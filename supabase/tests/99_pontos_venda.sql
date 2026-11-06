-- Pontos de venda: sede automática, estoque por ponto, transferência com frete e perda no transporte, PDV no ponto,
-- cancelamento, desativação, permissões e isolamento entre empresas.
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

create or replace function pg_temp.saldo(p_ponto text) returns numeric language sql as $$
  select saldo from estoque_peixe_ponto where ponto_venda_id = p_ponto::uuid and classe_id = current_setting('t.extra')::uuid
$$;

set role authenticated;
set request.jwt.claim.sub = '9bc0ffee-1111-4000-8000-00000000c001';
select set_config('t.emp', criar_empresa('61382904000109', 'Piscicultura Pontos Ltda')::text, false);
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), false);
insert into setores (id, empresa_id, nome) values ('9bc0ffee-0000-4000-8000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9bc0ffee-0000-4000-8000-000000000002', current_setting('t.emp')::uuid, '9bc0ffee-0000-4000-8000-000000000001', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'P1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '9bc0ffee-0000-4000-8000-000000000002', 10000, 5);
select registrar_apontamento(current_setting('t.emp')::uuid, null, '9bc0ffee-0000-4000-8000-000000000002', current_date - 1,
  'manha', 0, 0, 1100);
select registrar_despesca(current_setting('t.emp')::uuid, '9bc0ffee-0000-4000-8000-000000000002', current_date - 1, 'parcial', 1000, 800,
  jsonb_build_object(current_setting('t.extra'), 1000));
select set_config('t.kg', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe extra (kg)'), false);
select definir_preco(current_setting('t.kg')::uuid, 1000, null, current_date - 1);
insert into contatos (id, empresa_id, tipos, nome) values
  ('9bc0ffee-0000-4000-8000-0000000000e1', current_setting('t.emp')::uuid, '{fornecedor}', 'Frete Rápido');

-- Sede
select set_config('t.sede', (select id::text from pontos_venda where empresa_id = current_setting('t.emp')::uuid and sede), false);
select pg_temp.ok((select nome = 'Piscicultura' and tipo = 'piscicultura' and deposito_id = app.deposito_peixe(empresa_id)
  from pontos_venda where id = current_setting('t.sede')::uuid), 'a piscicultura vira a sede com o depósito de pescado');
select pg_temp.ok(pg_temp.saldo(current_setting('t.sede')) = 1000, 'a produção está na sede');

-- Ponto novo
select set_config('t.loja', criar_ponto_venda(current_setting('t.emp')::uuid, 'Loja Manaus', 'loja', 'Manaus', 'am')::text, false);
select pg_temp.ok((select d.tipo = 'peixe' and c.tipo = 'caixinha' and cc.tipo = 'comercial' and pv.uf = 'AM' and not pv.sede
  from pontos_venda pv join depositos d on d.id = pv.deposito_id join contas_financeiras c on c.id = pv.conta_caixa_id
  join centros_custo cc on cc.id = pv.centro_custo_id where pv.id = current_setting('t.loja')::uuid),
  'ponto nasce com depósito de pescado, caixa e centro de custo');
select pg_temp.ok(app.deposito_peixe(current_setting('t.emp')::uuid) = (select deposito_id from pontos_venda where id = current_setting('t.sede')::uuid),
  'o depósito da piscicultura continua o da sede');
select pg_temp.ok(pg_temp.saldo(current_setting('t.loja')) = 0, 'ponto novo começa sem peixe');
select pg_temp.espera_erro(format($$select criar_ponto_venda(%L, 'loja manaus')$$, current_setting('t.emp')), 'Já existe');
select pg_temp.espera_erro(format($$update pontos_venda set sede = false where id = %L$$, current_setting('t.sede')), 'não mudam');

-- Transferência: 240 kg, frete R$ 36, chega depois
select set_config('t.tr', transferir_peixe(current_setting('t.emp')::uuid, current_setting('t.sede')::uuid, current_setting('t.loja')::uuid,
  current_date, jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 240)),
  3600, true, '9bc0ffee-0000-4000-8000-0000000000e1', current_date + 10, false)::text, false);
select pg_temp.ok((select status = 'em_transito' and kg_enviados = 240 and numero = 1 from transferencias_peixe where id = current_setting('t.tr')::uuid),
  'transferência fica a caminho');
select pg_temp.ok(pg_temp.saldo(current_setting('t.sede')) = 760 and pg_temp.saldo(current_setting('t.loja')) = 0,
  'o peixe sai da piscicultura na hora e só entra no ponto ao receber');
select pg_temp.ok((select saldo = 760 from estoque_peixe where classe_id = current_setting('t.extra')::uuid), 'estoque_peixe é o da piscicultura');
select pg_temp.ok((select a.tipo = 'pagar' and a.valor_cents = 3600 and a.vencimento = current_date + 10 and a.contato_id = '9bc0ffee-0000-4000-8000-0000000000e1'
    and r.centro_custo_id = (select centro_custo_id from pontos_venda where id = current_setting('t.loja')::uuid)
  from transferencias_peixe t join agendamentos a on a.id = t.frete_titulo_id join agendamento_rateios r on r.agendamento_id = a.id
  where t.id = current_setting('t.tr')::uuid), 'frete vira conta a pagar no centro de custo do ponto');
select pg_temp.espera_erro(format($$select transferir_peixe(%L, %L, %L, current_date, '[{"produto_id":"%s","quantidade":1000}]')$$,
  current_setting('t.emp'), current_setting('t.sede'), current_setting('t.loja'), current_setting('t.kg')), 'Estoque insuficiente');
select pg_temp.espera_erro(format($$select transferir_peixe(%L, %L, %L, current_date, '[{"produto_id":"%s","quantidade":1}]')$$,
  current_setting('t.emp'), current_setting('t.sede'), current_setting('t.sede'), current_setting('t.kg')), 'destino diferente');
select pg_temp.espera_erro(format($$select transferir_peixe(%L, %L, %L, current_date + 1, '[{"produto_id":"%s","quantidade":1}]')$$,
  current_setting('t.emp'), current_setting('t.sede'), current_setting('t.loja'), current_setting('t.kg')), 'futura');

-- Recebimento com 12 kg perdidos no transporte
select pg_temp.ok(receber_transferencia_peixe(current_setting('t.tr')::uuid, jsonb_build_object(current_setting('t.extra'), 12)) = 228,
  'recebe 228 dos 240 kg');
select pg_temp.ok(pg_temp.saldo(current_setting('t.loja')) = 228, 'ponto fica com o que chegou em bom estado');
select pg_temp.ok((select status = 'recebida' and perda_kg = 12 and kg_recebidos = 228 from transferencias_peixe where id = current_setting('t.tr')::uuid),
  'transferência recebida com a perda');
select pg_temp.ok((select round(custo_unit_cents, 2) = round(3600 / 228.0, 2) from movimentos_estoque
  where origem_id = current_setting('t.tr')::uuid and quantidade > 0), 'frete vira custo por kg recebido');
select pg_temp.ok(exists (select 1 from movimentos_estoque where origem_id = current_setting('t.tr')::uuid and tipo = 'perda' and quantidade = -12),
  'perda do transporte sai como perda no ponto');
select pg_temp.espera_erro(format($$select receber_transferencia_peixe(%L)$$, current_setting('t.tr')), 'já foi recebida');

-- PDV no ponto: 24 kg em dinheiro
select set_config('t.v1', venda_balcao(current_setting('t.emp')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 24)),
  '[{"forma":"dinheiro","valor_cents":24000}]', null, null, null, current_setting('t.loja')::uuid)::text, false);
select pg_temp.ok(pg_temp.saldo(current_setting('t.loja')) = 204 and pg_temp.saldo(current_setting('t.sede')) = 760,
  'venda no ponto baixa o estoque do ponto, não o da piscicultura');
select pg_temp.ok((select ponto_venda_id = current_setting('t.loja')::uuid from pedidos_venda where id = (current_setting('t.v1')::jsonb->>'pedido_id')::uuid),
  'pedido guarda o ponto');
select pg_temp.ok((select conta_id = (select conta_caixa_id from pontos_venda where id = current_setting('t.loja')::uuid) and ponto_nome = 'Loja Manaus'
  from caixa_pdv where empresa_id = current_setting('t.emp')::uuid and data = current_date), 'dinheiro cai no caixa do ponto');
select pg_temp.ok((select r.centro_custo_id = (select centro_custo_id from pontos_venda where id = current_setting('t.loja')::uuid)
  from agendamentos a join agendamento_rateios r on r.agendamento_id = a.id
  where a.origem = 'pedido_venda' and a.origem_id = (current_setting('t.v1')::jsonb->>'pedido_id')::uuid), 'receita no centro de custo do ponto');
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":300}]', '[{"forma":"dinheiro","valor_cents":300000}]', null, null, null, %L)$$,
  current_setting('t.emp'), current_setting('t.kg'), current_setting('t.loja')), 'em Loja Manaus');

-- Venda sem ponto continua saindo da piscicultura
select venda_balcao(current_setting('t.emp')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 12)), '[{"forma":"dinheiro","valor_cents":12000}]');
select pg_temp.ok(pg_temp.saldo(current_setting('t.sede')) = 748, 'venda sem ponto sai da piscicultura');
select pg_temp.ok((select count(*) = 2 from pedidos where empresa_id = current_setting('t.emp')::uuid and ponto_nome is not null), 'pedidos mostram o ponto');

select pg_temp.ok((select vendas = 1 and kg_vendidos = 24 and kg_recebidos = 228 and perda_kg = 12 and frete_cents = 3600
  from resumo_pontos_venda(current_setting('t.emp')::uuid, current_date - 30, current_date) where ponto_venda_id = current_setting('t.loja')::uuid),
  'resumo do ponto: vendas, recebidos, perdas e frete');

-- Cancelar: a transferência já vendida no destino não volta
select pg_temp.espera_erro(format($$select cancelar_transferencia_peixe(%L)$$, current_setting('t.tr')), 'já saiu do estoque');
-- Uma segunda, recebida na hora e sem frete, volta inteira
select set_config('t.tr2', transferir_peixe(current_setting('t.emp')::uuid, current_setting('t.sede')::uuid, current_setting('t.loja')::uuid,
  current_date, jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 60)))::text, false);
select pg_temp.ok(pg_temp.saldo(current_setting('t.loja')) = 264 and pg_temp.saldo(current_setting('t.sede')) = 688, 'recebida na hora');
select cancelar_transferencia_peixe(current_setting('t.tr2')::uuid);
select pg_temp.ok(pg_temp.saldo(current_setting('t.loja')) = 204 and pg_temp.saldo(current_setting('t.sede')) = 748
  and (select status = 'cancelada' from transferencias_peixe where id = current_setting('t.tr2')::uuid), 'cancelar devolve o peixe à origem');
-- Frete em aberto é cancelado junto
select set_config('t.tr3', transferir_peixe(current_setting('t.emp')::uuid, current_setting('t.sede')::uuid, current_setting('t.loja')::uuid,
  current_date, jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 12)), 1000, true, null, null, false)::text, false);
select cancelar_transferencia_peixe(current_setting('t.tr3')::uuid);
select pg_temp.ok((select a.status = 'cancelado' from transferencias_peixe t join agendamentos a on a.id = t.frete_titulo_id
  where t.id = current_setting('t.tr3')::uuid), 'frete em aberto é cancelado com a transferência');

-- Desativar: com peixe no ponto não pode; contagem zera e aí pode
select pg_temp.espera_erro(format($$update pontos_venda set ativo = false where id = %L$$, current_setting('t.loja')), 'ainda tem peixe');
select pg_temp.espera_erro(format($$select inventariar_ponto(%L, '{}')$$, current_setting('t.sede')), 'Na piscicultura');
select pg_temp.ok(inventariar_ponto(current_setting('t.loja')::uuid, jsonb_build_object(current_setting('t.extra'), 0)) = -204, 'contagem acerta o ponto');
update pontos_venda set ativo = false where id = current_setting('t.loja')::uuid;
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":1}]', '[{"forma":"dinheiro","valor_cents":1000}]', null, null, null, %L)$$,
  current_setting('t.emp'), current_setting('t.kg'), current_setting('t.loja')), 'inativo');
select pg_temp.espera_erro(format($$update pontos_venda set ativo = false where id = %L$$, current_setting('t.sede')), 'não pode ser desativada');
update pontos_venda set ativo = true where id = current_setting('t.loja')::uuid;

-- Permissões: caixa vende no ponto, mas não transfere nem cadastra
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values
  (current_setting('t.emp')::uuid, '9bc0ffee-0000-4000-8000-0000000000f1', 'caixa');
set role authenticated;
set request.jwt.claim.sub = '9bc0ffee-0000-4000-8000-0000000000f1';
select pg_temp.espera_erro(format($$select transferir_peixe(%L, %L, %L, current_date, '[{"produto_id":"%s","quantidade":1}]')$$,
  current_setting('t.emp'), current_setting('t.sede'), current_setting('t.loja'), current_setting('t.kg')), 'permissão');
select pg_temp.espera_erro(format($$select criar_ponto_venda(%L, 'Feira')$$, current_setting('t.emp')), 'permissão');

-- Outra empresa não usa o ponto desta
set request.jwt.claim.sub = '9bc0ffee-1111-4000-8000-00000000c002';
select set_config('t.emp2', criar_empresa('61382904000290', 'Outra Piscicultura Ltda')::text, false);
select pg_temp.ok((select count(*) = 1 from pontos_venda), 'só vê os pontos da própria empresa');
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[]', '[{"forma":"dinheiro","valor_cents":1000}]', null, null, null, %L)$$,
  current_setting('t.emp2'), current_setting('t.loja')), 'Ponto de venda inválido');

reset role;
\o
\echo 'TESTES DE PONTOS DE VENDA PASSARAM'
