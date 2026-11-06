-- Conciliação simplificada: palpite pelo histórico, transferência sugerida, certeiras em lote e conexões Open Finance.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f5f5';
select set_config('t.emp', criar_empresa('40404040000140', 'Piscicultura Open Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data) values
  ('f5000000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'corrente', 'Banco A', 0, '2026-09-01'),
  ('f5000000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'corrente', 'Banco B', 0, '2026-09-01');
select set_config('t.milho', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj) values
  ('f5000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{fornecedor}', 'Agro Milho', '11222333000144'),
  ('f5000000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Sol', '99888777000166');

select set_config('t.venda1', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 1', '2026-09-10', '2026-09-01', 80000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 80000)), 'f5000000-0000-0000-0000-0000000000c2')::text, false);
select set_config('t.venda2', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 2', '2026-09-20', '2026-09-01', 45000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 45000)))::text, false);
select set_config('t.venda3', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 3', '2026-09-20', '2026-09-01', 45000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 45000)))::text, false);

select importar_extrato('f5000000-0000-0000-0000-0000000000a1', 'open_finance', '[
  {"id_externo":"P1","data":"2026-09-05","descricao":"PIX ENVIADO 05/09 AGRO MILHO 4411","valor_cents":-250000,"cpf_cnpj":"11.222.333/0001-44"},
  {"id_externo":"P2","data":"2026-09-11","descricao":"PIX RECEBIDO MERCADO SOL","valor_cents":80000,"cpf_cnpj":"99888777000166"},
  {"id_externo":"P3","data":"2026-09-20","descricao":"DEPOSITO","valor_cents":45000},
  {"id_externo":"P4","data":"2026-09-22","descricao":"TED PARA BANCO B","valor_cents":-10000},
  {"id_externo":"P5","data":"2026-10-05","descricao":"PIX ENVIADO 05/10 AGRO MILHO 9090","valor_cents":-260000}
]'::jsonb);
select importar_extrato('f5000000-0000-0000-0000-0000000000a2', 'open_finance', '[
  {"id_externo":"Q1","data":"2026-09-23","descricao":"TED RECEBIDA","valor_cents":10000}
]'::jsonb);
select set_config('t.p1', (select id::text from movimentos_bancarios where id_externo = 'P1'), false);
select set_config('t.p2', (select id::text from movimentos_bancarios where id_externo = 'P2'), false);
select set_config('t.p3', (select id::text from movimentos_bancarios where id_externo = 'P3'), false);
select set_config('t.p4', (select id::text from movimentos_bancarios where id_externo = 'P4'), false);
select set_config('t.p5', (select id::text from movimentos_bancarios where id_externo = 'P5'), false);

-- Palpite
select pg_temp.ok(app.chave_descricao('PIX ENVIADO 05/09 AGRO MILHO 4411') = app.chave_descricao('PIX ENVIADO 05/10 AGRO MILHO 9090'), 'datas e números não mudam a chave da descrição');
select pg_temp.ok((select contato_id = 'f5000000-0000-0000-0000-0000000000c1' and categoria_id is null and origem = 'contato'
                   from palpite_lancamento(current_setting('t.p1')::uuid)), 'sem histórico, o palpite traz o contato do mesmo CNPJ');
select conciliar_criando_titulo(current_setting('t.p1')::uuid, current_setting('t.milho')::uuid, null, 'f5000000-0000-0000-0000-0000000000c1', 'Milho setembro');
select pg_temp.ok((select categoria_id = current_setting('t.milho')::uuid and contato_id = 'f5000000-0000-0000-0000-0000000000c1' and origem = 'historico'
                   from palpite_lancamento(current_setting('t.p5')::uuid)), 'depois de lançar uma vez, o próximo parecido já vem com categoria e contato');
select pg_temp.ok(not exists (select 1 from palpite_lancamento(current_setting('t.p3')::uuid)), 'movimento sem parecido não tem palpite');

-- Painel
select pg_temp.ok((select certeira = current_setting('t.venda1')::uuid from painel_conciliacao('f5000000-0000-0000-0000-0000000000a1') where movimento_id = current_setting('t.p2')::uuid),
  'mesmo valor e mesmo cliente é certeira');
select pg_temp.ok((select certeira is null and jsonb_array_length(sugestoes) = 2 from painel_conciliacao('f5000000-0000-0000-0000-0000000000a1') where movimento_id = current_setting('t.p3')::uuid),
  'dois títulos iguais: sugere os dois mas não é certeira');
select pg_temp.ok((select transferencia->>'conta_id' = 'f5000000-0000-0000-0000-0000000000a2' from painel_conciliacao('f5000000-0000-0000-0000-0000000000a1') where movimento_id = current_setting('t.p4')::uuid),
  'saída com entrada igual noutra conta sugere transferência');
select pg_temp.ok((select count(*) from painel_conciliacao('f5000000-0000-0000-0000-0000000000a1')) = 4, 'painel só mostra pendentes');

-- Certeiras em lote
select pg_temp.ok(conciliar_certeiras('f5000000-0000-0000-0000-0000000000a1') = 1, 'concilia só as certeiras');
select pg_temp.ok((select status from agendamentos where id = current_setting('t.venda1')::uuid) = 'quitado', 'título da certeira quitado');
select pg_temp.ok((select modo from conciliacoes where movimento_id = current_setting('t.p2')::uuid) = 'lote', 'conciliação marcada como lote');
select pg_temp.ok((select status from movimentos_bancarios where id = current_setting('t.p3')::uuid) = 'pendente', 'a ambígua continua pendente');

-- Conexões Open Finance
insert into conexoes_bancarias (empresa_id, item_id, instituicao) values (current_setting('t.emp')::uuid, 'item-1', 'Banco A');
update contas_financeiras set open_finance_item_id = 'item-1', open_finance_conta_id = 'acc-1' where id = 'f5000000-0000-0000-0000-0000000000a1';
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from conexoes_bancarias where empresa_id = current_setting('t.emp')::uuid) = 0, 'conexões isoladas por empresa');
select pg_temp.ok((select count(*) from painel_conciliacao('f5000000-0000-0000-0000-0000000000a1')) = 0, 'painel isolado por empresa');

reset role;
\o
\echo 'TESTES DA CONCILIAÇÃO COM OPEN FINANCE PASSARAM'
