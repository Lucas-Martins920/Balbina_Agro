-- Cancelar a importação de um extrato lido por engano (quem pode conciliar; o que já foi feito fica), duplicados na
-- importação (mesmo id ou mesma data+valor+descrição) e "já lançado" (pagamento feito à mão antes do extrato).
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
  ('ca000000-0000-0000-0000-0000000000a1', 'master@cancela.com', now()),
  ('ca000000-0000-0000-0000-0000000000a2', 'financeiro@cancela.com', now()),
  ('ca000000-0000-0000-0000-0000000000a3', 'leitura@cancela.com', now());
insert into auth.mfa_factors (user_id, status) values ('ca000000-0000-0000-0000-0000000000a1', 'verified');

set role authenticated;
set request.jwt.claim.sub = 'ca000000-0000-0000-0000-0000000000a1';
select pg_temp.codigo(interval '1 hour');
select set_config('t.emp', criar_empresa('53987654000121', 'Piscicultura Cancela Ltda')::text, false);
select set_config('t.caixa', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa da piscicultura'), false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('ca000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2026-08-01');
select set_config('t.banco', 'ca000000-0000-0000-0000-0000000000b1', false);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Tarifas',
  '[{"campo":"descricao","operador":"comeca_com","valor":"tarifa"}]', 'todas', current_setting('t.desp')::uuid, null, null, 'Tarifa');
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Boletos',
  '[{"campo":"descricao","operador":"contem","valor":"boleto"}]', 'todas', current_setting('t.desp')::uuid, null, null, 'Boleto');

-- ---------------------------------------------------------------------------
-- Duplicados na importação
-- ---------------------------------------------------------------------------
select set_config('t.r', importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"A1","data":"2026-09-01","descricao":"PIX ENVIADO JOAO","valor_cents":-1000},
  {"id_externo":"C1","data":"2026-09-03","descricao":"PIX  Igual","valor_cents":-200},
  {"id_externo":"C2","data":"2026-09-03","descricao":"PIX IGUAL","valor_cents":-200}
]'::jsonb)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'novas')::int = 3 and (current_setting('t.r')::jsonb->>'repetidas')::int = 0,
  'primeira importação: tudo novo, inclusive dois PIX iguais no mesmo dia');

select set_config('t.r', importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"A1","data":"2026-09-01","descricao":"PIX ENVIADO JOAO","valor_cents":-1000},
  {"id_externo":"C1","data":"2026-09-03","descricao":"PIX IGUAL","valor_cents":-200},
  {"id_externo":"C2","data":"2026-09-03","descricao":"PIX IGUAL","valor_cents":-200}
]'::jsonb)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'novas')::int = 0, 'mesmo arquivo de novo: nada entra (mesmo id)');

select set_config('t.r', importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"X1","data":"2026-09-01","descricao":"PIX ENVIADO JOÃO","valor_cents":-1000},
  {"id_externo":"X2","data":"2026-09-03","descricao":"PIX IGUAL","valor_cents":-200},
  {"id_externo":"X3","data":"2026-09-03","descricao":"PIX IGUAL","valor_cents":-200},
  {"id_externo":"X4","data":"2026-09-03","descricao":"PIX IGUAL","valor_cents":-200},
  {"id_externo":"X5","data":"2026-09-01","descricao":"PIX ENVIADO JOAO 2","valor_cents":-1000},
  {"id_externo":"X6","data":"2026-09-04","descricao":"PIX NOVO","valor_cents":-300}
]'::jsonb)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'repetidas')::int = 3 and (current_setting('t.r')::jsonb->>'novas')::int = 3,
  'banco trocou o id: mesma data+valor+descrição não entra de novo; o terceiro PIX igual e os diferentes entram');
select pg_temp.ok((select linhas_repetidas = 3 and linhas_novas = 3 from importacoes_extrato where id = (current_setting('t.r')::jsonb->>'importacao_id')::uuid),
  'a importação guarda quantas linhas eram repetidas');
select pg_temp.ok((select count(*) = 3 from movimentos_bancarios where conta_id = current_setting('t.banco')::uuid and app.chave_extrato(descricao) = 'pix igual'),
  'ficam três PIX iguais, como no banco');

-- ---------------------------------------------------------------------------
-- Já lançado: pagamento feito à mão antes do extrato
-- ---------------------------------------------------------------------------
select set_config('t.racao', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Ração setembro', '2026-09-05', '2026-09-01', 300000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 300000)))::text, false);
select baixar_titulos(array[current_setting('t.racao')::uuid], current_setting('t.banco')::uuid, '2026-09-05');
select set_config('t.baixa_racao', (select id::text from baixas where agendamento_id = current_setting('t.racao')::uuid), false);
insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents, descricao)
values (current_setting('t.emp')::uuid, current_setting('t.banco')::uuid, current_setting('t.caixa')::uuid, '2026-09-06', 50000, 'Troco do caixa');
select set_config('t.tr_manual', (select id::text from transferencias where descricao = 'Troco do caixa'), false);

select importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"B1","data":"2026-09-07","descricao":"PAGTO BOLETO RACAO","valor_cents":-300000},
  {"id_externo":"B2","data":"2026-09-07","descricao":"TRANSF ENVIADA","valor_cents":-50000}
]'::jsonb);
select set_config('t.b1', (select id::text from movimentos_bancarios where id_externo = 'B1'), false);
select set_config('t.b2', (select id::text from movimentos_bancarios where id_externo = 'B2'), false);
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id = current_setting('t.b1')::uuid),
  'regra de boleto não cria outro pagamento quando ele já foi lançado');
select pg_temp.ok((select count(*) = 0 from agendamentos where empresa_id = current_setting('t.emp')::uuid and origem = 'conciliacao'),
  'nenhum título novo para o boleto');
select pg_temp.ok((select ja_lancados->0->>'id' = current_setting('t.baixa_racao') and certeira is null
                   from painel_conciliacao(current_setting('t.banco')::uuid, 100) where movimento_id = current_setting('t.b1')::uuid),
  'painel mostra o pagamento já lançado');
select pg_temp.ok((select ja_lancados->0->>'tipo' = 'transferencia'
                   from painel_conciliacao(current_setting('t.banco')::uuid, 100) where movimento_id = current_setting('t.b2')::uuid),
  'e a transferência já lançada');
select pg_temp.ok((select count(*) = 0 from palpites_firmes(current_setting('t.banco')::uuid) where movimento_id = current_setting('t.b1')::uuid),
  '"lançar como nas últimas vezes" não pega o que já foi lançado');

select pg_temp.espera_erro(format('select conciliar_com_existente(%L, %L, %L)', current_setting('t.b2'), 'baixa', current_setting('t.baixa_racao')), 'não serve');
select conciliar_com_existente(current_setting('t.b1')::uuid, 'baixa', current_setting('t.baixa_racao')::uuid);
select conciliar_com_existente(current_setting('t.b2')::uuid, 'transferencia', current_setting('t.tr_manual')::uuid);
select pg_temp.ok((select count(*) = 2 from movimentos_bancarios where id in (current_setting('t.b1')::uuid, current_setting('t.b2')::uuid) and status = 'conciliado'),
  'extrato ligado ao que já estava lançado');
select pg_temp.ok((select count(*) = 1 from baixas where agendamento_id = current_setting('t.racao')::uuid), 'sem pagamento em dobro');

select desconciliar(current_setting('t.b1')::uuid, 'Revisão');
select desconciliar(current_setting('t.b2')::uuid, 'Revisão');
select pg_temp.ok((select count(*) = 1 from baixas where id = current_setting('t.baixa_racao')::uuid)
                  and (select count(*) = 1 from transferencias where id = current_setting('t.tr_manual')::uuid),
  'desconciliar mantém o pagamento e a transferência lançados antes');

-- ---------------------------------------------------------------------------
-- Cancelar a importação
-- ---------------------------------------------------------------------------
select set_config('t.venda', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 9', '2026-10-10', '2026-10-01', 80000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 80000)))::text, false);
select set_config('t.r', importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"E1","data":"2026-10-10","descricao":"PIX RECEBIDO PEIXE","valor_cents":80000},
  {"id_externo":"E2","data":"2026-10-11","descricao":"TARIFA PACOTE","valor_cents":-1500},
  {"id_externo":"E3","data":"2026-10-12","descricao":"PIX ALGO","valor_cents":-700},
  {"id_externo":"B1","data":"2026-09-07","descricao":"PAGTO BOLETO RACAO","valor_cents":-300000},
  {"id_externo":"E4","data":"2026-10-13","descricao":"COMPRA AVULSA","valor_cents":-2500}
]'::jsonb)::text, false);
select set_config('t.imp', current_setting('t.r')::jsonb->>'importacao_id', false);
select set_config('t.e' || substr(id_externo, 2), id::text, false) from movimentos_bancarios where id_externo like 'E%';
select pg_temp.ok((current_setting('t.r')::jsonb->>'novas')::int = 4, 'preparo: arquivo errado com 4 lançamentos novos (B1 já estava)');
select aplicar_regras_lote(current_setting('t.banco')::uuid, current_setting('t.imp')::uuid, null, null, null);
select set_config('t.tarifa', (select a.id::text from agendamentos a where a.origem = 'conciliacao' and a.origem_id = current_setting('t.e2')::uuid), false);
select pg_temp.ok(current_setting('t.tarifa') <> '', 'preparo: a regra lançou a tarifa');
select conciliar_com_titulo(current_setting('t.e1')::uuid, current_setting('t.venda')::uuid, 'sugestao');
select set_config('t.avulsa', conciliar_criando_titulo(current_setting('t.e4')::uuid, current_setting('t.desp')::uuid, null, null, 'Compra avulsa')::text, false);
-- B1 (já estava) conciliado de novo com o pagamento lançado antes
select conciliar_com_existente(current_setting('t.b1')::uuid, 'baixa', current_setting('t.baixa_racao')::uuid);

reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin, ativo) values
  (current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2', 'sem_restricao', false, true),
  (current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a3', 'visualizacao', false, true);
set role authenticated;

set request.jwt.claim.sub = 'ca000000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"aal": "aal1"}';
select pg_temp.espera_erro(format('select cancelar_importacao(%L, %L)', current_setting('t.imp'), 'Arquivo errado'), 'Sem permissão');

-- quem pode conciliar cancela, sem código do autenticador
set request.jwt.claim.sub = 'ca000000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format('select cancelar_importacao(%L, %L)', current_setting('t.imp'), ''), 'motivo');

reset role;
insert into periodos_fechados (empresa_id, mes) values (current_setting('t.emp')::uuid, '2026-10-01');
set role authenticated;
select pg_temp.espera_erro(format('select cancelar_importacao(%L, %L)', current_setting('t.imp'), 'Arquivo errado'), 'está fechado');
reset role;
delete from periodos_fechados where empresa_id = current_setting('t.emp')::uuid;
set role authenticated;

select set_config('t.r', cancelar_importacao(current_setting('t.imp')::uuid, 'Arquivo de outra conta')::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'apagados')::int = 1 and (current_setting('t.r')::jsonb->>'mantidos')::int = 3,
  'cancelar: só o que estava para conciliar sai (1); os 3 já conciliados ficam');
select pg_temp.ok((select count(*) = 0 from movimentos_bancarios where id = current_setting('t.e3')::uuid), 'o lançamento pendente sai do extrato');
select pg_temp.ok((select count(*) = 3 from movimentos_bancarios where importacao_id = current_setting('t.imp')::uuid and status = 'conciliado'),
  'os conciliados continuam conciliados');
select pg_temp.ok((select count(*) = 2 from agendamentos where id in (current_setting('t.tarifa')::uuid, current_setting('t.avulsa')::uuid) and status <> 'cancelado'),
  'títulos criados pela regra e pela conciliação ficam');
select pg_temp.ok((select status = 'quitado' from agendamentos where id = current_setting('t.venda')::uuid),
  'o recebimento conciliado continua quitado');
select pg_temp.ok((select status = 'conciliado' from movimentos_bancarios where id = current_setting('t.b1')::uuid)
                  and (select count(*) = 1 from baixas where id = current_setting('t.baixa_racao')::uuid),
  'linha que o arquivo repetia de outra importação fica, com a conciliação');
select pg_temp.ok((select cancelada_em is not null and motivo_cancelamento = 'Arquivo de outra conta' from importacoes_extrato where id = current_setting('t.imp')::uuid),
  'a importação fica marcada como cancelada, com o motivo');
select pg_temp.ok((select count(*) = 1 from audit_log where tabela = 'importacao_extrato' and registro_id = current_setting('t.imp')
                   and resumo like '%Motivo: Arquivo de outra conta%' and user_id = 'ca000000-0000-0000-0000-0000000000a2'), 'fica no histórico');
select pg_temp.espera_erro(format('select cancelar_importacao(%L, %L)', current_setting('t.imp'), 'De novo'), 'já foi cancelada');

select pg_temp.ok((importar_extrato(current_setting('t.banco')::uuid, 'ofx', '[
  {"id_externo":"E1","data":"2026-10-10","descricao":"PIX RECEBIDO PEIXE","valor_cents":80000},
  {"id_externo":"E3","data":"2026-10-12","descricao":"PIX ALGO","valor_cents":-700}
]'::jsonb)->>'novas')::int = 1, 'ler o OFX de novo traz só o que saiu (o conciliado não duplica)');

-- Open Finance não se cancela (o banco manda de novo)
select set_config('t.of', (importar_extrato(current_setting('t.banco')::uuid, 'open_finance', '[
  {"id_externo":"OF1","data":"2026-10-20","descricao":"PIX OF","valor_cents":-100}
]'::jsonb)->>'importacao_id'), false);
select pg_temp.espera_erro(format('select cancelar_importacao(%L, %L)', current_setting('t.of'), 'Engano'), 'Open Finance');

-- Outra empresa não alcança
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.espera_erro(format('select cancelar_importacao(%L, %L)', current_setting('t.of'), 'Invasão'), 'Sem permissão');

reset role;
\o
\echo 'TESTES DE CANCELAR IMPORTAÇÃO E DUPLICADOS PASSARAM'
