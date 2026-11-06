-- Login por usuário e senha criado pelo master: conta presa à empresa, troca de senha e dispensa do 2º fator
-- só para cargo operacional.
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

-- m = master, o = master de outra empresa, z = ze.viveiro (login local), f = fin.local (login local financeiro),
-- x = conta com e-mail comum que um master tenta ligar como login
insert into auth.users (id, email, email_confirmed_at) values
  ('9da00000-0000-0000-0000-0000000000a1', 'master@login.com', now()),
  ('9da00000-0000-0000-0000-0000000000a2', 'outro@login.com', now()),
  ('9da00000-0000-0000-0000-0000000000a3', 'ze.viveiro@usuarios.balbina.test', now()),
  ('9da00000-0000-0000-0000-0000000000a4', 'fin.local@usuarios.balbina.test', now()),
  ('9da00000-0000-0000-0000-0000000000a5', 'pessoa@login.com', now());

set role authenticated;
set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a2';
select set_config('t.outra', criar_empresa('98123456000171', 'Outra Login Ltda')::text, false);

set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('98123456000252', 'Piscicultura Login Ltda')::text, false);

select pg_temp.espera_erro(format($$select registrar_login_local(%L, '9da00000-0000-0000-0000-0000000000a5', 'pessoa', 'Pessoa', 'tratador')$$,
  current_setting('t.emp')), 'Conta do login não encontrada');
select pg_temp.espera_erro(format($$select registrar_login_local(%L, '9da00000-0000-0000-0000-0000000000a3', 'Zé', 'Zé', 'tratador')$$,
  current_setting('t.emp')), 'Usuário inválido');
select pg_temp.espera_erro(format($$select registrar_login_local(%L, '9da00000-0000-0000-0000-0000000000a3', 'ze.viveiro', ' ', 'tratador')$$,
  current_setting('t.emp')), 'nome da pessoa');
select registrar_login_local(current_setting('t.emp')::uuid, '9da00000-0000-0000-0000-0000000000a3', ' Ze.Viveiro ', 'Zé do Viveiro', 'tratador',
  '{}', null, true);
select pg_temp.ok((select trocar_senha and dispensa_2fa and login = 'ze.viveiro' from logins_locais where user_id = '9da00000-0000-0000-0000-0000000000a3'),
  'master cria o login, que troca a senha no 1º acesso e fica sem 2º fator');
select pg_temp.ok((select nome = 'Zé do Viveiro' and perfil = 'tratador' and not is_admin from usuarios_empresa
  where user_id = '9da00000-0000-0000-0000-0000000000a3'), 'login entra na empresa com nome e cargo');
select pg_temp.espera_erro(format($$select registrar_login_local(%L, '9da00000-0000-0000-0000-0000000000a3', 'ze.viveiro', 'Zé', 'tratador')$$,
  current_setting('t.emp')), 'já existe');

-- Financeiro por login: precisa do app, a dispensa é recusada
select pg_temp.espera_erro(format($$select registrar_login_local(%L, '9da00000-0000-0000-0000-0000000000a4', 'fin.local', 'Fin', 'financeiro', '{}', null, true)$$,
  current_setting('t.emp')), 'Só cargos operacionais');
select registrar_login_local(current_setting('t.emp')::uuid, '9da00000-0000-0000-0000-0000000000a4', 'fin.local', 'Fin', 'financeiro');
select pg_temp.ok((select not dispensa_2fa from logins_locais where login = 'fin.local'), 'financeiro por login fica com 2º fator obrigatório');
select pg_temp.espera_erro(format($$select definir_dispensa_2fa(%L, '9da00000-0000-0000-0000-0000000000a4', true)$$, current_setting('t.emp')),
  'Só cargos operacionais');
select pg_temp.ok((select count(*) from logins_locais) = 2, 'master vê os logins da empresa');

-- Conta presa à empresa: outra empresa não a convida nem a liga
set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) from logins_locais) = 0, 'master de outra empresa não vê os logins');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'ze.viveiro@usuarios.balbina.test', 'tratador')$$, current_setting('t.outra')),
  'pertence a outra empresa');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'novo@usuarios.balbina.test', 'tratador')$$, current_setting('t.outra')),
  'não recebe convite');
select pg_temp.espera_erro(format($$select login_local_da_empresa(%L, '9da00000-0000-0000-0000-0000000000a3')$$, current_setting('t.outra')),
  'não encontrado');
select pg_temp.espera_erro(format($$select exigir_troca_senha(%L, '9da00000-0000-0000-0000-0000000000a3')$$, current_setting('t.emp')),
  'Só o usuário master');
reset role;
select pg_temp.espera_erro(format($$insert into usuarios_empresa (empresa_id, user_id, perfil) values (%L, '9da00000-0000-0000-0000-0000000000a3', 'tratador')$$,
  current_setting('t.outra')), 'pertence a outra empresa');

-- 2º fator obrigatório: o tratador dispensado entra só com a senha; o financeiro não
update app.parametros set valor = 'sim' where chave = 'exigir_2fa';
set role authenticated;
set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"aal": "aal1", "session_id": "9da00000-0000-0000-0000-0000000005e1", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok(not mfa_pendente(), 'tratador dispensado entra com senha');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'apontamentos.editar'), 'e lança o apontamento');
select pg_temp.ok((meu_login_local()->>'trocar_senha')::boolean and meu_login_local()->>'inicio' = '/campo',
  'o app sabe que ele troca a senha e cai no apontamento do celular');
update logins_locais set trocar_senha = false, dispensa_2fa = true;
select pg_temp.ok((meu_login_local()->>'trocar_senha')::boolean, 'a pessoa não muda o próprio login direto na tabela');
set request.jwt.claims = '{"aal": "aal1", "session_id": "9da00000-0000-0000-0000-0000000005e1", "amr": [{"method": "otp", "timestamp": 1}]}';
select pg_temp.ok(mfa_pendente(), 'dispensa só vale em sessão aberta com senha');

set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a4';
set request.jwt.claims = '{"aal": "aal1", "session_id": "9da00000-0000-0000-0000-0000000005e2", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok(mfa_pendente(), 'financeiro por login precisa do 2º fator');
select pg_temp.ok(meu_login_local()->>'inicio' is null, 'financeiro não cai na tela enxuta');

-- Se o master der cargo financeiro ao tratador, a dispensa para de valer na hora
set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"aal": "aal2"}';
select atualizar_usuario(current_setting('t.emp')::uuid, '9da00000-0000-0000-0000-0000000000a3', 'tratador', '{contas-a-pagar.editar}', false, true, 'Zé do Viveiro', null);
set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"aal": "aal1", "session_id": "9da00000-0000-0000-0000-0000000005e1", "amr": [{"method": "password", "timestamp": 1}]}';
select pg_temp.ok(mfa_pendente(), 'com permissão no financeiro a dispensa deixa de valer');
reset request.jwt.claims;

-- Master pede nova senha
reset role;
update app.parametros set valor = 'nao' where chave = 'exigir_2fa';
update logins_locais set trocar_senha = false where login = 'ze.viveiro';
set role authenticated;
set request.jwt.claim.sub = '9da00000-0000-0000-0000-0000000000a1';
select pg_temp.ok(login_local_da_empresa(current_setting('t.emp')::uuid, '9da00000-0000-0000-0000-0000000000a3') = 'ze.viveiro', 'gate devolve o usuário');
select exigir_troca_senha(current_setting('t.emp')::uuid, '9da00000-0000-0000-0000-0000000000a3');
select pg_temp.ok((select trocar_senha from logins_locais where login = 'ze.viveiro'), 'nova senha do master obriga a trocar de novo');

reset role;
\o
\echo 'TESTES DE LOGIN LOCAL PASSARAM'
