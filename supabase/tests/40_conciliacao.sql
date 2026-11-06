-- Marco 2b: extrato, conciliação, relatórios e fechamento de mês.
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

set role authenticated;
set request.jwt.claim.sub = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
select set_config('t.emp', criar_empresa('22333444000155', 'Piscicultura E Ltda')::text, false);
select set_config('t.caixa', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa da piscicultura'), false);
update contas_financeiras set saldo_inicial_data = '2026-09-01' where id = current_setting('t.caixa')::uuid;
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('e0000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2026-09-01');
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null and nome = 'Ração e insumos'), false);
select set_config('t.milho', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj)
values ('e0000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Bom Preço', '55666777000188');

-- Títulos em aberto
select set_config('t.venda', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 10', '2026-09-10', '2026-09-01', 120000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 120000)), 'e0000000-0000-0000-0000-0000000000c1')::text, false);
select set_config('t.milhopg', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho 30 t', '2026-09-12', '2026-08-01', 300000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 300000)))::text, false);

-- Importação idempotente
select pg_temp.ok((importar_extrato('e0000000-0000-0000-0000-000000000001', 'ofx', '[
  {"id_externo":"F1","data":"2026-09-11","descricao":"PIX RECEBIDO MERCADO BOM PRECO","valor_cents":120000,"cpf_cnpj":"55.666.777/0001-88"},
  {"id_externo":"F2","data":"2026-09-12","descricao":"PAG BOLETO AGRO MILHO","valor_cents":-300350},
  {"id_externo":"F3","data":"2026-09-15","descricao":"TARIFA PACOTE","valor_cents":-4590},
  {"id_externo":"F4","data":"2026-09-20","descricao":"TRANSF PARA CAIXA","valor_cents":-50000},
  {"id_externo":"F5","data":"2026-09-21","descricao":"ESTORNO","valor_cents":990}
]'::jsonb)->>'novas')::int = 5, 'extrato importa 5 lançamentos');
select pg_temp.ok((importar_extrato('e0000000-0000-0000-0000-000000000001', 'ofx', '[
  {"id_externo":"F1","data":"2026-09-11","descricao":"PIX RECEBIDO MERCADO BOM PRECO","valor_cents":120000},
  {"id_externo":"F6","data":"2026-09-25","descricao":"PIX RECEBIDO","valor_cents":5000}
]'::jsonb)->>'novas')::int = 1, 'reimportar o mesmo arquivo só traz o que é novo');

select set_config('t.m1', (select id::text from movimentos_bancarios where id_externo = 'F1'), false);
select set_config('t.m2', (select id::text from movimentos_bancarios where id_externo = 'F2'), false);
select set_config('t.m3', (select id::text from movimentos_bancarios where id_externo = 'F3'), false);
select set_config('t.m4', (select id::text from movimentos_bancarios where id_externo = 'F4'), false);
select set_config('t.m5', (select id::text from movimentos_bancarios where id_externo = 'F5'), false);
select pg_temp.ok((select cpf_cnpj_contraparte from movimentos_bancarios where id = current_setting('t.m1')::uuid) = '55666777000188', 'CPF/CNPJ da contraparte normalizado');

-- Sugestões
select pg_temp.ok((select agendamento_id from sugestoes_conciliacao(current_setting('t.m1')::uuid) limit 1) = current_setting('t.venda')::uuid, 'entrada sugere a conta a receber de mesmo valor e cliente');
select pg_temp.ok((select agendamento_id from sugestoes_conciliacao(current_setting('t.m2')::uuid) limit 1) = current_setting('t.milhopg')::uuid, 'saída sugere a conta a pagar de valor próximo e mesma data');
select pg_temp.ok(not exists (select 1 from sugestoes_conciliacao(current_setting('t.m1')::uuid) where agendamento_id = current_setting('t.milhopg')::uuid), 'entrada nunca sugere conta a pagar');

-- Conciliar
select conciliar_com_titulo(current_setting('t.m1')::uuid, current_setting('t.venda')::uuid, 'sugestao');
select pg_temp.ok((select status from agendamentos where id = current_setting('t.venda')::uuid) = 'quitado', 'conciliar quita o título');
select pg_temp.espera_erro(format('select conciliar_com_titulo(%L, %L)', current_setting('t.m1'), current_setting('t.venda')), 'já está');
select conciliar_com_titulo(current_setting('t.m2')::uuid, current_setting('t.milhopg')::uuid);
select pg_temp.ok((select juros_cents from baixas where agendamento_id = current_setting('t.milhopg')::uuid) = 350, 'diferença a maior no pagamento vira juros');
select pg_temp.espera_erro(format('select conciliar_com_titulo(%L, %L)', current_setting('t.m5'), current_setting('t.milhopg')), 'Entrada no extrato');

-- Tarifa não agendada: cria o título já pago
select set_config('t.tarifa', conciliar_criando_titulo(current_setting('t.m3')::uuid, current_setting('t.desp')::uuid, null, null, 'Tarifa bancária')::text, false);
select pg_temp.ok((select status = 'quitado' and origem = 'conciliacao' and tipo = 'pagar' from agendamentos where id = current_setting('t.tarifa')::uuid), 'lançamento avulso vira conta paga com origem conciliação');

-- Transferência
select conciliar_transferencia(current_setting('t.m4')::uuid, current_setting('t.caixa')::uuid);
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = current_setting('t.caixa')::uuid) = 50000, 'transferência conciliada entra no caixa');
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = 'e0000000-0000-0000-0000-000000000001') = 120000 - 300350 - 4590 - 50000, 'saldo do banco bate com o extrato conciliado');

select ignorar_movimento(current_setting('t.m5')::uuid);

-- Desfazer
select desconciliar(current_setting('t.m3')::uuid, 'Desfeito pela conciliação', false);
select pg_temp.ok((select status from movimentos_bancarios where id = current_setting('t.m3')::uuid) = 'pendente', 'desfazer volta o lançamento para pendente');
select pg_temp.ok((select status from agendamentos where id = current_setting('t.tarifa')::uuid) = 'cancelado', 'título criado na conciliação é cancelado ao desfazer');
select conciliar_criando_titulo(current_setting('t.m3')::uuid, current_setting('t.desp')::uuid, null, null, 'Tarifa bancária');

-- Relatórios: o milho é competência de agosto e caixa de setembro
select pg_temp.ok((select sum(valor_cents) from resultado_competencia where empresa_id = current_setting('t.emp')::uuid and tipo = 'pagar' and mes = '2026-08-01') = 300000, 'competência: milho em agosto');
select pg_temp.ok((select sum(valor_cents) from resultado_caixa where empresa_id = current_setting('t.emp')::uuid and tipo = 'pagar' and mes = '2026-09-01') = 300350 + 4590, 'caixa: milho com juros e tarifa em setembro');
select pg_temp.ok((select sum(valor_cents) from resultado_caixa where empresa_id = current_setting('t.emp')::uuid and tipo = 'receber' and mes = '2026-09-01') = 120000, 'caixa: venda recebida em setembro');

select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Vacina', '2020-01-10', '2020-01-01', 7000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 7000)));
select pg_temp.ok((select data = current_date and valor_cents = -7000 and vencido from fluxo_previsto where descricao = 'Vacina'), 'fluxo previsto põe vencidos em hoje com sinal de saída');

-- Fechamento de mês
select pg_temp.espera_erro(format('select fechar_mes(%L, %L)', current_setting('t.emp'), '2026-09-01'), 'pendentes de conciliação');
update movimentos_bancarios set status = 'ignorado' where id_externo = 'F6';
select fechar_mes(current_setting('t.emp')::uuid, '2026-09-15');
select pg_temp.ok(exists (select 1 from periodos_fechados where empresa_id = current_setting('t.emp')::uuid and mes = '2026-09-01'), 'mês fechado');
select pg_temp.espera_erro(format('select desconciliar(%L, %L, false)', current_setting('t.m1'), 'Desfeito pela conciliação'), 'está fechado');
select pg_temp.espera_erro(format($$insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents) values (%L, %L, %L, '2026-09-30', 100)$$,
  current_setting('t.emp'), current_setting('t.caixa'), 'e0000000-0000-0000-0000-000000000001'), 'está fechado');
select reabrir_mes(current_setting('t.emp')::uuid, '2026-09-01');
select pg_temp.ok(not exists (select 1 from periodos_fechados where empresa_id = current_setting('t.emp')::uuid), 'mês reaberto');

-- Isolamento
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from movimentos_bancarios where empresa_id = current_setting('t.emp')::uuid) = 0, 'extrato isolado por empresa');
select pg_temp.ok((select count(*) from resultado_caixa where empresa_id = current_setting('t.emp')::uuid) = 0, 'relatórios isolados por empresa');
select pg_temp.espera_erro(format('select fechar_mes(%L, %L)', current_setting('t.emp'), '2026-10-01'), 'Sem permissão');

reset role;
\o
\echo 'TESTES DO MARCO 2b PASSARAM'
