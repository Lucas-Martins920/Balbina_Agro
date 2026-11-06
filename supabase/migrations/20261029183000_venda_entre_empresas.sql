-- Pontos de venda, etapa 2: o ponto é OUTRA empresa do mesmo dono (CNPJ diferente) no Balbina.
-- A piscicultura vende para a loja como cliente (pedido normal). Depois de faturado, quem participa das
-- duas empresas lança a entrada na loja com um clique: os ovos entram no estoque do ponto escolhido
-- da loja (classe com o mesmo nome e cor), ao preço da venda, e as parcelas viram contas a pagar
-- para a piscicultura (fornecedor criado pelo documento da piscicultura). Decisões em docs/pontos-de-venda.md.

create table compras_grupo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,             -- quem comprou (a loja)
  empresa_origem_id uuid not null references empresas(id) on delete cascade,       -- quem vendeu (a piscicultura)
  -- sem chave estrangeira: o pedido é da outra empresa e a trava de referências exige a mesma empresa
  pedido_origem_id uuid not null unique,
  pedido_numero int not null,
  fornecedor_id uuid not null references contatos(id) on delete restrict,
  ponto_venda_id uuid not null references pontos_venda(id) on delete restrict,
  data date not null,
  ovos bigint not null default 0,
  total_cents bigint not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on compras_grupo (empresa_id, data);

-- Só leitura pelo app; grava e desfaz pelas funções abaixo (security definer, com as permissões conferidas nelas)
alter table compras_grupo enable row level security;
create policy membros on compras_grupo for select using (empresa_id in (select app.minhas_empresas())
  or empresa_origem_id in (select app.minhas_empresas()));

-- Nome da empresa em que o pedido já entrou como compra (null se não entrou). Definer: quem cancela
-- na piscicultura pode não participar da loja, e mesmo assim o cancelamento precisa saber.
create or replace function app.entrada_no_grupo(p_pedido uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(e.nome_fantasia, e.razao_social) from compras_grupo c join empresas e on e.id = c.empresa_id
  where c.pedido_origem_id = p_pedido
$$;

create or replace function public.receber_compra_do_grupo(p_pedido uuid, p_empresa uuid, p_ponto uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  origem empresas%rowtype;
  destino empresas%rowtype;
  pv pontos_venda%rowtype;
  v_doc text;
  v_forn uuid;
  v_cat uuid;
  v_cc uuid;
  v_id uuid;
  v_ponto uuid;
  v_ovos bigint := 0;
  v_ag uuid;
  r record;
  t record;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.empresa_id = p_empresa then raise exception 'Escolha a empresa que comprou, não a que vendeu' using errcode = 'check_violation'; end if;
  if not app.pode(p.empresa_id, 'vendas.ver') then
    raise exception 'Seu usuário não tem acesso às vendas da empresa que vendeu' using errcode = 'insufficient_privilege';
  end if;
  if not app.pode(p_empresa, 'estoque.editar') or not app.pode(p_empresa, 'contas-a-pagar.editar') then
    raise exception 'Para lançar a compra seu usuário precisa lançar estoque e contas a pagar na empresa que comprou'
      using errcode = 'insufficient_privilege';
  end if;
  if p.status not in ('faturado', 'entregue') then
    raise exception 'Fature o pedido antes de lançar a entrada na outra empresa' using errcode = 'check_violation';
  end if;
  select * into origem from empresas where id = p.empresa_id;
  select * into destino from empresas where id = p_empresa;
  select cpf_cnpj into v_doc from contatos where id = p.cliente_id;
  if v_doc is distinct from destino.cnpj then
    raise exception 'O cliente deste pedido não é a empresa % (o documento não bate)', coalesce(destino.nome_fantasia, destino.razao_social)
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from compras_grupo where pedido_origem_id = p.id) then
    raise exception 'A entrada deste pedido já foi lançada' using errcode = 'check_violation';
  end if;

  v_ponto := coalesce(p_ponto, app.ponto_sede(p_empresa));
  select * into pv from pontos_venda where id = v_ponto and empresa_id = p_empresa;
  if not found or not pv.ativo then raise exception 'Ponto de venda inválido' using errcode = 'check_violation'; end if;

  -- A piscicultura como fornecedora na loja, pelo documento
  select id into v_forn from contatos where empresa_id = p_empresa and cpf_cnpj = origem.cnpj;
  if v_forn is null then
    insert into contatos (empresa_id, tipos, nome, cpf_cnpj, produtor_rural)
    values (p_empresa, '{fornecedor}', coalesce(origem.nome_fantasia, origem.razao_social), origem.cnpj, length(origem.cnpj) = 11)
    returning id into v_forn;
  else
    update contatos set tipos = array_append(tipos, 'fornecedor') where id = v_forn and not ('fornecedor' = any(tipos));
  end if;

  insert into compras_grupo (empresa_id, empresa_origem_id, pedido_origem_id, pedido_numero, fornecedor_id, ponto_venda_id, data, total_cents)
  values (p_empresa, p.empresa_id, p.id, p.numero, v_forn, pv.id, app.hoje(p_empresa), p.total_cents)
  returning id into v_id;

  -- Ovos: mesma classe (nome e cor) na loja, ao preço por ovo da venda
  perform app.travar_estoque(p_empresa);
  for r in
    select c.nome, c.cor, sum(i.quantidade * pr.fator_kg)::bigint as ovos, sum(i.total_cents) as valor
    from pedido_itens i join produtos pr on pr.id = i.produto_id join classes_peixe c on c.id = pr.classe_peixe_id
    where i.pedido_id = p.id and pr.tipo = 'ovo'
    group by c.nome, c.cor
  loop
    select id into t from classes_peixe where empresa_id = p_empresa and nome = r.nome and cor is not distinct from r.cor;
    if not found then
      raise exception 'A empresa % não tem a classe de ovo % (%). Cadastre a classe e tente de novo',
        coalesce(destino.nome_fantasia, destino.razao_social), r.nome, r.cor using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, origem_id,
                                    observacao, created_by)
    values (p_empresa, app.produto_base_peixe(t.id), pv.deposito_id, app.hoje(p_empresa), 'entrada_compra', r.ovos, r.valor::numeric / r.ovos,
            'compras_grupo', v_id, format('Compra do pedido %s de %s', p.numero, coalesce(origem.nome_fantasia, origem.razao_social)), auth.uid());
    v_ovos := v_ovos + r.ovos;
  end loop;
  update compras_grupo set ovos = v_ovos where id = v_id;

  -- Contas a pagar espelhando as parcelas da venda
  select id into v_cat from categorias where empresa_id = p_empresa and sentido = 'saida' and nome = 'Compra de ovos para revenda';
  if v_cat is null then
    insert into categorias (empresa_id, grupo, sentido, nome) values (p_empresa, 'custo_operacional', 'saida', 'Compra de ovos para revenda')
    returning id into v_cat;
  end if;
  v_cc := coalesce(pv.centro_custo_id, (select id from centros_custo where empresa_id = p_empresa and tipo = 'comercial' order by nome limit 1));
  for t in
    select a.vencimento, a.valor_cents, a.parcela_numero, a.parcela_total from agendamentos a
    where a.origem = 'pedido_venda' and a.origem_id = p.id and a.status <> 'cancelado' order by a.vencimento
  loop
    v_ag := public.agendar_titulo(p_empresa, 'pagar',
      format('Compra pedido %s · %s%s', p.numero, coalesce(origem.nome_fantasia, origem.razao_social),
             case when t.parcela_total > 1 then format(' (%s/%s)', t.parcela_numero, t.parcela_total) else '' end),
      t.vencimento, date_trunc('month', p.data)::date, t.valor_cents,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', t.valor_cents)),
      v_forn, format('Pedido %s', p.numero), 1, p.forma_pagamento);
    update agendamentos set origem = 'compra', origem_id = v_id where id = v_ag;
  end loop;
  return v_id;
end $$;

create or replace function public.desfazer_compra_do_grupo(p_compra uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c compras_grupo%rowtype;
  v_produtos uuid[];
begin
  select * into c from compras_grupo where id = p_compra for update;
  if not found then raise exception 'Compra não encontrada' using errcode = 'no_data_found'; end if;
  if not app.pode(c.empresa_id, 'estoque.editar') or not app.pode(c.empresa_id, 'contas-a-pagar.editar') then
    raise exception 'Seu usuário não tem permissão para desfazer a compra' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from agendamentos where origem = 'compra' and origem_id = c.id and pago_cents > 0) then
    raise exception 'A compra já tem pagamento; estorne o pagamento antes de desfazer' using errcode = 'check_violation';
  end if;
  perform app.travar_estoque(c.empresa_id);
  select array_agg(distinct produto_id) into v_produtos from movimentos_estoque where origem_tabela = 'compras_grupo' and origem_id = c.id;
  delete from movimentos_estoque where origem_tabela = 'compras_grupo' and origem_id = c.id;
  if v_produtos is not null then perform app.conferir_saldo_peixe(v_produtos); end if;
  update agendamentos set status = 'cancelado', updated_at = now() where origem = 'compra' and origem_id = c.id;
  delete from compras_grupo where id = c.id;
end $$;

-- Cancelar o pedido na piscicultura não pode deixar a compra órfã na loja.
create or replace function public.cancelar_pedido(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
declare
  p pedidos_venda%rowtype;
  v_grupo text;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.status = 'cancelado' then return; end if;
  if exists (select 1 from agendamentos where origem = 'pedido_venda' and origem_id = p_pedido and pago_cents > 0) then
    raise exception 'O pedido já tem recebimento; estorne o recebimento antes de cancelar' using errcode = 'check_violation';
  end if;
  v_grupo := app.entrada_no_grupo(p_pedido);
  if v_grupo is not null then
    raise exception 'Este pedido já entrou como compra em %; desfaça a entrada lá antes de cancelar', v_grupo using errcode = 'check_violation';
  end if;
  delete from movimentos_estoque where origem_tabela = 'pedidos_venda' and origem_id = p_pedido;
  update agendamentos set status = 'cancelado', updated_at = now() where origem = 'pedido_venda' and origem_id = p_pedido;
  update pedidos_venda set status = 'cancelado', updated_at = now() where id = p_pedido;
end $$;

revoke all on function public.receber_compra_do_grupo(uuid, uuid, uuid) from public;
revoke all on function public.desfazer_compra_do_grupo(uuid) from public;
revoke all on function app.entrada_no_grupo(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.receber_compra_do_grupo(uuid, uuid, uuid), public.desfazer_compra_do_grupo(uuid),
      app.entrada_no_grupo(uuid) to authenticated;
    grant select on compras_grupo to authenticated;
  end if;
end $$;

select app.travar_referencias();
