-- Tutoriais vistos: cada pessoa só vê, marca e refaz os seus.
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
  ('99710000-0000-0000-0000-0000000000a1', 'tratador@tutorial.com', now()),
  ('99710000-0000-0000-0000-0000000000a2', 'master@tutorial.com', now());

set role authenticated;
set request.jwt.claim.sub = '99710000-0000-0000-0000-0000000000a1';
insert into tutoriais_vistos (tela) values ('geral'), ('/apontamentos'), ('/lotes/[id]');
insert into tutoriais_vistos (tela) values ('/apontamentos') on conflict do nothing;
select pg_temp.ok((select count(*) = 3 from tutoriais_vistos), 'marca as telas vistas sem duplicar');
select pg_temp.espera_erro($$insert into tutoriais_vistos (tela) values ('<script>')$$, 'tutoriais_vistos_tela_check');
select pg_temp.espera_erro($$insert into tutoriais_vistos (user_id, tela) values ('99710000-0000-0000-0000-0000000000a2', '/painel')$$, 'row-level security');
select pg_temp.espera_erro($$update tutoriais_vistos set tela = '/painel'$$, 'permission denied');

set request.jwt.claim.sub = '99710000-0000-0000-0000-0000000000a2';
insert into tutoriais_vistos (tela) values ('*');
select pg_temp.ok((select count(*) = 1 from tutoriais_vistos), 'ninguém vê os tutoriais vistos dos outros');
delete from tutoriais_vistos where tela = '/apontamentos';
reset role;
select pg_temp.ok((select count(*) = 4 from tutoriais_vistos), 'ninguém apaga os tutoriais vistos dos outros');

set role authenticated;
set request.jwt.claim.sub = '99710000-0000-0000-0000-0000000000a1';
delete from tutoriais_vistos;
select pg_temp.ok((select count(*) = 0 from tutoriais_vistos), 'refazer todos apaga só os seus');
reset role;
select pg_temp.ok((select count(*) = 1 from tutoriais_vistos), 'os do outro continuam');
set request.jwt.claim.sub = '';

\echo TESTES DE TUTORIAIS PASSARAM
