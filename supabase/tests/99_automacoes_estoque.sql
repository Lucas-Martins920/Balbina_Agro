-- Ficha de embalagem (B4): faturar baixa as embalagens; cancelar devolve; dias de compra/produção por empresa.
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

insert into auth.users (id, email, email_confirmed_at) values ('a0e00000-0000-0000-0000-000000000001', 'dono@autoest.com', now());
set role authenticated;
set request.jwt.claim.sub = 'a0e00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('81818181000160', 'Piscicultura Autoest Ltda')::text, false);

-- dias padrão e limites
insert into automacoes_empresa (empresa_id) values (current_setting('t.emp')::uuid);
select pg_temp.ok((select compra_dias = 30 and producao_dias = 7 from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid), 'padrão 30 dias de compra e 7 de produção');
select pg_temp.espera_erro($$update automacoes_empresa set compra_dias = 0$$, 'compra_dias');

insert into setores (id, empresa_id, nome) values ('a0e00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('a0e00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'a0e00000-0000-0000-0000-0000000000a1', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'L1', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, 'a0e00000-0000-0000-0000-0000000000a2', 10000, 5);
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'a0e00000-0000-0000-0000-0000000000a2', current_date - 1, 'manha');
select registrar_despesca(current_setting('t.emp')::uuid, 'a0e00000-0000-0000-0000-0000000000a2', current_date, 'parcial', 100, 80, jsonb_build_object(
  (select id from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), 100));

insert into depositos (id, empresa_id, nome, tipo) values ('a0e00000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'Embalagens', 'almoxarifado');
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('a0e00000-0000-0000-0000-0000000000e1', current_setting('t.emp')::uuid, 'embalagem', 'Gelo em escama', 'kg'),
  ('a0e00000-0000-0000-0000-0000000000e2', current_setting('t.emp')::uuid, 'embalagem', 'Caixa de isopor 20 kg', 'un'),
  ('a0e00000-0000-0000-0000-0000000000e3', current_setting('t.emp')::uuid, 'racao', 'Ração engorda', 'kg');
select registrar_entrada('a0e00000-0000-0000-0000-0000000000e1', 'a0e00000-0000-0000-0000-0000000000d1', current_date, 100, 10000);
select registrar_entrada('a0e00000-0000-0000-0000-0000000000e2', 'a0e00000-0000-0000-0000-0000000000d1', current_date, 1, 500);
select set_config('t.caixa', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);

insert into produto_embalagens (empresa_id, produto_id, embalagem_id, quantidade) values
  (current_setting('t.emp')::uuid, current_setting('t.caixa')::uuid, 'a0e00000-0000-0000-0000-0000000000e1', 10),
  (current_setting('t.emp')::uuid, current_setting('t.caixa')::uuid, 'a0e00000-0000-0000-0000-0000000000e2', 1);
select pg_temp.espera_erro(format($$insert into produto_embalagens (empresa_id, produto_id, embalagem_id, quantidade)
  values (%L, %L, 'a0e00000-0000-0000-0000-0000000000e3', 1)$$, current_setting('t.emp'), current_setting('t.caixa')), 'tipo embalagem');

insert into contatos (id, empresa_id, tipos, nome) values ('a0e00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado');
select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, 'a0e00000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.caixa'), 'quantidade', 2, 'preco_unit_cents', 20000)))::text, false);
select faturar_pedido(current_setting('t.ped')::uuid);
select pg_temp.ok(app.saldo_produto('a0e00000-0000-0000-0000-0000000000e1', 'a0e00000-0000-0000-0000-0000000000d1') = 80,
  'faturar 2 caixas tira 20 kg de gelo');
select pg_temp.ok(app.saldo_produto('a0e00000-0000-0000-0000-0000000000e2', 'a0e00000-0000-0000-0000-0000000000d1') = 0,
  'sem caixa suficiente sai só o que há, sem travar a venda');

select cancelar_pedido(current_setting('t.ped')::uuid);
select pg_temp.ok(app.saldo_produto('a0e00000-0000-0000-0000-0000000000e1', 'a0e00000-0000-0000-0000-0000000000d1') = 100
  and app.saldo_produto('a0e00000-0000-0000-0000-0000000000e2', 'a0e00000-0000-0000-0000-0000000000d1') = 1,
  'cancelar o pedido devolve as embalagens');
reset role;

\o
\echo 'TESTES DAS AUTOMAÇÕES DO ESTOQUE PASSARAM'
