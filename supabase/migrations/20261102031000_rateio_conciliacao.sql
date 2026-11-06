-- Rateio em várias categorias na conciliação e reclassificação do rateio de um título.
--
-- O título já guarda o rateio em agendamento_rateios (categoria + centro de custo + valor por linha),
-- e o DRE (resultado_competencia/resultado_caixa) e o custo do kg (calcular_custos_mes) já leem linha a linha.
-- Faltava:
--   1. conciliar um lançamento do extrato criando um título com várias linhas (compra única no banco
--      que cobre itens de categorias diferentes);
--   2. trocar o rateio de um título existente (inclusive já pago ou conciliado) sem excluir e relançar.

-- Confere um rateio contra o título: lista de 1 a 50 linhas, valores positivos que somam o total,
-- categoria do sentido certo e centro de custo da mesma empresa.
create or replace function app.validar_rateio(p_empresa uuid, p_tipo text, p_valor_cents bigint, p_rateio jsonb)
returns void language plpgsql stable set search_path = public as $$
declare
  v_sentido text := case p_tipo when 'pagar' then 'saida' when 'receber' then 'entrada' end;
  v_soma bigint;
begin
  if p_rateio is null or jsonb_typeof(p_rateio) <> 'array' or jsonb_array_length(p_rateio) = 0 then
    raise exception 'Informe ao menos uma categoria' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_rateio) > 50 then
    raise exception 'Rateio com mais de 50 linhas' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rateio) x
             where jsonb_typeof(x) <> 'object' or nullif(x->>'categoria_id', '') is null
                or coalesce((x->>'valor_cents')::bigint, 0) <= 0) then
    raise exception 'Cada linha do rateio precisa de categoria e valor maior que zero' using errcode = 'check_violation';
  end if;
  select sum((x->>'valor_cents')::bigint) into v_soma from jsonb_array_elements(p_rateio) x;
  if v_soma <> p_valor_cents then
    raise exception 'O rateio soma % e o título vale %', v_soma, p_valor_cents using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rateio) x
    left join categorias c on c.id = (x->>'categoria_id')::uuid and c.empresa_id = p_empresa
    left join centros_custo cc on cc.id = nullif(x->>'centro_custo_id', '')::uuid and cc.empresa_id = p_empresa
    where c.id is null or c.sentido <> v_sentido
       or (nullif(x->>'centro_custo_id', '') is not null and cc.id is null)
  ) then
    raise exception 'Categoria ou centro de custo inválido para um título a %', p_tipo using errcode = 'check_violation';
  end if;
end $$;

-- agendar_titulo passa a guardar a descrição de cada linha do rateio (única mudança na função).
create or replace function public.agendar_titulo(
  p_empresa uuid,
  p_tipo text,
  p_descricao text,
  p_vencimento date,
  p_competencia date,
  p_valor_cents bigint,
  p_rateio jsonb,               -- [{"categoria_id": "...", "centro_custo_id": "..."|null, "valor_cents": 123}]
  p_contato uuid default null,
  p_referencia text default null,
  p_parcelas int default 1,
  p_forma_pagamento text default null
) returns uuid                  -- grupo_parcelamento_id (ou o id do título quando é parcela única)
language plpgsql set search_path = public as $$
declare
  v_sentido text := case p_tipo when 'pagar' then 'saida' when 'receber' then 'entrada' end;
  v_soma bigint;
  v_grupo uuid := gen_random_uuid();
  v_id uuid;
  v_valor_parcela bigint;
  v_n int := coalesce(p_parcelas, 1);
  i int;
  r record;
  v_linhas int;
  v_acumulado bigint;
  v_fatia bigint;
  j int;
begin
  if v_sentido is null then raise exception 'Tipo deve ser pagar ou receber' using errcode = 'check_violation'; end if;
  if v_n < 1 or v_n > 120 then raise exception 'Parcelas entre 1 e 120' using errcode = 'check_violation'; end if;
  if p_valor_cents < v_n then raise exception 'Valor menor que o número de parcelas' using errcode = 'check_violation'; end if;
  if jsonb_typeof(p_rateio) <> 'array' or jsonb_array_length(p_rateio) = 0 then
    raise exception 'Informe ao menos uma categoria' using errcode = 'check_violation';
  end if;

  select sum((x->>'valor_cents')::bigint) into v_soma from jsonb_array_elements(p_rateio) x;
  if v_soma <> p_valor_cents then
    raise exception 'O rateio soma % e o título vale %', v_soma, p_valor_cents using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rateio) x
    left join categorias c on c.id = (x->>'categoria_id')::uuid and c.empresa_id = p_empresa
    left join centros_custo cc on cc.id = nullif(x->>'centro_custo_id', '')::uuid and cc.empresa_id = p_empresa
    where c.id is null or c.sentido <> v_sentido or (x->>'valor_cents')::bigint <= 0
       or (nullif(x->>'centro_custo_id', '') is not null and cc.id is null)
  ) then
    raise exception 'Categoria ou centro de custo inválido para um título a %', p_tipo using errcode = 'check_violation';
  end if;

  v_linhas := jsonb_array_length(p_rateio);

  for i in 1..v_n loop
    -- centavos que sobram da divisão ficam na primeira parcela
    v_valor_parcela := p_valor_cents / v_n + case when i = 1 then p_valor_cents % v_n else 0 end;

    insert into agendamentos (empresa_id, tipo, contato_id, descricao, referencia, vencimento, competencia, previsao,
                              valor_cents, forma_pagamento, parcela_numero, parcela_total, grupo_parcelamento_id, created_by)
    values (p_empresa, p_tipo, p_contato, trim(p_descricao), nullif(trim(p_referencia), ''),
            (p_vencimento + make_interval(months => i - 1))::date,
            date_trunc('month', p_competencia)::date,
            (p_vencimento + make_interval(months => i - 1))::date,
            v_valor_parcela, p_forma_pagamento,
            case when v_n > 1 then i end, case when v_n > 1 then v_n end,
            case when v_n > 1 then v_grupo end, auth.uid())
    returning id into v_id;

    -- rateio proporcional em cada parcela; a última linha absorve o arredondamento
    v_acumulado := 0;
    j := 0;
    for r in select x from jsonb_array_elements(p_rateio) x loop
      j := j + 1;
      if j = v_linhas then
        v_fatia := v_valor_parcela - v_acumulado;
      else
        v_fatia := round(v_valor_parcela::numeric * (r.x->>'valor_cents')::bigint / p_valor_cents);
      end if;
      v_acumulado := v_acumulado + v_fatia;
      if v_fatia > 0 then
        insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents, descricao)
        values (p_empresa, v_id, (r.x->>'categoria_id')::uuid, nullif(r.x->>'centro_custo_id', '')::uuid, v_fatia,
                left(nullif(trim(r.x->>'descricao'), ''), 200));
      end if;
    end loop;
  end loop;

  return case when v_n > 1 then v_grupo else v_id end;
end $$;

-- Grava o rateio já validado no lugar do que o título tinha.
create or replace function app.gravar_rateio(p_titulo uuid, p_empresa uuid, p_rateio jsonb) returns void
language sql set search_path = public as $$
  delete from agendamento_rateios where agendamento_id = p_titulo;
  insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents, descricao)
  select p_empresa, p_titulo, (x->>'categoria_id')::uuid, nullif(x->>'centro_custo_id', '')::uuid,
         (x->>'valor_cents')::bigint, left(nullif(trim(x->>'descricao'), ''), 200)
  from jsonb_array_elements(p_rateio) x;
$$;

-- Concilia criando o título com o rateio informado. O valor do título é o do extrato.
-- Desconciliar continua igual: o título nasce com origem 'conciliacao' e é cancelado (ou mantido em aberto).
create or replace function public.conciliar_rateando(p_movimento uuid, p_rateio jsonb,
                                                     p_contato uuid default null, p_descricao text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v movimentos_bancarios%rowtype := app.movimento_pendente(p_movimento);
  v_tipo text := case when v.valor_cents > 0 then 'receber' else 'pagar' end;
  v_ag uuid;
begin
  perform app.validar_rateio(v.empresa_id, v_tipo, abs(v.valor_cents), p_rateio);
  v_ag := public.agendar_titulo(v.empresa_id, v_tipo,
    coalesce(nullif(trim(p_descricao), ''), v.descricao), v.data, date_trunc('month', v.data)::date, abs(v.valor_cents),
    p_rateio, p_contato);
  update agendamentos set origem = 'conciliacao', origem_id = v.id where id = v_ag;
  perform public.conciliar_com_titulo(p_movimento, v_ag, 'manual');
  return v_ag;
end $$;

-- A versão de uma categoria só (regras, "lançar como nas últimas vezes", tela antiga) vira um rateio de uma linha.
create or replace function public.conciliar_criando_titulo(p_movimento uuid, p_categoria uuid, p_centro_custo uuid default null,
                                                           p_contato uuid default null, p_descricao text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v_valor bigint;
begin
  select abs(valor_cents) into v_valor from movimentos_bancarios where id = p_movimento;
  return public.conciliar_rateando(p_movimento,
    jsonb_build_array(jsonb_build_object('categoria_id', p_categoria, 'centro_custo_id', p_centro_custo, 'valor_cents', v_valor)),
    p_contato, p_descricao);
end $$;

-- Troca o rateio de um título (categorias, centros de custo e valores), mantendo o valor total.
-- Vale com o título pago ou conciliado: o caixa não muda, só a classificação no DRE e no custo do kg.
-- Mês de competência fechado bloqueia. A troca fica no Histórico (trigger de agendamento_rateios).
create or replace function public.ratear_titulo(p_titulo uuid, p_rateio jsonb) returns void
language plpgsql set search_path = public as $$
declare
  a agendamentos%rowtype;
begin
  perform app.exige_pode_titulos(array[p_titulo]);
  select * into a from agendamentos where id = p_titulo for update;
  if not found then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if a.status in ('cancelado', 'perda') then
    raise exception 'Restaure o título antes de mudar o rateio' using errcode = 'check_violation';
  end if;
  if app.mes_fechado(a.empresa_id, a.competencia) then
    raise exception 'Mês % está fechado', to_char(a.competencia, 'MM/YYYY') using errcode = 'check_violation';
  end if;
  perform app.validar_rateio(a.empresa_id, a.tipo, a.valor_cents, p_rateio);

  perform app.gravar_rateio(a.id, a.empresa_id, p_rateio);
  update agendamentos set updated_at = now() where id = a.id;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function app.validar_rateio(uuid, text, bigint, jsonb) from public;
    grant execute on function app.validar_rateio(uuid, text, bigint, jsonb) to authenticated;
    revoke all on function app.gravar_rateio(uuid, uuid, jsonb) from public;
    grant execute on function app.gravar_rateio(uuid, uuid, jsonb) to authenticated;
    revoke all on function public.conciliar_rateando(uuid, jsonb, uuid, text) from public;
    grant execute on function public.conciliar_rateando(uuid, jsonb, uuid, text) to authenticated;
    revoke all on function public.ratear_titulo(uuid, jsonb) from public;
    grant execute on function public.ratear_titulo(uuid, jsonb) to authenticated;
  end if;
end $$;
