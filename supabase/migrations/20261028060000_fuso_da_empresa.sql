-- Data de "hoje" no fuso de cada piscicultura (decisão do Nicolas em 2026-10-28: um fuso por empresa,
-- padrão America/Manaus). O Supabase roda em UTC: com current_date, uma venda às 21h de Manaus
-- caía no dia seguinte e um título que vence hoje aparecia vencido a partir das 20h.
-- Toda função ou view que precisa de "hoje" usa app.hoje(empresa), nunca current_date.

alter table empresas add column if not exists fuso text not null default 'America/Manaus';
-- nome de fuso inválido dá erro na conversão
alter table empresas add constraint empresas_fuso_valido check ((now() at time zone fuso) is not null);

-- SQL simples (sem security definer) para o planejador embutir nas views
create or replace function app.hoje(p_empresa uuid) returns date
language sql stable as $$
  select (now() at time zone coalesce((select e.fuso from public.empresas e where e.id = p_empresa), 'America/Manaus'))::date
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.hoje(uuid) to authenticated, service_role;
  end if;
end $$;

-- Funções e views recriadas a partir da definição atual, trocando só current_date.

CREATE OR REPLACE FUNCTION app.gerar_recorrencias_base(p_empresa uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    v_limite := least(coalesce(r.termino, 'infinity'::date), (app.hoje(p_empresa) + make_interval(months => r.meses_provisionados))::date);
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
end $function$;

CREATE OR REPLACE FUNCTION public.encerrar_recorrencia(p_recorrencia uuid, p_a_partir date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  p_a_partir := coalesce(p_a_partir, app.hoje((select empresa_id from recorrencias where id = p_recorrencia)));
  update recorrencias set status = 'finalizada', termino = p_a_partir - 1, updated_at = now() where id = p_recorrencia;
  if not found then raise exception 'Recorrência não encontrada' using errcode = 'no_data_found'; end if;
  update agendamentos set status = 'cancelado', updated_at = now()
  where recorrencia_id = p_recorrencia and vencimento >= p_a_partir and status = 'aberto';
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.descartar_ovos_carencia(p_evento uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  e eventos_sanitarios%rowtype;
  v_total bigint := 0;
  r record;
begin
  select * into e from eventos_sanitarios where id = p_evento for update;
  if not found then raise exception 'Evento não encontrado' using errcode = 'no_data_found'; end if;
  if e.carencia_descartada then raise exception 'Os ovos desta carência já foram descartados' using errcode = 'check_violation'; end if;
  for r in select k.classe_peixe_id, k.ovos, eo.saldo from ovos_em_carencia k
           join estoque_peixe eo on eo.classe_id = k.classe_peixe_id where k.evento_id = p_evento loop
    if least(r.ovos, r.saldo) > 0 then
      insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, origem_tabela, origem_id, created_by)
      values (e.empresa_id, app.produto_base_peixe(r.classe_peixe_id), app.deposito_ovos(e.empresa_id), app.hoje(e.empresa_id), 'perda',
              -least(r.ovos, r.saldo), e.lote_id, 'eventos_sanitarios', e.id, auth.uid());
      v_total := v_total + least(r.ovos, r.saldo);
    end if;
  end loop;
  update eventos_sanitarios set carencia_descartada = true where id = p_evento;
  return v_total;
end $function$;

CREATE OR REPLACE FUNCTION public.ajustar_estoque_peixe(p_empresa uuid, p_classe uuid, p_contado bigint, p_observacao text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_dif bigint;
begin
  if p_contado < 0 then raise exception 'Quantidade contada não pode ser negativa' using errcode = 'check_violation'; end if;
  select p_contado - saldo into v_dif from estoque_peixe where classe_id = p_classe and empresa_id = p_empresa;
  if not found then raise exception 'Classe de ovo não encontrada' using errcode = 'no_data_found'; end if;
  if v_dif <> 0 then
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, created_by)
    values (p_empresa, app.produto_base_peixe(p_classe), app.deposito_ovos(p_empresa), app.hoje(p_empresa), 'ajuste', v_dif,
            coalesce(nullif(trim(p_observacao), ''), 'inventário'), auth.uid());
  end if;
  return v_dif;
end $function$;

CREATE OR REPLACE FUNCTION public.criar_pedido(p_empresa uuid, p_cliente uuid, p_itens jsonb, p_data date DEFAULT NULL::date, p_entrega date DEFAULT NULL::date, p_parcelas jsonb DEFAULT '[{"pct": 100, "dias": 0}]'::jsonb, p_forma_pagamento text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'web'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_numero int;
  x jsonb;
  v_preco bigint;
  v_prod produtos%rowtype;
begin
  p_data := coalesce(p_data, app.hoje(p_empresa));
  if p_client_id is not null then
    select id into v_id from pedidos_venda where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if not exists (select 1 from contatos where id = p_cliente and empresa_id = p_empresa and 'cliente' = any(tipos)) then
    raise exception 'Cliente inválido' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens' using errcode = 'check_violation';
  end if;
  if (select coalesce(sum((p->>'pct')::numeric), 0) from jsonb_array_elements(p_parcelas) p) <> 100 then
    raise exception 'As parcelas precisam somar 100%%' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('pedido:' || p_empresa::text));
  select coalesce(max(numero), 0) + 1 into v_numero from pedidos_venda where empresa_id = p_empresa;

  insert into pedidos_venda (empresa_id, numero, cliente_id, vendedor_user_id, data, entrega_prevista, condicao_pagamento,
                             forma_pagamento, status, origem, client_id, observacoes)
  values (p_empresa, v_numero, p_cliente, auth.uid(), p_data, p_entrega, jsonb_build_object('parcelas', p_parcelas),
          p_forma_pagamento, 'aberto', p_origem, p_client_id, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  for x in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from produtos where id = (x->>'produto_id')::uuid and empresa_id = p_empresa and ativo;
    if not found then raise exception 'Produto inválido no pedido' using errcode = 'check_violation'; end if;
    if v_prod.tipo = 'ovo' and v_prod.base_estoque is false and v_prod.fator_kg is null then
      raise exception 'Produto % sem quantidade de ovos por unidade', v_prod.nome using errcode = 'check_violation';
    end if;
    v_preco := coalesce((x->>'preco_unit_cents')::bigint, public.preco_vigente(v_prod.id, p_cliente, p_data));
    if v_preco is null then
      raise exception 'Sem preço para % (cadastre na tabela de preços ou informe no pedido)', v_prod.nome using errcode = 'check_violation';
    end if;
    if coalesce((x->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade inválida para %', v_prod.nome using errcode = 'check_violation';
    end if;
    insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unit_cents)
    values (v_id, v_prod.id, (x->>'quantidade')::numeric, v_preco);
  end loop;

  update pedidos_venda set total_cents = (select sum(total_cents) from pedido_itens where pedido_id = v_id) where id = v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.faturar_pedido(p_pedido uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  p pedidos_venda%rowtype;
  r record;
  v_cat uuid;
  v_cc uuid;
  v_cliente text;
  v_n int;
  v_i int := 0;
  v_acum bigint := 0;
  v_valor bigint;
  v_ag uuid;
  x jsonb;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.status not in ('aberto', 'separado') then
    raise exception 'Pedido % não pode ser faturado', p.status using errcode = 'check_violation';
  end if;

  for r in
    select pr.classe_peixe_id, sum(i.quantidade * pr.fator_kg)::bigint as ovos, eo.classe, eo.disponivel, eo.em_carencia
    from pedido_itens i join produtos pr on pr.id = i.produto_id
    join estoque_peixe eo on eo.classe_id = pr.classe_peixe_id
    where i.pedido_id = p_pedido and pr.tipo = 'ovo'
    group by pr.classe_peixe_id, eo.classe, eo.disponivel, eo.em_carencia
  loop
    if r.ovos > r.disponivel then
      raise exception 'Estoque insuficiente de ovos %: o pedido precisa de % e há % disponíveis%', r.classe, r.ovos, r.disponivel,
        case when r.em_carencia > 0 then format(' (%s em carência)', r.em_carencia) else '' end
        using errcode = 'check_violation';
    end if;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, origem_id, created_by)
    values (p.empresa_id, app.produto_base_peixe(r.classe_peixe_id), app.deposito_ovos(p.empresa_id), app.hoje(p.empresa_id), 'venda', -r.ovos,
            'pedidos_venda', p.id, auth.uid());
  end loop;

  select id into v_cat from categorias where empresa_id = p.empresa_id and sentido = 'entrada' and nome = 'Venda de ovos';
  if v_cat is null then
    select id into v_cat from categorias where empresa_id = p.empresa_id and grupo = 'receita_operacional' and sentido = 'entrada' order by nome limit 1;
  end if;
  select id into v_cc from centros_custo where empresa_id = p.empresa_id and tipo = 'comercial' order by nome limit 1;
  select nome into v_cliente from contatos where id = p.cliente_id;

  v_n := jsonb_array_length(p.condicao_pagamento->'parcelas');
  for x in select * from jsonb_array_elements(p.condicao_pagamento->'parcelas') loop
    v_i := v_i + 1;
    v_valor := case when v_i = v_n then p.total_cents - v_acum else round(p.total_cents * (x->>'pct')::numeric / 100) end;
    v_acum := v_acum + v_valor;
    continue when v_valor <= 0;
    v_ag := public.agendar_titulo(p.empresa_id, 'receber', format('Pedido %s · %s', p.numero, v_cliente),
      p.data + coalesce((x->>'dias')::int, 0), date_trunc('month', p.data)::date, v_valor,
      jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'centro_custo_id', v_cc, 'valor_cents', v_valor)),
      p.cliente_id, format('Pedido %s', p.numero), 1, p.forma_pagamento);
    update agendamentos set origem = 'pedido_venda', origem_id = p.id,
      parcela_numero = case when v_n > 1 then v_i end, parcela_total = case when v_n > 1 then v_n end
    where id = v_ag;
  end loop;

  update pedidos_venda set status = 'faturado', updated_at = now() where id = p_pedido;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.preparar_cobranca(p_agendamento uuid, p_perfil uuid, p_meio text DEFAULT 'boleto_pix'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  t titulos%rowtype;
  p perfis_cobranca%rowtype;
  v_doc text;
  v_id uuid;
begin
  select * into t from titulos where id = p_agendamento;
  if not found then raise exception 'Título não encontrado' using errcode = 'no_data_found'; end if;
  if t.tipo <> 'receber' then raise exception 'Só contas a receber podem ser cobradas' using errcode = 'check_violation'; end if;
  if t.status not in ('aberto', 'parcial') or t.saldo_cents <= 0 then
    raise exception 'Título sem saldo em aberto' using errcode = 'check_violation';
  end if;
  select * into p from perfis_cobranca where id = p_perfil and empresa_id = t.empresa_id and ativo;
  if not found then raise exception 'Perfil de cobrança inválido' using errcode = 'check_violation'; end if;
  if p.conta_repasse_id is null then
    raise exception 'Defina no perfil a conta onde o dinheiro da cobrança cai' using errcode = 'check_violation';
  end if;
  select cpf_cnpj into v_doc from contatos where id = t.contato_id;
  if v_doc is null then
    raise exception 'O cliente precisa ter CPF ou CNPJ cadastrado para receber boleto ou Pix' using errcode = 'check_violation';
  end if;

  insert into cobrancas (empresa_id, agendamento_id, perfil_cobranca_id, meio, vencimento, valor_cents)
  values (t.empresa_id, t.id, p.id, p_meio, greatest(t.vencimento, app.hoje(t.empresa_id)), t.saldo_cents)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Este título já tem uma cobrança em aberto' using errcode = 'check_violation';
end $function$;

CREATE OR REPLACE FUNCTION public.venda_balcao(p_empresa uuid, p_itens jsonb, p_pagamentos jsonb, p_cliente uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

  v_ped := public.criar_pedido(p_empresa, coalesce(p_cliente, app.consumidor_final(p_empresa)), p_itens, app.hoje(p_empresa), app.hoje(p_empresa),
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
    values (p_empresa, v_ag, v_conta, app.hoje(p_empresa), v_valor, x->>'forma', format('PDV · pedido %s', v_numero), auth.uid());
  end loop;

  update pedidos_venda set status = 'entregue', updated_at = now() where id = v_ped;
  return jsonb_build_object('pedido_id', v_ped, 'numero', v_numero, 'total_cents', v_total, 'troco_cents', v_troco, 'repetida', false);
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_apontamento(p_empresa uuid, p_lote uuid, p_viveiro uuid, p_data date, p_turno text, p_ovos integer, p_mortes integer DEFAULT 0, p_descartes integer DEFAULT 0, p_racao_kg numeric DEFAULT 0, p_agua_l numeric DEFAULT NULL::numeric, p_observacoes text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT 'web'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_aloc lote_alocacoes%rowtype;
  v_peixes int;
  v_dia uuid;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from apontamento_lancamentos where client_id = p_client_id;
    if found then return v_id; end if;   -- reenvio do app offline
  end if;

  if p_data > app.hoje(p_empresa) then
    raise exception 'Não dá para apontar uma data futura' using errcode = 'check_violation';
  end if;
  if p_turno is null or p_turno not in ('manha', 'tarde') then
    raise exception 'Informe o turno: manhã ou tarde' using errcode = 'check_violation';
  end if;
  if p_ovos is null or p_ovos < 0 then
    raise exception 'Informe a quantidade de ovos do lançamento' using errcode = 'check_violation';
  end if;

  -- sem lote informado, vale o lote que estava no viveiro naquele dia
  select * into v_aloc from lote_alocacoes
  where (p_lote is null or lote_id = p_lote) and viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data;
  if not found then
    if p_lote is null then
      raise exception 'Nenhum lote estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
    raise exception 'O lote não estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  p_lote := v_aloc.lote_id;

  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_peixes
  from apontamentos_diarios
  where lote_id = p_lote and viveiro_id = p_viveiro and data < p_data and data >= lower(v_aloc.periodo);

  insert into apontamentos_diarios (empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia, origem, created_by)
  values (p_empresa, p_lote, p_viveiro, p_data, v_peixes, p_origem, auth.uid())
  on conflict (lote_id, viveiro_id, data) do update set updated_at = now()
  returning id into v_dia;

  insert into apontamento_lancamentos (empresa_id, apontamento_id, turno, ovos, mortes, descartes, racao_kg, agua_l,
                                       observacoes, origem, client_id, created_by)
  values (p_empresa, v_dia, p_turno, p_ovos, coalesce(p_mortes, 0), coalesce(p_descartes, 0), coalesce(p_racao_kg, 0),
          p_agua_l, nullif(trim(p_observacoes), ''), p_origem, p_client_id, auth.uid())
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_despesca(p_empresa uuid, p_data date, p_itens jsonb, p_lote uuid DEFAULT NULL::uuid, p_observacoes text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_sem uuid;
  v_total int;
  v_disponivel bigint;
begin
  if p_client_id is not null then
    select id into v_id from despescas where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Data da classificação inválida' using errcode = 'check_violation';
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'estoque.editar']) then
    raise exception 'Seu usuário não tem permissão para classificar ovos' using errcode = 'insufficient_privilege';
  end if;
  if p_lote is not null and not exists (select 1 from lotes where id = p_lote and empresa_id = p_empresa) then
    raise exception 'Lote não encontrado' using errcode = 'check_violation';
  end if;

  v_sem := app.classe_sem_classificacao(p_empresa);
  if jsonb_typeof(coalesce(p_itens, '{}')) <> 'object' or exists (
    select 1 from jsonb_each_text(coalesce(p_itens, '{}')) o
    where o.value !~ '^\d+$'
       or not exists (select 1 from classes_peixe c where c.id::text = o.key and c.empresa_id = p_empresa and not c.sem_classificacao)
  ) then
    raise exception 'Classe de ovo inválida ou quantidade negativa' using errcode = 'check_violation';
  end if;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(coalesce(p_itens, '{}'));
  if v_total <= 0 then
    raise exception 'Informe quantos ovos foram para cada classe' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('registrar_despesca:' || p_empresa));   -- duas ao mesmo tempo não passam do saldo
  select disponivel into v_disponivel from estoque_peixe where classe_id = v_sem;
  if v_total > coalesce(v_disponivel, 0) then
    raise exception 'Há só % ovos sem classificação disponíveis (os em carência não entram)', coalesce(v_disponivel, 0)
      using errcode = 'check_violation';
  end if;

  insert into despescas (empresa_id, data, lote_id, total, observacoes, client_id, created_by)
  values (p_empresa, p_data, p_lote, v_total, nullif(trim(p_observacoes), ''), p_client_id, auth.uid())
  returning id into v_id;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, origem_tabela, origem_id, created_by)
  select p_empresa, app.produto_base_peixe(c), app.deposito_ovos(p_empresa), p_data, 'classificacao', q, p_lote,
         'despescas', v_id, auth.uid()
  from (select v_sem as c, -v_total as q
        union all
        select key::uuid, value::int from jsonb_each_text(p_itens) where value::int > 0) x;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.preco_vigente(p_produto uuid, p_cliente uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date, p_lista uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_emp uuid;
  v_lista uuid;
  v_ajuste numeric := 0;
  v_preco bigint;
begin
  select empresa_id into v_emp from produtos where id = p_produto;
  if v_emp is null then return null; end if;
  p_data := coalesce(p_data, app.hoje(v_emp));

  if p_cliente is not null then
    select preco_cents into v_preco from tabelas_preco
    where produto_id = p_produto and cliente_id = p_cliente and vigencia @> p_data;
    if found then return v_preco; end if;
  end if;

  select l.id, l.ajuste_pct into v_lista, v_ajuste from listas_preco l
  where l.empresa_id = v_emp and l.ativa and not l.padrao
    and l.id = coalesce(p_lista, (select c.lista_preco_id from contatos c where c.id = p_cliente));
  if v_lista is not null then
    select preco_cents into v_preco from tabelas_preco
    where lista_id = v_lista and produto_id = p_produto and cliente_id is null and vigencia @> p_data;
    if found then return v_preco; end if;
  end if;

  select t.preco_cents into v_preco from tabelas_preco t join listas_preco l on l.id = t.lista_id and l.padrao
  where t.produto_id = p_produto and t.cliente_id is null and t.vigencia @> p_data;
  if v_preco is null then return null; end if;
  return round(v_preco * (1 + coalesce(v_ajuste, 0) / 100.0))::bigint;
end $function$;

CREATE OR REPLACE FUNCTION public.definir_preco(p_produto uuid, p_preco_cents bigint, p_cliente uuid DEFAULT NULL::uuid, p_desde date DEFAULT NULL::date, p_lista uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_emp uuid; v_lista uuid;
begin
  select empresa_id into v_emp from produtos where id = p_produto;
  p_desde := coalesce(p_desde, app.hoje(v_emp));
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  if p_preco_cents is null or p_preco_cents < 0 then raise exception 'Preço inválido' using errcode = 'check_violation'; end if;
  select id into v_lista from listas_preco where empresa_id = v_emp and (id = p_lista or (p_lista is null and padrao));
  if v_lista is null then raise exception 'Tabela de preço não encontrada' using errcode = 'no_data_found'; end if;
  delete from tabelas_preco where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente
    and lower(vigencia) >= p_desde;
  update tabelas_preco set vigencia = daterange(lower(vigencia), p_desde)
  where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente and vigencia @> p_desde;
  insert into tabelas_preco (empresa_id, lista_id, produto_id, cliente_id, preco_cents, vigencia)
  values (v_emp, v_lista, p_produto, p_cliente, p_preco_cents, daterange(p_desde, null));
end $function$;

CREATE OR REPLACE FUNCTION public.remover_preco(p_produto uuid, p_lista uuid DEFAULT NULL::uuid, p_cliente uuid DEFAULT NULL::uuid, p_desde date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_lista uuid;
begin
  p_desde := coalesce(p_desde, app.hoje((select empresa_id from produtos where id = p_produto)));
  select l.id into v_lista from listas_preco l join produtos p on p.empresa_id = l.empresa_id
  where p.id = p_produto and (l.id = p_lista or (p_lista is null and l.padrao));
  if v_lista is null then raise exception 'Tabela de preço não encontrada' using errcode = 'no_data_found'; end if;
  delete from tabelas_preco where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente
    and lower(vigencia) >= p_desde;
  update tabelas_preco set vigencia = daterange(lower(vigencia), p_desde)
  where lista_id = v_lista and produto_id = p_produto and cliente_id is not distinct from p_cliente and vigencia @> p_desde;
end $function$;

CREATE OR REPLACE FUNCTION public.salvar_tabela_preco(p_empresa uuid, p_id uuid, p_nome text, p_padrao boolean DEFAULT false, p_ativa boolean DEFAULT true, p_ajuste_pct numeric DEFAULT 0, p_observacoes text DEFAULT NULL::text, p_precos jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_atual bigint;
  v_novo bigint;
  x jsonb;
begin
  if p_id is null then
    insert into listas_preco (empresa_id, nome, padrao, ativa, ajuste_pct, observacoes)
    values (p_empresa, p_nome, coalesce(p_padrao, false), coalesce(p_ativa, true), coalesce(p_ajuste_pct, 0), nullif(btrim(p_observacoes), ''))
    returning id into v_id;
  else
    update listas_preco set nome = p_nome, ativa = coalesce(p_ativa, true), ajuste_pct = coalesce(p_ajuste_pct, 0),
      observacoes = nullif(btrim(p_observacoes), ''),
      -- tirar a marca de padrão só acontece marcando outra
      padrao = padrao or coalesce(p_padrao, false)
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;
    if v_id is null then raise exception 'Tabela de preço não encontrada' using errcode = 'no_data_found'; end if;
  end if;

  for x in select * from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) loop
    v_novo := (x->>'preco_cents')::bigint;
    select preco_cents into v_atual from tabelas_preco
    where lista_id = v_id and produto_id = (x->>'produto_id')::uuid and cliente_id is null and vigencia @> app.hoje(p_empresa);
    if not found then v_atual := null; end if;
    if v_novo is null and v_atual is not null then
      perform public.remover_preco((x->>'produto_id')::uuid, v_id);
    elsif v_novo is not null and v_novo is distinct from v_atual then
      perform public.definir_preco((x->>'produto_id')::uuid, v_novo, null, app.hoje(p_empresa), v_id);
    end if;
  end loop;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.importar_pacote(p_empresa uuid, p_pacote jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_origem text := coalesce(nullif(p_pacote->>'origem', ''), 'planilha');
  r jsonb;
  x jsonb;
  v_id uuid;
  v_doc text;
  v_tipos text[];
  v_sentido text;
  v_conta uuid;
  v_conta2 uuid;
  v_contato uuid;
  v_total bigint;
  v_soma bigint;
  v_resto bigint;
  v_valor bigint;
  v_cat uuid;
  v_novo boolean;
  b record;
  v_avisos text[] := '{}';
  n_cat int := 0; n_cc int := 0; n_conta int := 0; n_contato_novo int := 0; n_contato_atual int := 0;
  n_tit int := 0; n_tit_existente int := 0; n_baixa int := 0; n_transf int := 0; n_transf_existente int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;
  if v_origem !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'Origem inválida: %', v_origem using errcode = 'check_violation';
  end if;

  -- Categorias: pais antes dos filhos, para o pai existir com o grupo certo.
  for r in select e from jsonb_array_elements(coalesce(p_pacote->'categorias', '[]')) e
           order by (nullif(trim(e->>'pai'), '') is not null)
  loop
    continue when nullif(trim(r->>'nome'), '') is null;
    v_sentido := case when r->>'sentido' = 'entrada' then 'entrada' else 'saida' end;
    perform app.importar_categoria(p_empresa, r->>'nome', v_sentido, r->>'pai',
      case when r->>'grupo' in ('receita_operacional','custo_operacional','despesa_operacional','investimento','financiamento')
           then r->>'grupo' end,
      r->>'codigo');
    n_cat := n_cat + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'centros_custo', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null;
    perform app.importar_centro(p_empresa, r->>'nome');
    n_cc := n_cc + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'contas', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null;
    v_id := app.vinculo(p_empresa, v_origem, 'conta', coalesce(r->>'chave', app.nome_chave(r->>'nome')));
    if v_id is null then
      select id into v_id from contas_financeiras
       where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'nome') limit 1;
    end if;
    if v_id is null then
      insert into contas_financeiras (empresa_id, tipo, nome, banco_codigo, agencia, conta, conta_dv,
                                      saldo_inicial_cents, saldo_inicial_data, arquivada,
                                      dia_fechamento, dia_vencimento)
      values (p_empresa,
              case when r->>'tipo' in ('corrente','poupanca','caixinha','aplicacao','cartao_credito') then r->>'tipo' else 'corrente' end,
              trim(r->>'nome'), nullif(r->>'banco_codigo', ''), nullif(r->>'agencia', ''), nullif(r->>'conta', ''),
              nullif(r->>'conta_dv', ''), coalesce((r->>'saldo_inicial_cents')::bigint, 0),
              coalesce((r->>'saldo_inicial_data')::date, app.hoje(p_empresa)), coalesce((r->>'arquivada')::boolean, false),
              case when r->>'tipo' = 'cartao_credito' then coalesce((r->>'dia_fechamento')::smallint, 1) end,
              case when r->>'tipo' = 'cartao_credito' then coalesce((r->>'dia_vencimento')::smallint, 10) end)
      returning id into v_id;
    else
      update contas_financeiras set
        saldo_inicial_cents = coalesce((r->>'saldo_inicial_cents')::bigint, saldo_inicial_cents),
        saldo_inicial_data = coalesce((r->>'saldo_inicial_data')::date, saldo_inicial_data),
        banco_codigo = coalesce(banco_codigo, nullif(r->>'banco_codigo', '')),
        agencia = coalesce(agencia, nullif(r->>'agencia', '')),
        conta = coalesce(conta, nullif(r->>'conta', '')),
        updated_at = now()
      where id = v_id;
    end if;
    perform app.vincular(p_empresa, v_origem, 'conta', coalesce(r->>'chave', app.nome_chave(r->>'nome')), v_id);
    n_conta := n_conta + 1;
  end loop;

  -- Contatos: casa pela chave externa, depois pelo CPF/CNPJ, depois pelo nome. Une os tipos.
  for r in select e from jsonb_array_elements(coalesce(p_pacote->'contatos', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null;
    v_doc := app.so_digitos(r->>'cpf_cnpj');
    if v_doc is not null and v_doc !~ '^(\d{11}|\d{14})$' then
      v_avisos := v_avisos || format('Documento inválido ignorado em "%s": %s', r->>'nome', r->>'cpf_cnpj');
      v_doc := null;
    end if;
    select coalesce(array_agg(distinct t) filter (where t in ('cliente','fornecedor','funcionario','socio')), '{}')
      into v_tipos from jsonb_array_elements_text(coalesce(r->'tipos', '[]')) t;
    if cardinality(v_tipos) = 0 then v_tipos := array['cliente']; end if;

    v_id := null;
    if r ? 'chave' then v_id := app.vinculo(p_empresa, v_origem, 'contato', r->>'chave'); end if;
    if v_id is null and v_doc is not null then
      select id into v_id from contatos where empresa_id = p_empresa and cpf_cnpj = v_doc order by arquivado, created_at limit 1;
    end if;
    if v_id is null then
      -- pelo nome, mas sem juntar dois cadastros diferentes da mesma origem (dois "ANTONIO" no LC continuam dois)
      select id into v_id from contatos c where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'nome')
        and (v_doc is null or cpf_cnpj is null)
        and not (r ? 'chave' and exists (select 1 from importacao_vinculos v where v.empresa_id = p_empresa and v.origem = v_origem
                                          and v.entidade = 'contato' and v.registro_id = c.id))
      order by arquivado, created_at limit 1;
    end if;

    if v_id is null then
      insert into contatos (empresa_id, tipos, nome, cpf_cnpj, inscricao_estadual, email, telefone, endereco, cidade, uf, produtor_rural)
      values (p_empresa, v_tipos, trim(r->>'nome'), v_doc, nullif(trim(r->>'inscricao_estadual'), ''),
              nullif(trim(r->>'email'), ''), nullif(trim(r->>'telefone'), ''), coalesce(r->'endereco', '{}'),
              nullif(trim(r->>'cidade'), ''), nullif(upper(left(trim(r->>'uf'), 2)), ''),
              coalesce((r->>'produtor_rural')::boolean, false))
      returning id into v_id;
      n_contato_novo := n_contato_novo + 1;
    else
      update contatos c set
        tipos = (select array_agg(distinct t) from unnest(c.tipos || v_tipos) t),
        cpf_cnpj = coalesce(c.cpf_cnpj, v_doc),
        inscricao_estadual = coalesce(c.inscricao_estadual, nullif(trim(r->>'inscricao_estadual'), '')),
        email = coalesce(c.email, nullif(trim(r->>'email'), '')),
        telefone = coalesce(c.telefone, nullif(trim(r->>'telefone'), '')),
        endereco = case when c.endereco = '{}'::jsonb then coalesce(r->'endereco', '{}') else c.endereco end,
        cidade = coalesce(c.cidade, nullif(trim(r->>'cidade'), '')),
        uf = coalesce(c.uf, nullif(upper(left(trim(r->>'uf'), 2)), '')),
        produtor_rural = c.produtor_rural or coalesce((r->>'produtor_rural')::boolean, false),
        updated_at = now()
      where id = v_id;
      n_contato_atual := n_contato_atual + 1;
    end if;
    if r ? 'chave' then perform app.vincular(p_empresa, v_origem, 'contato', r->>'chave', v_id); end if;
  end loop;

  -- Títulos (contas a pagar e a receber) com rateio e baixas.
  for r in select e from jsonb_array_elements(coalesce(p_pacote->'titulos', '[]')) e loop
    v_total := (r->>'valor_cents')::bigint;
    if nullif(r->>'chave', '') is null or r->>'tipo' not in ('pagar','receber') or coalesce(v_total, 0) <= 0
       or nullif(r->>'vencimento', '') is null then
      v_avisos := v_avisos || format('Lançamento ignorado (falta chave, tipo, valor ou vencimento): %s', left(r::text, 160));
      continue;
    end if;
    -- a mesma conta pode ter vindo antes com outra chave (lançamento avulso x agendamento)
    v_id := coalesce(app.vinculo(p_empresa, v_origem, 'titulo', r->>'chave'),
      (select app.vinculo(p_empresa, v_origem, 'titulo', k) from jsonb_array_elements_text(coalesce(r->'chaves_extras', '[]')) k
        where app.vinculo(p_empresa, v_origem, 'titulo', k) is not null limit 1));
    if v_id is not null then
      -- título já importado: só traz as baixas feitas depois da última importação
      n_tit_existente := n_tit_existente + 1;
      continue when (select status from agendamentos where id = v_id) = 'cancelado';
      for x in select e from jsonb_array_elements(coalesce(r->'baixas', '[]')) e
               where coalesce((e->>'valor_cents')::bigint, 0) > 0 order by e->>'data'
      loop
        select * into b from app.importar_baixa(p_empresa, v_origem, v_id, x);
        if b.inserida then n_baixa := n_baixa + 1; end if;
        if b.aviso is not null then v_avisos := v_avisos || b.aviso; end if;
      end loop;
      continue;
    end if;
    v_sentido := case r->>'tipo' when 'receber' then 'entrada' else 'saida' end;

    v_contato := null;
    if nullif(r->>'contato_chave', '') is not null then
      v_contato := app.vinculo(p_empresa, v_origem, 'contato', r->>'contato_chave');
    end if;
    if v_contato is null and nullif(trim(r->>'contato'), '') is not null then
      select id into v_contato from contatos where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'contato')
       order by (case when r->>'tipo' = 'receber' then 'cliente' else 'fornecedor' end) = any(tipos) desc, arquivado, created_at limit 1;
      if v_contato is null then
        insert into contatos (empresa_id, tipos, nome)
        values (p_empresa, array[case when r->>'tipo' = 'receber' then 'cliente' else 'fornecedor' end], trim(r->>'contato'))
        returning id into v_contato;
        n_contato_novo := n_contato_novo + 1;
      end if;
    end if;

    insert into agendamentos (empresa_id, tipo, contato_id, descricao, referencia, vencimento, competencia, previsao,
                              valor_cents, origem, status, created_by)
    values (p_empresa, r->>'tipo', v_contato,
            coalesce(nullif(trim(r->>'descricao'), ''), case r->>'tipo' when 'receber' then 'Recebimento importado' else 'Pagamento importado' end),
            nullif(trim(r->>'referencia'), ''), (r->>'vencimento')::date,
            date_trunc('month', coalesce(nullif(r->>'competencia', '')::date, (r->>'vencimento')::date))::date,
            (r->>'vencimento')::date, v_total, 'importacao',
            case when coalesce((r->>'cancelado')::boolean, false) then 'cancelado' else 'aberto' end, auth.uid())
    returning id into v_id;

    -- Rateio: o que vier, ajustado para fechar com o valor; sem categoria vai para "Importado sem categoria".
    v_soma := 0;
    for x in select e from jsonb_array_elements(coalesce(r->'rateio', '[]')) e
             where coalesce((e->>'valor_cents')::bigint, 0) > 0
    loop
      v_valor := least((x->>'valor_cents')::bigint, v_total - v_soma);
      exit when v_valor <= 0;
      v_cat := app.importar_categoria(p_empresa, coalesce(nullif(trim(x->>'categoria'), ''), 'Importado sem categoria'),
                                      v_sentido, x->>'categoria_pai');
      insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, centro_custo_id, valor_cents)
      values (p_empresa, v_id, v_cat,
              case when nullif(trim(x->>'centro_custo'), '') is not null then app.importar_centro(p_empresa, x->>'centro_custo') end,
              v_valor);
      v_soma := v_soma + v_valor;
    end loop;
    if v_soma < v_total then
      v_cat := case when v_soma = 0 then app.importar_categoria(p_empresa, 'Importado sem categoria', v_sentido) end;
      if v_cat is not null then
        insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, valor_cents)
        values (p_empresa, v_id, v_cat, v_total);
      else
        -- diferença de arredondamento vai para a maior linha
        update agendamento_rateios set valor_cents = valor_cents + (v_total - v_soma)
         where id = (select id from agendamento_rateios where agendamento_id = v_id order by valor_cents desc limit 1);
      end if;
    end if;

    -- Baixas: o que passar do valor do título vira juros.
    for x in select e from jsonb_array_elements(coalesce(r->'baixas', '[]')) e
             where coalesce((e->>'valor_cents')::bigint, 0) > 0 order by e->>'data'
    loop
      select * into b from app.importar_baixa(p_empresa, v_origem, v_id, x);
      if b.inserida then n_baixa := n_baixa + 1; end if;
      if b.aviso is not null then v_avisos := v_avisos || b.aviso; end if;
    end loop;

    perform app.vincular(p_empresa, v_origem, 'titulo', r->>'chave', v_id);
    n_tit := n_tit + 1;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'transferencias', '[]')) e loop
    continue when nullif(r->>'chave', '') is null or coalesce((r->>'valor_cents')::bigint, 0) <= 0;
    if app.vinculo(p_empresa, v_origem, 'transferencia', r->>'chave') is not null then
      n_transf_existente := n_transf_existente + 1;
      continue;
    end if;
    v_conta := coalesce(app.vinculo(p_empresa, v_origem, 'conta', coalesce(r->>'origem_chave', app.nome_chave(r->>'origem'))),
      (select id from contas_financeiras where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'origem') limit 1));
    v_conta2 := coalesce(app.vinculo(p_empresa, v_origem, 'conta', coalesce(r->>'destino_chave', app.nome_chave(r->>'destino'))),
      (select id from contas_financeiras where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'destino') limit 1));
    if v_conta is null or v_conta2 is null or v_conta = v_conta2 then
      v_avisos := v_avisos || format('Transferência de %s ignorada: contas não encontradas (%s → %s)', r->>'data', r->>'origem', r->>'destino');
      continue;
    end if;
    insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents, descricao)
    values (p_empresa, v_conta, v_conta2, (r->>'data')::date, (r->>'valor_cents')::bigint, nullif(trim(r->>'descricao'), ''))
    returning id into v_id;
    perform app.vincular(p_empresa, v_origem, 'transferencia', r->>'chave', v_id);
    n_transf := n_transf + 1;
  end loop;

  return jsonb_build_object(
    'categorias', n_cat, 'centros_custo', n_cc, 'contas', n_conta,
    'contatos_novos', n_contato_novo, 'contatos_atualizados', n_contato_atual,
    'titulos', n_tit, 'titulos_ja_importados', n_tit_existente, 'baixas', n_baixa,
    'transferencias', n_transf, 'transferencias_ja_importadas', n_transf_existente,
    'avisos', to_jsonb(v_avisos[1:50]), 'total_avisos', cardinality(v_avisos));
end $function$;

CREATE OR REPLACE FUNCTION public.movimentar_estoque(p_produto uuid, p_operacao text, p_quantidade numeric, p_deposito uuid DEFAULT NULL::uuid, p_data date DEFAULT NULL::date, p_custo_total_cents bigint DEFAULT NULL::bigint, p_motivo text DEFAULT NULL::text, p_lote uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  p produtos%rowtype;
  v_alvo uuid;
  v_dep uuid;
  v_fator numeric := 1;
  v_qtd numeric;
  v_saldo numeric;
  v_mov numeric;
  v_tipo text;
  v_custo numeric;
begin
  select * into p from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  p_data := coalesce(p_data, app.hoje(p.empresa_id));
  if not app.pode_algum(p.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if p_operacao is null or p_operacao not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Escolha entrada, saída ou ajuste de saldo' using errcode = 'check_violation';
  end if;
  if p_quantidade is null or p_quantidade < 0 or (p_quantidade = 0 and p_operacao <> 'ajuste') then
    raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > app.hoje(p.empresa_id) then
    raise exception 'A data do lançamento não pode ser futura' using errcode = 'check_violation';
  end if;
  if p_lote is not null and not exists (select 1 from lotes where id = p_lote and empresa_id = p.empresa_id) then
    raise exception 'Lote inválido' using errcode = 'check_violation';
  end if;

  if p.tipo = 'ovo' then
    if p.classe_peixe_id is null then raise exception 'Produto de ovo sem classe' using errcode = 'check_violation'; end if;
    v_alvo := app.produto_base_peixe(p.classe_peixe_id);
    v_fator := coalesce(nullif(p.fator_kg, 0), 1);
    v_dep := app.deposito_ovos(p.empresa_id);
  else
    v_alvo := p.id;
    v_dep := coalesce(p_deposito, app.deposito_padrao(p.empresa_id));
    if not exists (select 1 from depositos where id = v_dep and empresa_id = p.empresa_id and tipo <> 'ovos') then
      raise exception 'Depósito inválido' using errcode = 'check_violation';
    end if;
  end if;

  v_qtd := p_quantidade * v_fator;
  if p.tipo = 'ovo' and v_qtd <> trunc(v_qtd) then
    raise exception 'A quantidade precisa dar um número inteiro de ovos' using errcode = 'check_violation';
  end if;
  v_saldo := app.saldo_produto(v_alvo, v_dep);

  if p_operacao = 'entrada' then
    v_mov := v_qtd;
    v_tipo := case when p.tipo <> 'ovo' and p_custo_total_cents is not null then 'entrada_compra' else 'ajuste' end;
  elsif p_operacao = 'saida' then
    v_tipo := coalesce(nullif(p_motivo, ''), 'perda');
    if v_tipo not in ('consumo_lote', 'perda', 'ajuste') or (p.tipo = 'ovo' and v_tipo = 'consumo_lote') then
      raise exception 'Motivo de saída inválido' using errcode = 'check_violation';
    end if;
    if v_saldo < v_qtd then
      raise exception 'Saldo insuficiente de %: há % %', p.nome, round(v_saldo / v_fator, 3), p.unidade
        using errcode = 'check_violation';
    end if;
    v_mov := -v_qtd;
  else
    v_mov := v_qtd - v_saldo;
    v_tipo := 'ajuste';
    if v_mov = 0 then return 0; end if;
  end if;

  if p_custo_total_cents is not null and p_custo_total_cents < 0 then
    raise exception 'Custo não pode ser negativo' using errcode = 'check_violation';
  end if;
  v_custo := case
    when p.tipo = 'ovo' then null
    when v_tipo = 'entrada_compra' then p_custo_total_cents::numeric / v_qtd
    else p.custo_medio_cents end;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id,
                                  origem_tabela, observacao, created_by)
  values (p.empresa_id, v_alvo, v_dep, p_data, v_tipo, v_mov, v_custo, case when v_tipo = 'consumo_lote' then p_lote end,
          'lancamento_manual', nullif(trim(p_observacao), ''), auth.uid());
  if v_tipo = 'entrada_compra' then
    perform app.atualizar_custo_medio(v_alvo, v_qtd, v_custo);
  end if;
  return v_mov / v_fator;
end $function$;

CREATE OR REPLACE FUNCTION public.transferir_lote(p_lote uuid, p_viveiro_origem uuid, p_data date, p_destinos jsonb, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_lote lotes%rowtype;
  v_aloc lote_alocacoes%rowtype;
  v_vivas int;
  v_sem_qtd int;
  v_soma int;
  v_tr uuid;
  v_fase text;
  d record;
  v_viveiro viveiros%rowtype;
begin
  select * into v_lote from lotes where id = p_lote for update;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if v_lote.fase = 'descartado' then
    raise exception 'Lote descartado não pode ser transferido' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > app.hoje(v_lote.empresa_id) then
    raise exception 'Informe a data da transferência; data futura não é aceita' using errcode = 'check_violation';
  end if;

  select * into v_aloc from lote_alocacoes
  where lote_id = p_lote and viveiro_id = p_viveiro_origem and periodo @> p_data and upper_inf(periodo)
  for update;
  if not found then
    raise exception 'O lote não está nesse viveiro de origem nessa data' using errcode = 'check_violation';
  end if;
  if lower(v_aloc.periodo) >= p_data then
    raise exception 'A transferência precisa ser depois de %, quando o lote chegou ao viveiro de origem',
      to_char(lower(v_aloc.periodo), 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios where lote_id = p_lote and viveiro_id = p_viveiro_origem and data >= p_data) then
    raise exception 'Há apontamentos no viveiro de origem a partir de %; use uma data depois do último apontamento de lá',
      to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_vivas
  from apontamentos_diarios
  where lote_id = p_lote and viveiro_id = p_viveiro_origem and data >= lower(v_aloc.periodo) and data < p_data;
  if v_vivas <= 0 then
    raise exception 'Não há peixes vivos no viveiro de origem nessa data' using errcode = 'check_violation';
  end if;

  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Escolha ao menos um viveiro de destino' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where nullif(e->>'viveiro', '') is null) then
    raise exception 'Escolha o viveiro de cada destino' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where (e->>'viveiro')::uuid = p_viveiro_origem) then
    raise exception 'O destino precisa ser outro viveiro' using errcode = 'check_violation';
  end if;
  if (select count(*) <> count(distinct e->>'viveiro') from jsonb_array_elements(p_destinos) e) then
    raise exception 'O mesmo viveiro aparece em dois destinos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where e->>'qtd' is not null and (e->>'qtd')::int <= 0) then
    raise exception 'A quantidade de cada destino precisa ser maior que zero' using errcode = 'check_violation';
  end if;
  select count(*) filter (where e->>'qtd' is null), coalesce(sum((e->>'qtd')::int), 0)
    into v_sem_qtd, v_soma from jsonb_array_elements(p_destinos) e;
  if v_sem_qtd > 1 then
    raise exception 'Informe a quantidade de peixes de cada destino (só um pode ficar com o restante)' using errcode = 'check_violation';
  end if;
  if v_soma > v_vivas or (v_sem_qtd = 1 and v_soma >= v_vivas) then
    raise exception 'O lote tem % peixes vivos no viveiro de origem nessa data', v_vivas using errcode = 'check_violation';
  end if;

  insert into lote_transferencias (empresa_id, lote_id, data, viveiro_origem_id, alocacao_origem_id, peixes_origem,
                                   fase_anterior, inicio_producao_anterior, observacoes)
  values (v_lote.empresa_id, p_lote, p_data, p_viveiro_origem, v_aloc.id, v_vivas,
          v_lote.fase, v_lote.inicio_producao, nullif(trim(p_observacoes), ''))
  returning id into v_tr;

  update lote_alocacoes set periodo = daterange(lower(periodo), p_data) where id = v_aloc.id;

  v_fase := v_lote.fase;
  for d in select (e->>'viveiro')::uuid as viveiro, coalesce((e->>'qtd')::int, v_vivas - v_soma) as qtd
           from jsonb_array_elements(p_destinos) e loop
    select * into v_viveiro from viveiros where id = d.viveiro and empresa_id = v_lote.empresa_id;
    if not found then raise exception 'Viveiro de destino não encontrado nesta empresa' using errcode = 'foreign_key_violation'; end if;
    if not v_viveiro.ativo then raise exception 'O viveiro % está inativo', v_viveiro.nome using errcode = 'check_violation'; end if;
    if d.qtd > v_viveiro.capacidade_peixes then
      raise exception 'O viveiro % comporta % peixes', v_viveiro.nome, v_viveiro.capacidade_peixes using errcode = 'check_violation';
    end if;
    begin
      insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id)
      values (v_lote.empresa_id, p_lote, d.viveiro, d.qtd, daterange(p_data, null), 'transferencia', v_tr);
    exception when exclusion_violation then
      raise exception 'O viveiro % já está ocupado por outro lote em %', v_viveiro.nome, to_char(p_data, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end;
    if v_fase not in ('muda', 'descartado') and app.ordem_fase(app.fase_do_viveiro(v_viveiro.finalidade)) > app.ordem_fase(v_fase) then
      v_fase := app.fase_do_viveiro(v_viveiro.finalidade);
    end if;
  end loop;

  if v_sem_qtd = 0 and v_soma < v_vivas then
    insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id)
    values (v_lote.empresa_id, p_lote, p_viveiro_origem, v_vivas - v_soma, daterange(p_data, null), 'divisao', v_tr);
  end if;

  update lotes set fase = v_fase,
    inicio_producao = case when v_fase = 'producao' and inicio_producao is null then p_data else inicio_producao end,
    updated_at = now()
  where id = p_lote;
  if not found then
    raise exception 'Seu usuário não tem permissão para transferir lotes' using errcode = 'insufficient_privilege';
  end if;
  return v_tr;
end $function$;

create or replace view public.titulos with (security_invoker = true) as  SELECT a.id,
    a.empresa_id,
    a.tipo,
    a.descricao,
    a.referencia,
    a.vencimento,
    a.competencia,
    a.previsao,
    a.valor_cents,
    a.pago_cents,
    a.valor_cents - a.desconto_cents - a.pago_cents AS saldo_cents,
        CASE
            WHEN (a.status = ANY (ARRAY['aberto'::text, 'parcial'::text])) AND a.vencimento < app.hoje(a.empresa_id) THEN 'vencido'::text
            ELSE a.status
        END AS situacao,
    a.status,
    a.parcela_numero,
    a.parcela_total,
    a.grupo_parcelamento_id,
    a.forma_pagamento,
    a.contato_id,
    ct.nome AS contato_nome,
    ( SELECT string_agg(DISTINCT c.nome, ', '::text) AS string_agg
           FROM agendamento_rateios r
             JOIN categorias c ON c.id = r.categoria_id
          WHERE r.agendamento_id = a.id) AS categorias,
    ( SELECT string_agg(DISTINCT cc.nome, ', '::text) AS string_agg
           FROM agendamento_rateios r
             JOIN centros_custo cc ON cc.id = r.centro_custo_id
          WHERE r.agendamento_id = a.id) AS centros_custo
   FROM agendamentos a
     LEFT JOIN contatos ct ON ct.id = a.contato_id;

create or replace view public.aging_titulos with (security_invoker = true) as  SELECT empresa_id,
    tipo,
    id AS agendamento_id,
    contato_id,
    COALESCE(contato_nome, 'Sem contato'::text) AS contato_nome,
    descricao,
    vencimento,
    saldo_cents,
    GREATEST(app.hoje(empresa_id) - vencimento, 0) AS dias_atraso,
        CASE
            WHEN vencimento >= app.hoje(empresa_id) THEN 'a_vencer'::text
            WHEN (app.hoje(empresa_id) - vencimento) <= 30 THEN 'ate_30'::text
            WHEN (app.hoje(empresa_id) - vencimento) <= 60 THEN 'ate_60'::text
            WHEN (app.hoje(empresa_id) - vencimento) <= 90 THEN 'ate_90'::text
            ELSE 'mais_90'::text
        END AS faixa
   FROM titulos
  WHERE (status = ANY (ARRAY['aberto'::text, 'parcial'::text])) AND saldo_cents > 0;

create or replace view public.fluxo_previsto with (security_invoker = true) as  SELECT empresa_id,
    id AS agendamento_id,
    tipo,
    descricao,
    contato_nome,
    GREATEST(COALESCE(previsao, vencimento), app.hoje(empresa_id)) AS data,
    vencimento,
        CASE
            WHEN tipo = 'receber'::text THEN 1
            ELSE '-1'::integer
        END * saldo_cents AS valor_cents,
    situacao = 'vencido'::text AS vencido
   FROM titulos
  WHERE (status = ANY (ARRAY['aberto'::text, 'parcial'::text])) AND saldo_cents > 0;

create or replace view public.alocacoes_atuais with (security_invoker = true) as  SELECT al.id,
    al.empresa_id,
    al.lote_id,
    al.viveiro_id,
    l.codigo AS lote_codigo,
    l.fase,
    l.data_nascimento,
    l.especie_id,
    g.nome AS viveiro_nome,
    n.nome AS setor_nome,
    al.qtd_peixes,
    al.qtd_peixes - COALESCE(b.baixas, 0::bigint) AS peixes_atuais,
    (app.hoje(al.empresa_id) - l.data_nascimento) / 7 + 1 AS semana,
    b.ultimo_apontamento
   FROM lote_alocacoes al
     JOIN lotes l ON l.id = al.lote_id
     JOIN viveiros g ON g.id = al.viveiro_id
     JOIN setores n ON n.id = g.setor_id
     LEFT JOIN LATERAL ( SELECT sum(a.mortes + a.descartes) AS baixas,
            max(a.data) AS ultimo_apontamento
           FROM apontamentos_diarios a
          WHERE a.lote_id = al.lote_id AND a.viveiro_id = al.viveiro_id AND al.periodo @> a.data) b ON true
  WHERE al.periodo @> app.hoje(al.empresa_id);

create or replace view public.ovos_em_carencia with (security_invoker = true) as  SELECT e.empresa_id,
    e.id AS evento_id,
    e.lote_id,
    l.codigo AS lote_codigo,
    p.classe_peixe_id,
    e.data AS inicio,
    e.data + e.carencia_dias::integer - 1 AS fim,
    sum(m.quantidade)::bigint AS ovos
   FROM eventos_sanitarios e
     JOIN lotes l ON l.id = e.lote_id
     JOIN movimentos_estoque m ON m.lote_id = e.lote_id AND m.tipo = 'producao_ovos'::text AND m.data >= e.data AND m.data <= (e.data + e.carencia_dias::integer - 1)
     JOIN produtos p ON p.id = m.produto_id
  WHERE e.status = 'realizado'::text AND e.carencia_dias > 0 AND NOT e.carencia_descartada AND (e.data + e.carencia_dias::integer) >= (app.hoje(e.empresa_id) - 30)
  GROUP BY e.empresa_id, e.id, e.lote_id, l.codigo, p.classe_peixe_id, e.data, e.carencia_dias;

create or replace view public.faturas_cartao with (security_invoker = true) as  WITH lanc AS (
         SELECT lancamentos_cartao.empresa_id,
            lancamentos_cartao.cartao_id,
            lancamentos_cartao.vencimento,
            sum(lancamentos_cartao.valor_cents)::bigint AS total_cents,
            count(*) AS lancamentos
           FROM lancamentos_cartao
          GROUP BY lancamentos_cartao.empresa_id, lancamentos_cartao.cartao_id, lancamentos_cartao.vencimento
        ), pag AS (
         SELECT transferencias.conta_destino_id AS cartao_id,
            transferencias.fatura_vencimento AS vencimento,
            sum(transferencias.valor_cents)::bigint AS pago_cents,
            max(transferencias.data) AS pago_em
           FROM transferencias
          WHERE transferencias.tipo = 'pagamento_fatura'::text
          GROUP BY transferencias.conta_destino_id, transferencias.fatura_vencimento
        )
 SELECT l.empresa_id,
    l.cartao_id,
    c.nome AS cartao,
    l.vencimento,
    app.fechamento_da_fatura(l.vencimento, c.dia_fechamento::integer, c.dia_vencimento::integer) AS fechamento,
    l.total_cents,
    COALESCE(p.pago_cents, 0::bigint) AS pago_cents,
    l.total_cents - COALESCE(p.pago_cents, 0::bigint) AS saldo_cents,
    l.lancamentos,
    p.pago_em,
        CASE
            WHEN (l.total_cents - COALESCE(p.pago_cents, 0::bigint)) <= 0 THEN 'paga'::text
            WHEN app.fechamento_da_fatura(l.vencimento, c.dia_fechamento::integer, c.dia_vencimento::integer) >= app.hoje(l.empresa_id) THEN 'aberta'::text
            WHEN l.vencimento < app.hoje(l.empresa_id) THEN 'vencida'::text
            ELSE 'fechada'::text
        END AS situacao
   FROM lanc l
     JOIN contas_financeiras c ON c.id = l.cartao_id
     LEFT JOIN pag p ON p.cartao_id = l.cartao_id AND p.vencimento = l.vencimento;

create or replace view public.alertas with (security_invoker = true) as  SELECT s.empresa_id,
        CASE
            WHEN s.pct_engorda < (s.padrao_pct_engorda - 10::numeric) THEN 'critico'::text
            ELSE 'atencao'::text
        END AS nivel,
    'engorda'::text AS tipo,
    format('Engorda do lote %s abaixo do padrão'::text, a.lote_codigo) AS titulo,
    format('Semana %s: %s%% contra %s%% da curva'::text, s.semana, s.pct_engorda, s.padrao_pct_engorda) AS detalhe,
    '/lotes/'::text || a.lote_id AS link,
    s.fim AS data
   FROM alocacoes_atuais a
     JOIN LATERAL ( SELECT i.empresa_id,
            i.lote_id,
            i.semana,
            i.inicio,
            i.fim,
            i.dias,
            i.peixes_medios,
            i.ovos,
            i.pct_engorda,
            i.consumo_g_peixe_dia,
            i.kg_racao_por_duzia,
            i.baixas,
            i.mortalidade_acum_pct,
            i.ovos_peixe_povoada_acum,
            i.padrao_pct_engorda,
            i.padrao_consumo_g,
            i.padrao_sobrevivencia_pct
           FROM indicadores_lote_semana i
          WHERE i.lote_id = a.lote_id AND i.dias >= 3
          ORDER BY i.semana DESC
         LIMIT 1) s ON true
  WHERE a.fase = 'producao'::text AND s.padrao_pct_engorda IS NOT NULL AND s.pct_engorda < (s.padrao_pct_engorda - 5::numeric)
UNION ALL
 SELECT a.empresa_id,
        CASE
            WHEN m.pct > 0.3 THEN 'critico'::text
            ELSE 'atencao'::text
        END AS nivel,
    'mortalidade'::text AS tipo,
    format('Mortalidade alta no lote %s (%s)'::text, a.lote_codigo, a.viveiro_nome) AS titulo,
    format('%s peixes nos últimos 3 dias (%s%% ao dia)'::text, m.baixas, m.pct) AS detalhe,
    '/lotes/'::text || a.lote_id AS link,
    app.hoje(a.empresa_id) AS data
   FROM alocacoes_atuais a
     JOIN LATERAL ( SELECT sum(d.mortes + d.descartes) AS baixas,
            round(100.0 * sum(d.mortes + d.descartes)::numeric / NULLIF(sum(d.peixes_inicio_dia), 0)::numeric, 2) AS pct
           FROM apontamentos_diarios d
          WHERE d.lote_id = a.lote_id AND d.viveiro_id = a.viveiro_id AND d.data > (app.hoje(a.empresa_id) - 3)) m ON true
  WHERE m.pct > 0.1
UNION ALL
 SELECT a.empresa_id,
    'atencao'::text AS nivel,
    'apontamento'::text AS tipo,
    format('Falta apontamento do %s'::text, a.viveiro_nome) AS titulo,
        CASE
            WHEN a.ultimo_apontamento IS NULL THEN format('Lote %s ainda sem nenhum apontamento'::text, a.lote_codigo)
            ELSE format('Último apontamento em %s'::text, to_char(a.ultimo_apontamento::timestamp with time zone, 'DD/MM'::text))
        END AS detalhe,
    '/apontamentos'::text AS link,
    app.hoje(a.empresa_id) AS data
   FROM alocacoes_atuais a
     JOIN lote_alocacoes al ON al.id = a.id
  WHERE lower(al.periodo) < (app.hoje(a.empresa_id) - 1) AND COALESCE(a.ultimo_apontamento, '-infinity'::date) < (app.hoje(a.empresa_id) - 1)
UNION ALL
 SELECT e.empresa_id,
    'info'::text AS nivel,
    'carencia'::text AS tipo,
    format('Ovos do lote %s em carência'::text, l.codigo) AS titulo,
    format('Não vender ovos postos até %s'::text, to_char((e.data + e.carencia_dias::integer - 1)::timestamp with time zone, 'DD/MM'::text)) AS detalhe,
    '/sanidade'::text AS link,
    e.data
   FROM eventos_sanitarios e
     JOIN lotes l ON l.id = e.lote_id
  WHERE e.status = 'realizado'::text AND e.carencia_dias > 0 AND (e.data + e.carencia_dias::integer) > app.hoje(e.empresa_id)
UNION ALL
 SELECT e.empresa_id,
        CASE
            WHEN e.data < app.hoje(e.empresa_id) THEN 'atencao'::text
            ELSE 'info'::text
        END AS nivel,
    'sanidade'::text AS tipo,
    format('%s %s do lote %s'::text,
        CASE
            WHEN e.data < app.hoje(e.empresa_id) THEN 'Atrasado:'::text
            ELSE 'Programado:'::text
        END, initcap(e.tipo), l.codigo) AS titulo,
    concat_ws(' · '::text, to_char(e.data::timestamp with time zone, 'DD/MM'::text), e.dose, e.via) AS detalhe,
    '/sanidade'::text AS link,
    e.data
   FROM eventos_sanitarios e
     JOIN lotes l ON l.id = e.lote_id
  WHERE e.status = 'planejado'::text AND e.data <= (app.hoje(e.empresa_id) + 7)
UNION ALL
 SELECT t.empresa_id,
    'atencao'::text AS nivel,
    'financeiro'::text AS tipo,
    format('%s conta(s) a %s vencida(s)'::text, count(*), t.tipo) AS titulo,
    format('Total de R$ %s'::text, to_char(sum(t.saldo_cents) / 100.0, 'FM999G999G990D00'::text)) AS detalhe,
        CASE
            WHEN t.tipo = 'pagar'::text THEN '/contas-a-pagar?situacao=vencido'::text
            ELSE '/contas-a-receber?situacao=vencido'::text
        END AS link,
    min(t.vencimento) AS data
   FROM titulos t
  WHERE t.situacao = 'vencido'::text
  GROUP BY t.empresa_id, t.tipo
UNION ALL
 SELECT estoque_peixe.empresa_id,
    'critico'::text AS nivel,
    'estoque'::text AS tipo,
    format('Estoque negativo de ovos %s'::text, estoque_peixe.classe) AS titulo,
    format('%s ovos: confira apontamentos e pedidos'::text, estoque_peixe.saldo) AS detalhe,
    '/estoque'::text AS link,
    app.hoje(estoque_peixe.empresa_id) AS data
   FROM estoque_peixe
  WHERE estoque_peixe.saldo < 0;
