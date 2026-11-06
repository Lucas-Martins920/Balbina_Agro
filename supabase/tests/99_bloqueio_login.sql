-- Bloqueio temporário do login depois de 5 senhas erradas em 15 minutos na mesma conta.
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

set role anon;
select pg_temp.espera_erro($$select login_bloqueado_ate('x@bloqueio.com')$$, 'permission denied');
set role authenticated;
select pg_temp.espera_erro($$select login_bloqueado_ate('x@bloqueio.com')$$, 'permission denied');

set role service_role;
select registrar_falha_login('x@bloqueio.com', '1.2.3.4') from generate_series(1, 4);
select pg_temp.ok(login_bloqueado_ate('x@bloqueio.com') is null, '4 senhas erradas ainda deixam tentar');
select registrar_falha_login('x@bloqueio.com', '1.2.3.4');
select pg_temp.ok(login_bloqueado_ate('x@bloqueio.com') > now() + interval '14 minutes', '5ª senha errada bloqueia por 15 minutos');
select pg_temp.ok(login_bloqueado_ate(' X@Bloqueio.COM ') is not null, 'bloqueio vale com maiúsculas e espaços');
select pg_temp.ok(login_bloqueado_ate('outra@bloqueio.com') is null, 'outra conta segue livre');
reset role;

-- erros antigos não contam
update eventos_seguranca set criado_em = now() - interval '16 minutes' where email = 'x@bloqueio.com';
set role service_role;
select pg_temp.ok(login_bloqueado_ate('x@bloqueio.com') is null, 'depois de 15 minutos libera');
reset role;

\o
\echo 'TESTES DO BLOQUEIO DE LOGIN PASSARAM'
