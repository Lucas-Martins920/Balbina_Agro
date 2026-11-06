-- Automações de vendas: pedidos fixos gerados na véspera (D2), bloqueio de venda a prazo para quem está
-- devendo (D4) e regras fiscais (E3).
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

insert into auth.users (id, email, email_confirmed_at) values
  ('a0840000-0000-0000-0000-000000000001', 'dono@vendasauto.com', now()),
  ('a0840000-0000-0000-0000-000000000002', 'tratador@vendasauto.com', now());

set role authenticated;
set request.jwt.claim.sub = 'a0840000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('84848484000113', 'Piscicultura Vendas Auto Ltda')::text, false);
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
select set_config('t.cx2', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe extra (kg)'), false);
select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' order by nome limit 1), false);
insert into contatos (id, empresa_id, tipos, nome) values
  ('a0840000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Fixo'),
  ('a0840000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{cliente}', 'Padaria Devedora');

-- D2 -----------------------------------------------------------------------------------------------
insert into automacoes_empresa (empresa_id, pedidos_fixos_hora) values (current_setting('t.emp')::uuid, '00:00');
insert into pedidos_fixos (id, empresa_id, cliente_id, dias_semana, itens, parcelas, forma_pagamento) values
  ('a0840000-0000-0000-0000-0000000000f1', current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-0000000000c1', '{0,1,2,3,4,5,6}',
   jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 4, 'preco_unit_cents', 18000)),
   '[{"dias":7,"pct":100}]', 'boleto'),
  -- sem preço na tabela: vira erro anotado, sem travar o outro
  ('a0840000-0000-0000-0000-0000000000f2', current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-0000000000c1', '{0,1,2,3,4,5,6}',
   jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx2'), 'quantidade', 1)), '[{"dias":0,"pct":100}]', null),
  -- dia que não é amanhã
  ('a0840000-0000-0000-0000-0000000000f3', current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-0000000000c1',
   array[((extract(dow from (now() at time zone 'America/Manaus')::date + 2))::int % 7)::smallint],
   jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 1, 'preco_unit_cents', 18000)), '[{"dias":0,"pct":100}]', null);
select pg_temp.espera_erro($$insert into pedidos_fixos (empresa_id, cliente_id, dias_semana, itens) values (current_setting('t.emp')::uuid,
  'a0840000-0000-0000-0000-0000000000c1', '{9}', '[{"q":1}]')$$, 'dias_semana');
select pg_temp.espera_erro($$select public.gerar_pedidos_fixos()$$, 'permission denied');
reset role;

create temp table g as select * from public.gerar_pedidos_fixos();
select pg_temp.ok((select gerados = 1 and erros = 1 from g where empresa_id = current_setting('t.emp')::uuid), 'gera o pedido de amanhã e anota o que falhou');
select pg_temp.ok((select p.status = 'aberto' and p.entrega_prevista = (now() at time zone 'America/Manaus')::date + 1 and p.total_cents = 72000
  and p.forma_pagamento = 'boleto' and p.observacoes like 'Pedido fixo%'
  from pedidos_fixos_gerados x join pedidos_venda p on p.id = x.pedido_id where x.pedido_fixo_id = 'a0840000-0000-0000-0000-0000000000f1'),
  'pedido em aberto para amanhã, com itens, condição e aviso para conferir');
select pg_temp.ok((select erro like 'Sem preço%' from pedidos_fixos_gerados where pedido_fixo_id = 'a0840000-0000-0000-0000-0000000000f2'), 'erro do pedido sem preço');
select pg_temp.ok(not exists (select 1 from pedidos_fixos_gerados where pedido_fixo_id = 'a0840000-0000-0000-0000-0000000000f3'), 'fora do dia não gera');
select pg_temp.ok(not exists (select 1 from public.gerar_pedidos_fixos()), 'não gera de novo para a mesma data');

-- D4 -----------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'a0840000-0000-0000-0000-000000000001';
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Venda antiga', current_date - 20, current_date - 20, 5000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 5000)), 'a0840000-0000-0000-0000-0000000000c2');
-- desligado: vende a prazo
select criar_pedido(current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-0000000000c2',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 1, 'preco_unit_cents', 18000)), current_date, null, '[{"dias":7,"pct":100}]');
update automacoes_empresa set bloquear_prazo_inadimplente = true, inadimplencia_dias = 15 where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.espera_erro(format($$select criar_pedido(%L, 'a0840000-0000-0000-0000-0000000000c2',
  jsonb_build_array(jsonb_build_object('produto_id', %L, 'quantidade', 1, 'preco_unit_cents', 18000)), current_date, null, '[{"dias":7,"pct":100}]')$$,
  current_setting('t.emp'), current_setting('t.cx')), 'só à vista');
select criar_pedido(current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-0000000000c2',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 1, 'preco_unit_cents', 18000)));
select pg_temp.ok(true, 'à vista continua liberado');
update automacoes_empresa set inadimplencia_dias = 30 where empresa_id = current_setting('t.emp')::uuid;
select criar_pedido(current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-0000000000c2',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 1, 'preco_unit_cents', 18000)), current_date, null, '[{"dias":7,"pct":100}]');
select pg_temp.ok(true, 'atraso menor que o limite não bloqueia');

-- E3 -----------------------------------------------------------------------------------------------
insert into regras_fiscais (empresa_id, nome, produto_id, destino, cfop, texto)
values (current_setting('t.emp')::uuid, 'Peixe fora do estado', current_setting('t.cx')::uuid, 'fora', '6101', 'Isento de ICMS.');
select pg_temp.espera_erro($$insert into regras_fiscais (empresa_id, nome) values (current_setting('t.emp')::uuid, 'Vazia')$$, 'check');
select pg_temp.espera_erro($$insert into regras_fiscais (empresa_id, nome, cfop) values (current_setting('t.emp')::uuid, 'Errada', '61')$$, 'cfop');
select pg_temp.ok((select count(*) > 0 from nfe_itens where empresa_id = current_setting('t.emp')::uuid and produto_id = current_setting('t.cx')::uuid),
  'itens da nota trazem o produto');

reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes)
values (current_setting('t.emp')::uuid, 'a0840000-0000-0000-0000-000000000002', 'apontador', '{}');
set role authenticated;
set request.jwt.claim.sub = 'a0840000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$insert into regras_fiscais (empresa_id, nome, cfop) values (current_setting('t.emp')::uuid, 'Tratador', '5101')$$, 'row-level security');
select pg_temp.espera_erro($$insert into pedidos_fixos (empresa_id, cliente_id, dias_semana, itens) values (current_setting('t.emp')::uuid,
  'a0840000-0000-0000-0000-0000000000c1', '{1}', '[{"q":1}]')$$, 'row-level security');
reset role;

\o
\echo 'TESTES DAS AUTOMAÇÕES DE VENDAS PASSARAM'
