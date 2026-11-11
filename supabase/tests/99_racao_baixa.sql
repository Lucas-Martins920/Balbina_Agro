-- Estoque de ração, fase 2: toda saída ligada às entradas (FEFO), custo histórico por lote, estorno, ajuste,
-- saldo negativo e vencida bloqueados, concorrência e isolamento entre empresas.
\set ON_ERROR_STOP on

create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: era esperado erro contendo "%" em: %', p_trecho, p_sql;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if position(p_trecho in sqlerrm) = 0 then
    raise exception 'FALHOU: erro diferente do esperado. Esperado "%", veio "%"', p_trecho, sqlerrm;
  end if;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- saldo de uma entrada pelo número
create or replace function pg_temp.saldo(p_num int) returns numeric language sql as $$
  select saldo_kg from racao_saldos where empresa_id = current_setting('t.emp')::uuid and numero = p_num $$;

set role authenticated;
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('99555444000133', 'Piscicultura Baixa Ltda')::text, false);
select set_config('t.hoje', app.hoje(current_setting('t.emp')::uuid)::text, false);
select set_config('t.mes', date_trunc('month', app.hoje(current_setting('t.emp')::uuid))::date::text, false);

insert into setores (id, empresa_id, nome) values ('99d00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('99d00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, '99d00000-0000-0000-0000-000000000001', 'V1', 'engorda', 10000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'L-01',
  (select id from especies where empresa_id is null limit 1), current_setting('t.mes')::date,
  '99d00000-0000-0000-0000-0000000000a1', 2500, 50)::text, false);
insert into produtos (id, empresa_id, tipo, nome, unidade, saco_kg) values
  ('99d00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'racao', 'Ração 32%', 'kg', 25),
  ('99d00000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'racao', 'Ração 28%', 'kg', 25);

-- Entradas: R-1 vence em 60 dias (R$ 5/kg); R-2 e R-3 vencem no mesmo dia (30 dias), a R-3 chegou antes
select registrar_entrada_racao('99d00000-0000-0000-0000-0000000000b1', current_setting('t.hoje')::date + 60, null, 100, null, current_setting('t.mes')::date, 50000);
select registrar_entrada_racao('99d00000-0000-0000-0000-0000000000b1', current_setting('t.hoje')::date + 30, null, 100, null, current_setting('t.mes')::date, 60000);
select registrar_entrada_racao('99d00000-0000-0000-0000-0000000000b1', current_setting('t.hoje')::date + 30, null, 100, null, current_setting('t.mes')::date - 1, 70000);
select pg_temp.ok((select array_agg(numero order by ordem_consumo) from racao_saldos
                   where empresa_id = current_setting('t.emp')::uuid and produto_id = '99d00000-0000-0000-0000-0000000000b1') = '{3,2,1}',
  'ordem de consumo: vence primeiro; na mesma validade, a que chegou antes (R-3, R-2, R-1)');

-- Saída que cabe numa entrada só
select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida', 30, null, null, null, 'perda', null, 'Saco rasgado');
select pg_temp.ok((select count(*) = 1 and min(entrada_numero) = 3 and sum(kg) = -30 and min(custo_kg_cents) = 700 and min(origem_lancamento) = 'web'
                   from racao_movimentos where empresa_id = current_setting('t.emp')::uuid and kg < 0),
  'saída de 30 kg sai inteira da R-3, ao custo da R-3 (R$ 7/kg)');

-- Saída dividida entre entradas: 100 kg = 70 da R-3 + 30 da R-2, com o mesmo baixa_id
select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida', 100, null, null, null, 'perda', null, 'Teste dividido');
select set_config('t.b2', (select min(baixa_id::text) from movimentos_estoque where observacao = 'Teste dividido'), false);
select pg_temp.ok((select array_agg(entrada_numero::text || ':' || (-kg)::text || ':' || custo_kg_cents::int::text order by entrada_numero desc)
                   from racao_movimentos where baixa_id = current_setting('t.b2')::uuid) = '{3:70.000:700,2:30.000:600}',
  'saída de 100 kg dividida: 70 kg da R-3 e 30 kg da R-2, cada parte ao custo da sua entrada');
select pg_temp.ok(pg_temp.saldo(3) = 0 and pg_temp.saldo(2) = 70 and pg_temp.saldo(1) = 100, 'saldos por entrada depois das saídas');
select pg_temp.ok((select saldo = 170 from estoque_produtos where produto_id = '99d00000-0000-0000-0000-0000000000b1'), 'saldo do produto = soma das entradas');

-- Saldo negativo bloqueado
select pg_temp.espera_erro($$select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida', 500)$$, 'Saldo insuficiente');
select pg_temp.ok((select saldo = 170 from estoque_produtos where produto_id = '99d00000-0000-0000-0000-0000000000b1'), 'saída recusada não mexe no saldo');
select pg_temp.espera_erro(format($$insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, entrada_id)
  select empresa_id, produto_id, deposito_id, %L::date, 'perda', -71, id from racao_entradas where empresa_id = %L and numero = 2$$,
  current_setting('t.hoje'), current_setting('t.emp')), 'Saldo insuficiente na entrada R-2');
select pg_temp.espera_erro(format($$insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade)
  select empresa_id, produto_id, deposito_id, %L::date, 'perda', -1 from racao_entradas where empresa_id = %L and numero = 2$$,
  current_setting('t.hoje'), current_setting('t.emp')), 'precisa de uma entrada numerada');

-- Entrada vencida não é usada; só o ajuste da própria entrada mexe nela
select registrar_entrada_racao('99d00000-0000-0000-0000-0000000000b2', current_setting('t.hoje')::date + 5, 2);   -- R-4, 50 kg
update racao_entradas set validade = current_setting('t.hoje')::date - 1 where empresa_id = current_setting('t.emp')::uuid and numero = 4;
select pg_temp.ok((select vencida from racao_saldos where empresa_id = current_setting('t.emp')::uuid and numero = 4), 'R-4 aparece como vencida');
select pg_temp.espera_erro($$select movimentar_estoque('99d00000-0000-0000-0000-0000000000b2', 'saida', 10)$$, '50 kg vencidos');
select pg_temp.ok(pg_temp.saldo(4) = 50, 'vencida continua com o saldo até o ajuste');

-- Ajuste com motivo, tipo e auditoria (saldo antes e depois)
select pg_temp.espera_erro(format($$select ajustar_entrada_racao((select id from racao_entradas where empresa_id = %L and numero = 4), 0, 'vencimento', ' ')$$, current_setting('t.emp')), 'motivo');
select pg_temp.espera_erro(format($$select ajustar_entrada_racao((select id from racao_entradas where empresa_id = %L and numero = 4), 0, null, 'x')$$, current_setting('t.emp')), 'tipo do ajuste');
select pg_temp.espera_erro(format($$select ajustar_entrada_racao((select id from racao_entradas where empresa_id = %L and numero = 4), -1, 'contagem', 'x')$$, current_setting('t.emp')), 'não pode ser negativo');
select pg_temp.ok(ajustar_entrada_racao((select id from racao_entradas where empresa_id = current_setting('t.emp')::uuid and numero = 4), 0, 'vencimento', 'Descartada vencida') = -50,
  'ajuste de vencimento zera a entrada vencida');
select pg_temp.ok((select tipo = 'vencimento' and kg_antes = 50 and kg_depois = 0 and created_by = '99d00000-0000-0000-0000-000000000001'
                   from racao_ajustes where empresa_id = current_setting('t.emp')::uuid), 'ajuste guarda tipo, motivo, saldo antes e depois e quem fez');
select pg_temp.ok((select tipo = 'perda' and origem_lancamento = 'ajuste' from movimentos_estoque
                   where origem_tabela = 'racao_ajustes' and empresa_id = current_setting('t.emp')::uuid), 'descarte vira movimento de perda');
select pg_temp.ok(ajustar_entrada_racao((select id from racao_entradas where empresa_id = current_setting('t.emp')::uuid and numero = 1), 98, 'contagem', 'Contagem do galpão de ração') = -2,
  'ajuste de contagem tira só a diferença');

-- Lote, fabricação e validade não mudam depois que a entrada foi usada
select pg_temp.espera_erro(format($$update racao_entradas set validade = validade + 10 where empresa_id = %L and numero = 2$$, current_setting('t.emp')), 'já foi usada');
select pg_temp.espera_erro(format($$update racao_entradas set kg = 1 where empresa_id = %L and numero = 2$$, current_setting('t.emp')), 'não mudam');
update racao_entradas set lote_fabricacao = 'L-77' where empresa_id = current_setting('t.emp')::uuid and numero = 2;
select pg_temp.ok((select lote_fabricacao = 'L-77' from racao_entradas where empresa_id = current_setting('t.emp')::uuid and numero = 2), 'preencher o lote que faltava ainda pode');

-- Estorno: devolve às mesmas entradas, com motivo; a saída original fica no histórico
select pg_temp.espera_erro(format($$select estornar_baixa_racao(%L, '')$$, current_setting('t.b2')), 'motivo do estorno');
select estornar_baixa_racao(current_setting('t.b2')::uuid, 'Lançado em dobro');
select pg_temp.ok(pg_temp.saldo(3) = 70 and pg_temp.saldo(2) = 100, 'estorno devolve 70 kg à R-3 e 30 kg à R-2');
select pg_temp.ok((select count(*) = 2 and bool_and(estornada) from racao_movimentos where baixa_id = current_setting('t.b2')::uuid), 'saída original continua, marcada como estornada');
select pg_temp.ok((select count(*) = 2 and bool_and(custo_kg_cents in (600, 700)) and bool_and(origem_lancamento = 'ajuste')
                   from racao_movimentos where estorno_de = current_setting('t.b2')::uuid), 'estorno com o custo de cada entrada');
select pg_temp.ok((select motivo = 'Lançado em dobro' and kg = 100 and created_by = '99d00000-0000-0000-0000-000000000001'
                   from racao_estornos where baixa_id = current_setting('t.b2')::uuid), 'estorno guarda motivo, kg e quem fez');
select pg_temp.espera_erro(format($$select estornar_baixa_racao(%L, 'de novo')$$, current_setting('t.b2')), 'já foi estornada');
select pg_temp.espera_erro(format($$delete from movimentos_estoque where baixa_id = %L$$, current_setting('t.b2')), 'não é apagado');
select pg_temp.espera_erro(format($$select excluir_entrada_racao((select id from racao_entradas where empresa_id = %L and numero = 3))$$, current_setting('t.emp')), 'já foi usada');

-- Trato do lote: baixa pelo FEFO, custo histórico das entradas e custo do lote
select set_config('t.l1', registrar_apontamento(current_setting('t.emp')::uuid, null, '99d00000-0000-0000-0000-0000000000a1',
  current_setting('t.hoje')::date, 'manha', 0, 0, 90)::text, false);
select completar_lancamento(current_setting('t.l1')::uuid, '[{"produto_id":"99d00000-0000-0000-0000-0000000000b1","kg":90}]');
select pg_temp.ok((select array_agg(entrada_numero::text || ':' || (-kg)::text order by entrada_numero desc) from racao_movimentos
                   where empresa_id = current_setting('t.emp')::uuid and origem_tabela = 'apontamento_racoes') = '{3:70.000,2:20.000}',
  'trato de 90 kg: 70 kg da R-3 e 20 kg da R-2');
select pg_temp.ok((select bool_and(lote_id = current_setting('t.lote')::uuid and viveiro_id = '99d00000-0000-0000-0000-0000000000a1'
                             and tipo = 'consumo_lote' and origem_lancamento = 'web' and created_by is not null)
                   from movimentos_estoque where origem_tabela = 'apontamento_racoes' and empresa_id = current_setting('t.emp')::uuid),
  'trato ligado a lote, viveiro, responsável e origem');
select pg_temp.ok((select custo_unit_cents = round((70 * 700 + 20 * 600) / 90.0, 4) from apontamento_racoes r
                   join apontamento_lancamentos l on l.id = r.lancamento_id where l.id = current_setting('t.l1')::uuid),
  'linha do trato guarda o custo por kg das entradas usadas');
select pg_temp.espera_erro(format($$select estornar_baixa_racao((select baixa_id from movimentos_estoque where origem_tabela = 'apontamento_racoes' and empresa_id = %L limit 1), 'x')$$,
  current_setting('t.emp')), 'pelo apontamento');
-- compra nova mais cara muda o custo médio, mas não o custo já lançado
select registrar_entrada_racao('99d00000-0000-0000-0000-0000000000b1', current_setting('t.hoje')::date + 90, null, 100, null, null, 200000);
select pg_temp.ok((select custo_medio_cents > 700 from produtos where id = '99d00000-0000-0000-0000-0000000000b1'), 'custo médio subiu com a compra nova');
select pg_temp.ok((select sum(-quantidade * custo_unit_cents) = 70 * 700 + 20 * 600 from movimentos_estoque
                   where origem_tabela = 'apontamento_racoes' and empresa_id = current_setting('t.emp')::uuid), 'custo do trato não muda com o custo médio novo');
select pg_temp.ok(calcular_custos_mes(current_setting('t.emp')::uuid, current_setting('t.mes')::date) >= 1, 'custo do mês calculado');
select pg_temp.ok((select racao_cents = 70 * 700 + 20 * 600 from custos_lote_mensal where lote_id = current_setting('t.lote')::uuid
                   and mes = current_setting('t.mes')::date), 'custo de ração do lote = custo histórico das entradas usadas');

-- Concorrência: duas baixas ao mesmo tempo não usam o mesmo saldo (trava do estoque da empresa)
begin;
select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida', 1);
select pg_temp.ok(exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and granted),
  'a baixa segura a trava do estoque até o fim da transação');
rollback;

reset role;
do $$
declare v_con text := 'dbname=' || current_database() || ' user=postgres password=postgres host=localhost';
        v_sql text;
        v_erro text;
begin
  begin
    create extension if not exists dblink;
    perform dblink_connect('a', v_con);
  exception when others then
    raise notice 'ok - (concorrência entre conexões pulada: dblink indisponível: %)', sqlerrm;
    return;
  end;
  v_sql := format($q$set role authenticated; set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000001';
                     set timezone = 'America/Manaus'$q$);
  perform dblink_exec('a', v_sql);
  perform dblink_exec('a', 'begin');
  -- conexão A tira quase todo o saldo da ração 32% e segura a transação aberta
  perform * from dblink('a', format($q$select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida',
    (select saldo from estoque_produtos where produto_id = '99d00000-0000-0000-0000-0000000000b1') - 5)::text$q$)) as t(x text);
  perform dblink_connect('b', v_con);
  perform dblink_exec('b', v_sql);
  perform dblink_exec('b', 'set lock_timeout = ''300ms''');
  begin
    perform * from dblink('b', $q$select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida', 10)::text$q$) as t(x text);
    v_erro := 'nenhum';
  exception when others then v_erro := sqlerrm;
  end;
  if position('lock timeout' in v_erro) = 0 and position('trava' in v_erro) = 0 then
    raise exception 'FALHOU: a segunda baixa deveria esperar a primeira, veio: %', v_erro;
  end if;
  raise notice 'ok - segunda baixa espera a primeira terminar';
  perform dblink_exec('a', 'commit');
  begin
    perform * from dblink('b', $q$select movimentar_estoque('99d00000-0000-0000-0000-0000000000b1', 'saida', 10)::text$q$) as t(x text);
    v_erro := 'nenhum';
  exception when others then v_erro := sqlerrm;
  end;
  if position('Saldo insuficiente' in v_erro) = 0 then
    raise exception 'FALHOU: depois da primeira, a segunda baixa deveria ver só 5 kg, veio: %', v_erro;
  end if;
  raise notice 'ok - depois da primeira baixa, a segunda vê o saldo novo e é recusada';
  perform dblink_disconnect('a');
  perform dblink_disconnect('b');
end $$;
set role authenticated;
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000001';
select pg_temp.ok((select bool_and(saldo_kg >= 0) from racao_saldos where empresa_id = current_setting('t.emp')::uuid), 'nenhuma entrada com saldo negativo');

-- Sem permissão de estoque não estorna nem ajusta
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '99d00000-0000-0000-0000-000000000002', 'apontador');
set role authenticated;
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000002';
select pg_temp.espera_erro(format($$select ajustar_entrada_racao((select id from racao_entradas where empresa_id = %L and numero = 1), 0, 'contagem', 'x')$$, current_setting('t.emp')), 'não tem permissão');
select pg_temp.espera_erro(format($$select app.movimentar_racao((select p from produtos p where id = '99d00000-0000-0000-0000-0000000000b1'), 'saida', 1, null, %L::date, null, null, null, null)$$,
  current_setting('t.hoje')), 'não tem permissão');

-- Outra empresa não vê nem mexe
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000003';
select criar_empresa('99555444000214', 'Outra Piscicultura Ltda');
select pg_temp.ok((select count(*) = 0 from racao_movimentos where empresa_id = current_setting('t.emp')::uuid), 'outra empresa não vê os movimentos de ração');
select pg_temp.ok((select count(*) = 0 from racao_estornos where empresa_id = current_setting('t.emp')::uuid), 'nem os estornos');
select pg_temp.ok((select count(*) = 0 from racao_ajustes where empresa_id = current_setting('t.emp')::uuid), 'nem os ajustes');
select pg_temp.espera_erro(format($$select estornar_baixa_racao(%L, 'invasão')$$, current_setting('t.b2')), 'não encontrada');
select pg_temp.espera_erro($$select ajustar_entrada_racao((select id from racao_entradas limit 1), 0, 'contagem', 'x')$$, 'não encontrada');
select pg_temp.espera_erro($$select app.baixar_racao('99d00000-0000-0000-0000-0000000000b1', 1, current_date, 'perda')$$, 'permission denied');

reset role;
\o
\echo 'TESTES DA BAIXA DE RAÇÃO POR ENTRADA PASSARAM'
