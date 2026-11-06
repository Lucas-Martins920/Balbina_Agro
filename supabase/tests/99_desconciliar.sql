-- Desconciliar com regras (motivo, mês fechado, o que já existia fica) e apagar conciliação ou
-- lançamento do extrato (só o master, com o código do autenticador de agora).
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

create or replace function pg_temp.codigo(p_ha interval) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
    jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - p_ha)::bigint)))::text, false);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('dc000000-0000-0000-0000-0000000000a1', 'master@desconc.com', now()),
  ('dc000000-0000-0000-0000-0000000000a2', 'financeiro@desconc.com', now()),
  ('dc000000-0000-0000-0000-0000000000a3', 'leitura@desconc.com', now());
insert into auth.mfa_factors (user_id, status) values ('dc000000-0000-0000-0000-0000000000a1', 'verified');

set role authenticated;
set request.jwt.claim.sub = 'dc000000-0000-0000-0000-0000000000a1';
select pg_temp.codigo(interval '1 hour');
select set_config('t.emp', criar_empresa('41222333000144', 'Piscicultura Desconcilia Ltda')::text, false);
select set_config('t.caixa', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa da piscicultura'), false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('dc000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2026-08-01');
select set_config('t.banco', 'dc000000-0000-0000-0000-0000000000b1', false);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);

select set_config('t.venda', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 7', '2026-09-10', '2026-09-01', 80000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 80000)))::text, false);

select importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"D1","data":"2026-09-10","descricao":"PIX RECEBIDO PEIXE","valor_cents":80000},
  {"id_externo":"D2","data":"2026-09-11","descricao":"TARIFA","valor_cents":-1500},
  {"id_externo":"D3","data":"2026-09-12","descricao":"TRANSF PARA CAIXA","valor_cents":-20000},
  {"id_externo":"D4","data":"2026-09-13","descricao":"ESTORNO","valor_cents":300},
  {"id_externo":"D5","data":"2026-09-14","descricao":"TARIFA DOC","valor_cents":-700},
  {"id_externo":"D6","data":"2026-09-15","descricao":"PIX DUPLICADO","valor_cents":-999}
]'::jsonb);
-- o caixa nasce com saldo inicial de hoje; o extrato de setembro precisa caber depois dele
reset role;
update contas_financeiras set saldo_inicial_data = '2026-09-01' where id = current_setting('t.caixa')::uuid;
set role authenticated;
select importar_extrato(current_setting('t.caixa')::uuid, 'ofx', '[
  {"id_externo":"C1","data":"2026-09-12","descricao":"DEPOSITO DO BANCO","valor_cents":20000}
]'::jsonb);
select set_config('t.m' || substr(id_externo, 2), id::text, false) from movimentos_bancarios where id_externo like 'D%';
select set_config('t.c1', id::text, false) from movimentos_bancarios where id_externo = 'C1';

select conciliar_com_titulo(current_setting('t.m1')::uuid, current_setting('t.venda')::uuid, 'sugestao');
select set_config('t.tarifa', conciliar_criando_titulo(current_setting('t.m2')::uuid, current_setting('t.desp')::uuid, null, null, 'Tarifa')::text, false);
select set_config('t.tr', conciliar_transferencia(current_setting('t.m3')::uuid, current_setting('t.caixa')::uuid)::text, false);
select conciliar_transferencia(current_setting('t.c1')::uuid, current_setting('t.banco')::uuid);
select pg_temp.ok((select count(*) = 1 from transferencias where empresa_id = current_setting('t.emp')::uuid), 'preparo: as duas pernas na mesma transferência');
select ignorar_movimento(current_setting('t.m4')::uuid);
select set_config('t.doc', conciliar_criando_titulo(current_setting('t.m5')::uuid, current_setting('t.desp')::uuid, null, null, 'Tarifa DOC')::text, false);

-- Usuários: financeiro (pode conciliar) e só leitura
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin, ativo) values
  (current_setting('t.emp')::uuid, 'dc000000-0000-0000-0000-0000000000a2', 'sem_restricao', false, true),
  (current_setting('t.emp')::uuid, 'dc000000-0000-0000-0000-0000000000a3', 'visualizacao', false, true);
set role authenticated;

-- ---------------------------------------------------------------------------
-- Desconciliar
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'dc000000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"aal": "aal1"}';
select pg_temp.espera_erro(format('select desconciliar(%L, %L)', current_setting('t.m1'), 'errado'), 'Sem permissão');

set request.jwt.claim.sub = 'dc000000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format('select desconciliar(%L, %L)', current_setting('t.m1'), ' '), 'motivo');
select pg_temp.espera_erro(format('select desconciliar(%L, %L)', current_setting('t.m6'), 'nada'), 'não está conciliado');

select desconciliar(current_setting('t.m1')::uuid, 'Era de outro pedido');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id = current_setting('t.m1')::uuid), 'desconciliar volta o lançamento para conciliar');
select pg_temp.ok((select status = 'aberto' and pago_cents = 0 from agendamentos where id = current_setting('t.venda')::uuid), 'a baixa criada sai e o título volta a aberto');
select pg_temp.ok((select count(*) = 1 from audit_log where tabela = 'desconciliacao' and registro_id = current_setting('t.m1')
                   and resumo like '%Motivo: Era de outro pedido%' and user_id = 'dc000000-0000-0000-0000-0000000000a2'), 'motivo e autor ficam no histórico');

select desconciliar(current_setting('t.m2')::uuid, 'Categoria errada');
select pg_temp.ok((select status = 'cancelado' from agendamentos where id = current_setting('t.tarifa')::uuid), 'título criado na conciliação é cancelado');
select desconciliar(current_setting('t.m5')::uuid, 'Vou conciliar com outro', true);
select pg_temp.ok((select status = 'aberto' from agendamentos where id = current_setting('t.doc')::uuid), 'ou fica em aberto, se pedir para manter');

select desconciliar(current_setting('t.m3')::uuid, 'Não foi transferência');
select pg_temp.ok((select count(*) = 1 from transferencias where id = current_setting('t.tr')::uuid), 'transferência fica enquanto a outra perna está conciliada');
select desconciliar(current_setting('t.c1')::uuid, 'Não foi transferência');
select pg_temp.ok((select count(*) = 0 from transferencias where id = current_setting('t.tr')::uuid), 'sem perna conciliada, a transferência sai');

select desconciliar(current_setting('t.m4')::uuid, 'Não era estorno');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id = current_setting('t.m4')::uuid), 'ignorado volta para conciliar');

-- O que já existia (baixa importada) fica; só o vínculo sai
select conciliar_com_titulo(current_setting('t.m1')::uuid, current_setting('t.venda')::uuid);
select set_config('t.baixa', (select baixa_id::text from conciliacoes where movimento_id = current_setting('t.m1')::uuid), false);
reset role;
insert into importacao_vinculos (empresa_id, origem, entidade, chave, registro_id)
values (current_setting('t.emp')::uuid, 'nibo', 'baixa', 'lancamento:x1', current_setting('t.baixa')::uuid);
set role authenticated;
select desconciliar(current_setting('t.m1')::uuid, 'Revisão');
select pg_temp.ok((select count(*) = 1 from baixas where id = current_setting('t.baixa')::uuid), 'baixa importada não é apagada ao desconciliar');
select pg_temp.ok((select status = 'quitado' from agendamentos where id = current_setting('t.venda')::uuid), 'e o título continua quitado');

-- Mês fechado bloqueia
select conciliar_criando_titulo(current_setting('t.m2')::uuid, current_setting('t.desp')::uuid, null, null, 'Tarifa');
update movimentos_bancarios set status = 'ignorado' where empresa_id = current_setting('t.emp')::uuid and status = 'pendente';
reset role;
insert into periodos_fechados (empresa_id, mes) values (current_setting('t.emp')::uuid, '2026-09-01');
set role authenticated;
select pg_temp.espera_erro(format('select desconciliar(%L, %L)', current_setting('t.m2'), 'Mês fechado'), 'está fechado');
reset role;
delete from periodos_fechados where empresa_id = current_setting('t.emp')::uuid;
set role authenticated;

-- ---------------------------------------------------------------------------
-- Apagar (só master com código de agora)
-- ---------------------------------------------------------------------------
select pg_temp.codigo(interval '1 minute');
select pg_temp.espera_erro(format('select apagar_conciliacao(%L, %L)', current_setting('t.m2'), 'Errado'), 'Só o master');
select pg_temp.espera_erro(format('select apagar_movimento_extrato(%L, %L)', current_setting('t.m6'), 'Duplicado'), 'Só o master');

set request.jwt.claim.sub = 'dc000000-0000-0000-0000-0000000000a1';
select pg_temp.codigo(interval '1 hour');
select pg_temp.espera_erro(format('select apagar_movimento_extrato(%L, %L)', current_setting('t.m6'), 'Duplicado'), 'código do autenticador');
select pg_temp.codigo(interval '1 minute');
select pg_temp.espera_erro(format('select apagar_movimento_extrato(%L, %L)', current_setting('t.m6'), ''), 'motivo');

-- apagar a conciliação leva junto o que já existia
reset role;
delete from baixas where id = current_setting('t.baixa')::uuid;
set role authenticated;
update movimentos_bancarios set status = 'pendente' where id = current_setting('t.m1')::uuid;
select conciliar_com_titulo(current_setting('t.m1')::uuid, current_setting('t.venda')::uuid);
reset role;
update importacao_vinculos set registro_id = (select baixa_id from conciliacoes where movimento_id = current_setting('t.m1')::uuid)
 where empresa_id = current_setting('t.emp')::uuid and entidade = 'baixa';
set role authenticated;
select apagar_conciliacao(current_setting('t.m1')::uuid, 'Importação errada');
select pg_temp.ok((select status = 'aberto' from agendamentos where id = current_setting('t.venda')::uuid), 'master apaga até a baixa importada');

select apagar_conciliacao(current_setting('t.m2')::uuid, 'Lançamento errado');
select pg_temp.ok((select count(*) = 0 from agendamentos where origem = 'conciliacao' and origem_id = current_setting('t.m2')::uuid and status <> 'cancelado'),
  'título criado na conciliação é apagado');

-- apagar o lançamento do extrato: some e não volta na próxima importação
select apagar_movimento_extrato(current_setting('t.m6')::uuid, 'Duplicado pelo banco');
select pg_temp.ok((select count(*) = 0 from movimentos_bancarios where id = current_setting('t.m6')::uuid), 'lançamento do extrato apagado');
select pg_temp.ok((importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"D6","data":"2026-09-15","descricao":"PIX DUPLICADO","valor_cents":-999},
  {"id_externo":"D7","data":"2026-09-16","descricao":"PIX NOVO","valor_cents":-100}
]'::jsonb)->>'novas')::int = 1, 'reimportar não traz de volta o que foi apagado');
select pg_temp.ok((select count(*) = 1 from movimentos_apagados where id_externo = 'D6' and motivo = 'Duplicado pelo banco'), 'fica guardado o que foi apagado');

select conciliar_com_titulo(current_setting('t.m1')::uuid, current_setting('t.venda')::uuid);
select apagar_movimento_extrato(current_setting('t.m1')::uuid, 'Lançamento de teste');
select pg_temp.ok((select status = 'aberto' and pago_cents = 0 from agendamentos where id = current_setting('t.venda')::uuid), 'apagar lançamento conciliado desfaz a baixa');
select pg_temp.ok((select count(*) = 4 from audit_log where tabela = 'desconciliacao' and acao = 'delete'
                   and user_id = 'dc000000-0000-0000-0000-0000000000a1'), 'cada exclusão fica no histórico');

-- Outra empresa não alcança
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.espera_erro(format('select desconciliar(%L, %L)', current_setting('t.m3'), 'Invasão'), 'Sem permissão');
select pg_temp.ok((select count(*) = 0 from movimentos_apagados where empresa_id = current_setting('t.emp')::uuid), 'lista de apagados isolada por empresa');

reset role;
\o
\echo 'TESTES DE DESCONCILIAR PASSARAM'
