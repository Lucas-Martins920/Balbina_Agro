-- Ponto como outra empresa do mesmo dono: a piscicultura vende para a loja e a entrada é lançada na loja.
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
set request.jwt.claim.sub = '9bd0beef-0000-4000-8000-00000000d001';
select set_config('t.piscicultura', criar_empresa('47120593000108', 'Piscicultura do Dono Ltda')::text, false);
select set_config('t.loja', criar_empresa('47120593000280', 'Loja do Dono Ltda')::text, false);
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.piscicultura')::uuid and nome = 'Extra'), false);
select set_config('t.extra_loja', (select id::text from classes_peixe where empresa_id = current_setting('t.loja')::uuid and nome = 'Extra'), false);
insert into setores (id, empresa_id, nome) values ('9bd00000-0000-4000-8000-000000000001', current_setting('t.piscicultura')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9bd00000-0000-4000-8000-000000000002', current_setting('t.piscicultura')::uuid, '9bd00000-0000-4000-8000-000000000001', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.piscicultura')::uuid, 'P1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '9bd00000-0000-4000-8000-000000000002', 10000, 5);
select registrar_apontamento(current_setting('t.piscicultura')::uuid, null, '9bd00000-0000-4000-8000-000000000002', current_date - 1,
  'manha', 0, 0, 1100);
select registrar_despesca(current_setting('t.piscicultura')::uuid, '9bd00000-0000-4000-8000-000000000002', current_date - 1, 'parcial', 3600, 1200,
  jsonb_build_object(current_setting('t.extra'), 3600));
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.piscicultura')::uuid and tipo = 'peixe'
  and classe_peixe_id = current_setting('t.extra')::uuid and fator_kg = 20), false);

-- A loja como cliente da piscicultura, pelo CNPJ dela; um cliente qualquer para o caso errado
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj) values
  ('9bd00000-0000-4000-8000-0000000000c1', current_setting('t.piscicultura')::uuid, '{cliente}', 'Loja do Dono', '47120593000280'),
  ('9bd00000-0000-4000-8000-0000000000c2', current_setting('t.piscicultura')::uuid, '{cliente}', 'Mercado Qualquer', null);

-- 5 caixas de 20 kg a R$ 150, metade à vista e metade em 30 dias
select set_config('t.ped', criar_pedido(current_setting('t.piscicultura')::uuid, '9bd00000-0000-4000-8000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 5, 'preco_unit_cents', 15000)),
  current_date, current_date, '[{"dias":0,"pct":50},{"dias":30,"pct":50}]')::text, false);
select pg_temp.espera_erro(format($$select receber_compra_do_grupo(%L, %L)$$, current_setting('t.ped'), current_setting('t.loja')), 'Fature o pedido');
select faturar_pedido(current_setting('t.ped')::uuid);

select set_config('t.compra', receber_compra_do_grupo(current_setting('t.ped')::uuid, current_setting('t.loja')::uuid)::text, false);
select pg_temp.ok((select saldo = 100 from estoque_peixe where classe_id = current_setting('t.extra_loja')::uuid), 'os 100 kg entram no estoque da loja');
select pg_temp.ok((select saldo = 3500 from estoque_peixe where classe_id = current_setting('t.extra')::uuid), 'e saíram da piscicultura na venda');
select pg_temp.ok((select round(custo_unit_cents, 4) = round(75000 / 100.0, 4) from movimentos_estoque
  where origem_tabela = 'compras_grupo' and origem_id = current_setting('t.compra')::uuid), 'custo de entrada é o preço por kg da venda');
select pg_temp.ok((select count(*) = 2 and sum(valor_cents) = 75000 and min(vencimento) = current_date and max(vencimento) = current_date + 30
  from agendamentos where empresa_id = current_setting('t.loja')::uuid and tipo = 'pagar' and origem = 'compra'), 'as parcelas viram contas a pagar na loja');
select pg_temp.ok((select c.cpf_cnpj = '47120593000108' and 'fornecedor' = any(c.tipos) from compras_grupo g join contatos c on c.id = g.fornecedor_id
  where g.id = current_setting('t.compra')::uuid), 'a piscicultura vira fornecedora da loja');
select pg_temp.espera_erro(format($$select receber_compra_do_grupo(%L, %L)$$, current_setting('t.ped'), current_setting('t.loja')), 'já foi lançada');
select pg_temp.espera_erro(format($$select cancelar_pedido(%L)$$, current_setting('t.ped')), 'já entrou como compra');

-- Pedido para outro cliente não entra na loja
select set_config('t.ped2', criar_pedido(current_setting('t.piscicultura')::uuid, '9bd00000-0000-4000-8000-0000000000c2',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 1, 'preco_unit_cents', 15000)))::text, false);
select faturar_pedido(current_setting('t.ped2')::uuid);
select pg_temp.espera_erro(format($$select receber_compra_do_grupo(%L, %L)$$, current_setting('t.ped2'), current_setting('t.loja')), 'não é a empresa');

-- Quem não participa da loja não lança
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.piscicultura')::uuid, '9bd00000-0000-4000-8000-0000000000f1', 'sem_restricao');
set role authenticated;
set request.jwt.claim.sub = '9bd00000-0000-4000-8000-0000000000f1';
select pg_temp.espera_erro(format($$select desfazer_compra_do_grupo(%L)$$, current_setting('t.compra')), 'permissão');
select pg_temp.ok((select count(*) = 1 from compras_grupo), 'a piscicultura vê a compra feita a partir do pedido dela');

-- Desfazer na loja libera o cancelamento na piscicultura
set request.jwt.claim.sub = '9bd0beef-0000-4000-8000-00000000d001';
select desfazer_compra_do_grupo(current_setting('t.compra')::uuid);
select pg_temp.ok((select saldo = 0 from estoque_peixe where classe_id = current_setting('t.extra_loja')::uuid), 'desfazer tira o peixe da loja');
select pg_temp.ok((select bool_and(status = 'cancelado') from agendamentos where empresa_id = current_setting('t.loja')::uuid and origem = 'compra'),
  'e cancela as contas a pagar');
select cancelar_pedido(current_setting('t.ped')::uuid);
select pg_temp.ok((select status = 'cancelado' from pedidos_venda where id = current_setting('t.ped')::uuid), 'o pedido pode ser cancelado depois');

reset role;
\o
\echo 'TESTES DE VENDA ENTRE EMPRESAS PASSARAM'
