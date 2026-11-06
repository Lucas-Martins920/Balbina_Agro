-- Aceite dos termos (LGPD) e travas nos identificadores das integrações.
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
  ('99200000-0000-0000-0000-0000000000a1', 'dono@termos.com', now()),
  ('99200000-0000-0000-0000-0000000000a2', 'outro@termos.com', now());

-- aceite
set role authenticated;
set request.jwt.claim.sub = '99200000-0000-0000-0000-0000000000a1';
select aceitar_termos('2026-10-27', 'cadastro', '200.1.2.3', 'Teste');
select aceitar_termos('2026-10-27', 'tela_aceite', '200.1.2.3', 'Teste');
select pg_temp.ok((select count(*) = 1 and min(origem) = 'cadastro' from aceites_termos), 'aceite repetido da mesma versão não duplica');
select pg_temp.espera_erro($$select aceitar_termos('qualquer coisa')$$, 'Versão dos termos inválida');
select pg_temp.espera_erro($$insert into aceites_termos (user_id, versao, origem) values (auth.uid(), '2030-01-01', 'cadastro')$$, 'permission denied');
select pg_temp.espera_erro($$update aceites_termos set versao = '2030-01-01'$$, 'permission denied');
select pg_temp.espera_erro($$delete from aceites_termos$$, 'permission denied');

set request.jwt.claim.sub = '99200000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) = 0 from aceites_termos), 'ninguém vê o aceite dos outros');
reset role;
set request.jwt.claim.sub = '';
set role authenticated;
select pg_temp.espera_erro($$select aceitar_termos('2026-10-27')$$, 'Entre na sua conta');

-- identificadores das integrações
set request.jwt.claim.sub = '99200000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('97444555000166', 'Piscicultura Termos Ltda')::text, false);
insert into contatos (id, empresa_id, tipos, nome) values ('99200000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado T');
update contatos set asaas_cliente_id = 'cus_000001' where id = '99200000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select asaas_cliente_id = 'cus_000001' from contatos where id = '99200000-0000-0000-0000-0000000000c1'), 'integração grava o id na primeira vez');
select pg_temp.espera_erro($$update contatos set asaas_cliente_id = 'cus_outra' where id = '99200000-0000-0000-0000-0000000000c1'$$, 'não pode ser alterado');
update contatos set nome = 'Mercado T2' where id = '99200000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select nome = 'Mercado T2' from contatos where id = '99200000-0000-0000-0000-0000000000c1'), 'editar o resto do contato continua livre');
update contatos set asaas_cliente_id = null where id = '99200000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select asaas_cliente_id is null from contatos where id = '99200000-0000-0000-0000-0000000000c1'), 'limpar o id é permitido');

reset role;
update contatos set asaas_cliente_id = 'cus_000001' where id = '99200000-0000-0000-0000-0000000000c1';
update contatos set asaas_cliente_id = 'cus_000002' where id = '99200000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select asaas_cliente_id = 'cus_000002' from contatos where id = '99200000-0000-0000-0000-0000000000c1'), 'service role pode trocar');

-- cobrança de uma piscicultura não pode apontar para o perfil (e a chave do Asaas) de outra
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_data) values
  ('99200000-0000-0000-0000-0000000000f1', current_setting('t.emp')::uuid, 'corrente', 'Asaas T', '2026-01-01');
insert into perfis_cobranca (id, empresa_id, nome, provedor, conta_repasse_id) values
  ('99200000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'Asaas T', 'asaas', '99200000-0000-0000-0000-0000000000f1');
select pg_temp.ok((select count(*) > 0 from cobrancas where perfil_cobranca_id = 'a9000000-0000-0000-0000-0000000000b1'), 'há cobrança de outra piscicultura para o teste');
select pg_temp.espera_erro($$update cobrancas set perfil_cobranca_id = '99200000-0000-0000-0000-0000000000b1'
  where perfil_cobranca_id = 'a9000000-0000-0000-0000-0000000000b1'$$, 'não é desta empresa');

\echo TESTES DE TERMOS E SEGURANÇA PASSARAM
