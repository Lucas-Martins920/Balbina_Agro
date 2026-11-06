-- Conciliação 1:N (múltipla): um movimento do extrato casa com vários títulos.
-- O status 'parcial' permite adicionar mais títulos até que a soma cubra o valor do extrato.

-- Adiciona o status 'parcial' ao check de movimentos_bancarios.
alter table movimentos_bancarios drop constraint if exists movimentos_bancarios_status_check;
alter table movimentos_bancarios add constraint movimentos_bancarios_status_check
  check (status in ('pendente','parcial','conciliado','ignorado'));

-- Permite movimento_pendente aceitar movimentos parcialmente conciliados.
create or replace function app.movimento_pendente(p_movimento uuid) returns movimentos_bancarios
language plpgsql set search_path = public as $$
declare v movimentos_bancarios%rowtype;
begin
  select * into v from movimentos_bancarios where id = p_movimento for update;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  if v.status not in ('pendente', 'parcial') then raise exception 'Lançamento já está %', v.status using errcode = 'check_violation'; end if;
  return v;
end $$;

-- Soma já conciliada de um movimento (em valor absoluto).
create or replace function app.soma_conciliada(p_movimento uuid) returns bigint
language sql stable set search_path = public as $$
  select coalesce(sum(abs(valor_cents)), 0)::bigint from conciliacoes where movimento_id = p_movimento
$$;

-- Concilia um movimento com vários títulos de uma vez. Cada título recebe uma baixa proporcional,
-- a última absorve o arredondamento ou a diferença que vira juros.
create or replace function public.conciliar_multiplos(p_movimento uuid, p_agendamentos uuid[], p_modo text default 'multipla')
returns uuid[] language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  v_abs bigint := abs(v.valor_cents);
  v_ja bigint := app.soma_conciliada(v.id);
  v_restante bigint := v_abs - v_ja;
  v_tipo text := case when v.valor_cents > 0 then 'receber' else 'pagar' end;
  v_soma bigint := 0;
  v_baixas uuid[] := '{}';
  t titulos%rowtype;
  v_baixa uuid;
  v_valor bigint;
  i int := 0;
  n int := array_length(p_agendamentos, 1);
begin
  if n is null or n = 0 then raise exception 'Informe ao menos um título' using errcode = 'check_violation'; end if;

  for i in 1..n loop
    select * into t from titulos where id = p_agendamentos[i];
    if not found or t.empresa_id <> v.empresa_id then
      raise exception 'Título não encontrado' using errcode = 'no_data_found';
    end if;
    if t.tipo <> v_tipo then
      raise exception 'Entrada no extrato só concilia com conta a receber, e saída com conta a pagar' using errcode = 'check_violation';
    end if;

    v_valor := least(t.saldo_cents, v_restante - v_soma);
    if v_valor <= 0 then continue; end if;

    insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao, created_by)
    values (v.empresa_id, t.id, v.conta_id, v.data, v_valor, 0,
            'Conciliação múltipla: ' || v.descricao, auth.uid())
    returning id into v_baixa;

    insert into conciliacoes (empresa_id, movimento_id, baixa_id, valor_cents, modo, created_by)
    values (v.empresa_id, v.id, v_baixa, case when v.valor_cents > 0 then v_valor else -v_valor end, p_modo, auth.uid());

    v_soma := v_soma + v_valor;
    v_baixas := v_baixas || v_baixa;
    if v_soma >= v_restante then exit; end if;
  end loop;

  if v_soma = 0 then raise exception 'Nenhum título com saldo para conciliar' using errcode = 'check_violation'; end if;

  if v_ja + v_soma >= v_abs then
    update movimentos_bancarios set status = 'conciliado' where id = v.id;
  else
    update movimentos_bancarios set status = 'parcial' where id = v.id;
  end if;

  return v_baixas;
end $$;

-- Atualiza conciliar_com_titulo para funcionar com movimentos parciais (soma ao que já tem).
create or replace function public.conciliar_com_titulo(p_movimento uuid, p_agendamento uuid, p_modo text default 'manual')
returns uuid language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  v_abs bigint := abs(v.valor_cents);
  v_ja bigint := app.soma_conciliada(v.id);
  v_restante bigint := v_abs - v_ja;
  t titulos%rowtype;
  v_valor bigint;
  v_juros bigint;
  v_baixa uuid;
begin
  select * into t from titulos where id = p_agendamento;
  if not found or t.empresa_id <> v.empresa_id then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if t.tipo <> (case when v.valor_cents > 0 then 'receber' else 'pagar' end) then
    raise exception 'Entrada no extrato só concilia com conta a receber, e saída com conta a pagar' using errcode = 'check_violation';
  end if;

  v_valor := least(v_restante, t.saldo_cents);
  v_juros := greatest(0, v_restante - t.saldo_cents);

  insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents, observacao, created_by)
  values (v.empresa_id, t.id, v.conta_id, v.data, v_valor, v_juros,
          'Conciliação: ' || v.descricao, auth.uid())
  returning id into v_baixa;

  -- só a parte que esta baixa cobre (num movimento parcial, o resto já está noutras conciliações)
  insert into conciliacoes (empresa_id, movimento_id, baixa_id, valor_cents, modo, created_by)
  values (v.empresa_id, v.id, v_baixa, sign(v.valor_cents) * (v_valor + v_juros), p_modo, auth.uid());

  if v_ja + v_valor + v_juros >= v_abs then
    update movimentos_bancarios set status = 'conciliado' where id = v.id;
  else
    update movimentos_bancarios set status = 'parcial' where id = v.id;
  end if;

  return v_baixa;
end $$;

-- Inclui movimentos 'parcial' no painel de conciliação (já conciliou parte, falta o resto).
create or replace function public.painel_conciliacao(p_conta uuid, p_limite int default 50)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint, nome_contraparte text, cpf_cnpj_contraparte text,
               sugestoes jsonb, palpite jsonb, transferencia jsonb, certeira uuid, ja_lancados jsonb)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, m.nome_contraparte, m.cpf_cnpj_contraparte,
         s.lista, p.palpite, t.transferencia,
         case when j.lista = '[]'::jsonb
                   and (s.lista->0->>'pontos')::int >= 70
                   and (s.lista->0->>'saldo_cents')::bigint = abs(m.valor_cents)
                   and coalesce((s.lista->1->>'pontos')::int, 0) < (s.lista->0->>'pontos')::int - 10
              then (s.lista->0->>'agendamento_id')::uuid end,
         j.lista
  from movimentos_bancarios m
  cross join lateral (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.pontos desc, abs(x.vencimento - m.data)), '[]'::jsonb) as lista
    from public.sugestoes_conciliacao(m.id) x
  ) s
  cross join lateral (select app.ja_lancados(m) as lista) j
  left join lateral (select to_jsonb(x) as palpite from public.palpite_lancamento(m.id) x limit 1) p on true
  left join lateral (
    select jsonb_build_object('conta_id', o.conta_id, 'conta_nome', cf.nome) as transferencia
    from movimentos_bancarios o join contas_financeiras cf on cf.id = o.conta_id
    where o.empresa_id = m.empresa_id and o.conta_id <> m.conta_id and o.valor_cents = -m.valor_cents
      and abs(o.data - m.data) <= 3 and o.status <> 'ignorado'
    order by abs(o.data - m.data)
    limit 1
  ) t on true
  where m.conta_id = p_conta and m.status in ('pendente', 'parcial')
    and m.data >= (select cf.saldo_inicial_data from contas_financeiras cf where cf.id = p_conta)
  order by m.data, m.id
  limit p_limite
$$;

create or replace function public.palpites_firmes(p_conta uuid)
returns table (movimento_id uuid, data date, descricao text, valor_cents bigint,
               categoria_id uuid, centro_custo_id uuid, contato_id uuid, vezes int)
language sql stable set search_path = public as $$
  select m.id, m.data, m.descricao, m.valor_cents, h.categoria_id, h.centro_custo_id, h.contato_id, h.vezes::int
  from movimentos_bancarios m
  cross join lateral (
    select (array_agg(x.categoria_id))[1] categoria_id, (array_agg(x.centro_custo_id))[1] centro_custo_id,
           (array_agg(x.contato_id))[1] contato_id, count(*) vezes, count(distinct x.categoria_id) categorias
    from app.historico_movimento(m) x
  ) h
  where m.conta_id = p_conta and m.status in ('pendente', 'parcial')
    and m.data >= (select cf.saldo_inicial_data from contas_financeiras cf where cf.id = p_conta)
    and h.vezes >= 2 and h.categorias = 1
    and exists (select 1 from categorias k where k.id = h.categoria_id and k.ativa
                and k.sentido = case when m.valor_cents > 0 then 'entrada' else 'saida' end)
    and not exists (select 1 from public.sugestoes_conciliacao(m.id))
    and app.ja_lancados(m) = '[]'::jsonb
  order by m.data, m.id
  limit 200
$$;

-- Atualiza desconciliar para aceitar status 'parcial' também (e continua desfazendo o 'ignorado').
create or replace function public.desconciliar(p_movimento uuid, p_motivo text, p_manter_titulo boolean default false) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  v_motivo text := app.motivo_valido(p_motivo);
  v_feito text[];
begin
  select * into v from movimentos_bancarios where id = p_movimento;
  if not found or not app.pode(v.empresa_id, 'conciliacao.editar') then
    raise exception 'Sem permissão para desconciliar' using errcode = 'insufficient_privilege';
  end if;
  if v.status = 'pendente' then
    raise exception 'Este lançamento não está conciliado' using errcode = 'check_violation';
  end if;
  v_feito := app.soltar_conciliacao(p_movimento, false, p_manter_titulo);
  perform app.registrar_desconciliacao(v, 'update', 'Desconciliou', v_motivo, v_feito);
  return v_feito;
end $$;
