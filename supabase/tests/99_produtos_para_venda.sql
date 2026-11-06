-- Produtos de venda x insumos de consumo: milho não pede preço de venda nem entra em pedido.
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
set request.jwt.claim.sub = '99b99b99-99b9-9b99-b99b-99b99b99b99b';
select set_config('t.emp', criar_empresa('61374598000173', 'Piscicultura Insumos Ltda')::text, false);
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome like 'Caixa%extra%' limit 1), false);
insert into contatos (id, empresa_id, tipos, nome) values
  ('99b00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado');

-- pescado e alevinos nascem de venda; insumos nascem de consumo
select pg_temp.ok((select para_venda from produtos where id = current_setting('t.cx')::uuid), 'pescado é produto de venda');
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('99b00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'insumo_racao', 'Milho', 'kg'),
  ('99b00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'alevino', 'Alevino de tambaqui', 'un'),
  ('99b00000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'outro', 'Sacaria vazia', 'un');
insert into produtos (id, empresa_id, tipo, nome, unidade, para_venda) values
  ('99b00000-0000-0000-0000-0000000000a4', current_setting('t.emp')::uuid, 'embalagem', 'Caixa térmica vazia', 'un', true);
select pg_temp.ok(not (select para_venda from produtos where id = '99b00000-0000-0000-0000-0000000000a1'), 'milho (ingrediente) é consumo');
select pg_temp.ok((select para_venda from produtos where id = '99b00000-0000-0000-0000-0000000000a2'), 'alevino é de venda');
select pg_temp.ok(not (select para_venda from produtos where id = '99b00000-0000-0000-0000-0000000000a3'), '"outro" novo começa como consumo');
select pg_temp.ok((select para_venda from produtos where id = '99b00000-0000-0000-0000-0000000000a4'), 'marcação explícita vale (embalagem vendida)');

-- insumo não recebe preço de venda nem entra em pedido
select pg_temp.espera_erro($$select definir_preco('99b00000-0000-0000-0000-0000000000a1', 9000)$$, 'não produto de venda');
select pg_temp.espera_erro(format($$select criar_pedido(%L, '99b00000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', '99b00000-0000-0000-0000-0000000000a1', 'quantidade', 1, 'preco_unit_cents', 100)))$$,
  current_setting('t.emp')), 'não produto de venda');

-- marcar como de venda libera; desmarcar mantém o preço antigo no histórico e trava preço novo
update produtos set para_venda = true where id = '99b00000-0000-0000-0000-0000000000a3';
select definir_preco('99b00000-0000-0000-0000-0000000000a3', 1500);
select pg_temp.ok(preco_vigente('99b00000-0000-0000-0000-0000000000a3') = 1500, 'produto marcado de venda recebe preço');
update produtos set para_venda = false where id = '99b00000-0000-0000-0000-0000000000a3';
select pg_temp.ok((select count(*) from tabelas_preco where produto_id = '99b00000-0000-0000-0000-0000000000a3') = 1, 'preço antigo continua no histórico');
select pg_temp.espera_erro($$select definir_preco('99b00000-0000-0000-0000-0000000000a3', 1600)$$, 'não produto de venda');
