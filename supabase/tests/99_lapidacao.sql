-- Lapidação de 31/10: o que os Advisors do Supabase apontavam (policies, índices, funções) não volta.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Toda chave estrangeira tem índice começando pelas colunas dela (apagar o pai e juntar tabelas não varrem a filha).
select pg_temp.ok(not exists (
  select 1 from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)),
  'toda chave estrangeira tem índice');

-- Policy não refaz auth.uid() a cada linha: vai embrulhada em (select auth.uid()).
select pg_temp.ok(not exists (
  select 1 from pg_policies where schemaname = 'public'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''), '\(\s*select\s+auth\.uid\(\)', '', 'gi') ~ 'auth\.uid\(\)'),
  'policies chamam auth.uid() uma vez por consulta');

-- Uma policy permissiva por papel e ação: o Postgres testa todas em cada linha.
select pg_temp.ok(not exists (
  select 1 from pg_policies p, unnest(case when p.cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] else array[p.cmd] end) a(cmd)
  where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
  group by p.tablename, a.cmd having count(*) > 1),
  'uma só policy permissiva por tabela e ação');

-- Telas do master (chaves, webhooks, convites, logins) filtram pelo conjunto de empresas, não chamam e_master por linha.
select pg_temp.ok(not exists (
  select 1 from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL') and qual ~ 'app\.e_master\('),
  'leitura do master compara com o conjunto de empresas');

-- Funções plpgsql com caminho de busca fixo (o Advisor marca function_search_path_mutable).
select pg_temp.ok(not exists (
  select 1 from pg_proc p join pg_language l on l.oid = p.prolang
  left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
  where p.pronamespace in ('public'::regnamespace, 'app'::regnamespace) and l.lanname = 'plpgsql'
    and p.proconfig is null and d.objid is null),
  'funções plpgsql com search_path fixo');

select pg_temp.ok((select count(*) from pg_index where indrelid = 'public.orcamentos'::regclass and indisprimary) = 1, 'orçamento tem chave primária');

-- Sobras sem uso saíram
select pg_temp.ok(to_regprocedure('app.pode_titulo_tipo(uuid, text)') is null, 'app.pode_titulo_tipo removida');
select pg_temp.ok(to_regprocedure('public.desfazer_conciliacao(uuid)') is null, 'desfazer_conciliacao removida (o app usa desconciliar)');

-- Curva da espécie: só quem edita lotes mexe; membro sem essa permissão só lê (antes conseguia apagar).
insert into auth.users (id, email, email_confirmed_at) values
  ('99a10000-0000-0000-0000-0000000000a1', 'dono@lapidacao.com', now()),
  ('99a10000-0000-0000-0000-0000000000a2', 'leitor@lapidacao.com', now()),
  ('99a10000-0000-0000-0000-0000000000a3', 'fora@lapidacao.com', now());

set role authenticated;
set request.jwt.claim.sub = '99a10000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"aal": "aal2"}';
select set_config('t.emp', criar_empresa('97333444000155', 'Piscicultura Lapidada Ltda')::text, false);
select convidar_usuario(current_setting('t.emp')::uuid, 'leitor@lapidacao.com', 'visualizacao');
insert into especies (id, empresa_id, nome) values ('99a10000-0000-0000-0000-00000000c001', current_setting('t.emp')::uuid, 'Espécie da casa');
insert into curvas_crescimento (especie_id, semana, peso_g) values ('99a10000-0000-0000-0000-00000000c001', 20, 50), ('99a10000-0000-0000-0000-00000000c001', 21, 70);
select pg_temp.ok((select count(*) from especies where empresa_id is null) >= 10, 'catálogo global de espécies visível');
select pg_temp.ok((select count(*) from especies where id = '99a10000-0000-0000-0000-00000000c001') = 1, 'dono vê a espécie da casa');

set request.jwt.claim.sub = '99a10000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) from curvas_crescimento where especie_id = '99a10000-0000-0000-0000-00000000c001') = 2, 'leitor vê a curva');
delete from curvas_crescimento where especie_id = '99a10000-0000-0000-0000-00000000c001';
update curvas_crescimento set peso_g = 1 where especie_id = '99a10000-0000-0000-0000-00000000c001';
reset role;
select pg_temp.ok((select count(*) from curvas_crescimento where especie_id = '99a10000-0000-0000-0000-00000000c001' and peso_g > 1) = 2,
  'leitor não apaga nem altera a curva');

set role authenticated;
set request.jwt.claim.sub = '99a10000-0000-0000-0000-0000000000a3';
select pg_temp.ok(not exists (select 1 from especies where id = '99a10000-0000-0000-0000-00000000c001'), 'outra pessoa não vê a espécie da casa');
select pg_temp.ok((select count(*) from especies where empresa_id is null) >= 10, 'mas vê o catálogo global');

set request.jwt.claim.sub = '99a10000-0000-0000-0000-0000000000a1';
update curvas_crescimento set peso_g = 55 where especie_id = '99a10000-0000-0000-0000-00000000c001' and semana = 20;
delete from curvas_crescimento where especie_id = '99a10000-0000-0000-0000-00000000c001' and semana = 21;
select pg_temp.ok((select peso_g from curvas_crescimento where especie_id = '99a10000-0000-0000-0000-00000000c001' and semana = 20) = 55
  and (select count(*) from curvas_crescimento where especie_id = '99a10000-0000-0000-0000-00000000c001') = 1, 'dono altera e apaga a curva');
reset role;

\echo TESTES DE LAPIDAÇÃO PASSARAM
