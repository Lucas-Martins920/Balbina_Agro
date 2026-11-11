-- Estoque de ração para peixes, fase 1: ficha técnica da ração e entradas numeradas com lote e validade.
--
-- Pedido do Nicolas (11/11/2026): o estoque deixa de ser de insumos genéricos herdados da avicultura e passa a
-- controlar ração para peixes. Cada compra que chega vira uma ENTRADA numerada (R-1, R-2...) com fabricante,
-- proteína bruta, granulometria, peso do saco, lote de fabricação, validade, preço e fornecedor, para a
-- rastreabilidade. O consumo segue o FEFO: sai primeiro a ração que vence primeiro.
--
-- Nesta fase o saldo de cada entrada é calculado pelo FEFO a partir do saldo do produto no depósito
-- (view racao_saldos): fica com saldo a entrada que vence por último, e o que já saiu (trato, ajuste, perda)
-- é descontado das que vencem antes. Assim qualquer saída que já existe (apontamento, app de campo,
-- lançamento manual) continua funcionando sem mudança. A baixa ligada à entrada, com o custo da própria
-- entrada e o rastro "qual lote comeu qual entrada", é a fase 2.

-- ---------------------------------------------------------------------------
-- 1. Ficha técnica da ração no cadastro do produto (tipo = 'racao')
-- ---------------------------------------------------------------------------
alter table produtos
  add column fabricante text,
  add column proteina_pct numeric(4,1) check (proteina_pct is null or proteina_pct between 0 and 70),
  add column granulometria text,
  add column saco_kg numeric(8,3) check (saco_kg is null or saco_kg > 0),
  add column fase_recomendada text;
comment on column produtos.proteina_pct is 'Ração: proteína bruta (% PB) informada pelo fabricante';
comment on column produtos.granulometria is 'Ração: tamanho do grânulo (ex.: 2–4 mm, farelada)';
comment on column produtos.saco_kg is 'Ração: kg de um saco (25 kg é o mais comum)';
comment on column produtos.fase_recomendada is 'Ração: fase do peixe em que o fabricante indica a ração (nome da faixa da tabela de arraçoamento)';

-- ---------------------------------------------------------------------------
-- 2. Entradas de ração
-- ---------------------------------------------------------------------------
alter table empresas add column racao_ultimo_numero integer not null default 0;
comment on column empresas.racao_ultimo_numero is 'Último número de entrada de ração usado (R-1, R-2...)';

create table racao_entradas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero integer not null,
  produto_id uuid not null references produtos(id) on delete restrict,
  deposito_id uuid not null references depositos(id) on delete restrict,
  fornecedor_id uuid references contatos(id) on delete set null,
  data date not null,
  lote_fabricacao text,
  fabricacao date,
  validade date,
  sacos numeric(10,2) check (sacos is null or sacos > 0),
  kg numeric(12,3) not null check (kg > 0),
  custo_total_cents bigint check (custo_total_cents is null or custo_total_cents >= 0),
  abertura boolean not null default false,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (empresa_id, numero),
  -- só a entrada de abertura (o saldo que já existia antes desta mudança) pode ficar sem validade
  check (abertura or validade is not null),
  check (fabricacao is null or validade is null or validade >= fabricacao)
);
comment on table racao_entradas is 'Cada compra de ração que chega: número, lote de fabricação e validade (rastreabilidade e FEFO)';
comment on column racao_entradas.abertura is 'Saldo de ração que já estava no estoque quando as entradas numeradas começaram (validade desconhecida)';
create index on racao_entradas (produto_id, deposito_id);
create index on racao_entradas (deposito_id);
create index on racao_entradas (fornecedor_id);
create index on racao_entradas (empresa_id, validade);

alter table racao_entradas enable row level security;
create policy membros on racao_entradas
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on racao_entradas as restrictive for insert
  with check (app.pode_algum(empresa_id, array['estoque.editar', 'racao.editar']));
create policy escrita_alterar on racao_entradas as restrictive for update
  using (app.pode_algum(empresa_id, array['estoque.editar', 'racao.editar']))
  with check (app.pode_algum(empresa_id, array['estoque.editar', 'racao.editar']));
-- apagar só por excluir_entrada_racao, que confere se o saldo continua de pé
create policy escrita_apagar on racao_entradas as restrictive for delete using (false);
grant select, insert, update on racao_entradas to authenticated;

-- Número sequencial por empresa (o contador fica na empresa: número de entrada excluída não volta; o update
-- da linha da empresa serializa duas entradas ao mesmo tempo) e o que não pode mudar depois:
-- produto, depósito, kg e custo já viraram movimento de estoque.
create or replace function app.racao_entrada_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from produtos where id = new.produto_id and empresa_id = new.empresa_id and tipo = 'racao') then
      raise exception 'Escolha uma ração do cadastro' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from depositos where id = new.deposito_id and empresa_id = new.empresa_id and tipo <> 'peixe') then
      raise exception 'Depósito inválido' using errcode = 'check_violation';
    end if;
    update empresas set racao_ultimo_numero = racao_ultimo_numero + 1 where id = new.empresa_id
    returning racao_ultimo_numero into new.numero;
  else
    if new.numero <> old.numero or new.produto_id <> old.produto_id or new.deposito_id <> old.deposito_id
       or new.kg <> old.kg or new.custo_total_cents is distinct from old.custo_total_cents
       or new.abertura <> old.abertura or new.empresa_id <> old.empresa_id or new.data <> old.data then
      raise exception 'Ração, depósito, data, quantidade e custo da entrada não mudam: exclua a entrada e lance de novo'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger racao_entrada_conferir before insert or update on racao_entradas
  for each row execute function app.racao_entrada_conferir();

-- A entrada vira um movimento de compra no estoque (a de abertura não: o saldo dela já estava lá).
-- Excluir a entrada apaga o movimento.
create or replace function app.racao_entrada_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_unit numeric;
begin
  if tg_op = 'DELETE' then
    delete from movimentos_estoque where origem_tabela = 'racao_entradas' and origem_id = old.id;
    return null;
  end if;
  if new.abertura then return null; end if;
  v_unit := new.custo_total_cents::numeric / new.kg;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents,
                                  validade, lote_embalagem, origem_tabela, origem_id, observacao, created_by)
  values (new.empresa_id, new.produto_id, new.deposito_id, new.data,
          case when new.custo_total_cents is null then 'ajuste' else 'entrada_compra' end, new.kg,
          coalesce(v_unit, (select custo_medio_cents from produtos where id = new.produto_id)),
          new.validade, new.lote_fabricacao, 'racao_entradas', new.id, format('Entrada R-%s', new.numero), new.created_by);
  if v_unit is not null then
    perform app.atualizar_custo_medio(new.produto_id, new.kg, v_unit);
  end if;
  return null;
end $$;
create trigger racao_entrada_estoque after insert or delete on racao_entradas
  for each row execute function app.racao_entrada_estoque();

-- ---------------------------------------------------------------------------
-- 3. Lançar e excluir uma entrada
-- ---------------------------------------------------------------------------
-- Informe os sacos (o kg sai do peso do saco no cadastro da ração) ou os kg. Devolve o número da entrada.
create or replace function public.registrar_entrada_racao(p_produto uuid, p_validade date, p_sacos numeric default null,
                                                          p_kg numeric default null, p_deposito uuid default null,
                                                          p_data date default null, p_custo_total_cents bigint default null,
                                                          p_lote_fabricacao text default null, p_fabricacao date default null,
                                                          p_fornecedor uuid default null, p_observacoes text default null)
returns integer language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_kg numeric;
  v_numero integer;
begin
  select * into p from produtos where id = p_produto;
  if not found or p.tipo <> 'racao' then raise exception 'Escolha uma ração do cadastro' using errcode = 'check_violation'; end if;
  if not app.pode_algum(p.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  p_data := coalesce(p_data, app.hoje(p.empresa_id));
  if p_data > app.hoje(p.empresa_id) then
    raise exception 'A data da entrada não pode ser futura' using errcode = 'check_violation';
  end if;
  if p_validade is null then raise exception 'Informe a validade da ração' using errcode = 'check_violation'; end if;
  if p_validade < p_data then raise exception 'Esta ração já chega vencida: confira a validade' using errcode = 'check_violation'; end if;
  if p_fabricacao is not null and (p_fabricacao > p_data or p_fabricacao > p_validade) then
    raise exception 'Data de fabricação inválida' using errcode = 'check_violation';
  end if;
  if coalesce(p_sacos, 1) <= 0 or coalesce(p_kg, 1) <= 0 then
    raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation';
  end if;
  v_kg := coalesce(p_kg, p_sacos * p.saco_kg);
  if v_kg is null then
    raise exception 'Informe os kg, ou o peso do saco no cadastro da ração' using errcode = 'check_violation';
  end if;
  if p_custo_total_cents is not null and p_custo_total_cents < 0 then
    raise exception 'Custo não pode ser negativo' using errcode = 'check_violation';
  end if;
  if p_fornecedor is not null and not exists (select 1 from contatos where id = p_fornecedor and empresa_id = p.empresa_id) then
    raise exception 'Fornecedor inválido' using errcode = 'check_violation';
  end if;

  insert into racao_entradas (empresa_id, produto_id, deposito_id, fornecedor_id, data, lote_fabricacao, fabricacao,
                              validade, sacos, kg, custo_total_cents, observacoes, numero)
  values (p.empresa_id, p.id, coalesce(p_deposito, app.deposito_padrao(p.empresa_id)), p_fornecedor, p_data,
          nullif(trim(p_lote_fabricacao), ''), p_fabricacao, p_validade, p_sacos, round(v_kg, 3), p_custo_total_cents,
          nullif(trim(p_observacoes), ''), 0)
  returning numero into v_numero;
  return v_numero;
end $$;

-- Excluir uma entrada lançada por engano: só se a ração dela ainda está no depósito (senão o saldo ficaria negativo).
create or replace function public.excluir_entrada_racao(p_entrada uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  e racao_entradas%rowtype;
  v_saldo numeric;
begin
  select * into e from racao_entradas where id = p_entrada;
  if not found or e.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Entrada não encontrada' using errcode = 'no_data_found';
  end if;
  if not app.pode_algum(e.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  perform app.travar_estoque(e.empresa_id);
  delete from racao_entradas where id = e.id;
  select coalesce(sum(quantidade), 0) into v_saldo from movimentos_estoque
  where produto_id = e.produto_id and deposito_id = e.deposito_id;
  if v_saldo < 0 then
    raise exception 'A ração da entrada R-% já foi usada: lance um ajuste de estoque em vez de excluir', e.numero
      using errcode = 'check_violation';
  end if;
end $$;

revoke all on function public.registrar_entrada_racao(uuid, date, numeric, numeric, uuid, date, bigint, text, date, uuid, text) from public, anon;
revoke all on function public.excluir_entrada_racao(uuid) from public, anon;
grant execute on function public.registrar_entrada_racao(uuid, date, numeric, numeric, uuid, date, bigint, text, date, uuid, text) to authenticated;
grant execute on function public.excluir_entrada_racao(uuid) to authenticated;
revoke all on function app.racao_entrada_conferir() from public;
revoke all on function app.racao_entrada_estoque() from public;

-- ---------------------------------------------------------------------------
-- 4. Saldo por entrada pelo FEFO
-- ---------------------------------------------------------------------------
-- O saldo do produto no depósito fica com as entradas que vencem por último (a de abertura, sem validade, sai
-- primeiro; com a mesma validade, a compra mais antiga sai primeiro). Saldo acima da soma das entradas
-- (ajuste para mais) aparece na tela como ração sem número.
create view racao_saldos with (security_invoker = true) as
with s as (
  select produto_id, deposito_id, greatest(sum(quantidade), 0) as saldo
  from movimentos_estoque group by produto_id, deposito_id
), e as (
  select e.*, sum(e.kg) over (partition by e.produto_id, e.deposito_id
                              order by e.validade desc nulls last, e.data desc, e.numero desc
                              rows unbounded preceding) as acumulado
  from racao_entradas e
)
select e.id, e.empresa_id, e.numero, e.produto_id, e.deposito_id, e.fornecedor_id, e.data, e.lote_fabricacao,
       e.fabricacao, e.validade, e.sacos, e.kg, e.custo_total_cents, e.abertura, e.observacoes,
       round(greatest(0, least(e.kg, coalesce(s.saldo, 0) - (e.acumulado - e.kg))), 3) as saldo_kg,
       e.validade - app.hoje(e.empresa_id) as dias_para_vencer
from e
left join s on s.produto_id = e.produto_id and s.deposito_id = e.deposito_id;
grant select on racao_saldos to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Abertura: o saldo de ração que já existe vira a entrada de abertura (sem validade, sai primeiro)
-- ---------------------------------------------------------------------------
alter table racao_entradas disable trigger racao_entrada_conferir;
insert into racao_entradas (empresa_id, numero, produto_id, deposito_id, data, kg, custo_total_cents, abertura, observacoes)
select x.empresa_id,
       row_number() over (partition by x.empresa_id order by x.nome, x.deposito_id),
       x.produto_id, x.deposito_id, app.hoje(x.empresa_id), round(x.saldo, 3),
       round(x.saldo * x.custo_medio_cents)::bigint, true,
       'Saldo que já estava no estoque quando as entradas numeradas começaram. Validade desconhecida: é usada primeiro.'
from (
  select m.empresa_id, m.produto_id, m.deposito_id, p.nome, p.custo_medio_cents, sum(m.quantidade) as saldo
  from movimentos_estoque m join produtos p on p.id = m.produto_id
  where p.tipo = 'racao'
  group by m.empresa_id, m.produto_id, m.deposito_id, p.nome, p.custo_medio_cents
  having sum(m.quantidade) > 0
) x;
alter table racao_entradas enable trigger racao_entrada_conferir;
update empresas e set racao_ultimo_numero = x.n
from (select empresa_id, max(numero) as n from racao_entradas group by empresa_id) x where x.empresa_id = e.id;

-- ---------------------------------------------------------------------------
-- 6. Zerar o sistema apaga as entradas (movimento), não a ficha técnica da ração (cadastro)
-- ---------------------------------------------------------------------------
do $$
declare v text;
begin
  v := pg_get_functiondef('public.zerar_sistema(uuid, text, text)'::regprocedure);
  if position('  delete from movimentos_estoque where empresa_id = p_empresa;' in v) = 0 then
    raise exception 'zerar_sistema mudou: revise onde apagar racao_entradas';
  end if;
  v := replace(v, '  delete from movimentos_estoque where empresa_id = p_empresa;',
                  '  delete from movimentos_estoque where empresa_id = p_empresa;' || chr(10) ||
                  '  delete from racao_entradas where empresa_id = p_empresa;' || chr(10) ||
                  '  update empresas set racao_ultimo_numero = 0 where id = p_empresa;');
  execute v;
end $$;

select app.travar_referencias();
