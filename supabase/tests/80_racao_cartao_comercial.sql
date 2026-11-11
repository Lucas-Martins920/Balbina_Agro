-- Marco 5b: insumos, cartão de crédito e relatórios comerciais (a fábrica de ração foi desativada em 2026-11-11).
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
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
select set_config('t.emp', criar_empresa('77888999000111', 'Piscicultura S Ltda')::text, false);

-- Insumos e custo médio
insert into depositos (id, empresa_id, nome, tipo) values
  ('80000000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'Silos', 'insumos'),
  ('80000000-0000-0000-0000-0000000000d2', current_setting('t.emp')::uuid, 'Ração pronta', 'racao');
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('80000000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'outro', 'Milho', 'kg'),
  ('80000000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'outro', 'Farelo de soja', 'kg'),
  ('80000000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'outro', 'Calcário', 'kg'),
  ('80000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'racao', 'Engorda 1', 'kg'),
  ('80000000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'racao', 'Engorda 2', 'kg');

select registrar_entrada('80000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000d1', current_date - 10, 10000, 1000000);
select registrar_entrada('80000000-0000-0000-0000-0000000000a1', '80000000-0000-0000-0000-0000000000d1', current_date - 5, 10000, 1400000);
select pg_temp.ok((select custo_medio_cents from produtos where id = '80000000-0000-0000-0000-0000000000a1') = 120, 'custo médio ponderado: R$ 1,00 e R$ 1,40 dão R$ 1,20/kg');
select registrar_entrada('80000000-0000-0000-0000-0000000000a2', '80000000-0000-0000-0000-0000000000d1', current_date - 5, 5000, 1250000);
select registrar_entrada('80000000-0000-0000-0000-0000000000a3', '80000000-0000-0000-0000-0000000000d1', current_date - 5, 2000, 40000);
select pg_temp.ok((select saldo = 20000 and valor_cents = 2400000 from estoque_produtos where produto_id = '80000000-0000-0000-0000-0000000000a1'), 'estoque de insumos com saldo e valor');
select pg_temp.espera_erro($$select registrar_saida('80000000-0000-0000-0000-0000000000a3', '80000000-0000-0000-0000-0000000000d1', current_date, 5000)$$, 'Saldo insuficiente');

-- Fábrica de ração desativada: a ração é comprada pronta e entra por entrada numerada
select pg_temp.espera_erro($$select salvar_formula('80000000-0000-0000-0000-0000000000b1', 'Engorda 1',
  '[{"insumo_id":"80000000-0000-0000-0000-0000000000a1","kg":700}]')$$, 'fábrica de ração foi desativada');
select pg_temp.espera_erro($$select produzir_racao(gen_random_uuid(), current_date, 1, '80000000-0000-0000-0000-0000000000d1', '80000000-0000-0000-0000-0000000000d2')$$, 'fábrica de ração foi desativada');
select pg_temp.espera_erro($$insert into produtos (empresa_id, tipo, nome, unidade) values (current_setting('t.emp')::uuid, 'insumo_racao', 'Farelo', 'kg')$$, 'tipo_check');
select pg_temp.espera_erro($$insert into formulas_racao (empresa_id, produto_racao_id, fase) values (current_setting('t.emp')::uuid, '80000000-0000-0000-0000-0000000000b1', 'x')$$, 'permission denied');

-- Cartão: fecha dia 5, vence dia 15
select pg_temp.ok(app.vencimento_fatura('2026-10-03', 5, 15) = '2026-10-15', 'compra antes do fechamento cai na fatura do mês');
select pg_temp.ok(app.vencimento_fatura('2026-10-06', 5, 15) = '2026-11-15', 'compra depois do fechamento vai para a próxima');
select pg_temp.ok(app.vencimento_fatura('2026-10-20', 25, 2) = '2026-11-02', 'vencimento antes do fechamento cai no mês seguinte');
select pg_temp.ok(app.vencimento_fatura('2026-01-10', 5, 31) = '2026-02-28', 'dia de vencimento ajustado ao fim do mês');
select pg_temp.ok(app.fechamento_da_fatura('2026-11-02', 25, 2) = '2026-10-25', 'fechamento a partir do vencimento');

insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data) values
  ('80000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 1000000, '2026-01-01');
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_data, dia_fechamento, dia_vencimento, conta_pagadora_id) values
  ('80000000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, 'cartao_credito', 'Cartão empresa', '2026-01-01', 5, 15, '80000000-0000-0000-0000-0000000000c1');
select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);

select compra_cartao('80000000-0000-0000-0000-0000000000c2', '2026-10-03', 'Peças do comedouro', 30000, current_setting('t.cat')::uuid, 3);
select compra_cartao('80000000-0000-0000-0000-0000000000c2', '2026-10-04', 'Combustível', 10000, current_setting('t.cat')::uuid);
select pg_temp.ok((select count(*) = 3 and bool_and(status = 'quitado') and bool_and(competencia = '2026-10-01') from agendamentos where descricao = 'Peças do comedouro'),
  'compra parcelada vira 3 contas pagas, todas na competência da compra');
select pg_temp.ok((select array_agg(vencimento::text || ':' || total_cents::text order by vencimento) from faturas_cartao where cartao_id = '80000000-0000-0000-0000-0000000000c2')
  = '{2026-10-15:20000,2026-11-15:10000,2026-12-15:10000}', 'cada parcela cai numa fatura');
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = '80000000-0000-0000-0000-0000000000c2') = -40000, 'limite usado aparece como saldo negativo do cartão');

select pagar_fatura('80000000-0000-0000-0000-0000000000c2', '2026-10-15', '2026-10-15');
select pg_temp.ok((select situacao = 'paga' and pago_cents = 20000 from faturas_cartao where vencimento = '2026-10-15'), 'fatura paga pela conta pagadora');
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = '80000000-0000-0000-0000-0000000000c1') = 1000000 - 20000, 'pagamento sai do banco');
select pg_temp.espera_erro($$select pagar_fatura('80000000-0000-0000-0000-0000000000c2', '2026-10-15', '2026-10-16')$$, 'sem saldo');
select pg_temp.espera_erro($$select pagar_fatura('80000000-0000-0000-0000-0000000000c2', '2026-11-15', '2026-11-10', null, 99999)$$, 'entre 0 e o saldo');
select pg_temp.espera_erro($$select compra_cartao('80000000-0000-0000-0000-0000000000c1', '2026-10-04', 'x', 100, null)$$, 'cartão de crédito');

-- Relatório comercial
insert into contatos (id, empresa_id, tipos, nome) values ('80000000-0000-0000-0000-0000000000e1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado S');
select ajustar_estoque_peixe(current_setting('t.emp')::uuid, (select id from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), 300, 'inventário');
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
select set_config('t.p1', criar_pedido(current_setting('t.emp')::uuid, '80000000-0000-0000-0000-0000000000e1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 5, 'preco_unit_cents', 18000)))::text, false);
select criar_pedido(current_setting('t.emp')::uuid, '80000000-0000-0000-0000-0000000000e1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 2, 'preco_unit_cents', 18000)));
select faturar_pedido(current_setting('t.p1')::uuid);
select pg_temp.ok((select count(*) = 1 and sum(kg) = 100 and sum(total_cents) = 90000 and min(classe) = 'Extra' from vendas_itens where empresa_id = current_setting('t.emp')::uuid),
  'só pedidos faturados entram nas vendas, com os kg e a classe');

-- Isolamento
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from estoque_produtos where empresa_id = current_setting('t.emp')::uuid) = 0, 'estoque de insumos isolado por empresa');
select pg_temp.ok((select count(*) from faturas_cartao where empresa_id = current_setting('t.emp')::uuid) = 0, 'faturas isoladas por empresa');
select pg_temp.ok((select count(*) from vendas_itens where empresa_id = current_setting('t.emp')::uuid) = 0, 'vendas isoladas por empresa');

reset role;
\o
\echo 'TESTES DO MARCO 5b PASSARAM'
