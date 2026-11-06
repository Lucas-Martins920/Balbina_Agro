-- LCDPR (E2): lançamentos do financeiro realizado. Portal do cliente (D3): link, preços e pedido.
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

insert into auth.users (id, email, email_confirmed_at) values ('a0860000-0000-0000-0000-000000000001', 'dono@lcdpr.com', now());
set role authenticated;
set request.jwt.claim.sub = 'a0860000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('86868686000152', 'Piscicultura LCDPR')::text, false);
select set_config('t.conta', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid order by created_at limit 1), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and grupo = 'receita_operacional' and sentido = 'entrada' order by nome limit 1), false);
select set_config('t.cus', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and grupo = 'custo_operacional' and sentido = 'saida' order by nome limit 1), false);
select set_config('t.fin', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and grupo = 'financiamento' and sentido = 'saida' order by nome limit 1), false);
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj) values
  ('a0860000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Bom', '11222333000181'),
  ('a0860000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{fornecedor}', 'Cerealista', '99888777000166');

-- venda recebida, compra paga em duas categorias (uma de financiamento fica fora)
select set_config('t.a1', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Venda de peixes', '2026-03-10', '2026-03-10', 500000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 500000)), 'a0860000-0000-0000-0000-0000000000c1')::text, false);
select set_config('t.a2', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho e parcela', '2026-03-12', '2026-03-12', 300000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cus'), 'valor_cents', 200000),
                    jsonb_build_object('categoria_id', current_setting('t.fin'), 'valor_cents', 100000)), 'a0860000-0000-0000-0000-0000000000c2',
  repeat('1', 44))::text, false);
insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents) values
  (current_setting('t.emp')::uuid, (select id from agendamentos where grupo_parcelamento_id = current_setting('t.a1')::uuid or id = current_setting('t.a1')::uuid limit 1), current_setting('t.conta')::uuid, '2026-03-10', 500000),
  (current_setting('t.emp')::uuid, (select id from agendamentos where grupo_parcelamento_id = current_setting('t.a2')::uuid or id = current_setting('t.a2')::uuid limit 1), current_setting('t.conta')::uuid, '2026-03-12', 300000);

create temp table l as select * from lcdpr_lancamentos(current_setting('t.emp')::uuid, '2026-01-01', '2026-12-31');
select pg_temp.ok((select count(*) = 2 from l), 'uma linha por baixa');
select pg_temp.ok((select tipo_lanc = 1 and entrada_cents = 500000 and saida_cents = 0 and id_partic = '11222333000181' from l where hist = 'Venda de peixes'),
  'recebimento é receita da atividade rural');
select pg_temp.ok((select tipo_lanc = 2 and saida_cents = 200000 and tipo_doc = 1 and num_doc = '111111111' from l where hist = 'Milho e parcela'),
  'pagamento é custeio, sem a parte de financiamento, com o número da nota');

insert into lcdpr_config (empresa_id, cpf, nome) values (current_setting('t.emp')::uuid, '11111111191', 'José');
select pg_temp.espera_erro($$update lcdpr_config set caepf = '123'$$, 'caepf');

-- portal: o navegador nunca chama direto
select pg_temp.espera_erro($$select portal_cliente('x')$$, 'permission denied');
update contatos set portal_token = md5('portal-teste') where id = 'a0860000-0000-0000-0000-0000000000c1';
select set_config('t.peixe', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and tipo = 'peixe' and not base_estoque order by nome limit 1), false);
select definir_preco(current_setting('t.peixe')::uuid, 18000);
reset role;

select pg_temp.ok(portal_cliente('naoexiste') is null, 'link errado não mostra nada');
select pg_temp.ok((select (j->>'cliente') = 'Mercado Bom' and jsonb_array_length(j->'produtos') >= 1
  and (select (x->>'preco_cents')::int = 18000 from jsonb_array_elements(j->'produtos') x where x->>'id' = current_setting('t.peixe')) from (select portal_cliente(md5('portal-teste')) j) u),
  'cliente vê os produtos com o preço da tabela');
select pg_temp.ok(criar_pedido_portal(md5('portal-teste'), jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.peixe'), 'quantidade', 3, 'preco_unit_cents', 1)), null, 'entregar cedo') > 0,
  'cliente faz o pedido');
select pg_temp.ok((select p.origem = 'portal' and p.status = 'aberto' and p.total_cents = 54000 and p.observacoes like '%entregar cedo%'
  from pedidos_venda p where p.cliente_id = 'a0860000-0000-0000-0000-0000000000c1' and p.origem = 'portal'), 'preço da tabela, não o do navegador');
select pg_temp.espera_erro($$select criar_pedido_portal(md5('portal-teste'), '[]')$$, 'pelo menos um produto');
select pg_temp.espera_erro($$select criar_pedido_portal(md5('portal-teste'), '[{"produto_id":"00000000-0000-0000-0000-000000000000","quantidade":1}]')$$, 'pelo menos um produto');
select pg_temp.espera_erro($$select criar_pedido_portal('a', '[]')$$, 'Link de pedido inválido');
update contatos set arquivado = true where id = 'a0860000-0000-0000-0000-0000000000c1';
select pg_temp.ok(portal_cliente(md5('portal-teste')) is null, 'cliente arquivado perde o link');

\o
\echo 'TESTES DO LCDPR E DO PORTAL DO CLIENTE PASSARAM'
