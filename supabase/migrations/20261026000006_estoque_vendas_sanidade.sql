-- Marco 3: estoque de ovos alimentado pelo apontamento, pedidos de venda, carência sanitária e alertas.

-- ---------------------------------------------------------------------------
-- Produtos de ovo: um produto-base por classe (unidade = 1 ovo) guarda o estoque;
-- os produtos de venda (dúzia, caixa) dizem quantos ovos da classe consomem.
-- ---------------------------------------------------------------------------

alter table produtos add column base_estoque boolean not null default false;
create unique index produtos_base_por_classe on produtos (empresa_id, classe_peixe_id) where base_estoque;

create or replace function app.produto_base_peixe(p_classe uuid) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  c classes_peixe%rowtype;
begin
  select id into v_id from produtos where classe_peixe_id = p_classe and base_estoque;
  if found then return v_id; end if;
  select * into c from classes_peixe where id = p_classe;
  insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm, base_estoque)
  values (c.empresa_id, 'ovo', 'Ovo ' || c.nome || ' (unidade)', 'un', 1, c.id, '0407.21.00', true)
  on conflict (empresa_id, nome) do update set base_estoque = true, classe_peixe_id = excluded.classe_peixe_id, fator_kg = 1
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.produtos_da_classe() returns trigger language plpgsql as $$
begin
  perform app.produto_base_peixe(new.id);
  if new.comercializavel then
    insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm) values
      (new.empresa_id, 'ovo', 'Dúzia ' || new.nome, 'dz', 12, new.id, '0407.21.00'),
      (new.empresa_id, 'ovo', 'Caixa 30 dúzias ' || new.nome, 'cx', 360, new.id, '0407.21.00')
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger produtos_da_classe after insert on classes_peixe
  for each row execute function app.produtos_da_classe();

-- empresas que já existiam
do $$
declare c classes_peixe%rowtype;
begin
  for c in select * from classes_peixe loop
    perform app.produto_base_peixe(c.id);
    if c.comercializavel then
      insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm) values
        (c.empresa_id, 'ovo', 'Dúzia ' || c.nome, 'dz', 12, c.id, '0407.21.00'),
        (c.empresa_id, 'ovo', 'Caixa 30 dúzias ' || c.nome, 'cx', 360, c.id, '0407.21.00')
      on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function app.deposito_ovos(p_empresa uuid) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from depositos where empresa_id = p_empresa and tipo = 'ovos' order by nome limit 1;
  if not found then
    insert into depositos (empresa_id, nome, tipo) values (p_empresa, 'Ovos', 'ovos')
    on conflict (empresa_id, nome) do update set tipo = 'ovos'
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Apontamento -> entrada de ovos no estoque
-- ---------------------------------------------------------------------------

create or replace function app.ovos_para_estoque() returns trigger language plpgsql as $$
declare a apontamentos_diarios%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from movimentos_estoque
    where origem_tabela = 'apontamento_ovos' and origem_id = old.apontamento_id
      and produto_id = app.produto_base_peixe(old.classe_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.quantidade > 0 then
    select * into a from apontamentos_diarios where id = new.apontamento_id;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, viveiro_id,
                                    origem_tabela, origem_id, created_by)
    values (a.empresa_id, app.produto_base_peixe(new.classe_id), app.deposito_ovos(a.empresa_id), a.data, 'producao_ovos',
            new.quantidade, a.lote_id, a.viveiro_id, 'apontamento_ovos', a.id, auth.uid());
  end if;
  return null;
end $$;

create trigger ovos_para_estoque after insert or update or delete on apontamento_ovos
  for each row execute function app.ovos_para_estoque();

insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, viveiro_id, origem_tabela, origem_id)
select a.empresa_id, app.produto_base_peixe(o.classe_id), app.deposito_ovos(a.empresa_id), a.data, 'producao_ovos', o.quantidade,
       a.lote_id, a.viveiro_id, 'apontamento_ovos', a.id
from apontamento_ovos o join apontamentos_diarios a on a.id = o.apontamento_id
where o.quantidade > 0;

-- ---------------------------------------------------------------------------
-- Carência: ovos postos durante a carência de um medicamento não podem ser vendidos
-- ---------------------------------------------------------------------------

alter table eventos_sanitarios add column carencia_descartada boolean not null default false;

-- Ovos de cada classe ainda retidos por carência (eventos dos últimos 30 dias, não descartados)
create view ovos_em_carencia with (security_invoker = true) as
select e.empresa_id, e.id as evento_id, e.lote_id, l.codigo as lote_codigo, p.classe_peixe_id,
       e.data as inicio, e.data + e.carencia_dias - 1 as fim,
       sum(m.quantidade)::bigint as ovos
from eventos_sanitarios e
join lotes l on l.id = e.lote_id
join movimentos_estoque m on m.lote_id = e.lote_id and m.tipo = 'producao_ovos'
  and m.data between e.data and e.data + e.carencia_dias - 1
join produtos p on p.id = m.produto_id
where e.status = 'realizado' and e.carencia_dias > 0 and not e.carencia_descartada
  and e.data + e.carencia_dias >= current_date - 30
group by e.empresa_id, e.id, e.lote_id, l.codigo, p.classe_peixe_id, e.data, e.carencia_dias;

create view estoque_peixe with (security_invoker = true) as
select c.empresa_id, c.id as classe_id, c.nome as classe, c.ordem, c.comercializavel, p.id as produto_id,
       coalesce(s.saldo, 0)::bigint as saldo,
       least(coalesce(s.saldo, 0), coalesce(k.ovos, 0))::bigint as em_carencia,
       greatest(coalesce(s.saldo, 0) - coalesce(k.ovos, 0), 0)::bigint as disponivel
from classes_peixe c
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (select produto_id, sum(quantidade) as saldo from movimentos_estoque group by produto_id) s on s.produto_id = p.id
left join (select classe_peixe_id, sum(ovos) as ovos from ovos_em_carencia group by classe_peixe_id) k on k.classe_peixe_id = c.id;

-- Dá baixa como perda nos ovos retidos pela carência de um evento
create or replace function public.descartar_ovos_carencia(p_evento uuid) returns bigint
language plpgsql set search_path = public as $$
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
      values (e.empresa_id, app.produto_base_peixe(r.classe_peixe_id), app.deposito_ovos(e.empresa_id), current_date, 'perda',
              -least(r.ovos, r.saldo), e.lote_id, 'eventos_sanitarios', e.id, auth.uid());
      v_total := v_total + least(r.ovos, r.saldo);
    end if;
  end loop;
  update eventos_sanitarios set carencia_descartada = true where id = p_evento;
  return v_total;
end $$;

-- Ajuste de inventário: informa o saldo contado de uma classe
create or replace function public.ajustar_estoque_peixe(p_empresa uuid, p_classe uuid, p_contado bigint, p_observacao text default null)
returns bigint language plpgsql set search_path = public as $$
declare v_dif bigint;
begin
  if p_contado < 0 then raise exception 'Quantidade contada não pode ser negativa' using errcode = 'check_violation'; end if;
  select p_contado - saldo into v_dif from estoque_peixe where classe_id = p_classe and empresa_id = p_empresa;
  if not found then raise exception 'Classe de ovo não encontrada' using errcode = 'no_data_found'; end if;
  if v_dif <> 0 then
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, origem_tabela, created_by)
    values (p_empresa, app.produto_base_peixe(p_classe), app.deposito_ovos(p_empresa), current_date, 'ajuste', v_dif,
            coalesce(nullif(trim(p_observacao), ''), 'inventário'), auth.uid());
  end if;
  return v_dif;
end $$;

-- ---------------------------------------------------------------------------
-- Pedidos de venda
-- ---------------------------------------------------------------------------

create or replace function public.preco_vigente(p_produto uuid, p_cliente uuid default null, p_data date default current_date)
returns bigint language sql stable set search_path = public as $$
  select preco_cents from tabelas_preco
  where produto_id = p_produto and vigencia @> p_data and (cliente_id = p_cliente or cliente_id is null)
  order by cliente_id nulls last
  limit 1
$$;

-- Novo preço geral ou do cliente a partir de uma data (encerra o anterior)
create or replace function public.definir_preco(p_produto uuid, p_preco_cents bigint, p_cliente uuid default null, p_desde date default current_date)
returns void language plpgsql set search_path = public as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado' using errcode = 'no_data_found'; end if;
  if p_preco_cents < 0 then raise exception 'Preço inválido' using errcode = 'check_violation'; end if;
  delete from tabelas_preco where produto_id = p_produto and cliente_id is not distinct from p_cliente and lower(vigencia) >= p_desde;
  update tabelas_preco set vigencia = daterange(lower(vigencia), p_desde)
  where produto_id = p_produto and cliente_id is not distinct from p_cliente and vigencia @> p_desde;
  insert into tabelas_preco (empresa_id, produto_id, cliente_id, preco_cents, vigencia)
  values (v_emp, p_produto, p_cliente, p_preco_cents, daterange(p_desde, null));
end $$;

-- p_itens: [{produto_id, quantidade, preco_unit_cents?}]  (sem preço, usa a tabela)
-- p_parcelas: [{dias, pct}]
create or replace function public.criar_pedido(
  p_empresa uuid,
  p_cliente uuid,
  p_itens jsonb,
  p_data date default current_date,
  p_entrega date default null,
  p_parcelas jsonb default '[{"dias":0,"pct":100}]',
  p_forma_pagamento text default null,
  p_observacoes text default null,
  p_client_id uuid default null,
  p_origem text default 'web'
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_numero int;
  x jsonb;
  v_preco bigint;
  v_prod produtos%rowtype;
begin
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
end $$;

-- Faturar: tira os ovos do estoque (respeitando a carência) e gera as contas a receber.
create or replace function public.faturar_pedido(p_pedido uuid) returns int
language plpgsql set search_path = public as $$
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
    values (p.empresa_id, app.produto_base_peixe(r.classe_peixe_id), app.deposito_ovos(p.empresa_id), current_date, 'venda', -r.ovos,
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
end $$;

create or replace function public.entregar_pedido(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
begin
  update pedidos_venda set status = 'entregue', updated_at = now() where id = p_pedido and status = 'faturado';
  if not found then raise exception 'Só pedido faturado pode ser entregue' using errcode = 'check_violation'; end if;
end $$;

-- Cancelar devolve os ovos e cancela as contas a receber (se nada foi recebido).
create or replace function public.cancelar_pedido(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
declare p pedidos_venda%rowtype;
begin
  select * into p from pedidos_venda where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'no_data_found'; end if;
  if p.status = 'cancelado' then return; end if;
  if exists (select 1 from agendamentos where origem = 'pedido_venda' and origem_id = p_pedido and pago_cents > 0) then
    raise exception 'O pedido já tem recebimento; estorne o recebimento antes de cancelar' using errcode = 'check_violation';
  end if;
  delete from movimentos_estoque where origem_tabela = 'pedidos_venda' and origem_id = p_pedido;
  update agendamentos set status = 'cancelado', updated_at = now() where origem = 'pedido_venda' and origem_id = p_pedido;
  update pedidos_venda set status = 'cancelado', updated_at = now() where id = p_pedido;
end $$;

create view pedidos with (security_invoker = true) as
select p.id, p.empresa_id, p.numero, p.data, p.entrega_prevista, p.status, p.total_cents, p.forma_pagamento,
       p.condicao_pagamento, p.observacoes, p.origem, p.cliente_id, c.nome as cliente_nome,
       (select string_agg(format('%s %s', trim(to_char(i.quantidade, 'FM999G999D###')), pr.nome), ', ' order by pr.nome)
        from pedido_itens i join produtos pr on pr.id = i.produto_id where i.pedido_id = p.id) as itens,
       (select sum(i.quantidade * coalesce(pr.fator_kg, 0)) from pedido_itens i join produtos pr on pr.id = i.produto_id
        where i.pedido_id = p.id)::bigint as ovos
from pedidos_venda p join contatos c on c.id = p.cliente_id;

-- ---------------------------------------------------------------------------
-- Alertas do dia
-- ---------------------------------------------------------------------------

create view alertas with (security_invoker = true) as
-- engorda da última semana abaixo da curva da espécie
select s.empresa_id,
       case when s.pct_engorda < s.padrao_pct_engorda - 10 then 'critico' else 'atencao' end as nivel,
       'engorda'::text as tipo,
       format('Engorda do lote %s abaixo do padrão', a.lote_codigo) as titulo,
       format('Semana %s: %s%% contra %s%% da curva', s.semana, s.pct_engorda, s.padrao_pct_engorda) as detalhe,
       '/lotes/' || a.lote_id as link, s.fim as data
from alocacoes_atuais a
join lateral (select * from indicadores_lote_semana i where i.lote_id = a.lote_id and i.dias >= 3
              order by i.semana desc limit 1) s on true
where a.fase = 'producao' and s.padrao_pct_engorda is not null and s.pct_engorda < s.padrao_pct_engorda - 5
union all
-- mortalidade dos últimos 3 dias
select a.empresa_id,
       case when m.pct > 0.3 then 'critico' else 'atencao' end,
       'mortalidade',
       format('Mortalidade alta no lote %s (%s)', a.lote_codigo, a.viveiro_nome),
       format('%s peixes nos últimos 3 dias (%s%% ao dia)', m.baixas, m.pct),
       '/lotes/' || a.lote_id, current_date
from alocacoes_atuais a
join lateral (
  select sum(d.mortes + d.descartes) as baixas,
         round(100.0 * sum(d.mortes + d.descartes) / nullif(sum(d.peixes_inicio_dia), 0), 2) as pct
  from apontamentos_diarios d
  where d.lote_id = a.lote_id and d.viveiro_id = a.viveiro_id and d.data > current_date - 3
) m on true
where m.pct > 0.1
union all
-- viveiro sem apontamento de ontem
select a.empresa_id, 'atencao', 'apontamento',
       format('Falta apontamento do %s', a.viveiro_nome),
       case when a.ultimo_apontamento is null then format('Lote %s ainda sem nenhum apontamento', a.lote_codigo)
            else format('Último apontamento em %s', to_char(a.ultimo_apontamento, 'DD/MM')) end,
       '/apontamentos', current_date
from alocacoes_atuais a
join lote_alocacoes al on al.id = a.id
where lower(al.periodo) < current_date - 1 and coalesce(a.ultimo_apontamento, '-infinity') < current_date - 1
union all
-- carência em andamento
select e.empresa_id, 'info', 'carencia',
       format('Ovos do lote %s em carência', l.codigo),
       format('Não vender ovos postos até %s', to_char(e.data + e.carencia_dias - 1, 'DD/MM')),
       '/sanidade', e.data
from eventos_sanitarios e join lotes l on l.id = e.lote_id
where e.status = 'realizado' and e.carencia_dias > 0 and e.data + e.carencia_dias > current_date
union all
-- manejo sanitário planejado
select e.empresa_id, case when e.data < current_date then 'atencao' else 'info' end, 'sanidade',
       format('%s %s do lote %s', case when e.data < current_date then 'Atrasado:' else 'Programado:' end,
              initcap(e.tipo), l.codigo),
       concat_ws(' · ', to_char(e.data, 'DD/MM'), e.dose, e.via),
       '/sanidade', e.data
from eventos_sanitarios e join lotes l on l.id = e.lote_id
where e.status = 'planejado' and e.data <= current_date + 7
union all
-- contas vencidas
select t.empresa_id, 'atencao', 'financeiro',
       format('%s conta(s) a %s vencida(s)', count(*), t.tipo),
       format('Total de R$ %s', to_char(sum(t.saldo_cents) / 100.0, 'FM999G999G990D00')),
       case when t.tipo = 'pagar' then '/contas-a-pagar?situacao=vencido' else '/contas-a-receber?situacao=vencido' end,
       min(t.vencimento)
from titulos t where t.situacao = 'vencido'
group by t.empresa_id, t.tipo
union all
-- estoque negativo indica apontamento ou venda lançados errado
select empresa_id, 'critico', 'estoque', format('Estoque negativo de ovos %s', classe),
       format('%s ovos: confira apontamentos e pedidos', saldo), '/estoque', current_date
from estoque_peixe where saldo < 0;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.descartar_ovos_carencia(uuid) to authenticated;
    grant execute on function public.ajustar_estoque_peixe(uuid, uuid, bigint, text) to authenticated;
    grant execute on function public.preco_vigente(uuid, uuid, date) to authenticated;
    grant execute on function public.definir_preco(uuid, bigint, uuid, date) to authenticated;
    grant execute on function public.criar_pedido(uuid, uuid, jsonb, date, date, jsonb, text, text, uuid, text) to authenticated;
    grant execute on function public.faturar_pedido(uuid) to authenticated;
    grant execute on function public.entregar_pedido(uuid) to authenticated;
    grant execute on function public.cancelar_pedido(uuid) to authenticated;
    grant select on ovos_em_carencia, estoque_peixe, pedidos, alertas to authenticated;
  end if;
end $$;
