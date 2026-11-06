-- Funções de master (convites, usuários, importação) também exigem o código do autenticador
-- e a assinatura liberada, como app.pode().
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create or replace function pg_temp.recusa(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('99b00000-0000-0000-0000-0000000000b1', 'master@mfa2.com', now()),
  ('99b00000-0000-0000-0000-0000000000b2', 'intruso@mfa2.com', now());

set role authenticated;
set request.jwt.claim.sub = '99b00000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"aal": "aal1"}';
select set_config('t.emp', criar_empresa('96333444000236', 'Piscicultura MFA Master Ltda')::text, false);
select pg_temp.ok(app.e_master(current_setting('t.emp')::uuid), 'sem autenticador, o master entra só com a senha');

reset role;
insert into auth.mfa_factors (user_id, status) values ('99b00000-0000-0000-0000-0000000000b1', 'verified');
set role authenticated;
select pg_temp.ok(not app.e_master(current_setting('t.emp')::uuid), 'com autenticador, sessão só com senha não é master');
select pg_temp.ok(pg_temp.recusa(format(
  $$select convidar_usuario(%L, 'intruso@mfa2.com', 'sem_restricao', '{}', true)$$, current_setting('t.emp'))),
  'nem convida outro master');
select pg_temp.ok(pg_temp.recusa(format(
  $$select remover_usuario(%L, '99b00000-0000-0000-0000-0000000000b1')$$, current_setting('t.emp'))),
  'nem remove usuários');

reset role;
select pg_temp.ok((select count(*) = 0 from usuarios_empresa where user_id = '99b00000-0000-0000-0000-0000000000b2'), 'o intruso não entrou na empresa');
set role authenticated;

set request.jwt.claims = '{"aal": "aal2"}';
select pg_temp.ok(app.e_master(current_setting('t.emp')::uuid), 'depois do código (aal2) volta a ser master');

reset role;
update assinaturas set status = 'aguardando', teste_ate = current_date - 30, pago_ate = null where empresa_id = current_setting('t.emp')::uuid;
set role authenticated;
select pg_temp.ok(not app.e_master(current_setting('t.emp')::uuid), 'com a assinatura bloqueada, o master não gerencia nem importa');
select pg_temp.ok(pg_temp.recusa(format(
  $$select importar_pacote(%L, '{"contatos":[{"nome":"X","tipos":["cliente"]}]}')$$, current_setting('t.emp'))),
  'a importação também fica bloqueada');
reset role;
reset request.jwt.claims;

\echo TESTES DE MFA DO MASTER PASSARAM
