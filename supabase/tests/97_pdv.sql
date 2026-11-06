-- PDV: venda de balcão numa transação só, troco e resumo do caixa.
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
set request.jwt.claim.sub = '97979797-9797-9797-9797-979797979797';
select set_config('t.emp', criar_empresa('97111222000144', 'Piscicultura PDV Ltda')::text, false);
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), false);
insert into setores (id, empresa_id, nome) values ('97000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('97000000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, '97000000-0000-0000-0000-000000000001', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'P1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '97000000-0000-0000-0000-000000000002', 10000, 5);
select registrar_apontamento(current_setting('t.emp')::uuid, null, '97000000-0000-0000-0000-000000000002', current_date - 1,
  'manha', 0, 0, 1100);
select registrar_despesca(current_setting('t.emp')::uuid, '97000000-0000-0000-0000-000000000002', current_date - 1, 'parcial', 1000, 800,
  jsonb_build_object(current_setting('t.extra'), 1000));
select set_config('t.kg', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe extra (kg)'), false);
select definir_preco(current_setting('t.kg')::uuid, 1000, null, current_date - 1);
insert into contas_financeiras (id, empresa_id, tipo, nome) values
  ('97000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco');

-- 3 kg a R$ 10: paga R$ 20 em dinheiro e R$ 15 no Pix, troco de R$ 5
select set_config('t.v1', venda_balcao(current_setting('t.emp')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 3)),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor_cents', 2000),
                    jsonb_build_object('forma', 'pix', 'valor_cents', 1500, 'conta_id', '97000000-0000-0000-0000-0000000000b1')),
  null, '97000000-0000-0000-0000-0000000000d1')::text, false);
select pg_temp.ok((current_setting('t.v1')::jsonb->>'troco_cents')::int = 500 and (current_setting('t.v1')::jsonb->>'total_cents')::int = 3000, 'venda calcula o troco do dinheiro');
select pg_temp.ok((select status = 'entregue' and origem = 'pdv' from pedidos_venda where id = (current_setting('t.v1')::jsonb->>'pedido_id')::uuid), 'venda de balcão sai entregue');
select pg_temp.ok((select c.nome = 'Consumidor final' from pedidos_venda p join contatos c on c.id = p.cliente_id where p.id = (current_setting('t.v1')::jsonb->>'pedido_id')::uuid), 'sem cliente vai para consumidor final');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 1000 - 3, 'venda baixa os kg do estoque');
select pg_temp.ok((select status = 'quitado' from agendamentos where origem = 'pedido_venda' and origem_id = (current_setting('t.v1')::jsonb->>'pedido_id')::uuid), 'conta a receber já nasce quitada');
select pg_temp.ok((select sum(valor_cents) filter (where forma = 'dinheiro') = 1500 and sum(valor_cents) filter (where forma = 'pix') = 1500
  from caixa_pdv where empresa_id = current_setting('t.emp')::uuid and data = current_date), 'caixa separa dinheiro (sem o troco) e Pix');
select pg_temp.ok((select c.tipo = 'caixinha' from caixa_pdv x join contas_financeiras c on c.id = x.conta_id where x.empresa_id = current_setting('t.emp')::uuid and x.forma = 'dinheiro'), 'dinheiro cai no caixa físico');

select pg_temp.ok((venda_balcao(current_setting('t.emp')::uuid, '[]', '[{"forma":"dinheiro","valor_cents":1}]', null, '97000000-0000-0000-0000-0000000000d1')->>'repetida')::boolean,
  'reenvio da mesma venda não duplica');
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":1}]', '[{"forma":"dinheiro","valor_cents":500}]')$$,
  current_setting('t.emp'), current_setting('t.kg')), 'Falta receber');
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":1}]', '[{"forma":"pix","valor_cents":2000,"conta_id":"97000000-0000-0000-0000-0000000000b1"}]')$$,
  current_setting('t.emp'), current_setting('t.kg')), 'só dinheiro pode ter troco');
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":1}]', '[{"forma":"cartao","valor_cents":1000}]')$$,
  current_setting('t.emp'), current_setting('t.kg')), 'Escolha a conta');
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":1000}]', '[{"forma":"dinheiro","valor_cents":1000000}]')$$,
  current_setting('t.emp'), current_setting('t.kg')), 'Estoque insuficiente');
select pg_temp.ok((select count(*) = 1 from pedidos_venda where empresa_id = current_setting('t.emp')::uuid), 'venda que falha não deixa pedido pela metade');

-- Permissões: o perfil caixa vende no PDV; quem só visualiza não
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values
  (current_setting('t.emp')::uuid, '97000000-0000-0000-0000-0000000000f1', 'caixa'),
  (current_setting('t.emp')::uuid, '97000000-0000-0000-0000-0000000000f2', 'visualizacao');
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((venda_balcao(current_setting('t.emp')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 1)),
  '[{"forma":"dinheiro","valor_cents":1000}]')->>'total_cents')::int = 1000, 'perfil caixa vende no PDV');
select pg_temp.ok((venda_balcao(current_setting('t.emp')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 2.35)),
  '[{"forma":"dinheiro","valor_cents":2350}]')->>'total_cents')::int = 2350, 'balcão vende peixe pesado na hora (2,35 kg)');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 1000 - 3 - 1 - 2.35, 'kg fracionado sai do estoque');
set request.jwt.claim.sub = '97000000-0000-0000-0000-0000000000f2';
select pg_temp.espera_erro(format($$select venda_balcao(%L, '[{"produto_id":"%s","quantidade":1}]', '[{"forma":"dinheiro","valor_cents":1000}]')$$,
  current_setting('t.emp'), current_setting('t.kg')), 'row-level security');

reset role;
\o
\echo 'TESTES DO PDV PASSARAM'
