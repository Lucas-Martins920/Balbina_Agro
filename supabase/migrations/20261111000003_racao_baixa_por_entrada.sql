-- Estoque de ração, fase 2 (banco): toda saída de ração fica ligada às entradas numeradas.
--
-- Pedido do Nicolas (11/11/2026, fase 2): a baixa escolhe as entradas pelo FEFO (vence primeiro, sai primeiro),
-- uma saída pode usar várias entradas e guarda quanto saiu de cada uma, ao custo da própria entrada. Esse custo
-- é o que entra no custo do lote de peixe (o rateio mensal já lê movimentos_estoque.custo_unit_cents dos
-- consumo_lote), então o custo antigo não muda quando o custo médio do produto muda depois.
--
-- Como fica:
-- - movimentos_estoque.entrada_id: todo movimento de ração novo aponta para uma entrada (trigger
--   app.racao_movimento_conferir recusa movimento de ração sem entrada e saldo de entrada negativo).
-- - movimentos_estoque.baixa_id: as linhas de uma mesma saída (uma por entrada) têm o mesmo baixa_id.
-- - movimentos_estoque.origem_lancamento: web, campo, android, ajuste, offline, importacao, conciliacao, sistema.
-- - app.baixar_racao: a baixa pelo FEFO, sob a trava de estoque da empresa (duas baixas ao mesmo tempo não usam
--   o mesmo saldo). Entrada vencida não é usada; só um ajuste da própria entrada mexe nela.
-- - racao_estornos e estornar_baixa_racao: devolve às mesmas entradas, com motivo; o movimento original fica.
-- - racao_ajustes e ajustar_entrada_racao: ajuste por entrada com tipo, motivo, saldo antes e depois.
-- - O saldo da entrada passa a ser explícito: o da fase 1 (calculado pelo FEFO) vira o ponto de partida
--   (consumido_antes_kg) e o que sobrava sem entrada vira entrada de abertura.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------
alter table movimentos_estoque
  add column entrada_id uuid references racao_entradas(id) on delete cascade,
  add column baixa_id uuid,
  add column estorno_de uuid,
  add column origem_lancamento text check (origem_lancamento is null or origem_lancamento in
    ('web', 'campo', 'android', 'ajuste', 'offline', 'importacao', 'conciliacao', 'sistema'));
create index on movimentos_estoque (entrada_id);
create index on movimentos_estoque (baixa_id) where baixa_id is not null;
comment on column movimentos_estoque.entrada_id is 'Ração: entrada numerada de onde a ração saiu (ou para onde voltou)';
comment on column movimentos_estoque.baixa_id is 'Ração: as linhas de uma mesma saída (uma por entrada usada) têm o mesmo baixa_id';
comment on column movimentos_estoque.estorno_de is 'Ração: baixa_id da saída que este movimento estornou';

alter table racao_entradas add column consumido_antes_kg numeric(12,3) not null default 0 check (consumido_antes_kg >= 0);
comment on column racao_entradas.consumido_antes_kg is 'Ração que saiu desta entrada antes da baixa por entrada (fase 1, pelo FEFO)';

-- A entrada que veio de conciliação ou de ajuste de saldo pode chegar sem validade (fica como "validade não
-- informada" e sai primeiro); pela tela a validade continua obrigatória (registrar_entrada_racao).
alter table racao_entradas drop constraint racao_entradas_check;

-- ---------------------------------------------------------------------------
-- 2. Saldo explícito por entrada
-- ---------------------------------------------------------------------------
-- Fase 1 → fase 2: o que cada entrada já tinha "consumido" pelo FEFO fica registrado, para o saldo bater.
with s as (
  select produto_id, deposito_id, greatest(sum(quantidade), 0) as saldo
  from movimentos_estoque group by produto_id, deposito_id
), e as (
  select e.id, e.kg, sum(e.kg) over (partition by e.produto_id, e.deposito_id
                                     order by e.validade desc nulls last, e.data desc, e.numero desc
                                     rows unbounded preceding) as acumulado, e.produto_id, e.deposito_id
  from racao_entradas e
)
update racao_entradas r set consumido_antes_kg = r.kg - round(greatest(0, least(e.kg, coalesce(s.saldo, 0) - (e.acumulado - e.kg))), 3)
from e left join s on s.produto_id = e.produto_id and s.deposito_id = e.deposito_id
where r.id = e.id;

-- o movimento de compra da entrada também aponta para ela
update movimentos_estoque set entrada_id = origem_id where origem_tabela = 'racao_entradas';

-- Saldo de ração sem entrada (ajuste para mais na fase 1) vira entrada de abertura
alter table racao_entradas disable trigger racao_entrada_conferir;
with sobra as (
  select m.empresa_id, m.produto_id, m.deposito_id, p.custo_medio_cents,
         sum(m.quantidade) - coalesce((select sum(e.kg - e.consumido_antes_kg) from racao_entradas e
                                       where e.produto_id = m.produto_id and e.deposito_id = m.deposito_id), 0) as kg
  from movimentos_estoque m join produtos p on p.id = m.produto_id
  where p.tipo = 'racao'
  group by m.empresa_id, m.produto_id, m.deposito_id, p.custo_medio_cents
), nova as (
  select s.*, row_number() over (partition by s.empresa_id order by s.produto_id, s.deposito_id) as n
  from sobra s where s.kg > 0.0005
)
insert into racao_entradas (empresa_id, numero, produto_id, deposito_id, data, kg, custo_total_cents, abertura, observacoes)
select n.empresa_id, e.racao_ultimo_numero + n.n, n.produto_id, n.deposito_id, app.hoje(n.empresa_id), round(n.kg, 3),
       round(n.kg * n.custo_medio_cents)::bigint, true, 'Saldo de ração que estava sem entrada numerada.'
from nova n join empresas e on e.id = n.empresa_id;
alter table racao_entradas enable trigger racao_entrada_conferir;
update empresas e set racao_ultimo_numero = x.n
from (select empresa_id, max(numero) as n from racao_entradas group by empresa_id) x
where x.empresa_id = e.id and x.n > e.racao_ultimo_numero;

-- Saldo da entrada: abertura começa com os kg dela (não tem movimento de compra); as outras, com o movimento
-- de compra ligado; menos o que saiu antes da fase 2; mais todo movimento ligado a ela.
create or replace function app.saldo_entrada(p_entrada uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when e.abertura then e.kg else 0 end - e.consumido_antes_kg
         + coalesce((select sum(m.quantidade) from movimentos_estoque m where m.entrada_id = e.id), 0)
  from racao_entradas e where e.id = p_entrada
$$;
revoke all on function app.saldo_entrada(uuid) from public;
grant execute on function app.saldo_entrada(uuid) to authenticated, service_role;

-- Custo de 1 kg da entrada: o valor pago dividido pelos kg; sem valor, o custo médio do produto no lançamento
create or replace function app.custo_kg_entrada(p_entrada uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(e.custo_total_cents::numeric / nullif(e.kg, 0), p.custo_medio_cents)
  from racao_entradas e join produtos p on p.id = e.produto_id where e.id = p_entrada
$$;
revoke all on function app.custo_kg_entrada(uuid) from public;

drop view racao_saldos;
-- ordem_consumo: posição da entrada na fila do FEFO da ração (só entradas com saldo e dentro da validade)
create view racao_saldos with (security_invoker = true) as
select s.*,
       case when s.saldo_kg > 0 and not coalesce(s.vencida, false) then
         row_number() over (partition by s.empresa_id, s.produto_id, (s.saldo_kg > 0 and not coalesce(s.vencida, false))
                            order by s.validade asc nulls first, s.data, s.numero) end as ordem_consumo
from (
  select e.id, e.empresa_id, e.numero, e.produto_id, e.deposito_id, e.fornecedor_id, e.data, e.lote_fabricacao,
         e.fabricacao, e.validade, e.sacos, e.kg, e.custo_total_cents, e.abertura, e.observacoes,
         round(case when e.abertura then e.kg else 0 end - e.consumido_antes_kg + coalesce(m.kg, 0), 3) as saldo_kg,
         e.validade - app.hoje(e.empresa_id) as dias_para_vencer,
         round(coalesce(e.custo_total_cents::numeric / nullif(e.kg, 0), p.custo_medio_cents), 4) as custo_kg_cents,
         e.validade < app.hoje(e.empresa_id) as vencida
  from racao_entradas e
  join produtos p on p.id = e.produto_id
  left join (select entrada_id, sum(quantidade) as kg from movimentos_estoque where entrada_id is not null group by entrada_id) m
    on m.entrada_id = e.id
) s;
grant select on racao_saldos to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Regras de todo movimento de ração
-- ---------------------------------------------------------------------------
create or replace function app.racao_movimento_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  e racao_entradas%rowtype;
begin
  select tipo into v_tipo from produtos where id = new.produto_id;
  if v_tipo is distinct from 'racao' then
    if new.entrada_id is not null then raise exception 'Só movimento de ração tem entrada' using errcode = 'check_violation'; end if;
    return new;
  end if;
  if new.entrada_id is null then
    raise exception 'Toda movimentação de ração precisa de uma entrada numerada (use a baixa, o estorno ou o ajuste de ração)'
      using errcode = 'check_violation';
  end if;
  select * into e from racao_entradas where id = new.entrada_id;
  if e.produto_id <> new.produto_id or e.deposito_id <> new.deposito_id or e.empresa_id <> new.empresa_id then
    raise exception 'A entrada R-% é de outra ração ou de outro depósito', e.numero using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger racao_movimento_conferir before insert or update of entrada_id, produto_id, deposito_id on movimentos_estoque
  for each row execute function app.racao_movimento_conferir();

-- Saldo da entrada nunca negativo (vale para qualquer caminho: baixa, ajuste, exclusão de estorno...)
create or replace function app.racao_saldo_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_entrada uuid := case when tg_op = 'DELETE' then old.entrada_id else new.entrada_id end;
  v_saldo numeric;
  v_numero int;
begin
  if v_entrada is null then return null; end if;
  select numero into v_numero from racao_entradas where id = v_entrada;
  if not found then return null; end if;   -- a entrada inteira está sendo apagada
  v_saldo := app.saldo_entrada(v_entrada);
  if v_saldo < -0.0005 then
    raise exception 'Saldo insuficiente na entrada R-%: ficaria com % kg', v_numero, round(v_saldo, 3) using errcode = 'check_violation';
  end if;
  return null;
end $$;
create trigger racao_saldo_conferir after insert or update or delete on movimentos_estoque
  for each row execute function app.racao_saldo_conferir();

-- Saída manual, estorno e ajuste de ração não somem do histórico: só a função que os criou (ou o zerar do
-- sistema, ou a exclusão da conta) apaga. A ração do trato segue o apontamento (lixeira e restauração).
create or replace function app.racao_movimento_sem_apagar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.entrada_id is null or coalesce(old.origem_tabela, '') in ('apontamento_racoes', 'racao_entradas') then return old; end if;
  if current_setting('app.racao_pode_apagar', true) = 'sim' then return old; end if;
  if not exists (select 1 from empresas where id = old.empresa_id) then return old; end if;   -- conta excluída
  raise exception 'Movimento de ração já lançado não é apagado: faça o estorno ou o ajuste da entrada' using errcode = 'check_violation';
end $$;
create trigger racao_movimento_sem_apagar before delete on movimentos_estoque
  for each row execute function app.racao_movimento_sem_apagar();

revoke all on function app.racao_movimento_conferir() from public;
revoke all on function app.racao_saldo_conferir() from public;
revoke all on function app.racao_movimento_sem_apagar() from public;

-- O movimento de compra da entrada nasce ligado a ela
create or replace function app.racao_entrada_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_unit numeric;
begin
  if tg_op = 'DELETE' then
    delete from movimentos_estoque where origem_tabela = 'racao_entradas' and origem_id = old.id;
    return null;
  end if;
  if new.abertura then return null; end if;
  v_unit := new.custo_total_cents::numeric / new.kg;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents,
                                  validade, lote_embalagem, origem_tabela, origem_id, observacao, created_by, entrada_id,
                                  origem_lancamento)
  values (new.empresa_id, new.produto_id, new.deposito_id, new.data,
          case when new.custo_total_cents is null then 'ajuste' else 'entrada_compra' end, new.kg,
          coalesce(v_unit, (select custo_medio_cents from produtos where id = new.produto_id)),
          new.validade, new.lote_fabricacao, 'racao_entradas', new.id, format('Entrada R-%s', new.numero), new.created_by,
          new.id, 'web');
  if v_unit is not null then
    perform app.atualizar_custo_medio(new.produto_id, new.kg, v_unit);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A baixa pelo FEFO
-- ---------------------------------------------------------------------------
-- Ordem: validade mais próxima primeiro; sem validade (abertura, conciliação) antes de todas, porque é a ração
-- mais antiga; empate de validade: a compra mais antiga (data) e depois o menor número. Entrada vencida na data
-- da saída não é usada. Sem saldo suficiente dentro da validade, nada é lançado.
create or replace function app.baixar_racao(p_produto uuid, p_kg numeric, p_data date, p_tipo text,
                                            p_lote uuid default null, p_viveiro uuid default null,
                                            p_origem_tabela text default null, p_origem_id uuid default null,
                                            p_origem_lancamento text default 'web', p_observacao text default null,
                                            p_deposito uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p produtos%rowtype;
  r record;
  v_falta numeric := round(p_kg, 3);
  v_tira numeric;
  v_baixa uuid := gen_random_uuid();
  v_vencida numeric := 0;
  v_total numeric := 0;
begin
  select * into p from produtos where id = p_produto;
  if not found or p.tipo <> 'racao' then raise exception 'Escolha uma ração do cadastro' using errcode = 'check_violation'; end if;
  if p_kg is null or p_kg <= 0 then raise exception 'Quantidade precisa ser positiva' using errcode = 'check_violation'; end if;
  if p_tipo not in ('consumo_lote', 'perda', 'ajuste') then raise exception 'Tipo de saída inválido' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(p.empresa_id);   -- mesma trava em toda função que mexe no saldo

  for r in
    select e.id, e.numero, e.deposito_id, e.validade, app.saldo_entrada(e.id) as saldo
    from racao_entradas e
    where e.produto_id = p.id and (p_deposito is null or e.deposito_id = p_deposito)
    order by e.validade asc nulls first, e.data, e.numero
  loop
    continue when r.saldo <= 0.0005;
    if r.validade is not null and r.validade < p_data then
      v_vencida := v_vencida + r.saldo;
      continue;
    end if;
    exit when v_falta <= 0;
    v_tira := least(r.saldo, v_falta);
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id,
                                    viveiro_id, origem_tabela, origem_id, observacao, created_by, entrada_id, baixa_id,
                                    origem_lancamento)
    values (p.empresa_id, p.id, r.deposito_id, p_data, p_tipo, -v_tira, app.custo_kg_entrada(r.id), p_lote, p_viveiro,
            coalesce(p_origem_tabela, 'lancamento_manual'), p_origem_id, nullif(trim(p_observacao), ''), auth.uid(),
            r.id, v_baixa, coalesce(p_origem_lancamento, 'web'));
    v_falta := round(v_falta - v_tira, 3);
    v_total := v_total + v_tira;
  end loop;

  if v_falta > 0 then
    raise exception 'Saldo insuficiente de %: há % kg dentro da validade%. Lance a entrada da compra antes.',
      p.nome, replace(trim_scale(round(v_total, 3))::text, '.', ','),
      case when v_vencida > 0 then format(' e %s kg vencidos (faça o ajuste de perda da entrada vencida)',
                                          replace(trim_scale(round(v_vencida, 3))::text, '.', ',')) else '' end
      using errcode = 'check_violation';
  end if;
  return v_baixa;
end $$;
revoke all on function app.baixar_racao(uuid, numeric, date, text, uuid, uuid, text, uuid, text, text, uuid) from public;

-- Trato do apontamento: a ração por tipo sai das entradas pelo FEFO (de qualquer depósito) e o custo efetivo
-- (média ponderada das entradas usadas) volta para a linha do apontamento.
create or replace function app.racao_apontamento_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a apontamentos_diarios%rowtype;
  v_origem text;
  v_baixa uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.travar_estoque(old.empresa_id);
    delete from movimentos_estoque where origem_tabela = 'apontamento_racoes' and origem_id = old.id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select d.* into a from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where l.id = new.lancamento_id;
    select case l.origem when 'app' then case when l.client_id is not null then 'offline' else 'campo' end
                         when 'importacao' then 'importacao' when 'sensor' then 'sistema' else 'web' end
      into v_origem from apontamento_lancamentos l where l.id = new.lancamento_id;
    v_baixa := app.baixar_racao(new.produto_id, new.kg, a.data, 'consumo_lote', a.lote_id, a.viveiro_id,
                                'apontamento_racoes', new.id, v_origem, null, null);
    update apontamento_racoes set custo_unit_cents = (
      select sum(-m.quantidade * m.custo_unit_cents) / nullif(sum(-m.quantidade), 0) from movimentos_estoque m where m.baixa_id = v_baixa)
    where id = new.id;
  end if;
  return null;
end $$;
drop trigger racao_apontamento_estoque on apontamento_racoes;
create trigger racao_apontamento_estoque after insert or delete or update of produto_id, deposito_id, kg on apontamento_racoes
  for each row execute function app.racao_apontamento_estoque();

-- O apontamento não procura mais saldo num depósito só: a baixa olha todas as entradas.
do $$
declare v text;
begin
  v := pg_get_functiondef('public.completar_lancamento(uuid, jsonb, jsonb)'::regprocedure);
  if position('      v_saldo := coalesce(app.saldo_produto(p.id, v_dep), 0);' in v) = 0 then
    raise exception 'completar_lancamento mudou: revise a conferência de saldo da ração';
  end if;
  v := replace(v, '      v_saldo := coalesce(app.saldo_produto(p.id, v_dep), 0);
      if v_dep is null or v_saldo < r.kg then
        raise exception ''Saldo insuficiente de %: há % kg no estoque. Lance a produção da fábrica ou a compra antes.'',
          p.nome, round(v_saldo, 1) using errcode = ''check_violation'';
      end if;', '      if v_dep is null then
        raise exception ''Saldo insuficiente de %: não há ração no estoque. Lance a entrada da compra antes.'', p.nome
          using errcode = ''check_violation'';
      end if;');
  if position('Lance a produção da fábrica' in v) > 0 then raise exception 'troca do texto de completar_lancamento falhou'; end if;
  execute v;
end $$;

-- Insumo aplicado no viveiro pelo campo (calagem, adubação...) não é ração: a ração sai pelo trato.
do $$
declare v text;
begin
  v := pg_get_functiondef('public.registrar_insumo_viveiro(uuid, uuid, date, text, uuid, numeric, uuid, integer, numeric, numeric, text, uuid, boolean)'::regprocedure);
  if position('p.tipo in (''peixe'', ''alevino'', ''embalagem'')' in v) = 0 then
    raise exception 'registrar_insumo_viveiro mudou: revise a recusa de ração';
  end if;
  v := replace(v, 'p.tipo in (''peixe'', ''alevino'', ''embalagem'')', 'p.tipo in (''peixe'', ''alevino'', ''embalagem'', ''racao'')');
  execute v;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Lançamento manual de ração (tela de estoque, API do celular, conciliação, importação)
-- ---------------------------------------------------------------------------
-- entrada: vira uma entrada numerada (sem validade quando não vem da tela de entrada de ração)
-- saida:   baixa pelo FEFO
-- ajuste:  saldo do produto contado; a diferença sai pelo FEFO ou entra como entrada nova. Exige motivo.
create or replace function app.movimentar_racao(p produtos, p_operacao text, p_quantidade numeric, p_deposito uuid,
                                                p_data date, p_custo_total_cents bigint, p_motivo text, p_lote uuid,
                                                p_observacao text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric;
  v_dif numeric;
  v_origem text := case when coalesce(p_observacao, '') like '%(conciliação)%' then 'conciliacao'
                        when coalesce(p_observacao, '') like 'Estoque inicial (planilha)%' then 'importacao' else 'web' end;
begin
  -- relê o produto (o parâmetro vem de quem chama) e confere a permissão aqui também
  select * into p from produtos where id = p.id and tipo = 'racao';
  if not found then raise exception 'Escolha uma ração' using errcode = 'check_violation'; end if;
  if not app.pode_algum(p.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if p_operacao = 'entrada' then
    insert into racao_entradas (empresa_id, produto_id, deposito_id, data, kg, custo_total_cents, observacoes, numero)
    values (p.empresa_id, p.id, coalesce(p_deposito, app.deposito_padrao(p.empresa_id)), p_data, round(p_quantidade, 3),
            p_custo_total_cents, coalesce(nullif(trim(p_observacao), ''), 'Entrada sem validade informada'), 0);
    return round(p_quantidade, 3);
  elsif p_operacao = 'saida' then
    perform app.baixar_racao(p.id, p_quantidade, p_data, coalesce(nullif(p_motivo, ''), 'perda'), p_lote, null,
                             'lancamento_manual', null, v_origem, p_observacao, p_deposito);
    return -round(p_quantidade, 3);
  end if;
  -- ajuste do saldo total do produto
  if nullif(trim(p_observacao), '') is null then
    raise exception 'Informe o motivo do ajuste de ração' using errcode = 'check_violation';
  end if;
  perform app.travar_estoque(p.empresa_id);
  select coalesce(sum(app.saldo_entrada(e.id)), 0) into v_saldo from racao_entradas e
  where e.produto_id = p.id and (p_deposito is null or e.deposito_id = p_deposito);
  v_dif := round(p_quantidade - v_saldo, 3);
  if v_dif = 0 then return 0; end if;
  if v_dif > 0 then
    insert into racao_entradas (empresa_id, produto_id, deposito_id, data, kg, custo_total_cents, observacoes, numero)
    values (p.empresa_id, p.id, coalesce(p_deposito, app.deposito_padrao(p.empresa_id)), p_data, v_dif,
            round(v_dif * p.custo_medio_cents)::bigint, 'Ajuste de saldo: ' || trim(p_observacao), 0);
  else
    perform app.baixar_racao(p.id, -v_dif, p_data, 'ajuste', null, null, 'lancamento_manual', null, 'ajuste',
                             'Ajuste de saldo: ' || trim(p_observacao), p_deposito);
  end if;
  return v_dif;
end $$;
revoke all on function app.movimentar_racao(produtos, text, numeric, uuid, date, bigint, text, uuid, text) from public;
grant execute on function app.movimentar_racao(produtos, text, numeric, uuid, date, bigint, text, uuid, text) to authenticated, service_role;

do $$
declare v text;
begin
  v := pg_get_functiondef('public.movimentar_estoque(uuid, text, numeric, uuid, date, bigint, text, uuid, text)'::regprocedure);
  if position('  if p.tipo = ''peixe'' then
    if p.classe_peixe_id is null' in v) = 0 then
    raise exception 'movimentar_estoque mudou: revise o desvio da ração';
  end if;
  v := replace(v, '  if p.tipo = ''peixe'' then
    if p.classe_peixe_id is null', '  if p.tipo = ''racao'' then
    return app.movimentar_racao(p, p_operacao, p_quantidade, p_deposito, p_data, p_custo_total_cents, p_motivo, p_lote, p_observacao);
  end if;
  if p.tipo = ''peixe'' then
    if p.classe_peixe_id is null');
  execute v;
end $$;

-- registrar_entrada e registrar_saida (funções antigas, por depósito) também passam pelas entradas
do $$
declare v text;
begin
  v := pg_get_functiondef('public.registrar_entrada(uuid, uuid, date, numeric, bigint, text)'::regprocedure);
  if position('  insert into movimentos_estoque' in v) = 0 then raise exception 'registrar_entrada mudou'; end if;
  v := replace(v, '  insert into movimentos_estoque', '  if p.tipo = ''racao'' then
    insert into racao_entradas (empresa_id, produto_id, deposito_id, data, kg, custo_total_cents, observacoes, numero)
    values (p.empresa_id, p.id, p_deposito, p_data, round(p_quantidade, 3), p_custo_total_cents,
            coalesce(nullif(trim(p_observacao), ''''), ''Entrada sem validade informada''), 0)
    returning id into v_id;
    return (select id from movimentos_estoque where entrada_id = v_id and origem_tabela = ''racao_entradas'');
  end if;
  insert into movimentos_estoque');
  execute v;

  v := pg_get_functiondef('public.registrar_saida(uuid, uuid, date, numeric, text, uuid, text)'::regprocedure);
  if position('  perform app.travar_estoque(p.empresa_id);' in v) = 0 then raise exception 'registrar_saida mudou'; end if;
  v := replace(v, '  perform app.travar_estoque(p.empresa_id);', '  if p.tipo = ''racao'' then
    return app.baixar_racao(p.id, p_quantidade, p_data, p_tipo, p_lote, null, ''lancamento_manual'', null, ''web'', p_observacao, p_deposito);
  end if;
  perform app.travar_estoque(p.empresa_id);');
  execute v;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Estorno de uma saída
-- ---------------------------------------------------------------------------
create table racao_estornos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  baixa_id uuid not null unique,
  kg numeric(12,3) not null,
  motivo text not null check (btrim(motivo) <> ''),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table racao_estornos is 'Saída de ração desfeita: a ração volta às mesmas entradas e a saída original fica no histórico';
create index on racao_estornos (empresa_id);
alter table racao_estornos enable row level security;
create policy membros on racao_estornos using (empresa_id in (select app.minhas_empresas()));
-- gravação só pela função
create policy escrita_inserir on racao_estornos as restrictive for insert with check (false);
create policy escrita_alterar on racao_estornos as restrictive for update using (false);
create policy escrita_apagar on racao_estornos as restrictive for delete using (false);
grant select on racao_estornos to authenticated;

create or replace function public.estornar_baixa_racao(p_baixa uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m movimentos_estoque%rowtype;
  v_id uuid;
  v_kg numeric;
begin
  select * into m from movimentos_estoque where baixa_id = p_baixa and quantidade < 0 limit 1;
  if not found or m.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Saída de ração não encontrada' using errcode = 'no_data_found';
  end if;
  if not app.pode_algum(m.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo do estorno' using errcode = 'check_violation'; end if;
  if m.origem_tabela = 'apontamento_racoes' then
    raise exception 'A ração do trato se corrige pelo apontamento (editar ou mandar para a lixeira)' using errcode = 'check_violation';
  end if;
  perform app.travar_estoque(m.empresa_id);
  if exists (select 1 from racao_estornos where baixa_id = p_baixa) then
    raise exception 'Esta saída já foi estornada' using errcode = 'check_violation';
  end if;
  select -sum(quantidade) into v_kg from movimentos_estoque where baixa_id = p_baixa;
  insert into racao_estornos (empresa_id, baixa_id, kg, motivo) values (m.empresa_id, p_baixa, v_kg, trim(p_motivo))
  returning id into v_id;
  -- cada linha volta para a mesma entrada, com o mesmo custo, lote e viveiro (o custo do lote é descontado)
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id,
                                  viveiro_id, origem_tabela, origem_id, observacao, created_by, entrada_id, estorno_de,
                                  origem_lancamento)
  select x.empresa_id, x.produto_id, x.deposito_id, app.hoje(x.empresa_id), x.tipo, -x.quantidade, x.custo_unit_cents,
         x.lote_id, x.viveiro_id, 'racao_estornos', v_id, 'Estorno: ' || trim(p_motivo), auth.uid(), x.entrada_id, p_baixa,
         'ajuste'
  from movimentos_estoque x where x.baixa_id = p_baixa;
  return v_id;
end $$;
revoke all on function public.estornar_baixa_racao(uuid, text) from public, anon;
grant execute on function public.estornar_baixa_racao(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Ajuste de uma entrada (contagem, perda, avaria, vencimento, correção)
-- ---------------------------------------------------------------------------
create table racao_ajustes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  entrada_id uuid not null references racao_entradas(id) on delete cascade,
  tipo text not null check (tipo in ('contagem', 'perda', 'avaria', 'vencimento', 'correcao', 'outro')),
  motivo text not null check (btrim(motivo) <> ''),
  kg_antes numeric(12,3) not null,
  kg_depois numeric(12,3) not null check (kg_depois >= 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
comment on table racao_ajustes is 'Ajuste de saldo de uma entrada de ração, com tipo, motivo e o saldo antes e depois';
create index on racao_ajustes (empresa_id);
create index on racao_ajustes (entrada_id);
alter table racao_ajustes enable row level security;
create policy membros on racao_ajustes using (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on racao_ajustes as restrictive for insert with check (false);
create policy escrita_alterar on racao_ajustes as restrictive for update using (false);
create policy escrita_apagar on racao_ajustes as restrictive for delete using (false);
grant select on racao_ajustes to authenticated;

create or replace function public.ajustar_entrada_racao(p_entrada uuid, p_kg_contado numeric, p_tipo text, p_motivo text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  e racao_entradas%rowtype;
  v_antes numeric;
  v_dif numeric;
  v_id uuid;
begin
  select * into e from racao_entradas where id = p_entrada;
  if not found or e.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Entrada não encontrada' using errcode = 'no_data_found';
  end if;
  if not app.pode_algum(e.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  if p_tipo is null or p_tipo not in ('contagem', 'perda', 'avaria', 'vencimento', 'correcao', 'outro') then
    raise exception 'Escolha o tipo do ajuste' using errcode = 'check_violation';
  end if;
  if nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo do ajuste' using errcode = 'check_violation'; end if;
  if p_kg_contado is null or p_kg_contado < 0 then raise exception 'O saldo contado não pode ser negativo' using errcode = 'check_violation'; end if;
  perform app.travar_estoque(e.empresa_id);
  v_antes := round(app.saldo_entrada(e.id), 3);
  v_dif := round(p_kg_contado - v_antes, 3);
  if v_dif = 0 then return 0; end if;
  insert into racao_ajustes (empresa_id, entrada_id, tipo, motivo, kg_antes, kg_depois)
  values (e.empresa_id, e.id, p_tipo, trim(p_motivo), v_antes, round(p_kg_contado, 3))
  returning id into v_id;
  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents,
                                  origem_tabela, origem_id, observacao, created_by, entrada_id, baixa_id, origem_lancamento)
  values (e.empresa_id, e.produto_id, e.deposito_id, app.hoje(e.empresa_id),
          case when v_dif < 0 and p_tipo in ('perda', 'avaria', 'vencimento') then 'perda' else 'ajuste' end,
          v_dif, app.custo_kg_entrada(e.id), 'racao_ajustes', v_id,
          format('Ajuste R-%s (%s): %s', e.numero, p_tipo, trim(p_motivo)), auth.uid(), e.id,
          case when v_dif < 0 then gen_random_uuid() end, 'ajuste');
  return v_dif;
end $$;
revoke all on function public.ajustar_entrada_racao(uuid, numeric, text, text) from public, anon;
grant execute on function public.ajustar_entrada_racao(uuid, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Entrada: o que já foi movimentado não muda; excluir só a entrada intocada
-- ---------------------------------------------------------------------------
create or replace function app.racao_entrada_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mexida boolean;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from produtos where id = new.produto_id and empresa_id = new.empresa_id and tipo = 'racao') then
      raise exception 'Escolha uma ração do cadastro' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from depositos where id = new.deposito_id and empresa_id = new.empresa_id and tipo <> 'peixe') then
      raise exception 'Depósito inválido' using errcode = 'check_violation';
    end if;
    update empresas set racao_ultimo_numero = racao_ultimo_numero + 1 where id = new.empresa_id
    returning racao_ultimo_numero into new.numero;
    return new;
  end if;
  if new.numero <> old.numero or new.produto_id <> old.produto_id or new.deposito_id <> old.deposito_id
     or new.kg <> old.kg or new.custo_total_cents is distinct from old.custo_total_cents
     or new.abertura <> old.abertura or new.empresa_id <> old.empresa_id or new.data <> old.data
     or new.consumido_antes_kg <> old.consumido_antes_kg then
    raise exception 'Ração, depósito, data, quantidade e custo da entrada não mudam depois de lançados' using errcode = 'check_violation';
  end if;
  -- lote, fabricação e validade: livres enquanto nada saiu da entrada; depois, só preencher o que faltava
  v_mexida := old.consumido_antes_kg > 0 or exists (
    select 1 from movimentos_estoque where entrada_id = old.id and coalesce(origem_tabela, '') <> 'racao_entradas');
  if v_mexida and ((old.validade is not null and new.validade is distinct from old.validade)
                   or (old.lote_fabricacao is not null and new.lote_fabricacao is distinct from old.lote_fabricacao)
                   or (old.fabricacao is not null and new.fabricacao is distinct from old.fabricacao)) then
    raise exception 'A entrada R-% já foi usada: lote, fabricação e validade não mudam mais', old.numero using errcode = 'check_violation';
  end if;
  if new.validade is not null and new.fabricacao is not null and new.validade < new.fabricacao then
    raise exception 'A validade é antes da fabricação' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function public.excluir_entrada_racao(p_entrada uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e racao_entradas%rowtype;
begin
  select * into e from racao_entradas where id = p_entrada;
  if not found or e.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Entrada não encontrada' using errcode = 'no_data_found';
  end if;
  if not app.pode_algum(e.empresa_id, array['estoque.editar', 'racao.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar estoque' using errcode = 'insufficient_privilege';
  end if;
  perform app.travar_estoque(e.empresa_id);
  if e.abertura or e.consumido_antes_kg > 0
     or exists (select 1 from movimentos_estoque where entrada_id = e.id and coalesce(origem_tabela, '') <> 'racao_entradas') then
    raise exception 'A ração da entrada R-% já foi usada ou ajustada: faça um ajuste da entrada em vez de excluir', e.numero
      using errcode = 'check_violation';
  end if;
  perform set_config('app.racao_pode_apagar', 'sim', true);
  delete from racao_entradas where id = e.id;
  perform set_config('app.racao_pode_apagar', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Movimentos de ração para a tela (consultar movimentos) e para o custo do lote
-- ---------------------------------------------------------------------------
create view racao_movimentos with (security_invoker = true) as
select m.id, m.empresa_id, m.data, m.created_at, m.tipo, m.produto_id, m.entrada_id, e.numero as entrada_numero,
       m.quantidade as kg, m.custo_unit_cents as custo_kg_cents, round(m.quantidade * coalesce(m.custo_unit_cents, 0))::bigint as custo_cents,
       m.lote_id, m.viveiro_id, m.baixa_id, m.estorno_de, m.origem_tabela, m.origem_lancamento, m.observacao, m.created_by,
       (m.baixa_id is not null and exists (select 1 from racao_estornos x where x.baixa_id = m.baixa_id)) as estornada
from movimentos_estoque m join racao_entradas e on e.id = m.entrada_id;
grant select on racao_movimentos to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Zerar o sistema pode apagar os movimentos de ração
-- ---------------------------------------------------------------------------
do $$
declare v text;
begin
  v := pg_get_functiondef('public.zerar_sistema(uuid, text, text)'::regprocedure);
  if position('  delete from movimentos_estoque where empresa_id = p_empresa;' in v) = 0 then
    raise exception 'zerar_sistema mudou: revise a liberação dos movimentos de ração';
  end if;
  v := replace(v, '  delete from movimentos_estoque where empresa_id = p_empresa;',
                  '  perform set_config(''app.racao_pode_apagar'', ''sim'', true);' || chr(10) ||
                  '  delete from racao_estornos where empresa_id = p_empresa;' || chr(10) ||
                  '  delete from movimentos_estoque where empresa_id = p_empresa;');
  execute v;
end $$;

select app.travar_referencias();
