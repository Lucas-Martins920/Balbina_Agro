-- Estoque sem corrida e sem saldo negativo ao desfazer (plano 002 da auditoria).
--
-- 1. Trava única por empresa (app.travar_estoque) em toda função que lê o saldo e tira estoque.
--    Sem ela, duas saídas ao mesmo tempo (pedido faturado + venda no PDV, dois faturamentos)
--    liam o mesmo saldo e as duas passavam. pg_advisory_xact_lock solta no fim da transação e
--    é reentrante na mesma sessão (venda_balcao -> faturar_pedido não trava em si mesma).
--    O test:db roda numa sessão só, então a concorrência não tem teste automático; a garantia
--    vem de toda leitura de saldo seguida de saída acontecer depois da mesma trava.
-- 2. Excluir classificação ou lançamento de produção (ou baixar a quantidade) recusa quando
--    os ovos já saíram do estoque: antes o saldo ia para negativo em silêncio.

create or replace function app.travar_estoque(p_empresa uuid) returns void
language sql volatile set search_path = public as $$
  select pg_advisory_xact_lock(hashtext('estoque:' || p_empresa::text))
$$;
revoke all on function app.travar_estoque(uuid) from public;
grant execute on function app.travar_estoque(uuid) to authenticated, service_role;

-- Desfazer só passa se o saldo das classes afetadas continuar >= 0.
create or replace function app.conferir_saldo_peixe(p_produtos uuid[]) returns void
language plpgsql stable set search_path = public as $$
declare v_classe text; v_saldo numeric;
begin
  select c.nome, s.saldo into v_classe, v_saldo
  from (select produto_id, sum(quantidade) as saldo from movimentos_estoque
        where produto_id = any(p_produtos) group by produto_id) s
  join produtos p on p.id = s.produto_id
  left join classes_peixe c on c.id = p.classe_peixe_id
  where s.saldo < 0
  limit 1;
  if found then
    raise exception 'Esses ovos já saíram do estoque: % ficaria com % ovos. Estorne a venda ou faça um ajuste de estoque antes',
      coalesce(v_classe, 'a classe'), v_saldo::bigint using errcode = 'check_violation';
  end if;
end $$;
revoke all on function app.conferir_saldo_peixe(uuid[]) from public;


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
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
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
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
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

  perform app.travar_estoque(p_empresa);   -- mesma trava em toda função que mexe no saldo
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

CREATE OR REPLACE FUNCTION public.ajustar_estoque_peixe(p_empresa uuid, p_classe uuid, p_contado bigint, p_observacao text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_dif bigint;
begin
  if p_contado < 0 then raise exception 'Quantidade contada não pode ser negativa' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(p_empresa);   -- mesma trava em toda função que mexe no saldo
  select p_contado - saldo into v_dif from estoque_peixe where classe_id = p_classe and empresa_id = p_empresa;
  if not found then raise exception 'Classe de ovo não encontrada' using errcode = 'no_data_found'; end if;
  if v_dif <> 0 then
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, created_by)
    values (p_empresa, app.produto_base_peixe(p_classe), app.deposito_ovos(p_empresa), app.hoje(p_empresa), 'ajuste', v_dif,
            coalesce(nullif(trim(p_observacao), ''), 'inventário'), auth.uid());
  end if;
  return v_dif;
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
  perform app.travar_estoque(e.empresa_id);   -- mesma trava em toda função que mexe no saldo
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

CREATE OR REPLACE FUNCTION public.registrar_saida(p_produto uuid, p_deposito uuid, p_data date, p_quantidade numeric, p_tipo text DEFAULT 'consumo_lote'::text, p_lote uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  p produtos%rowtype;
  v_id uuid;
begin
  select * into p from produtos where id = p_produto;
  if not found or p.tipo = 'ovo' then raise exception 'Produto inválido' using errcode = 'check_violation'; end if;
  if p_tipo not in ('consumo_lote', 'perda', 'ajuste') then raise exception 'Tipo de saída inválido' using errcode = 'check_violation'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo
  if app.saldo_produto(p_produto, p_deposito) < p_quantidade then
    raise exception 'Saldo insuficiente de %: há % %', p.nome, app.saldo_produto(p_produto, p_deposito), p.unidade using errcode = 'check_violation';
  end if;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id, origem_tabela, created_by)
  values (p.empresa_id, p_produto, p_deposito, p_data, p_tipo, -p_quantidade, p.custo_medio_cents, p_lote, nullif(trim(p_observacao), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.produzir_racao(p_formula uuid, p_data date, p_toneladas numeric, p_deposito_insumos uuid, p_deposito_destino uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  f formulas_racao%rowtype;
  i record;
  v_ordem uuid;
  v_custo numeric := 0;
  v_kg numeric := p_toneladas * 1000;
begin
  select * into f from formulas_racao where id = p_formula;
  if not found then raise exception 'Fórmula não encontrada' using errcode = 'no_data_found'; end if;
  perform app.travar_estoque(f.empresa_id);   -- mesma trava em toda função que mexe no saldo
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
end $function$;

CREATE OR REPLACE FUNCTION app.desfaz_classificacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_produtos uuid[];
begin
  perform app.travar_estoque(old.empresa_id);
  with d as (delete from movimentos_estoque where origem_tabela = 'despescas' and origem_id = old.id returning produto_id)
  select array_agg(distinct produto_id) into v_produtos from d;
  perform app.conferir_saldo_peixe(v_produtos);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION app.lancamento_para_estoque()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a apontamentos_diarios%rowtype; v_produtos uuid[];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.travar_estoque(old.empresa_id);
    with d as (delete from movimentos_estoque where origem_tabela = 'apontamento_lancamentos' and origem_id = old.id returning produto_id)
    select array_agg(distinct produto_id) into v_produtos from d;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.ovos > 0 then
    select * into a from apontamentos_diarios where id = new.apontamento_id;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, viveiro_id,
                                    origem_tabela, origem_id, created_by)
    values (a.empresa_id, app.produto_base_peixe(app.classe_sem_classificacao(a.empresa_id)), app.deposito_ovos(a.empresa_id),
            a.data, 'producao_ovos', new.ovos, a.lote_id, a.viveiro_id, 'apontamento_lancamentos', new.id, auth.uid());
  end if;
  if v_produtos is not null then perform app.conferir_saldo_peixe(v_produtos); end if;
  return null;
end $function$;
