-- NF-e completa: NFC-e do balcão, inutilização de numeração e emitente na Focus.
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
set request.jwt.claim.sub = '99c99c99-9c99-9c99-9c99-9c999c999c99';
select set_config('t.emp', criar_empresa('99222333000181', 'Piscicultura Cupom Ltda')::text, false);
select ajustar_estoque_peixe(current_setting('t.emp')::uuid, (select id from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), 3600, 'inventário');
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
insert into contas_financeiras (id, empresa_id, tipo, nome) values
  ('99c00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco');

-- Venda de balcão de R$ 360: R$ 200 em dinheiro (com R$ 40 de troco) e R$ 200 no Pix
select set_config('t.ped', (venda_balcao(current_setting('t.emp')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 2, 'preco_unit_cents', 18000)),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor_cents', 20000),
                    jsonb_build_object('forma', 'pix', 'valor_cents', 20000, 'conta_id', '99c00000-0000-0000-0000-0000000000b1')))->>'pedido_id'), false);

select pg_temp.ok((select pagamentos_do_pedido(current_setting('t.ped')::uuid) =
  '[{"forma": "pix", "valor_cents": 20000}, {"forma": "dinheiro", "valor_cents": 16000}]'::jsonb), 'pagamentos da venda com o troco já descontado');

select set_config('t.nfce', preparar_nfce(current_setting('t.ped')::uuid)::text, false);
select pg_temp.ok((select modelo = 'nfce' and serie = 1 and status = 'processando' and valor_total_cents = 36000 and natureza_operacao = 'Venda ao consumidor'
  from notas_fiscais where id = current_setting('t.nfce')::uuid), 'NFC-e aberta para a venda do balcão');
select pg_temp.espera_erro(format('select preparar_nfce(%L)', current_setting('t.ped')), 'já tem uma nota');
update empresas set config_fiscal = '{"serie_nfce": 2}' where id = current_setting('t.emp')::uuid;
select pg_temp.ok((select (x->>'serie_nfce')::int = 2 and (x->>'serie')::int = 1 from config_fiscal_empresa(current_setting('t.emp')::uuid) x), 'série da NFC-e separada da NF-e');

-- Inutilização: número já usado por nota não pode
update notas_fiscais set numero = 7, status = 'autorizada' where id = current_setting('t.nfce')::uuid;
select pg_temp.espera_erro(format($$insert into inutilizacoes_nfe (empresa_id, modelo, serie, numero_inicial, numero_final, justificativa)
  values (%L, 'nfce', 1, 5, 8, 'Numeração pulada por falha de comunicação')$$, current_setting('t.emp')), 'Os números 7 já foram usados');
select pg_temp.espera_erro(format($$insert into inutilizacoes_nfe (empresa_id, modelo, serie, numero_inicial, numero_final, justificativa)
  values (%L, 'nfe', 1, 5, 8, 'curta')$$, current_setting('t.emp')), 'inutilizacoes_nfe_justificativa_check');
-- a NF-e tem numeração própria: o 7 da NFC-e não atrapalha
insert into inutilizacoes_nfe (id, empresa_id, modelo, serie, numero_inicial, numero_final, justificativa)
values ('99c00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'nfe', 1, 5, 8, 'Numeração pulada por falha de comunicação');
select pg_temp.espera_erro(format($$insert into inutilizacoes_nfe (empresa_id, modelo, serie, numero_inicial, numero_final, justificativa)
  values (%L, 'nfe', 1, 8, 9, 'Numeração pulada por falha de comunicação')$$, current_setting('t.emp')), 'já foi inutilizada');
update inutilizacoes_nfe set status = 'rejeitada', motivo = 'teste' where id = '99c00000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro($$update inutilizacoes_nfe set numero_final = 20 where id = '99c00000-0000-0000-0000-0000000000a1'$$, 'não pode ser alterada');
insert into inutilizacoes_nfe (empresa_id, modelo, serie, numero_inicial, numero_final, justificativa)
values (current_setting('t.emp')::uuid, 'nfe', 1, 8, 9, 'Numeração pulada por falha de comunicação');
select pg_temp.ok(true, 'faixa rejeitada pode ser pedida de novo');
delete from inutilizacoes_nfe where id = '99c00000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select count(*) = 2 from inutilizacoes_nfe where empresa_id = current_setting('t.emp')::uuid), 'inutilização não se apaga');
select pg_temp.ok(exists (select 1 from audit_log where tabela = 'inutilizacoes_nfe' and registro_id = '99c00000-0000-0000-0000-0000000000a1' and acao = 'insert'
  and user_id = '99c99c99-9c99-9c99-9c99-9c999c999c99'), 'inutilização fica no histórico com quem pediu');

-- Emitente na Focus: só o servidor grava
select pg_temp.espera_erro(format($$insert into focus_emitentes (empresa_id, focus_id) values (%L, '1')$$, current_setting('t.emp')), 'permission denied');
select pg_temp.espera_erro($$select * from focus_emitentes_segredos$$, 'permission denied');

-- Produtor rural pessoa física não emite NFC-e
set request.jwt.claim.sub = '99c99c99-9c99-9c99-9c99-9c999c999c98';
select set_config('t.pr', criar_empresa('99011122233', 'Maria Produtora', null, '041234567')::text, false);
select ajustar_estoque_peixe(current_setting('t.pr')::uuid, (select id from classes_peixe where empresa_id = current_setting('t.pr')::uuid and nome = 'Extra'), 3600, 'inventário');
select set_config('t.ped2', (venda_balcao(current_setting('t.pr')::uuid,
  jsonb_build_array(jsonb_build_object('produto_id', (select id from produtos where empresa_id = current_setting('t.pr')::uuid and nome = 'Caixa 20 kg · peixe extra'),
    'quantidade', 1, 'preco_unit_cents', 18000)),
  jsonb_build_array(jsonb_build_object('forma', 'dinheiro', 'valor_cents', 18000)))->>'pedido_id'), false);
select pg_temp.espera_erro(format('select preparar_nfce(%L)', current_setting('t.ped2')), 'Produtor rural pessoa física emite NF-e');

-- Outra empresa não vê pagamentos nem inutilizações
select pg_temp.ok(pagamentos_do_pedido(current_setting('t.ped')::uuid) = '[]'::jsonb, 'pagamentos de outra empresa ficam escondidos');
select pg_temp.ok((select count(*) = 0 from inutilizacoes_nfe where empresa_id = current_setting('t.emp')::uuid), 'inutilizações isoladas por empresa');
select pg_temp.espera_erro(format($$insert into inutilizacoes_nfe (empresa_id, modelo, serie, numero_inicial, numero_final, justificativa)
  values (%L, 'nfe', 1, 50, 50, 'Numeração pulada por falha de comunicação')$$, current_setting('t.emp')), 'row-level security');

reset role;
\o
\echo 'TESTES DA NF-e COMPLETA PASSARAM'
