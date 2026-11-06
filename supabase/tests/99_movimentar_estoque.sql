-- Estoque unificado: entrada, saída e ajuste de saldo de qualquer produto do cadastro.
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
set request.jwt.claim.sub = '99a00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('99777888000144', 'Piscicultura Estoque Ltda')::text, false);
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('99a00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'embalagem', 'Saco plástico para peixe', 'un'),
  ('99a00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'vacina', 'Vacina estreptococose', 'dose');

-- Produto recém-cadastrado aparece no saldo com zero
select pg_temp.ok((select saldo = 0 from saldos_produtos where produto_id = '99a00000-0000-0000-0000-0000000000a1'), 'produto sem movimento tem saldo zero');

-- Entrada sem depósito cria o Almoxarifado; com custo atualiza o custo médio
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'entrada', 1000, null, current_date, 50000) = 1000, 'entrada devolve o que entrou');
select pg_temp.ok((select count(*) = 1 from depositos where empresa_id = current_setting('t.emp')::uuid and nome = 'Almoxarifado'), 'entrada sem depósito usa o Almoxarifado');
select pg_temp.ok((select custo_medio_cents = 50 from produtos where id = '99a00000-0000-0000-0000-0000000000a1'), 'entrada com custo atualiza o custo médio');
select pg_temp.ok((select tipo = 'entrada_compra' from movimentos_estoque where produto_id = '99a00000-0000-0000-0000-0000000000a1'), 'entrada com custo é compra');

-- Saída e ajuste
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'saida', 200, null, current_date, null, 'perda', null, 'rasgou') = -200, 'saída devolve negativo');
select pg_temp.ok((select observacao = 'rasgou' from movimentos_estoque where produto_id = '99a00000-0000-0000-0000-0000000000a1' and tipo = 'perda'), 'observação gravada');
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'saida', 5000)$$, 'Saldo insuficiente');
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'saida', 10, null, current_date, null, 'venda')$$, 'Motivo de saída inválido');
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'entrada', 0)$$, 'positiva');
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'entrada', 1, null, current_date + 1)$$, 'não pode ser futura');
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'ajuste', 750) = -50, 'ajuste lança a diferença para o contado');
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'ajuste', 750) = 0, 'ajuste igual ao saldo não lança nada');
select pg_temp.ok((select saldo = 750 and valor_cents = 37500 from saldos_produtos where produto_id = '99a00000-0000-0000-0000-0000000000a1'), 'saldo e valor no cadastro');
select pg_temp.ok((select saldo = 750 from estoque_produtos where produto_id = '99a00000-0000-0000-0000-0000000000a1'), 'mesmo saldo na fábrica de ração');
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000a2', 'entrada', 500) = 500, 'entrada sem custo também vale');
select pg_temp.ok((select tipo = 'ajuste' and custo_unit_cents = 0 from movimentos_estoque where produto_id = '99a00000-0000-0000-0000-0000000000a2'), 'entrada sem custo é ajuste ao custo médio');

-- Peixe: produto embalado mexe no produto base da classe, convertendo pelo fator de kg
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), false);
select set_config('t.base', (select id::text from produtos where classe_peixe_id = current_setting('t.extra')::uuid and base_estoque), false);
insert into produtos (id, empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id) values
  ('99a00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'peixe', 'Caixa 10 kg extra teste', 'cx', 10, current_setting('t.extra')::uuid);
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000b1', 'entrada', 10) = 10, 'entrada de 10 caixas');
select pg_temp.ok((select saldo = 100 from estoque_peixe where classe_id = current_setting('t.extra')::uuid), '10 caixas de 10 kg viram 100 kg na classe');
select pg_temp.ok((select saldo = 100 from saldos_produtos where produto_id = current_setting('t.base')::uuid), 'produto base mostra o saldo em kg');
select pg_temp.ok((select saldo = 10 from saldos_produtos where produto_id = '99a00000-0000-0000-0000-0000000000b1'), 'caixa mostra o saldo em caixas');
select pg_temp.ok(movimentar_estoque('99a00000-0000-0000-0000-0000000000b1', 'saida', 0.25) = -0.25, 'saída de um quarto de caixa');
select pg_temp.ok((select saldo = 97.5 from estoque_peixe where classe_id = current_setting('t.extra')::uuid), 'peixe sai fracionado em kg (2,5 kg)');
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000b1', 'saida', 1, null, current_date, null, 'consumo_lote')$$, 'Motivo de saída inválido');
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000b1', 'saida', 20)$$, 'Saldo insuficiente');
select pg_temp.ok(movimentar_estoque(current_setting('t.base')::uuid, 'ajuste', 80) = -17.5, 'ajuste do peixe pela pesagem');
select pg_temp.ok((select saldo = 80 from estoque_peixe where classe_id = current_setting('t.extra')::uuid), 'estoque da classe depois do ajuste');

-- Quem não tem estoque.editar nem racao.editar não lança
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-000000000002', 'apontador');
set role authenticated;
set request.jwt.claim.sub = '99a00000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$select movimentar_estoque('99a00000-0000-0000-0000-0000000000a1', 'entrada', 1)$$, 'não tem permissão');

reset role;
\o
\echo 'TESTES DE MOVIMENTAÇÃO DE ESTOQUE PASSARAM'
