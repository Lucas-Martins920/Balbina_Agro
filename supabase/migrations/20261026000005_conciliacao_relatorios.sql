-- Marco 2b: extrato bancário, conciliação, fluxo de caixa, caixa × competência e fechamento de mês.

-- ---------------------------------------------------------------------------
-- Importação de extrato (o app lê o OFX e manda as linhas já normalizadas)
-- ---------------------------------------------------------------------------

-- p_linhas: [{id_externo, data, descricao, valor_cents, cpf_cnpj, nome}]
create or replace function public.importar_extrato(p_conta uuid, p_origem text, p_linhas jsonb, p_arquivo text default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_conta contas_financeiras%rowtype;
  v_imp uuid;
  v_novas int;
begin
  select * into v_conta from contas_financeiras where id = p_conta;
  if not found then raise exception 'Conta não encontrada' using errcode = 'no_data_found'; end if;
  if jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Extrato sem lançamentos' using errcode = 'check_violation';
  end if;

  insert into importacoes_extrato (empresa_id, conta_id, origem, arquivo_path, periodo_inicio, periodo_fim, total_linhas, created_by)
  select v_conta.empresa_id, p_conta, p_origem, p_arquivo, min((x->>'data')::date), max((x->>'data')::date), count(*), auth.uid()
  from jsonb_array_elements(p_linhas) x
  returning id into v_imp;

  with novas as (
    insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents,
                                      cpf_cnpj_contraparte, nome_contraparte, id_externo)
    select v_conta.empresa_id, p_conta, v_imp, (x->>'data')::date, coalesce(nullif(trim(x->>'descricao'), ''), 'Sem descrição'),
           (x->>'valor_cents')::bigint, nullif(regexp_replace(coalesce(x->>'cpf_cnpj', ''), '\D', '', 'g'), ''),
           nullif(trim(x->>'nome'), ''), x->>'id_externo'
    from jsonb_array_elements(p_linhas) x
    where (x->>'valor_cents')::bigint <> 0
    on conflict (conta_id, id_externo) do nothing
    returning 1
  )
  select count(*) into v_novas from novas;

  update importacoes_extrato set linhas_novas = v_novas where id = v_imp;
  return jsonb_build_object('importacao_id', v_imp, 'total', jsonb_array_length(p_linhas), 'novas', v_novas);
end $$;

-- ---------------------------------------------------------------------------
-- Sugestões: títulos em aberto do mesmo sentido com valor igual e data próxima
-- ---------------------------------------------------------------------------

create or replace function public.sugestoes_conciliacao(p_movimento uuid)
returns table (agendamento_id uuid, descricao text, contato_nome text, vencimento date, saldo_cents bigint, pontos int)
language sql stable set search_path = public as $$
  with m as (select * from movimentos_bancarios where id = p_movimento)
  select t.id, t.descricao, t.contato_nome, t.vencimento, t.saldo_cents,
         (case when t.saldo_cents = abs(m.valor_cents) then 50 else 0 end
          + greatest(0, 30 - abs(t.vencimento - m.data) * 3)
          + case when m.cpf_cnpj_contraparte is not null and ct.cpf_cnpj = m.cpf_cnpj_contraparte then 40 else 0 end)::int as pontos
  from m
  join titulos t on t.empresa_id = m.empresa_id
                and t.tipo = case when m.valor_cents > 0 then 'receber' else 'pagar' end
                and t.status in ('aberto', 'parcial')
                and t.saldo_cents > 0
  left join contatos ct on ct.id = t.contato_id
  where t.saldo_cents = abs(m.valor_cents)
     or (m.cpf_cnpj_contraparte is not null and ct.cpf_cnpj = m.cpf_cnpj_contraparte and t.saldo_cents >= abs(m.valor_cents))
     or (abs(t.vencimento - m.data) <= 5 and t.saldo_cents between abs(m.valor_cents) * 0.9 and abs(m.valor_cents) * 1.1)
  order by pontos desc, abs(t.vencimento - m.data)
  limit 5
$$;

create or replace function app.movimento_pendente(p_movimento uuid) returns movimentos_bancarios
language plpgsql as $$
declare v movimentos_bancarios%rowtype;
begin
  select * into v from movimentos_bancarios where id = p_movimento for update;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  if v.status <> 'pendente' then raise exception 'Lançamento já está %', v.status using errcode = 'check_violation'; end if;
  return v;
end $$;

-- Concilia com um título existente. Diferença a maior vira juros; a menor fica como baixa parcial.
create or replace function public.conciliar_com_titulo(p_movimento uuid, p_agendamento uuid, p_modo text default 'manual')
returns uuid language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  t titulos%rowtype;
  v_valor bigint := abs(v.valor_cents);
  v_baixa uuid;
begin
  select * into t from titulos where id = p_agendamento;
  if not found or t.empresa_id <> v.empresa_id then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if t.tipo <> (case when v.valor_cents > 0 then 'receber' else 'pagar' end) then
    raise exception 'Entrada no extrato só concilia com conta a receber, e saída com conta a pagar' using errcode = 'check_violation';
  end if;

  insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao, created_by)
  values (v.empresa_id, t.id, v.conta_id, v.data, least(v_valor, t.saldo_cents), greatest(0, v_valor - t.saldo_cents),
          'Conciliação: ' || v.descricao, auth.uid())
  returning id into v_baixa;

  insert into conciliacoes (empresa_id, movimento_id, baixa_id, valor_cents, modo, created_by)
  values (v.empresa_id, v.id, v_baixa, v.valor_cents, p_modo, auth.uid());
  update movimentos_bancarios set status = 'conciliado' where id = v.id;
  return v_baixa;
end $$;

-- Lançamento que não estava agendado: cria o título já baixado.
create or replace function public.conciliar_criando_titulo(p_movimento uuid, p_categoria uuid, p_centro_custo uuid default null,
                                                           p_contato uuid default null, p_descricao text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  v_ag uuid;
begin
  v_ag := public.agendar_titulo(v.empresa_id, case when v.valor_cents > 0 then 'receber' else 'pagar' end,
    coalesce(nullif(trim(p_descricao), ''), v.descricao), v.data, date_trunc('month', v.data)::date, abs(v.valor_cents),
    jsonb_build_array(jsonb_build_object('categoria_id', p_categoria, 'centro_custo_id', p_centro_custo, 'valor_cents', abs(v.valor_cents))),
    p_contato);
  update agendamentos set origem = 'conciliacao', origem_id = v.id where id = v_ag;
  perform public.conciliar_com_titulo(p_movimento, v_ag, 'manual');
  return v_ag;
end $$;

-- Movimento entre contas próprias: cria a transferência (a outra perna aparece no outro extrato).
create or replace function public.conciliar_transferencia(p_movimento uuid, p_outra_conta uuid)
returns uuid language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  v_tr uuid;
  v_outro uuid;
begin
  if not exists (select 1 from contas_financeiras where id = p_outra_conta and empresa_id = v.empresa_id) then
    raise exception 'Conta de contrapartida inválida' using errcode = 'check_violation';
  end if;
  -- se a outra perna já virou transferência, reaproveita
  select c.transferencia_id into v_tr
  from movimentos_bancarios o join conciliacoes c on c.movimento_id = o.id and c.transferencia_id is not null
  join transferencias t on t.id = c.transferencia_id
  where o.conta_id = p_outra_conta and o.valor_cents = -v.valor_cents and abs(o.data - v.data) <= 3
    and t.conta_origem_id in (v.conta_id, p_outra_conta) and t.conta_destino_id in (v.conta_id, p_outra_conta)
    and not exists (select 1 from conciliacoes c2 join movimentos_bancarios m2 on m2.id = c2.movimento_id
                    where c2.transferencia_id = t.id and m2.conta_id = v.conta_id)
  limit 1;

  if v_tr is null then
    insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents, descricao)
    values (v.empresa_id,
            case when v.valor_cents < 0 then v.conta_id else p_outra_conta end,
            case when v.valor_cents < 0 then p_outra_conta else v.conta_id end,
            v.data, abs(v.valor_cents), v.descricao)
    returning id into v_tr;
  end if;

  insert into conciliacoes (empresa_id, movimento_id, transferencia_id, valor_cents, created_by)
  values (v.empresa_id, v.id, v_tr, v.valor_cents, auth.uid());
  update movimentos_bancarios set status = 'conciliado' where id = v.id;
  return v_tr;
end $$;

create or replace function public.ignorar_movimento(p_movimento uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform app.movimento_pendente(p_movimento);
  update movimentos_bancarios set status = 'ignorado' where id = p_movimento;
end $$;

-- Desfaz: apaga as baixas/transferências criadas pela conciliação e volta o lançamento para pendente.
-- Títulos criados na conciliação são cancelados.
create or replace function public.desfazer_conciliacao(p_movimento uuid) returns void
language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  c record;
begin
  select * into v from movimentos_bancarios where id = p_movimento for update;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  for c in select * from conciliacoes where movimento_id = p_movimento loop
    delete from conciliacoes where id = c.id;
    if c.baixa_id is not null then
      delete from baixas where id = c.baixa_id;
    elsif not exists (select 1 from conciliacoes where transferencia_id = c.transferencia_id) then
      delete from transferencias where id = c.transferencia_id;
    end if;
  end loop;
  update agendamentos set status = 'cancelado', updated_at = now()
  where origem = 'conciliacao' and origem_id = p_movimento and pago_cents = 0;
  update movimentos_bancarios set status = 'pendente' where id = p_movimento;
end $$;

-- ---------------------------------------------------------------------------
-- Relatórios
-- ---------------------------------------------------------------------------

-- Regime de competência: o que foi agendado, pelo mês da competência, por categoria e centro de custo.
create view resultado_competencia with (security_invoker = true) as
select a.empresa_id, a.competencia as mes, a.tipo, r.categoria_id, c.nome as categoria, c.grupo, r.centro_custo_id,
       sum(r.valor_cents)::bigint as valor_cents
from agendamentos a
join agendamento_rateios r on r.agendamento_id = a.id
join categorias c on c.id = r.categoria_id
where a.status <> 'cancelado'
group by 1, 2, 3, 4, 5, 6, 7;

-- Regime de caixa: cada baixa distribuída pelas fatias do rateio, pelo mês do pagamento.
create view resultado_caixa with (security_invoker = true) as
select b.empresa_id, date_trunc('month', b.data)::date as mes, a.tipo, r.categoria_id, c.nome as categoria, c.grupo, r.centro_custo_id,
       sum(round((b.valor_cents + b.juros_cents + b.multa_cents - b.desconto_cents)::numeric * r.valor_cents / a.valor_cents))::bigint as valor_cents
from baixas b
join agendamentos a on a.id = b.agendamento_id
join agendamento_rateios r on r.agendamento_id = a.id
join categorias c on c.id = r.categoria_id
group by 1, 2, 3, 4, 5, 6, 7;

-- Fluxo de caixa previsto: saldo em aberto de cada título na data prevista (vencidos entram como "hoje").
create view fluxo_previsto with (security_invoker = true) as
select empresa_id, id as agendamento_id, tipo, descricao, contato_nome,
       greatest(coalesce(previsao, vencimento), current_date) as data, vencimento,
       (case when tipo = 'receber' then 1 else -1 end) * saldo_cents as valor_cents,
       situacao = 'vencido' as vencido
from titulos
where status in ('aberto', 'parcial') and saldo_cents > 0;

-- ---------------------------------------------------------------------------
-- Fechamento de mês
-- ---------------------------------------------------------------------------

create or replace function public.fechar_mes(p_empresa uuid, p_mes date) returns void
language plpgsql set search_path = public as $$
begin
  if not app.tem_permissao(p_empresa, 'financeiro.fechar') then
    raise exception 'Sem permissão para fechar o mês' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from movimentos_bancarios where empresa_id = p_empresa and status = 'pendente'
             and date_trunc('month', data) = date_trunc('month', p_mes)) then
    raise exception 'Há lançamentos do extrato pendentes de conciliação em %', to_char(p_mes, 'MM/YYYY') using errcode = 'check_violation';
  end if;
  insert into periodos_fechados (empresa_id, mes, fechado_por)
  values (p_empresa, date_trunc('month', p_mes)::date, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.reabrir_mes(p_empresa uuid, p_mes date) returns void
language plpgsql set search_path = public as $$
begin
  if not app.tem_permissao(p_empresa, 'financeiro.fechar') then
    raise exception 'Sem permissão para reabrir o mês' using errcode = 'insufficient_privilege';
  end if;
  delete from periodos_fechados where empresa_id = p_empresa and mes = date_trunc('month', p_mes)::date;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.importar_extrato(uuid, text, jsonb, text) to authenticated;
    grant execute on function public.sugestoes_conciliacao(uuid) to authenticated;
    grant execute on function public.conciliar_com_titulo(uuid, uuid, text) to authenticated;
    grant execute on function public.conciliar_criando_titulo(uuid, uuid, uuid, uuid, text) to authenticated;
    grant execute on function public.conciliar_transferencia(uuid, uuid) to authenticated;
    grant execute on function public.ignorar_movimento(uuid) to authenticated;
    grant execute on function public.desfazer_conciliacao(uuid) to authenticated;
    grant execute on function public.fechar_mes(uuid, date) to authenticated;
    grant execute on function public.reabrir_mes(uuid, date) to authenticated;
    grant select on resultado_competencia, resultado_caixa, fluxo_previsto to authenticated;
  end if;
end $$;
