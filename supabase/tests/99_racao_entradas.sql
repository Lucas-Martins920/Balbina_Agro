-- Estoque de ração: ficha técnica, entradas numeradas com lote e validade, saldo por entrada pelo FEFO.
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
set request.jwt.claim.sub = '99c00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('99777888000155', 'Piscicultura Ração Ltda')::text, false);
insert into produtos (id, empresa_id, tipo, nome, unidade, fabricante, proteina_pct, granulometria, saco_kg, fase_recomendada) values
  ('99c00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'racao', 'Ração 32% 4-6 mm', 'kg', 'Fabricante A', 32, '4–6 mm', 25, 'Recria III'),
  ('99c00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'racao', 'Ração 28% 8 mm', 'kg', 'Fabricante A', 28, '8 mm', null, 'Engorda I'),
  ('99c00000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'corretivo', 'Calcário', 'kg', null, null, null, null, null);
select pg_temp.espera_erro($$insert into produtos (empresa_id, tipo, nome, unidade, proteina_pct) values (current_setting('t.emp')::uuid, 'racao', 'PB errada', 'kg', 90)$$, 'check');

-- Entrada por sacos: o kg sai do peso do saco; número sequencial; vira movimento de compra com custo
select pg_temp.ok(registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 90, 10, null, null, current_date - 5, 150000, 'L123', current_date - 20) = 1, 'primeira entrada é a R-1');
select pg_temp.ok((select kg = 250 and sacos = 10 and lote_fabricacao = 'L123' from racao_entradas where numero = 1 and empresa_id = current_setting('t.emp')::uuid), '10 sacos de 25 kg = 250 kg');
select pg_temp.ok((select tipo = 'entrada_compra' and quantidade = 250 and custo_unit_cents = 600 and validade = current_date + 90
                   from movimentos_estoque where origem_tabela = 'racao_entradas' and produto_id = '99c00000-0000-0000-0000-0000000000a1'), 'entrada vira compra no estoque, com validade');
select pg_temp.ok((select custo_medio_cents = 600 from produtos where id = '99c00000-0000-0000-0000-0000000000a1'), 'custo médio pelo preço da entrada');
select pg_temp.ok(registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 30, null, 100) = 2, 'segunda entrada é a R-2, em kg');

-- Regras da entrada
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', null, 1)$$, 'validade');
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date - 1, 1)$$, 'já chega vencida');
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 10, 1, null, null, current_date + 1)$$, 'não pode ser futura');
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a2', current_date + 10, 4)$$, 'peso do saco');
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a3', current_date + 10, null, 10)$$, 'Escolha uma ração');
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 10, 0)$$, 'positiva');
select pg_temp.espera_erro($$update racao_entradas set kg = 1 where numero = 1 and empresa_id = current_setting('t.emp')::uuid$$, 'não mudam');
update racao_entradas set lote_fabricacao = 'L124' where numero = 1 and empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select lote_fabricacao = 'L124' from racao_entradas where numero = 1 and empresa_id = current_setting('t.emp')::uuid), 'lote de fabricação pode ser corrigido');
delete from racao_entradas where numero = 1 and empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select count(*) = 2 from racao_entradas where empresa_id = current_setting('t.emp')::uuid), 'apagar direto na tabela não passa (só pela função)');

-- FEFO: 350 kg no estoque; a R-2 vence antes (30 dias) e é a primeira a sair
select pg_temp.ok((select saldo_kg = 250 from racao_saldos where numero = 1 and empresa_id = current_setting('t.emp')::uuid)
              and (select saldo_kg = 100 and dias_para_vencer = 30 from racao_saldos where numero = 2 and empresa_id = current_setting('t.emp')::uuid), 'sem consumo, cada entrada tem o que entrou');
select movimentar_estoque('99c00000-0000-0000-0000-0000000000a1', 'saida', 120, null, current_date, null, 'consumo_lote');
select pg_temp.ok((select saldo_kg = 0 from racao_saldos where numero = 2 and empresa_id = current_setting('t.emp')::uuid)
              and (select saldo_kg = 230 from racao_saldos where numero = 1 and empresa_id = current_setting('t.emp')::uuid), 'consumo de 120 kg esgota a R-2 (vence antes) e tira 20 kg da R-1');

-- Excluir: só se a ração da entrada ainda está no depósito
select pg_temp.espera_erro($$select excluir_entrada_racao((select id from racao_entradas where numero = 1 and empresa_id = current_setting('t.emp')::uuid))$$, 'já foi usada');
select pg_temp.ok((select count(*) = 2 from racao_entradas where empresa_id = current_setting('t.emp')::uuid), 'exclusão recusada não apaga nada');
select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 60, 2);
select excluir_entrada_racao((select id from racao_entradas where numero = 3 and empresa_id = current_setting('t.emp')::uuid));
select pg_temp.ok((select count(*) = 0 from movimentos_estoque where origem_tabela = 'racao_entradas' and observacao = 'Entrada R-3'), 'excluir a entrada apaga o movimento');
select pg_temp.ok(registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 60, 2) = 4, 'número excluído não volta (R-4)');

-- Sem estoque.editar nem racao.editar não lança
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '99c00000-0000-0000-0000-000000000002', 'apontador');
set role authenticated;
set request.jwt.claim.sub = '99c00000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$select registrar_entrada_racao('99c00000-0000-0000-0000-0000000000a1', current_date + 60, 2)$$, 'não tem permissão');
select pg_temp.espera_erro($$select excluir_entrada_racao((select id from racao_entradas where numero = 4 and empresa_id = current_setting('t.emp')::uuid))$$, 'não tem permissão');

-- Outra empresa não vê as entradas
set request.jwt.claim.sub = '99c00000-0000-0000-0000-000000000003';
select criar_empresa('99777888000166', 'Outra Piscicultura Ltda');
select pg_temp.ok((select count(*) = 0 from racao_entradas where empresa_id = current_setting('t.emp')::uuid), 'outra empresa não vê as entradas');
select pg_temp.ok((select count(*) = 0 from racao_saldos where empresa_id = current_setting('t.emp')::uuid), 'nem o saldo por entrada');

reset role;
\o
\echo 'TESTES DE ENTRADAS DE RAÇÃO PASSARAM'
