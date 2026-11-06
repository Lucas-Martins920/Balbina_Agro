-- Marco 5b: estoque de insumos e fábrica de ração, cartão de crédito com faturas e relatórios comerciais.

-- ---------------------------------------------------------------------------
-- Estoque de insumos, ração, embalagens e medicamentos (ovos têm estoque_peixe)
-- ---------------------------------------------------------------------------

create view estoque_produtos with (security_invoker = true) as
select p.empresa_id, p.id as produto_id, p.nome, p.tipo, p.unidade, d.id as deposito_id, d.nome as deposito,
       sum(m.quantidade) as saldo, p.custo_medio_cents,
       round(sum(m.quantidade) * p.custo_medio_cents)::bigint as valor_cents
from movimentos_estoque m
join produtos p on p.id = m.produto_id
join depositos d on d.id = m.deposito_id
where p.tipo <> 'ovo'
group by p.id, d.id;

create or replace function app.saldo_produto(p_produto uuid, p_deposito uuid) returns numeric
language sql stable as $$
  select coalesce(sum(quantidade), 0) from movimentos_estoque where produto_id = p_produto and deposito_id = p_deposito
$$;

-- Custo médio ponderado: o saldo antigo ao custo médio atual mais a entrada ao custo dela.
create or replace function app.atualizar_custo_medio(p_produto uuid, p_quantidade numeric, p_custo_unit numeric) returns void
language plpgsql as $$
declare
  v_saldo numeric;
  v_medio numeric;
begin
  select coalesce(sum(quantidade), 0) into v_saldo from movimentos_estoque where produto_id = p_produto;
  select custo_medio_cents into v_medio from produtos where id = p_produto for update;
  -- o movimento da entrada já foi gravado, então o saldo anterior é o atual menos a entrada
  v_saldo := greatest(v_saldo - p_quantidade, 0);
  update produtos set custo_medio_cents = (v_saldo * v_medio + p_quantidade * p_custo_unit) / nullif(v_saldo + p_quantidade, 0)
  where id = p_produto;
end $$;

create or replace function public.registrar_entrada(p_produto uuid, p_deposito uuid, p_data date, p_quantidade numeric,
                                                    p_custo_total_cents bigint, p_observacao text default null) returns uuid
language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_id uuid;
begin
  select * into p from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  if p.tipo = 'ovo' then raise exception 'Ovos entram pelo apontamento diário' using errcode = 'check_violation'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation'; end if;
  if not exists (select 1 from depositos where id = p_deposito and empresa_id = p.empresa_id) then
    raise exception 'Depósito inválido' using errcode = 'check_violation';
  end if;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, created_by)
  values (p.empresa_id, p_produto, p_deposito, p_data, 'entrada_compra', p_quantidade, p_custo_total_cents::numeric / p_quantidade,
          nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;
  perform app.atualizar_custo_medio(p_produto, p_quantidade, p_custo_total_cents::numeric / p_quantidade);
  return v_id;
end $$;

-- Saída avulsa (consumo no viveiro, perda, ajuste de inventário) ao custo médio
create or replace function public.registrar_saida(p_produto uuid, p_deposito uuid, p_data date, p_quantidade numeric,
                                                  p_tipo text default 'consumo_lote', p_lote uuid default null, p_observacao text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  p produtos%rowtype;
  v_id uuid;
begin
  select * into p from produtos where id = p_produto;
  if not found or p.tipo = 'ovo' then raise exception 'Produto inválido' using errcode = 'check_violation'; end if;
  if p_tipo not in ('consumo_lote', 'perda', 'ajuste') then raise exception 'Tipo de saída inválido' using errcode = 'check_violation'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation'; end if;
  if app.saldo_produto(p_produto, p_deposito) < p_quantidade then
    raise exception 'Saldo insuficiente de %: há % %', p.nome, app.saldo_produto(p_produto, p_deposito), p.unidade using errcode = 'check_violation';
  end if;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id, origem_tabela, created_by)
  values (p.empresa_id, p_produto, p_deposito, p_data, p_tipo, -p_quantidade, p.custo_medio_cents, p_lote, nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Fábrica de ração
-- ---------------------------------------------------------------------------

-- Nova versão da fórmula de uma ração; a anterior deixa de ser vigente.
-- p_itens: [{insumo_id, kg_por_tonelada}] somando 1.000 kg
create or replace function public.salvar_formula(p_racao uuid, p_fase text, p_itens jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  r produtos%rowtype;
  v_soma numeric;
  v_id uuid;
begin
  select * into r from produtos where id = p_racao;
  if not found or r.tipo <> 'racao' then raise exception 'Escolha um produto do tipo ração' using errcode = 'check_violation'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A fórmula precisa de ingredientes' using errcode = 'check_violation';
  end if;
  select sum((x->>'kg_por_tonelada')::numeric) into v_soma from jsonb_array_elements(p_itens) x;
  if abs(v_soma - 1000) > 0.5 then
    raise exception 'Os ingredientes somam % kg por tonelada; precisam somar 1.000', round(v_soma, 1) using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x
             left join produtos i on i.id = (x->>'insumo_id')::uuid and i.empresa_id = r.empresa_id
             where i.id is null or i.tipo not in ('insumo_racao', 'medicamento', 'outro') or i.id = p_racao) then
    raise exception 'Ingrediente inválido na fórmula' using errcode = 'check_violation';
  end if;

  perform 1 from produtos where id = p_racao for update;
  update formulas_racao set vigente = false where produto_racao_id = p_racao and vigente;
  insert into formulas_racao (empresa_id, produto_racao_id, fase, versao)
  values (r.empresa_id, p_racao, coalesce(nullif(trim(p_fase), ''), r.nome),
          coalesce((select max(versao) from formulas_racao where produto_racao_id = p_racao), 0) + 1)
  returning id into v_id;
  insert into formula_itens (formula_id, insumo_id, kg_por_tonelada)
  select v_id, (x->>'insumo_id')::uuid, sum((x->>'kg_por_tonelada')::numeric)
  from jsonb_array_elements(p_itens) x group by 2;
  return v_id;
end $$;

-- Produz a ração: tira os ingredientes do depósito de insumos ao custo médio e põe a ração no destino
-- com o custo somado. Ingredientes em kg; a ordem é em toneladas.
create or replace function public.produzir_racao(p_formula uuid, p_data date, p_toneladas numeric,
                                                 p_deposito_insumos uuid, p_deposito_destino uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  f formulas_racao%rowtype;
  i record;
  v_ordem uuid;
  v_custo numeric := 0;
  v_kg numeric := p_toneladas * 1000;
begin
  select * into f from formulas_racao where id = p_formula;
  if not found then raise exception 'Fórmula não encontrada' using errcode = 'no_data_found'; end if;
  if p_toneladas is null or p_toneladas <= 0 then raise exception 'Informe as toneladas' using errcode = 'check_violation'; end if;
  if not exists (select 1 from depositos where id = p_deposito_destino and empresa_id = f.empresa_id)
     or not exists (select 1 from depositos where id = p_deposito_insumos and empresa_id = f.empresa_id) then
    raise exception 'Depósito inválido' using errcode = 'check_violation';
  end if;

  insert into ordens_producao_racao (empresa_id, formula_id, data, toneladas, deposito_destino_id, status)
  values (f.empresa_id, p_formula, p_data, p_toneladas, p_deposito_destino, 'produzida')
  returning id into v_ordem;

  for i in select fi.insumo_id, fi.kg_por_tonelada * p_toneladas as kg, p.nome, p.custo_medio_cents,
                  app.saldo_produto(fi.insumo_id, p_deposito_insumos) as saldo
           from formula_itens fi join produtos p on p.id = fi.insumo_id
           where fi.formula_id = p_formula for update of p loop
    if i.saldo < i.kg then
      raise exception 'Falta %: a ordem pede % kg e o depósito tem % kg', i.nome, round(i.kg, 1), round(i.saldo, 1)
        using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, origem_id, created_by)
    values (f.empresa_id, i.insumo_id, p_deposito_insumos, p_data, 'consumo_producao', -i.kg, i.custo_medio_cents,
            'ordens_producao_racao', v_ordem, auth.uid());
    v_custo := v_custo + i.kg * i.custo_medio_cents;
  end loop;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, origem_tabela, origem_id, created_by)
  values (f.empresa_id, f.produto_racao_id, p_deposito_destino, p_data, 'producao_racao', v_kg, v_custo / v_kg,
          'ordens_producao_racao', v_ordem, auth.uid());
  perform app.atualizar_custo_medio(f.produto_racao_id, v_kg, v_custo / v_kg);
  update ordens_producao_racao set custo_total_cents = round(v_custo) where id = v_ordem;
  return v_ordem;
end $$;

-- Custo da tonelada de cada fórmula vigente ao custo médio de hoje dos ingredientes
create view custo_formulas with (security_invoker = true) as
select f.empresa_id, f.id as formula_id, f.produto_racao_id, r.nome as racao, f.fase, f.versao,
       round(sum(fi.kg_por_tonelada * i.custo_medio_cents))::bigint as custo_tonelada_cents,
       count(*) as ingredientes
from formulas_racao f
join produtos r on r.id = f.produto_racao_id
join formula_itens fi on fi.formula_id = f.id
join produtos i on i.id = fi.insumo_id
where f.vigente
group by f.id, r.nome;

-- ---------------------------------------------------------------------------
-- Cartão de crédito
-- ---------------------------------------------------------------------------

alter table transferencias add column fatura_vencimento date;
alter table agendamentos drop constraint agendamentos_origem_check;
alter table agendamentos add constraint agendamentos_origem_check
  check (origem in ('manual','recorrencia','pedido_venda','compra','importacao','caixa_entrada','conciliacao','cartao'));

-- Vencimento da fatura em que cai uma compra feita em p_data
create or replace function app.vencimento_fatura(p_data date, p_fechamento int, p_vencimento int) returns date
language sql immutable as $$
  with base as (
    select (date_trunc('month', p_data) + case when extract(day from p_data) > p_fechamento then interval '1 month' else interval '0' end)::date as mes_fech
  ), venc as (
    select (mes_fech + case when p_vencimento <= p_fechamento then interval '1 month' else interval '0' end)::date as mes from base
  )
  select (mes + (least(p_vencimento, extract(day from (mes + interval '1 month' - interval '1 day'))::int) - 1))::date from venc
$$;

create or replace function app.fechamento_da_fatura(p_vencimento date, p_fechamento int, p_dia_venc int) returns date
language sql immutable as $$
  with m as (
    select (date_trunc('month', p_vencimento) - case when p_dia_venc <= p_fechamento then interval '1 month' else interval '0' end)::date as mes
  )
  select (mes + (least(p_fechamento, extract(day from (mes + interval '1 month' - interval '1 day'))::int) - 1))::date from m
$$;

-- Lançamentos do cartão: compras (baixas de contas a pagar) e estornos (recebimentos), cada um na sua fatura.
create view lancamentos_cartao with (security_invoker = true) as
select c.empresa_id, c.id as cartao_id, b.id as baixa_id, b.data, a.descricao, a.parcela_numero, a.parcela_total,
       (case when a.tipo = 'pagar' then 1 else -1 end) * (b.valor_cents + b.juros_cents + b.multa_cents - b.desconto_cents) as valor_cents,
       app.vencimento_fatura(b.data, c.dia_fechamento, c.dia_vencimento) as vencimento
from contas_financeiras c
join baixas b on b.conta_id = c.id
join agendamentos a on a.id = b.agendamento_id
where c.tipo = 'cartao_credito';

create view faturas_cartao with (security_invoker = true) as
with lanc as (
  select empresa_id, cartao_id, vencimento, sum(valor_cents)::bigint as total_cents, count(*) as lancamentos
  from lancamentos_cartao group by 1, 2, 3
), pag as (
  select conta_destino_id as cartao_id, fatura_vencimento as vencimento, sum(valor_cents)::bigint as pago_cents, max(data) as pago_em
  from transferencias where tipo = 'pagamento_fatura' group by 1, 2
)
select l.empresa_id, l.cartao_id, c.nome as cartao, l.vencimento,
       app.fechamento_da_fatura(l.vencimento, c.dia_fechamento, c.dia_vencimento) as fechamento,
       l.total_cents, coalesce(p.pago_cents, 0) as pago_cents, l.total_cents - coalesce(p.pago_cents, 0) as saldo_cents,
       l.lancamentos, p.pago_em,
       case when l.total_cents - coalesce(p.pago_cents, 0) <= 0 then 'paga'
            when app.fechamento_da_fatura(l.vencimento, c.dia_fechamento, c.dia_vencimento) >= current_date then 'aberta'
            when l.vencimento < current_date then 'vencida'
            else 'fechada' end as situacao
from lanc l
join contas_financeiras c on c.id = l.cartao_id
left join pag p on p.cartao_id = l.cartao_id and p.vencimento = l.vencimento;

-- Compra no cartão: cria a conta a pagar (parcelada ou não) e já lança cada parcela no cartão,
-- uma por fatura. A despesa fica toda na competência do mês da compra.
create or replace function public.compra_cartao(p_cartao uuid, p_data date, p_descricao text, p_valor_cents bigint,
                                                p_categoria uuid, p_parcelas int default 1, p_centro_custo uuid default null,
                                                p_contato uuid default null) returns uuid
language plpgsql set search_path = public as $$
declare
  c contas_financeiras%rowtype;
  v_grupo uuid;
  t record;
  k int := 0;
begin
  select * into c from contas_financeiras where id = p_cartao;
  if not found or c.tipo <> 'cartao_credito' then raise exception 'Escolha um cartão de crédito' using errcode = 'check_violation'; end if;
  if coalesce(p_parcelas, 1) not between 1 and 48 then raise exception 'Parcelas entre 1 e 48' using errcode = 'check_violation'; end if;

  v_grupo := public.agendar_titulo(c.empresa_id, 'pagar', p_descricao, p_data, date_trunc('month', p_data)::date, p_valor_cents,
    jsonb_build_array(jsonb_build_object('categoria_id', p_categoria, 'centro_custo_id', p_centro_custo, 'valor_cents', p_valor_cents)),
    p_contato, null, coalesce(p_parcelas, 1), 'cartao');

  for t in select id, valor_cents, desconto_cents from agendamentos
           where id = v_grupo or grupo_parcelamento_id = v_grupo order by parcela_numero nulls first loop
    -- cada parcela cai na fatura seguinte à anterior
    update agendamentos set vencimento = app.vencimento_fatura((p_data + make_interval(months => k))::date, c.dia_fechamento, c.dia_vencimento),
                            origem = 'cartao', origem_id = p_cartao
    where id = t.id;
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, observacao, created_by)
    values (c.empresa_id, t.id, p_cartao, (p_data + make_interval(months => k))::date, t.valor_cents - t.desconto_cents,
            'Compra no cartão ' || c.nome, auth.uid());
    k := k + 1;
  end loop;
  return v_grupo;
end $$;

-- Paga a fatura (ou parte dela) com uma transferência da conta pagadora para o cartão.
create or replace function public.pagar_fatura(p_cartao uuid, p_vencimento date, p_data date, p_conta uuid default null,
                                               p_valor_cents bigint default null) returns uuid
language plpgsql set search_path = public as $$
declare
  c contas_financeiras%rowtype;
  v_saldo bigint;
  v_conta uuid;
  v_id uuid;
begin
  select * into c from contas_financeiras where id = p_cartao;
  if not found or c.tipo <> 'cartao_credito' then raise exception 'Escolha um cartão de crédito' using errcode = 'check_violation'; end if;
  select saldo_cents into v_saldo from faturas_cartao where cartao_id = p_cartao and vencimento = p_vencimento;
  if coalesce(v_saldo, 0) <= 0 then raise exception 'Fatura sem saldo a pagar' using errcode = 'check_violation'; end if;
  if p_valor_cents is not null and (p_valor_cents <= 0 or p_valor_cents > v_saldo) then
    raise exception 'Valor precisa ficar entre 0 e o saldo da fatura' using errcode = 'check_violation';
  end if;
  v_conta := coalesce(p_conta, c.conta_pagadora_id);
  if v_conta is null or v_conta = p_cartao or not exists (select 1 from contas_financeiras where id = v_conta and empresa_id = c.empresa_id) then
    raise exception 'Escolha a conta que paga a fatura' using errcode = 'check_violation';
  end if;
  insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents, descricao, tipo, fatura_vencimento)
  values (c.empresa_id, v_conta, p_cartao, p_data, coalesce(p_valor_cents, v_saldo),
          format('Fatura %s venc. %s', c.nome, to_char(p_vencimento, 'DD/MM/YYYY')), 'pagamento_fatura', p_vencimento)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Relatórios comerciais: itens dos pedidos faturados
-- ---------------------------------------------------------------------------

create view vendas_itens with (security_invoker = true) as
select p.empresa_id, p.id as pedido_id, p.numero, p.data, date_trunc('month', p.data)::date as mes,
       p.cliente_id, c.nome as cliente, i.produto_id, pr.nome as produto, pr.classe_peixe_id, co.nome as classe,
       i.quantidade, (i.quantidade * coalesce(pr.fator_kg, 0))::bigint as ovos, i.total_cents
from pedidos_venda p
join contatos c on c.id = p.cliente_id
join pedido_itens i on i.pedido_id = p.id
join produtos pr on pr.id = i.produto_id
left join classes_peixe co on co.id = pr.classe_peixe_id
where p.status in ('faturado', 'entregue');

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.registrar_entrada(uuid, uuid, date, numeric, bigint, text) to authenticated;
    grant execute on function public.registrar_saida(uuid, uuid, date, numeric, text, uuid, text) to authenticated;
    grant execute on function public.salvar_formula(uuid, text, jsonb) to authenticated;
    grant execute on function public.produzir_racao(uuid, date, numeric, uuid, uuid) to authenticated;
    grant execute on function public.compra_cartao(uuid, date, text, bigint, uuid, int, uuid, uuid) to authenticated;
    grant execute on function public.pagar_fatura(uuid, date, date, uuid, bigint) to authenticated;
    grant select on estoque_produtos, custo_formulas, lancamentos_cartao, faturas_cartao, vendas_itens to authenticated;
  end if;
end $$;
