-- Marco 3: despesca, estoque de pescado em kg, carência, pedidos de venda e alertas.
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
set request.jwt.claim.sub = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
select set_config('t.emp', criar_empresa('33444555000166', 'Piscicultura F Ltda')::text, false);
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), false);
select set_config('t.grande', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Grande'), false);
select set_config('t.inteiro', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and sem_classificacao), false);

select pg_temp.ok((select count(*) from produtos where empresa_id = current_setting('t.emp')::uuid and base_estoque and unidade = 'kg') = 6,
  'cada classe ganha um produto-base de estoque, em kg');
select pg_temp.ok((select fator_kg = 20 and unidade = 'cx' and para_venda from produtos
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), 'caixa de 20 kg de peixe extra');
select pg_temp.ok((select fator_kg = 1 and unidade = 'kg' and para_venda from produtos
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe extra (kg)'), 'peixe extra vendido por kg');
select pg_temp.ok(not exists (select 1 from produtos p join classes_peixe c on c.id = p.classe_peixe_id
                              where p.empresa_id = current_setting('t.emp')::uuid and p.para_venda and c.nome = 'Descarte'),
  'classe não comercializável não vira produto de venda');

-- Classes editáveis em Piscicultura: classe nova ganha os produtos; ligar e desligar a venda acompanha
insert into classes_peixe (empresa_id, nome, peso_min_g, peso_max_g, comercializavel, ordem)
values (current_setting('t.emp')::uuid, 'Jumbo', 4000, null, false, 5);
select pg_temp.ok((select count(*) = 1 from produtos p join classes_peixe c on c.id = p.classe_peixe_id
                   where c.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Jumbo'), 'classe nova sem venda só tem o produto de estoque');
update classes_peixe set comercializavel = true where empresa_id = current_setting('t.emp')::uuid and nome = 'Jumbo';
select pg_temp.ok((select count(*) = 2 from produtos p join classes_peixe c on c.id = p.classe_peixe_id
                   where c.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Jumbo' and p.para_venda and p.ativo),
  'classe que passa a ser vendida ganha o kg e a caixa');
update classes_peixe set comercializavel = false where empresa_id = current_setting('t.emp')::uuid and nome = 'Jumbo';
select pg_temp.ok(not exists (select 1 from produtos p join classes_peixe c on c.id = p.classe_peixe_id
                              where c.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Jumbo' and p.para_venda and p.ativo)
  and exists (select 1 from produtos p join classes_peixe c on c.id = p.classe_peixe_id
              where c.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Jumbo' and p.base_estoque and p.ativo),
  'classe que deixa de ser vendida desativa os produtos de venda e mantém o de estoque');
select pg_temp.espera_erro(format($$update classes_peixe set peso_max_g = 3500 where empresa_id = %L and nome = 'Jumbo'$$, current_setting('t.emp')),
  'classes_peixe_faixa_check');

insert into setores (id, empresa_id, nome) values ('f0000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes, area_m2)
values ('f0000000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-000000000001', 'G1', 'engorda', 20000, 10000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'F1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 200), 'f0000000-0000-0000-0000-000000000002', 10000, 5)::text, false);

-- O apontamento não mexe no estoque: o pescado entra no estoque na despesca
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'f0000000-0000-0000-0000-000000000002', current_date - 3,
  'manha', 30, 0, 120);
select pg_temp.ok((select coalesce(sum(saldo), 0) from estoque_peixe where empresa_id = current_setting('t.emp')::uuid) = 0, 'apontamento não põe peixe no estoque');

-- Despesca parcial separada por classe
select set_config('t.desp', registrar_despesca(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-000000000002', current_date - 2,
  'parcial', 1200, 1000, jsonb_build_object(current_setting('t.extra'), 500, current_setting('t.grande'), '700,0'))::text, false);
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 500
  and (select saldo from estoque_peixe where classe_id = current_setting('t.grande')::uuid) = 700, 'despesca põe os kg de cada classe no estoque');
select pg_temp.ok((select peso_medio_g = 1200 and peixes_perdidos = 0 from despescas where id = current_setting('t.desp')::uuid), 'peso médio da despesca = kg ÷ peixes');
select pg_temp.ok((select peixes_atuais = 10000 - 30 - 1000 from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid),
  'despesca parcial deixa o restante no viveiro');
select pg_temp.ok((select fase = 'engorda' from lotes where id = current_setting('t.lote')::uuid), 'lote segue em engorda depois da parcial');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date, 'parcial', 100, 10, jsonb_build_object(%L, 50))$$,
  current_setting('t.emp'), current_setting('t.extra')), 'A soma das classes');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date, 'parcial', 100, 10, jsonb_build_object(%L, 100))$$,
  current_setting('t.emp'), current_setting('t.lote')), 'Classe do pescado inválida');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date, 'parcial', 0)$$,
  current_setting('t.emp')), 'Informe os kg despescados');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date, 'meia', 10)$$,
  current_setting('t.emp')), 'Escolha despesca parcial ou total');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date, 'parcial', 9000, 8970)$$,
  current_setting('t.emp')), 'A despesca parcial precisa deixar peixes');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date + 1, 'parcial', 10, 5)$$,
  current_setting('t.emp')), 'data futura');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date - 3, 'parcial', 10, 5)$$,
  current_setting('t.emp')), 'Não há lote neste viveiro');

-- Desfazer a despesca devolve os peixes ao viveiro e tira os kg do estoque
select desfazer_despesca(current_setting('t.desp')::uuid);
select pg_temp.ok((select coalesce(sum(saldo), 0) from estoque_peixe where empresa_id = current_setting('t.emp')::uuid) = 0
  and (select peixes_atuais from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid) = 10000 - 30
  and (select count(*) from lote_alocacoes where lote_id = current_setting('t.lote')::uuid) = 1, 'desfazer a despesca devolve os peixes e tira os kg');

-- Reenvio offline com o mesmo client_id não duplica
select registrar_despesca(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-000000000002', current_date - 2, 'parcial', 1200, 1000,
  jsonb_build_object(current_setting('t.extra'), 500, current_setting('t.grande'), 700), null, 'f0000000-0000-0000-0000-0000000000f1');
select registrar_despesca(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-000000000002', current_date - 2, 'parcial', 1200, 1000,
  jsonb_build_object(current_setting('t.extra'), 500, current_setting('t.grande'), 700), null, 'f0000000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) from despescas where lote_id = current_setting('t.lote')::uuid) = 1
  and (select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 500, 'reenvio da despesca não duplica');

-- Sem separar por classe, vai tudo para a classe Inteiro; sem contar, os peixes saem pelo peso estimado
select set_config('t.desp2', registrar_despesca(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-000000000002', current_date - 1,
  'parcial', 300)::text, false);
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.inteiro')::uuid) = 300, 'despesca sem classes entra como peixe inteiro');
select pg_temp.ok((select qtd_peixes = greatest(round(300 * 1000 / app.peso_estimado(lote_id, current_date - 1))::int, 1)
                   from despescas where id = current_setting('t.desp2')::uuid), 'peixes da despesca estimados pelo peso da curva');

-- Carência: medicação ontem com 3 dias bloqueia a despesca para venda
insert into eventos_sanitarios (id, empresa_id, lote_id, data, tipo, carencia_dias, dose)
values ('f0000000-0000-0000-0000-0000000000e1', current_setting('t.emp')::uuid, current_setting('t.lote')::uuid, current_date - 1, 'medicacao', 3, 'oxitetraciclina');
select pg_temp.espera_erro(format($$select registrar_despesca(%L, 'f0000000-0000-0000-0000-000000000002', current_date, 'parcial', 50, 40)$$,
  current_setting('t.emp')), 'em carência de medicamento até');
select pg_temp.ok(exists (select 1 from alertas where empresa_id = current_setting('t.emp')::uuid and tipo = 'carencia'), 'alerta de carência');
delete from eventos_sanitarios where id = 'f0000000-0000-0000-0000-0000000000e1';

-- Pedido
insert into contatos (id, empresa_id, tipos, nome) values ('f0000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado F');
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
select set_config('t.kg', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe grande (kg)'), false);
select definir_preco(current_setting('t.cx')::uuid, 18000, null, current_date - 30);
select definir_preco(current_setting('t.cx')::uuid, 17500, 'f0000000-0000-0000-0000-0000000000c1', current_date - 30);
select definir_preco(current_setting('t.cx')::uuid, 19000, null, current_date);
select pg_temp.ok(preco_vigente(current_setting('t.cx')::uuid, null, current_date) = 19000 and preco_vigente(current_setting('t.cx')::uuid, null, current_date - 1) = 18000, 'novo preço vale a partir da data e o antigo fica no histórico');
select pg_temp.ok(preco_vigente(current_setting('t.cx')::uuid, 'f0000000-0000-0000-0000-0000000000c1') = 17500, 'preço do cliente vence o geral');

select pg_temp.espera_erro(format($$select criar_pedido(%L, %L, '[{"produto_id":"%s","quantidade":1}]')$$,
  current_setting('t.emp'), 'f0000000-0000-0000-0000-0000000000c1', current_setting('t.kg')), 'Sem preço');

select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 10),
                    jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 50, 'preco_unit_cents', 1100)),
  current_date, null, '[{"dias":14,"pct":50},{"dias":28,"pct":50}]', 'boleto', null, 'f0000000-0000-0000-0000-0000000000d1')::text, false);
select pg_temp.ok((select numero = 1 and total_cents = 10 * 17500 + 50 * 1100 from pedidos_venda where id = current_setting('t.ped')::uuid), 'pedido numerado com preço do cliente e preço informado');
select pg_temp.ok((select kg = 250 from pedidos where id = current_setting('t.ped')::uuid), 'pedido mostra o total em kg (10 caixas de 20 kg + 50 kg)');
select pg_temp.ok(criar_pedido(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-0000000000c1', '[{"produto_id":"00000000-0000-0000-0000-000000000000","quantidade":1}]',
  current_date, null, '[{"dias":0,"pct":100}]', null, null, 'f0000000-0000-0000-0000-0000000000d1') = current_setting('t.ped')::uuid, 'reenvio offline do pedido não duplica');

-- 10 caixas = 200 kg de peixe extra; há 500 kg
select pg_temp.ok(faturar_pedido(current_setting('t.ped')::uuid) = 2, 'faturar gera duas parcelas');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 500 - 200, 'faturar tira os kg do estoque');
select pg_temp.ok((select c.pedidos = 1 and c.ultima_compra = p.data and c.total_cents = p.total_cents
  from clientes_compras c join pedidos_venda p on p.id = current_setting('t.ped')::uuid
  where c.cliente_id = 'f0000000-0000-0000-0000-0000000000c1'), 'histórico de compra do cliente conta o pedido faturado');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.grande')::uuid) = 700 - 50, 'venda por kg baixa o kg da classe');
-- Desfazer a despesca do peixe já vendido deixaria o extra negativo: recusa (a mais recente sai antes)
select desfazer_despesca(current_setting('t.desp2')::uuid);
select pg_temp.espera_erro($$select desfazer_despesca((select id from despescas where client_id = 'f0000000-0000-0000-0000-0000000000f1'))$$,
  'Esse peixe já saiu do estoque');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 300, 'desfazer recusado não mexe no estoque');
select pg_temp.ok((select count(*) = 2 and sum(valor_cents) = 230000 and min(vencimento) = current_date + 14 and bool_and(parcela_total = 2)
  from agendamentos where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid), 'contas a receber com as parcelas da condição');

-- Segundo pedido maior que o disponível: 20 caixas = 400 kg; há 300 kg
select set_config('t.ped2', criar_pedido(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 20)))::text, false);
select pg_temp.espera_erro(format('select faturar_pedido(%L)', current_setting('t.ped2')), 'Estoque insuficiente de peixe extra');
select pg_temp.ok(not exists (select 1 from clientes_compras c join pedidos_venda p on p.cliente_id = c.cliente_id
  where p.id = current_setting('t.ped2')::uuid and c.pedidos > 1), 'pedido em aberto não conta como compra');

-- Cancelar o primeiro pedido devolve os kg
select cancelar_pedido(current_setting('t.ped')::uuid);
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 500, 'cancelar devolve os kg');
select pg_temp.ok((select bool_and(status = 'cancelado') from agendamentos where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid), 'cancelar cancela as contas a receber');

-- Inventário em kg
select pg_temp.ok(ajustar_estoque_peixe(current_setting('t.emp')::uuid, current_setting('t.grande')::uuid, 690.5) = -9.5, 'ajuste de inventário lança a diferença em kg');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.grande')::uuid) = 690.5, 'saldo fica no contado');

-- Despesca total esvazia o viveiro e encerra o lote; o que faltou na contagem vira perda
select set_config('t.total', registrar_despesca(current_setting('t.emp')::uuid, 'f0000000-0000-0000-0000-000000000002', current_date,
  'total', 9000, 8950)::text, false);
select pg_temp.ok((select peixes_perdidos = 20 from despescas where id = current_setting('t.total')::uuid), 'despesca total registra os peixes que não apareceram');
select pg_temp.ok((select fase = 'encerrado' and encerrado_em = current_date and motivo_encerramento = 'Despesca total' from lotes where id = current_setting('t.lote')::uuid),
  'despesca total do último viveiro encerra o lote');
select pg_temp.ok((select upper(periodo) = current_date + 1 from lote_alocacoes where lote_id = current_setting('t.lote')::uuid order by lower(periodo) desc limit 1)
  and not exists (select 1 from lote_alocacoes where lote_id = current_setting('t.lote')::uuid and upper_inf(periodo)), 'os peixes saem do viveiro no fim do dia da despesca');
select desfazer_despesca(current_setting('t.total')::uuid);
select pg_temp.ok((select fase = 'engorda' and encerrado_em is null from lotes where id = current_setting('t.lote')::uuid)
  and (select peixes_atuais = 8970 from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid), 'desfazer a despesca total reabre o lote');

-- Alertas: manejo atrasado, mortalidade e oxigênio
insert into eventos_sanitarios (empresa_id, lote_id, data, tipo, status) values (current_setting('t.emp')::uuid, current_setting('t.lote')::uuid, current_date - 3, 'vacina', 'planejado');
select pg_temp.ok(exists (select 1 from alertas where empresa_id = current_setting('t.emp')::uuid and tipo = 'sanidade' and nivel = 'atencao'), 'vacina planejada atrasada vira alerta');
select pg_temp.ok(not exists (select 1 from alertas where empresa_id = current_setting('t.emp')::uuid and tipo = 'mortalidade'), 'mortalidade normal não gera alerta');
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'f0000000-0000-0000-0000-000000000002', current_date, 'manha', 40, 0, 90,
  '{"oxigenio_mg_l": 2.6, "temperatura_c": 29}');
select pg_temp.ok(exists (select 1 from alertas where empresa_id = current_setting('t.emp')::uuid and tipo = 'mortalidade'), 'mortalidade acima de 0,1% ao dia vira alerta');
select pg_temp.ok((select nivel = 'critico' and detalhe like '2,6 mg/L%' from alertas where empresa_id = current_setting('t.emp')::uuid and tipo = 'oxigenio'),
  'oxigênio abaixo de 3 mg/L é alerta crítico');

-- Isolamento
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from estoque_peixe where empresa_id = current_setting('t.emp')::uuid) = 0, 'estoque isolado por empresa');
select pg_temp.ok((select count(*) from pedidos where empresa_id = current_setting('t.emp')::uuid) = 0, 'pedidos isolados por empresa');
select pg_temp.ok((select count(*) from clientes_compras where empresa_id = current_setting('t.emp')::uuid) = 0, 'histórico de compras isolado por empresa');
select pg_temp.ok((select count(*) from alertas where empresa_id = current_setting('t.emp')::uuid) = 0, 'alertas isolados por empresa');
select pg_temp.ok((select count(*) from despescas where empresa_id = current_setting('t.emp')::uuid) = 0, 'despescas isoladas por empresa');

reset role;
\o
\echo 'TESTES DO MARCO 3 PASSARAM'
