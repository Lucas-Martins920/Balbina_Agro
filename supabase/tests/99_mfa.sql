-- Verificação em duas etapas: com autenticador cadastrado, só a sessão aal2 vê os dados.
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
  ('99a00000-0000-0000-0000-0000000000a1', 'dono@mfa.com', now());

set role authenticated;
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"aal": "aal1"}';
select set_config('t.emp', criar_empresa('96333444000155', 'Piscicultura MFA Ltda')::text, false);
insert into setores (empresa_id, nome) values (current_setting('t.emp')::uuid, 'Sede MFA');
select pg_temp.ok((select count(*) = 1 from setores where empresa_id = current_setting('t.emp')::uuid), 'sem autenticador, a senha basta');

reset role;
insert into auth.mfa_factors (user_id, status) values ('99a00000-0000-0000-0000-0000000000a1', 'unverified');
set role authenticated;
select pg_temp.ok((select count(*) = 1 from setores where empresa_id = current_setting('t.emp')::uuid), 'autenticador não confirmado ainda não exige o código');

reset role;
update auth.mfa_factors set status = 'verified' where user_id = '99a00000-0000-0000-0000-0000000000a1';
set role authenticated;
select pg_temp.ok((select count(*) = 0 from setores where empresa_id = current_setting('t.emp')::uuid), 'com autenticador, sessão só com senha não lê nada');
select pg_temp.ok((select count(*) = 0 from empresas where id = current_setting('t.emp')::uuid), 'nem o nome da empresa');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'piscicultura.editar'), 'nem tem permissão de escrita');
select pg_temp.ok(mfa_pendente(), 'o app sabe que falta o código');
select pg_temp.ok(not app.e_master(current_setting('t.emp')::uuid), 'nem age como master (importar, convidar usuários)');

set request.jwt.claims = '{"aal": "aal2"}';
select pg_temp.ok((select count(*) = 1 from setores where empresa_id = current_setting('t.emp')::uuid), 'depois do código (aal2) tudo volta');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'piscicultura.editar'), 'e a permissão de escrita também');
select pg_temp.ok(not mfa_pendente(), 'e não pede mais o código');
select pg_temp.ok(app.e_master(current_setting('t.emp')::uuid), 'e volta a ser master');
reset role;
reset request.jwt.claims;

-- 2º fator obrigatório: código por e-mail para quem não tem app
insert into auth.users (id, email, email_confirmed_at) values ('99a00000-0000-0000-0000-0000000000a2', 'email@mfa.com', now());
set role authenticated;
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000a2';
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e1", "amr": [{"method": "password", "timestamp": 1}]}';
select set_config('t.emp2', criar_empresa('95444555000166', 'Piscicultura Email Ltda')::text, false);
insert into setores (empresa_id, nome) values (current_setting('t.emp2')::uuid, 'Sede E');
reset role;
update app.parametros set valor = 'sim' where chave = 'exigir_2fa';
set role authenticated;
select pg_temp.ok((select count(*) = 0 from setores where empresa_id = current_setting('t.emp2')::uuid), 'obrigatório: só a senha não lê nada');
select pg_temp.ok(mfa_pendente(), 'obrigatório: o app pede o 2º fator');
select pg_temp.espera_erro($$insert into sessoes_2fa (session_id, user_id, metodo) values ('99a00000-0000-0000-0000-0000000005e1', auth.uid(), 'email')$$, 'permission denied');

reset role;
insert into sessoes_2fa (session_id, user_id, metodo) values ('99a00000-0000-0000-0000-0000000005e1', '99a00000-0000-0000-0000-0000000000a2', 'email');
set role authenticated;
select pg_temp.ok((select count(*) = 1 from setores where empresa_id = current_setting('t.emp2')::uuid), 'código por e-mail libera a sessão');
select pg_temp.ok(not mfa_pendente(), 'e não pede mais nada');
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e1", "amr": [{"method": "otp", "timestamp": 1}]}';
select pg_temp.ok((select count(*) = 0 from setores where empresa_id = current_setting('t.emp2')::uuid), 'sessão aberta só pelo e-mail (sem senha) não vale como dois fatores');
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e1", "amr": [{"method": "password", "timestamp": 1}]}';
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e2", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok((select count(*) = 0 from setores where empresa_id = current_setting('t.emp2')::uuid), 'outra sessão (outro aparelho) pede o código de novo');

-- quem tem app autenticador não troca o app pelo e-mail
reset role;
insert into sessoes_2fa (session_id, user_id, metodo) values ('99a00000-0000-0000-0000-0000000005e3', '99a00000-0000-0000-0000-0000000000a1', 'email');
set role authenticated;
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e3", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok((select count(*) = 0 from setores where empresa_id = current_setting('t.emp')::uuid), 'com app cadastrado, o e-mail não basta');

-- dispositivo confiável: vale conforme o fator que criou a confiança
reset role;
insert into sessoes_2fa (session_id, user_id, metodo) values
  ('99a00000-0000-0000-0000-0000000005e4', '99a00000-0000-0000-0000-0000000000a1', 'dispositivo_email'),
  ('99a00000-0000-0000-0000-0000000005e5', '99a00000-0000-0000-0000-0000000000a1', 'dispositivo_app'),
  ('99a00000-0000-0000-0000-0000000005e6', '99a00000-0000-0000-0000-0000000000a2', 'dispositivo_email');
set role authenticated;
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e4", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok((select count(*) = 0 from setores where empresa_id = current_setting('t.emp')::uuid), 'com app, dispositivo confiado pelo e-mail não vale');
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e5", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok((select count(*) = 1 from setores where empresa_id = current_setting('t.emp')::uuid), 'com app, dispositivo confiado pelo app vale');
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000a2';
set request.jwt.claims = '{"aal": "aal1", "session_id": "99a00000-0000-0000-0000-0000000005e6", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok((select count(*) = 1 from setores where empresa_id = current_setting('t.emp2')::uuid), 'sem app, dispositivo confiado pelo e-mail vale');
select pg_temp.espera_erro($$select count(*) from dispositivos_confiaveis$$, 'permission denied');

reset role;
update app.parametros set valor = 'nao' where chave = 'exigir_2fa';
reset request.jwt.claims;

\echo TESTES DE MFA PASSARAM
