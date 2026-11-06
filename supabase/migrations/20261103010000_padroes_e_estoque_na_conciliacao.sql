-- Pedido do Nicolas (2026-11-03):
-- 1. "Aplicar plano padrão" de categorias deixa SÓ as categorias do plano: as que não são do plano somem
--    (apagadas se nada as usa; desativadas se têm lançamento, regra, orçamento etc., para o histórico ficar).
-- 2. Centros de custo padrão da piscicultura de engorda, com a mesma regra. Setores, viveiros e lotes (criados
--    sozinhos pelo cadastro da piscicultura) nunca saem.
-- 3. Conciliação: pagamento a fornecedor pode lançar a entrada do produto comprado no estoque, e o
--    fornecedor guarda o produto (contatos.produto_estoque_id) para a próxima conciliação lembrar.

-- Registro usado por alguma chave estrangeira (qualquer tabela, inclusive filhas pela parent_id)?
-- Também conta a lista de centros permitidos dos usuários, que é um array sem chave estrangeira.
create or replace function app.registro_em_uso(p_tabela regclass, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v boolean;
begin
  for r in
    select c.conrelid::regclass as tabela, a.attname as coluna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = p_tabela and array_length(c.conkey, 1) = 1
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabela, r.coluna) into v using p_id;
    if v then return true; end if;
  end loop;
  if p_tabela = 'centros_custo'::regclass
     and exists (select 1 from usuarios_empresa where p_id = any(centros_custo_permitidos)) then
    return true;
  end if;
  return false;
end $$;

revoke all on function app.registro_em_uso(regclass, uuid) from public;

-- ---------------------------------------------------------------------------------------------
-- 1. Categorias: só as do plano
-- ---------------------------------------------------------------------------------------------
create or replace function app.restaurar_plano_categorias(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plano jsonb;
  r record;
  v_apagadas integer := 0;
  v_desativadas integer := 0;
  v_reativadas integer := 0;
begin
  v_plano := app.aplicar_plano_categorias(p_empresa);

  -- Categorias do plano voltam a ficar ativas
  with doplano as (
    select c.id from categorias c
    left join categorias pai on pai.id = c.parent_id
    join app.plano_categorias() p
      on lower(p.nome) = lower(trim(c.nome))
     and (case when c.parent_id is null then p.pai is null else lower(p.pai) = lower(trim(pai.nome)) and pai.parent_id is null end)
    where c.empresa_id = p_empresa
  )
  update categorias set ativa = true, updated_at = now()
  where id in (select id from doplano) and not ativa;
  get diagnostics v_reativadas = row_count;

  -- As que não são do plano (nem do sistema): das filhas para as mães, para a mãe só sair sem filhas.
  for r in
    with recursive arvore as (
      select id, 0 as nivel from categorias where empresa_id = p_empresa and parent_id is null
      union all
      select c.id, a.nivel + 1 from categorias c join arvore a on c.parent_id = a.id
    )
    select c.id, c.ativa, a.nivel from categorias c
    join arvore a on a.id = c.id
    left join categorias pai on pai.id = c.parent_id
    where c.empresa_id = p_empresa and not c.sistema
      and not exists (
        select 1 from app.plano_categorias() p
        where lower(p.nome) = lower(trim(c.nome))
          and (case when c.parent_id is null then p.pai is null
                    else pai.parent_id is null and lower(p.pai) = lower(trim(pai.nome)) end))
    order by a.nivel desc
  loop
    if app.registro_em_uso('categorias', r.id) then
      if r.ativa then
        update categorias set ativa = false, updated_at = now() where id = r.id;
        v_desativadas := v_desativadas + 1;
      end if;
    else
      delete from importacao_vinculos where empresa_id = p_empresa and entidade = 'categoria' and registro_id = r.id;
      delete from categorias where id = r.id;
      v_apagadas := v_apagadas + 1;
    end if;
  end loop;

  return v_plano || jsonb_build_object('apagadas', v_apagadas, 'desativadas', v_desativadas, 'reativadas', v_reativadas);
end $$;

revoke all on function app.restaurar_plano_categorias(uuid) from public;

create or replace function public.restaurar_plano_categorias(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.pode(p_empresa, 'categorias.editar') and not app.pode(p_empresa, 'configuracoes.editar') then
    raise exception 'Seu usuário não pode editar as categorias desta empresa' using errcode = 'insufficient_privilege';
  end if;
  return app.restaurar_plano_categorias(p_empresa);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Centros de custo padrão da piscicultura de engorda
-- ---------------------------------------------------------------------------------------------
-- Etapas do custo de produção do ovo (Embrapa / CNA Campo Futuro): recria, engorda, ração,
-- classificação e comercialização, mais as áreas de apoio. Viveiros e lotes têm centro próprio,
-- criado pelo cadastro da piscicultura; estes são os centros "gerais", rateados nos lotes.
create or replace function app.plano_centros_custo()
returns table (pos integer, nome text, tipo text)
language sql immutable set search_path = public as $$
  values
    (1,  'Recria', 'geral'),
    (2,  'Engorda (comum aos viveiros)', 'geral'),
    (3,  'Fábrica de ração', 'fabrica_racao'),
    (4,  'Classificação e expedição', 'geral'),
    (5,  'Sanidade e biosseguridade', 'geral'),
    (6,  'Manutenção e infraestrutura', 'geral'),
    (7,  'Esterco e compostagem', 'geral'),
    (8,  'Logística e entregas', 'comercial'),
    (9,  'Comercial', 'comercial'),
    (10, 'Administrativo', 'administrativo')
$$;

create or replace function app.restaurar_centros_custo(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_id uuid;
  v_criados integer := 0;
  v_apagados integer := 0;
  v_desativados integer := 0;
  v_padrao uuid[] := '{}';
  v_base integer;
begin
  -- Centros padrão: casa pelo nome (sem diferenciar maiúsculas); cria o que falta
  for r in select * from app.plano_centros_custo() order by pos loop
    select id into v_id from centros_custo
    where empresa_id = p_empresa and lower(trim(nome)) = lower(r.nome)
    order by created_at limit 1;
    if v_id is null then
      insert into centros_custo (empresa_id, nome, tipo) values (p_empresa, r.nome, r.tipo) returning id into v_id;
      v_criados := v_criados + 1;
    else
      update centros_custo set ativo = true, parent_id = null, tipo = r.tipo, updated_at = now()
      where id = v_id and (not ativo or parent_id is not null or tipo <> r.tipo);
    end if;
    v_padrao := v_padrao || v_id;
  end loop;

  -- Os demais, menos a estrutura da piscicultura (setor, viveiro, lote): filhos antes dos pais
  for r in
    with recursive arvore as (
      select id, 0 as nivel from centros_custo where empresa_id = p_empresa and parent_id is null
      union all
      select c.id, a.nivel + 1 from centros_custo c join arvore a on c.parent_id = a.id
    )
    select c.id, c.ativo from centros_custo c join arvore a on a.id = c.id
    where c.empresa_id = p_empresa and c.tipo not in ('setor', 'viveiro', 'lote') and c.id <> all (v_padrao)
    order by a.nivel desc
  loop
    if app.registro_em_uso('centros_custo', r.id) then
      if r.ativo then
        update centros_custo set ativo = false, updated_at = now() where id = r.id;
        v_desativados := v_desativados + 1;
      end if;
    else
      delete from importacao_vinculos where empresa_id = p_empresa and entidade = 'centro_custo' and registro_id = r.id;
      delete from centros_custo where id = r.id;
      v_apagados := v_apagados + 1;
    end if;
  end loop;

  -- Ordem: os padrão primeiro, na ordem do plano; a estrutura da piscicultura depois, como estava
  select coalesce(max(ordem), 0) into v_base from centros_custo where empresa_id = p_empresa;
  update centros_custo c set ordem = p.pos
  from app.plano_centros_custo() p
  where c.empresa_id = p_empresa and c.parent_id is null and lower(trim(c.nome)) = lower(p.nome);
  update centros_custo c set ordem = o.n
  from (
    select id, 100 + row_number() over (order by ordem, nome) as n from centros_custo
    where empresa_id = p_empresa and parent_id is null and id <> all (v_padrao)
  ) o
  where o.id = c.id;

  return jsonb_build_object('criados', v_criados, 'apagados', v_apagados, 'desativados', v_desativados);
end $$;

revoke all on function app.restaurar_centros_custo(uuid) from public;

create or replace function public.restaurar_centros_custo(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.pode(p_empresa, 'centros-de-custo.editar') and not app.pode(p_empresa, 'configuracoes.editar') then
    raise exception 'Seu usuário não pode editar os centros de custo desta empresa' using errcode = 'insufficient_privilege';
  end if;
  return app.restaurar_centros_custo(p_empresa);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Produto do fornecedor para o estoque, na conciliação
-- ---------------------------------------------------------------------------------------------
alter table contatos add column if not exists produto_estoque_id uuid references produtos(id) on delete set null;
create index if not exists contatos_produto_estoque_idx on contatos (produto_estoque_id) where produto_estoque_id is not null;
comment on column contatos.produto_estoque_id is
  'Produto que este fornecedor costuma vender para o estoque: a conciliação lembra de lançar a entrada';

-- Concilia criando o título (como conciliar_rateando) e, numa transação só, lança a entrada do produto
-- no estoque com o custo do pagamento. p_lembrar: true guarda o produto no fornecedor, false esquece,
-- null não mexe.
create or replace function public.conciliar_com_estoque(
  p_movimento uuid, p_rateio jsonb, p_contato uuid default null, p_descricao text default null,
  p_produto uuid default null, p_quantidade numeric default null, p_deposito uuid default null,
  p_lembrar boolean default null
) returns uuid language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  v_ag uuid;
begin
  select * into v from movimentos_bancarios where id = p_movimento;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  if p_produto is not null then
    if v.valor_cents > 0 then
      raise exception 'Entrada no estoque só vale para pagamento' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from produtos where id = p_produto and empresa_id = v.empresa_id) then
      raise exception 'Produto inválido' using errcode = 'check_violation';
    end if;
    if p_quantidade is null or p_quantidade <= 0 then
      raise exception 'Informe a quantidade que entrou no estoque' using errcode = 'check_violation';
    end if;
  end if;
  if p_contato is not null and not exists (select 1 from contatos where id = p_contato and empresa_id = v.empresa_id) then
    raise exception 'Fornecedor inválido' using errcode = 'check_violation';
  end if;

  v_ag := public.conciliar_rateando(p_movimento, p_rateio, p_contato, p_descricao);

  if p_produto is not null then
    perform public.movimentar_estoque(p_produto, 'entrada', p_quantidade, p_deposito, least(v.data, current_date),
      abs(v.valor_cents), 'Compra', null,
      left('Compra paga em ' || to_char(v.data, 'DD/MM/YYYY') || ' (conciliação): ' || coalesce(nullif(trim(p_descricao), ''), v.descricao), 300));
  end if;

  if p_contato is not null and p_lembrar is not null then
    perform app.lembrar_produto_fornecedor(p_contato, case when p_lembrar then p_produto end);
  end if;
  return v_ag;
end $$;

-- Quem concilia nem sempre edita contatos: a memória do fornecedor é gravada por aqui.
create or replace function app.lembrar_produto_fornecedor(p_contato uuid, p_produto uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update contatos c set produto_estoque_id = p_produto, updated_at = now()
  where c.id = p_contato and c.empresa_id in (select app.minhas_empresas())
    and (p_produto is null or exists (select 1 from produtos p where p.id = p_produto and p.empresa_id = c.empresa_id))
    and c.produto_estoque_id is distinct from p_produto;
end $$;

revoke all on function app.lembrar_produto_fornecedor(uuid, uuid) from public;

do $$
begin
  revoke all on function public.restaurar_plano_categorias(uuid) from public;
  revoke all on function public.restaurar_centros_custo(uuid) from public;
  revoke all on function public.conciliar_com_estoque(uuid, jsonb, uuid, text, uuid, numeric, uuid, boolean) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.restaurar_plano_categorias(uuid) from anon;
    revoke all on function public.restaurar_centros_custo(uuid) from anon;
    revoke all on function public.conciliar_com_estoque(uuid, jsonb, uuid, text, uuid, numeric, uuid, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.restaurar_plano_categorias(uuid) to authenticated;
    grant execute on function public.restaurar_centros_custo(uuid) to authenticated;
    grant execute on function public.conciliar_com_estoque(uuid, jsonb, uuid, text, uuid, numeric, uuid, boolean) to authenticated;
    grant execute on function app.lembrar_produto_fornecedor(uuid, uuid) to authenticated;
  end if;
end $$;

-- Empresa nova nasce com os centros padrão (o resto igual a 20261102030000)
create or replace function app.carregar_padroes(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.aplicar_plano_categorias(p_empresa);
  insert into centros_custo (empresa_id, nome, tipo, ordem)
  select p_empresa, p.nome, p.tipo, p.pos from app.plano_centros_custo() p
  on conflict do nothing;

  -- Classes de ovo por peso (Portaria MAPA nº 1/1990; conferir norma vigente).
  insert into classes_peixe (empresa_id, nome, peso_min_g, peso_max_g, comercializavel, ordem) values
    (p_empresa, 'Jumbo',      66, null, true, 1),
    (p_empresa, 'Extra',      60, 66,   true, 2),
    (p_empresa, 'Grande',     55, 60,   true, 3),
    (p_empresa, 'Médio',      50, 55,   true, 4),
    (p_empresa, 'Pequeno',    45, 50,   true, 5),
    (p_empresa, 'Industrial', null, 45, true, 6),
    (p_empresa, 'Trincado',   null, null, false, 7),
    (p_empresa, 'Descarte',   null, null, false, 8)
  on conflict do nothing;

  insert into centros_custo (empresa_id, nome, tipo) values
    (p_empresa, 'Administrativo', 'administrativo'),
    (p_empresa, 'Fábrica de ração', 'fabrica_racao'),
    (p_empresa, 'Comercial', 'comercial')
  on conflict do nothing;

  insert into depositos (empresa_id, nome, tipo) values
    (p_empresa, 'Ovos', 'ovos'),
    (p_empresa, 'Insumos', 'insumos'),
    (p_empresa, 'Ração', 'racao'),
    (p_empresa, 'Almoxarifado', 'almoxarifado')
  on conflict do nothing;

  insert into contas_financeiras (empresa_id, tipo, nome) values
    (p_empresa, 'caixinha', 'Caixa da piscicultura');
end $$;

select app.travar_referencias();
