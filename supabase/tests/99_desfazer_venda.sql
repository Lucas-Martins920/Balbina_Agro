-- Desfazer entrega e desfazer faturamento de pedido marcado por engano.
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
set request.jwt.claim.sub = '96969696-9696-9696-9696-969696969696';
select set_config('t.emp', criar_empresa('96987654000133', 'Piscicultura Desfazer Ltda')::text, false);
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), false);
insert into setores (id, empresa_id, nome) values ('96d00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('96d00000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, '96d00000-0000-0000-0000-000000000001', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'P1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '96d00000-0000-0000-0000-000000000002', 10000, 5);
select registrar_apontamento(current_setting('t.emp')::uuid, null, '96d00000-0000-0000-0000-000000000002', current_date - 1,
  'manha', 0, 0, 1100);
select registrar_despesca(current_setting('t.emp')::uuid, '96d00000-0000-0000-0000-000000000002', current_date - 1, 'parcial', 1000, 800,
  jsonb_build_object(current_setting('t.extra'), 1000));
select set_config('t.cart', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and classe_peixe_id = current_setting('t.extra')::uuid and fator_kg = 20 order by nome limit 1), false);
select definir_preco(current_setting('t.cart')::uuid, 20000, null, current_date - 1);
insert into contatos (id, empresa_id, tipos, nome) values ('96d00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado');

select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, '96d00000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cart'), 'quantidade', 10)), current_date, null, '[{"dias":7,"pct":100}]')::text, false);
select faturar_pedido(current_setting('t.ped')::uuid);
select entregar_pedido(current_setting('t.ped')::uuid);
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 1000 - 200, 'faturar tira 200 kg (10 caixas de 20 kg)');

-- Desfazer entrega: só volta o status; estoque e contas ficam
select pg_temp.espera_erro(format('select desfazer_faturamento(%L)', current_setting('t.ped')), 'Desfaça a entrega antes');
select desfazer_entrega(current_setting('t.ped')::uuid);
select pg_temp.ok((select status from pedidos_venda where id = current_setting('t.ped')::uuid) = 'faturado', 'desfazer entrega volta para faturado');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 800, 'desfazer entrega não mexe no estoque');
select pg_temp.ok((select bool_and(status <> 'cancelado') from agendamentos where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid), 'desfazer entrega não mexe nas contas');
select pg_temp.espera_erro(format('select desfazer_entrega(%L)', current_setting('t.ped')), 'Só pedido entregue');
select pg_temp.ok((select count(*) > 0 from audit_log where tabela = 'pedidos_venda' and registro_id = current_setting('t.ped')
  and antes->>'status' = 'entregue' and depois->>'status' = 'faturado' and user_id = auth.uid()), 'histórico guarda quem desfez a entrega');

-- Nota fiscal válida bloqueia desfazer faturamento e cancelar
reset role;
insert into notas_fiscais (id, empresa_id, destinatario_id, valor_total_cents, pedido_venda_id, status)
values ('96d00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, '96d00000-0000-0000-0000-0000000000c1', 20000, current_setting('t.ped')::uuid, 'autorizada');
set role authenticated;
select pg_temp.espera_erro(format('select desfazer_faturamento(%L)', current_setting('t.ped')), 'nota fiscal válida');
select pg_temp.espera_erro(format('select cancelar_pedido(%L)', current_setting('t.ped')), 'nota fiscal válida');
reset role;
update notas_fiscais set status = 'cancelada' where id = '96d00000-0000-0000-0000-0000000000a1';
set role authenticated;

-- Sem permissão vendas.cancelar não desfaz
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '96d00000-0000-0000-0000-0000000000f1', 'vendedor');
set role authenticated;
set request.jwt.claim.sub = '96d00000-0000-0000-0000-0000000000f1';
select pg_temp.espera_erro(format('select desfazer_faturamento(%L)', current_setting('t.ped')), 'não tem permissão');
set request.jwt.claim.sub = '96969696-9696-9696-9696-969696969696';

-- Desfazer faturamento: os kg voltam, contas canceladas, pedido volta para aberto e pode faturar de novo
select desfazer_faturamento(current_setting('t.ped')::uuid);
select pg_temp.ok((select status from pedidos_venda where id = current_setting('t.ped')::uuid) = 'aberto', 'desfazer faturamento volta para aberto');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 1000, 'desfazer faturamento devolve os kg');
select pg_temp.ok((select bool_and(status = 'cancelado') from agendamentos where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid), 'desfazer faturamento cancela as contas a receber');
select pg_temp.ok(faturar_pedido(current_setting('t.ped')::uuid) = 1, 'pedido pode ser faturado de novo');
select pg_temp.ok((select count(*) from agendamentos where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid and status <> 'cancelado') = 1, 'refaturar gera só a conta nova');

-- Com recebimento, recusa
update agendamentos set pago_cents = 100 where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid and status <> 'cancelado';
select pg_temp.espera_erro(format('select desfazer_faturamento(%L)', current_setting('t.ped')), 'já tem recebimento');
\echo 'TESTES DE DESFAZER ENTREGA E FATURAMENTO PASSARAM'
