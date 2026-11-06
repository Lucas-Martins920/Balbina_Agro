-- Contas e caixas: excluir só a conta sem movimento e sem banco ligado; a que tem histórico é arquivada.
-- A conta vinda do NIBO segue ligada ao NIBO quando muda de nome ou é arquivada.
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
  ('9ac00000-0000-0000-0000-0000000000a1', 'master@contas.com', now());
insert into auth.mfa_factors (user_id, status) values ('9ac00000-0000-0000-0000-0000000000a1', 'verified');

set role authenticated;
set request.jwt.claim.sub = '9ac00000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"aal": "aal2"}';
select set_config('t.emp', criar_empresa('99555444000177', 'Piscicultura Contas Ltda')::text, false);

select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "nibo",
  "contas": [{"chave": "acc1", "nome": "Sicredi", "tipo": "corrente", "saldo_inicial_cents": 5000, "saldo_inicial_data": "2025-12-31"},
             {"chave": "acc2", "nome": "Banco teste", "tipo": "corrente", "saldo_inicial_cents": 0, "saldo_inicial_data": "2025-12-31"}]
}$j$::jsonb);

insert into contas_financeiras (empresa_id, tipo, nome) values
  (current_setting('t.emp')::uuid, 'corrente', 'Conta vazia'),
  (current_setting('t.emp')::uuid, 'caixinha', 'Caixa com transferência'),
  (current_setting('t.emp')::uuid, 'corrente', 'Conta com extrato');

insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents)
select current_setting('t.emp')::uuid,
       (select id from contas_financeiras where nome = 'Sicredi'),
       (select id from contas_financeiras where nome = 'Caixa com transferência'), '2026-01-05', 1000;

insert into importacoes_extrato (empresa_id, conta_id, origem)
select current_setting('t.emp')::uuid, id, 'ofx' from contas_financeiras where nome = 'Conta com extrato';
insert into movimentos_bancarios (empresa_id, conta_id, importacao_id, data, descricao, valor_cents, id_externo)
select current_setting('t.emp')::uuid, i.conta_id, i.id, '2026-01-06', 'PIX', 700, 'ofx:1'
  from importacoes_extrato i join contas_financeiras c on c.id = i.conta_id where c.nome = 'Conta com extrato';

-- Conta sem nada: sai de vez
delete from contas_financeiras where nome = 'Conta vazia';
select pg_temp.ok(not exists (select 1 from contas_financeiras where nome = 'Conta vazia'), 'conta sem movimento é excluída');

-- Com movimento: a exclusão é recusada com mensagem clara, nada some
select pg_temp.espera_erro($$delete from contas_financeiras where nome = 'Caixa com transferência'$$, 'Arquive em vez de excluir');
select pg_temp.espera_erro($$delete from contas_financeiras where nome = 'Sicredi'$$, 'Arquive em vez de excluir');
select pg_temp.espera_erro($$delete from contas_financeiras where nome = 'Conta com extrato'$$, 'Arquive em vez de excluir');
select pg_temp.ok((select count(*) = 1 from movimentos_bancarios where empresa_id = current_setting('t.emp')::uuid),
  'o extrato importado continua (antes sumia em cascata)');

-- Ligada ao Open Finance: também só arquiva
reset role;
update contas_financeiras set open_finance_conta_id = 'pluggy-acc-1', open_finance_item_id = 'item-1' where nome = 'Banco teste';
set role authenticated;
select pg_temp.espera_erro($$delete from contas_financeiras where nome = 'Banco teste'$$, 'Open Finance');

-- Arquivar e renomear mantém o vínculo do NIBO e do Open Finance
update contas_financeiras set arquivada = true, nome = 'Banco teste (antigo)' where nome = 'Banco teste';
update contas_financeiras set nome = 'Sicredi Matriz' where nome = 'Sicredi';
select pg_temp.ok((select open_finance_conta_id = 'pluggy-acc-1' from contas_financeiras where nome = 'Banco teste (antigo)'),
  'arquivar mantém o Open Finance');

select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "nibo",
  "contas": [{"chave": "acc1", "nome": "Sicredi", "tipo": "corrente", "saldo_inicial_cents": 6000, "saldo_inicial_data": "2025-12-31"},
             {"chave": "acc2", "nome": "Banco teste", "tipo": "corrente", "saldo_inicial_cents": 0, "saldo_inicial_data": "2025-12-31"}]
}$j$::jsonb);
select pg_temp.ok((select saldo_inicial_cents = 6000 from contas_financeiras where nome = 'Sicredi Matriz'),
  'conta renomeada continua recebendo a importação do NIBO');
select pg_temp.ok(not exists (select 1 from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome in ('Sicredi', 'Banco teste')),
  'reimportação não duplica as contas renomeadas');
select pg_temp.ok((select arquivada from contas_financeiras where nome = 'Banco teste (antigo)'), 'reimportação não desarquiva');

-- Conta do NIBO sem movimento excluída: o vínculo sai junto e a próxima importação cria de novo
insert into contas_financeiras (empresa_id, tipo, nome) values (current_setting('t.emp')::uuid, 'poupanca', 'Poupança');
select importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo",
  "contas": [{"chave": "acc3", "nome": "Poupança", "tipo": "poupanca"}]}$j$::jsonb);
delete from contas_financeiras where nome = 'Poupança';
select pg_temp.ok(not exists (select 1 from importacao_vinculos where entidade = 'conta' and chave = 'acc3'), 'vínculo da conta excluída sai junto');
select importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo",
  "contas": [{"chave": "acc3", "nome": "Poupança", "tipo": "poupanca"}]}$j$::jsonb);
select pg_temp.ok((select count(*) = 1 from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Poupança'),
  'reimportar recria a conta excluída');

-- Sem permissão de contas: não exclui nem edita
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('9ac00000-0000-0000-0000-0000000000a2', 'producao@contas.com', now());
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin, ativo)
  values (current_setting('t.emp')::uuid, '9ac00000-0000-0000-0000-0000000000a2', 'visualizacao', false, true);
set role authenticated;
set request.jwt.claim.sub = '9ac00000-0000-0000-0000-0000000000a2';
update contas_financeiras set nome = 'Hack' where nome = 'Poupança';
delete from contas_financeiras where nome = 'Poupança';
select pg_temp.ok((select count(*) = 1 from contas_financeiras where nome = 'Poupança'), 'perfil só de visualização não muda nem exclui');

