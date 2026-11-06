-- Desempenho: funções chamadas linha a linha nas views e policies não podem refazer o RLS a cada linha.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- app.hoje continua SQL simples (o planejador embute nas views) e lê o fuso por uma função security definer
select pg_temp.ok((select not prosecdef and prolang = (select oid from pg_language where lanname = 'sql')
  from pg_proc where oid = 'app.hoje(uuid)'::regprocedure), 'app.hoje segue SQL simples, sem security definer');
select pg_temp.ok((select prosecdef from pg_proc where oid = 'app.fuso_empresa(uuid)'::regprocedure), 'fuso da empresa lido sem passar pelo RLS');

-- Nenhum índice repetido: mesma tabela, mesmas colunas e mesmo filtro (cada um custa uma escrita a mais)
select pg_temp.ok(not exists (
  select 1 from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'app')
  group by i.indrelid, i.indkey::text, coalesce(pg_get_expr(i.indpred, i.indrelid), ''), coalesce(pg_get_expr(i.indexprs, i.indrelid), '')
  having count(*) > 1), 'nenhum índice repetido');

-- Histórico: policy compara com o conjunto de empresas (uma vez por consulta), não chama app.pode por linha
select pg_temp.ok((select qual from pg_policies where tablename = 'audit_log' and policyname = 'membros') like '%empresas_onde_pode%',
  'policy do histórico usa o conjunto de empresas permitidas');

insert into auth.users (id, email, email_confirmed_at) values
  ('99d00000-0000-0000-0000-0000000000d1', 'dono@desempenho.com', now()),
  ('99d00000-0000-0000-0000-0000000000d2', 'outro@desempenho.com', now());

set role authenticated;
set request.jwt.claim.sub = '99d00000-0000-0000-0000-0000000000d1';
set request.jwt.claims = '{"aal": "aal2"}';
select set_config('t.emp', criar_empresa('96555666000177', 'Piscicultura Rápida Ltda')::text, false);
select pg_temp.ok(app.hoje(current_setting('t.emp')::uuid) = (now() at time zone 'America/Manaus')::date, 'hoje da empresa continua no fuso dela');
select pg_temp.ok(app.hoje(gen_random_uuid()) = (now() at time zone 'America/Manaus')::date, 'empresa desconhecida cai no fuso padrão');
select pg_temp.ok(current_setting('t.emp')::uuid in (select app.empresas_onde_pode('historico.ver')), 'dono pode ver o histórico da própria empresa');

set request.jwt.claim.sub = '99d00000-0000-0000-0000-0000000000d2';
select pg_temp.ok(not exists (select 1 from app.empresas_onde_pode('historico.ver') e where e = current_setting('t.emp')::uuid),
  'quem não é da empresa não ganha acesso ao histórico dela');
reset role;
