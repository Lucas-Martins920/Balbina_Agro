-- Marco 2a: recorrências, saldos de contas e movimentos de caixa.

-- ---------------------------------------------------------------------------
-- Movimentos de caixa: tudo que entrou e saiu de cada conta
-- ---------------------------------------------------------------------------

create view movimentos_caixa with (security_invoker = true) as
select b.empresa_id, b.conta_id, b.data, 'baixa'::text as origem, b.id as origem_id, a.id as agendamento_id,
       a.descricao,
       (case when a.tipo = 'receber' then 1 else -1 end)
         * (b.valor_cents + b.juros_cents + b.multa_cents - b.desconto_cents) as valor_cents
from baixas b join agendamentos a on a.id = b.agendamento_id
union all
select t.empresa_id, t.conta_origem_id, t.data, 'transferencia', t.id, null, coalesce(t.descricao, 'Transferência'), -t.valor_cents
from transferencias t
union all
select t.empresa_id, t.conta_destino_id, t.data, 'transferencia', t.id, null, coalesce(t.descricao, 'Transferência'), t.valor_cents
from transferencias t;

create view saldos_contas with (security_invoker = true) as
select c.id as conta_id, c.empresa_id, c.nome, c.tipo, c.arquivada,
       c.saldo_inicial_cents + coalesce(sum(m.valor_cents) filter (where m.data >= c.saldo_inicial_data), 0) as saldo_cents,
       max(m.data) as ultimo_movimento
from contas_financeiras c
left join movimentos_caixa m on m.conta_id = c.id
group by c.id;

-- ---------------------------------------------------------------------------
-- Recorrências: geram títulos futuros até o horizonte configurado
-- ---------------------------------------------------------------------------

create unique index if not exists agendamentos_recorrencia_venc_un
  on agendamentos (recorrencia_id, vencimento) where recorrencia_id is not null;

create or replace function app.passo_recorrencia(p_frequencia text) returns interval language sql immutable as $$
  select case p_frequencia
    when 'semanal' then interval '7 days'
    when 'quinzenal' then interval '14 days'
    when 'mensal' then interval '1 month'
    when 'bimestral' then interval '2 months'
    when 'trimestral' then interval '3 months'
    when 'semestral' then interval '6 months'
    when 'anual' then interval '1 year' end
$$;

-- Cria os títulos que faltam de cada recorrência ativa, até hoje + meses_provisionados.
-- Pode rodar quantas vezes quiser: não duplica.
create or replace function public.gerar_recorrencias(p_empresa uuid) returns int
language plpgsql set search_path = public as $$
declare
  r recorrencias%rowtype;
  v_venc date;
  v_limite date;
  v_n int := 0;
  v_k int;
  v_id uuid;
  v_linha jsonb;
begin
  for r in select * from recorrencias where empresa_id = p_empresa and status = 'ativa' loop
    v_limite := least(coalesce(r.termino, 'infinity'::date), (current_date + make_interval(months => r.meses_provisionados))::date);
    v_k := 0;
    loop
      v_venc := (r.inicio + app.passo_recorrencia(r.frequencia) * v_k)::date;
      exit when v_venc > v_limite;
      v_k := v_k + 1;
      continue when exists (select 1 from agendamentos where recorrencia_id = r.id and vencimento = v_venc);

      insert into agendamentos (empresa_id, tipo, contato_id, descricao, vencimento, competencia, previsao,
                                valor_cents, recorrencia_id, origem, origem_id, forma_pagamento)
      values (r.empresa_id, r.tipo, r.contato_id, r.descricao, v_venc, date_trunc('month', v_venc)::date, v_venc,
              r.valor_cents, r.id, 'recorrencia', r.id, r.template->>'forma_pagamento')
      returning id into v_id;

      -- o template guarda o rateio em percentual para sobreviver a reajustes
      perform app.ratear_por_percentual(v_id, r.empresa_id, r.valor_cents, r.template->'rateio');
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;

-- rateio: [{categoria_id, centro_custo_id, pct}] somando 100
create or replace function app.ratear_por_percentual(p_agendamento uuid, p_empresa uuid, p_valor bigint, p_rateio jsonb) returns void
language plpgsql as $$
declare
  v_total int := jsonb_array_length(p_rateio);
  v_acum bigint := 0;
  v_fatia bigint;
  i int := 0;
  x jsonb;
begin
  for x in select * from jsonb_array_elements(p_rateio) loop
    i := i + 1;
    v_fatia := case when i = v_total then p_valor - v_acum
                    else round(p_valor * (x->>'pct')::numeric / 100) end;
    v_acum := v_acum + v_fatia;
    if v_fatia > 0 then
      insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents)
      values (p_empresa, p_agendamento, (x->>'categoria_id')::uuid, nullif(x->>'centro_custo_id', '')::uuid, v_fatia);
    end if;
  end loop;
end $$;

create or replace function public.criar_recorrencia(
  p_empresa uuid,
  p_tipo text,
  p_descricao text,
  p_valor_cents bigint,
  p_frequencia text,
  p_inicio date,
  p_categoria uuid,
  p_centro_custo uuid default null,
  p_contato uuid default null,
  p_termino date default null,
  p_forma_pagamento text default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_sentido text := case p_tipo when 'pagar' then 'saida' when 'receber' then 'entrada' end;
begin
  if not exists (select 1 from categorias where id = p_categoria and empresa_id = p_empresa and sentido = v_sentido) then
    raise exception 'Categoria inválida para um título a %', p_tipo using errcode = 'check_violation';
  end if;
  if p_centro_custo is not null and not exists (select 1 from centros_custo where id = p_centro_custo and empresa_id = p_empresa) then
    raise exception 'Centro de custo inválido' using errcode = 'check_violation';
  end if;

  insert into recorrencias (empresa_id, tipo, contato_id, descricao, valor_cents, frequencia, inicio, termino,
                            dia_vencimento, template)
  values (p_empresa, p_tipo, p_contato, trim(p_descricao), p_valor_cents, p_frequencia, p_inicio, p_termino,
          extract(day from p_inicio)::smallint,
          jsonb_build_object('forma_pagamento', p_forma_pagamento,
            'rateio', jsonb_build_array(jsonb_build_object('categoria_id', p_categoria, 'centro_custo_id', p_centro_custo, 'pct', 100))))
  returning id into v_id;

  perform public.gerar_recorrencias(p_empresa);
  return v_id;
end $$;

-- Encerrar uma recorrência cancela os títulos futuros ainda em aberto.
create or replace function public.encerrar_recorrencia(p_recorrencia uuid, p_a_partir date default current_date) returns int
language plpgsql set search_path = public as $$
declare v_n int;
begin
  update recorrencias set status = 'finalizada', termino = p_a_partir - 1, updated_at = now() where id = p_recorrencia;
  if not found then raise exception 'Recorrência não encontrada' using errcode = 'no_data_found'; end if;
  update agendamentos set status = 'cancelado', updated_at = now()
  where recorrencia_id = p_recorrencia and vencimento >= p_a_partir and status = 'aberto';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.gerar_recorrencias(uuid) to authenticated;
    grant execute on function public.criar_recorrencia(uuid, text, text, bigint, text, date, uuid, uuid, uuid, date, text) to authenticated;
    grant execute on function public.encerrar_recorrencia(uuid, date) to authenticated;
    grant select on movimentos_caixa, saldos_contas to authenticated;
  end if;
end $$;
