-- Vendas mais rápidas: PDV (venda de balcão) numa transação só e forma de pagamento em cada recebimento.

alter table pedidos_venda drop constraint if exists pedidos_venda_origem_check;
alter table pedidos_venda add constraint pedidos_venda_origem_check check (origem in ('web', 'app', 'pdv'));

-- Como o dinheiro entrou (o resumo do caixa do PDV separa dinheiro, Pix e cartão)
alter table baixas add column if not exists forma_pagamento text
  check (forma_pagamento in ('boleto','pix','ted','dinheiro','cartao','debito_automatico','cheque'));

-- Cliente padrão do balcão, criado na primeira venda sem cliente
create or replace function app.consumidor_final(p_empresa uuid) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from contatos
  where empresa_id = p_empresa and nome = 'Consumidor final' and 'cliente' = any(tipos) order by created_at limit 1;
  if v_id is null then
    insert into contatos (empresa_id, tipos, nome) values (p_empresa, '{cliente}', 'Consumidor final') returning id into v_id;
  end if;
  return v_id;
end $$;

-- Caixa físico da piscicultura (o onboarding cria "Caixa da piscicultura"); cria um se não houver
create or replace function app.conta_caixa(p_empresa uuid) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from contas_financeiras
  where empresa_id = p_empresa and tipo = 'caixinha' and not arquivada order by created_at limit 1;
  if v_id is null then
    insert into contas_financeiras (empresa_id, tipo, nome) values (p_empresa, 'caixinha', 'Caixa da piscicultura') returning id into v_id;
  end if;
  return v_id;
end $$;

-- Venda de balcão: cria o pedido à vista, fatura (baixa os ovos), recebe e marca como entregue.
-- p_itens: [{produto_id, quantidade, preco_unit_cents?}]
-- p_pagamentos: [{forma: dinheiro|pix|cartao|..., valor_cents, conta_id?}]  (dinheiro sem conta cai no caixa)
-- O que passar do total só pode ser troco de dinheiro. p_client_id evita venda duplicada no reenvio.
create or replace function public.venda_balcao(
  p_empresa uuid,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_cliente uuid default null,
  p_client_id uuid default null,
  p_observacoes text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_ped uuid;
  v_total bigint;
  v_numero int;
  v_pago bigint;
  v_dinheiro bigint;
  v_troco bigint;
  v_forma text;
  v_ag uuid;
  v_conta uuid;
  v_valor bigint;
  v_resto bigint;
  x jsonb;
begin
  if p_client_id is not null then
    select id, numero, total_cents into v_ped, v_numero, v_total from pedidos_venda where client_id = p_client_id;
    if found then
      return jsonb_build_object('pedido_id', v_ped, 'numero', v_numero, 'total_cents', v_total, 'troco_cents', 0, 'repetida', true);
    end if;
  end if;
  if jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    raise exception 'Informe como o cliente pagou' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) p
             where coalesce((p->>'valor_cents')::bigint, 0) <= 0
                or p->>'forma' not in ('boleto','pix','ted','dinheiro','cartao','debito_automatico','cheque')) then
    raise exception 'Pagamento inválido' using errcode = 'check_violation';
  end if;

  select sum((p->>'valor_cents')::bigint),
         coalesce(sum((p->>'valor_cents')::bigint) filter (where p->>'forma' = 'dinheiro'), 0)
    into v_pago, v_dinheiro
  from jsonb_array_elements(p_pagamentos) p;
  -- forma do título: a que pagou mais
  select p->>'forma' into v_forma from jsonb_array_elements(p_pagamentos) p order by (p->>'valor_cents')::bigint desc limit 1;

  v_ped := public.criar_pedido(p_empresa, coalesce(p_cliente, app.consumidor_final(p_empresa)), p_itens, current_date, current_date,
    '[{"dias":0,"pct":100}]', v_forma, p_observacoes, p_client_id, 'pdv');
  select numero, total_cents into v_numero, v_total from pedidos_venda where id = v_ped;

  if v_pago < v_total then
    raise exception 'Falta receber R$ %', to_char((v_total - v_pago) / 100.0, 'FM999G999G990D00') using errcode = 'check_violation';
  end if;
  v_troco := v_pago - v_total;
  if v_troco > v_dinheiro then
    raise exception 'Os pagamentos passam do total; só dinheiro pode ter troco' using errcode = 'check_violation';
  end if;

  perform public.faturar_pedido(v_ped);
  select id into v_ag from agendamentos where origem = 'pedido_venda' and origem_id = v_ped limit 1;

  v_resto := v_troco;
  for x in select * from jsonb_array_elements(p_pagamentos) loop
    v_valor := (x->>'valor_cents')::bigint;
    if x->>'forma' = 'dinheiro' and v_resto > 0 then
      v_valor := v_valor - least(v_valor, v_resto);
      v_resto := v_resto - least((x->>'valor_cents')::bigint, v_resto);
    end if;
    continue when v_valor <= 0 or v_ag is null;
    v_conta := nullif(x->>'conta_id', '')::uuid;
    if v_conta is null then
      if x->>'forma' <> 'dinheiro' then
        raise exception 'Escolha a conta onde cai o pagamento em %', x->>'forma' using errcode = 'check_violation';
      end if;
      v_conta := app.conta_caixa(p_empresa);
    elsif not exists (select 1 from contas_financeiras where id = v_conta and empresa_id = p_empresa) then
      raise exception 'Conta inválida' using errcode = 'check_violation';
    end if;
    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, forma_pagamento, observacao, created_by)
    values (p_empresa, v_ag, v_conta, current_date, v_valor, x->>'forma', format('PDV · pedido %s', v_numero), auth.uid());
  end loop;

  update pedidos_venda set status = 'entregue', updated_at = now() where id = v_ped;
  return jsonb_build_object('pedido_id', v_ped, 'numero', v_numero, 'total_cents', v_total, 'troco_cents', v_troco, 'repetida', false);
end $$;

-- Recebimentos do PDV por dia, forma e conta (fechamento do caixa)
create view caixa_pdv with (security_invoker = true) as
select b.empresa_id, b.data, coalesce(b.forma_pagamento, 'outro') as forma, b.conta_id, cf.nome as conta_nome,
       count(distinct p.id)::int as vendas, sum(b.valor_cents)::bigint as valor_cents
from baixas b
join agendamentos a on a.id = b.agendamento_id and a.origem = 'pedido_venda'
join pedidos_venda p on p.id = a.origem_id and p.origem = 'pdv'
join contas_financeiras cf on cf.id = b.conta_id
group by b.empresa_id, b.data, coalesce(b.forma_pagamento, 'outro'), b.conta_id, cf.nome;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.venda_balcao(uuid, jsonb, jsonb, uuid, uuid, text) to authenticated;
    grant select on caixa_pdv to authenticated;
  end if;
end $$;
