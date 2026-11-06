-- Lapidação de 31/10: o que os Advisors do Supabase (splinter) apontavam no banco.
-- Teste: supabase/tests/99_lapidacao.sql.

-- 1. Curva da espécie: a policy "membros_escrita" (ALL) só exigia ser membro no USING, então quem só tinha
--    leitura conseguia apagar a curva. Agora leitura numa policy e escrita com lotes.editar nas outras.
drop policy if exists membros_escrita on curvas_crescimento;
create policy escrita_inserir on curvas_crescimento for insert with check (exists (
  select 1 from especies g where g.id = curvas_crescimento.especie_id and app.pode(g.empresa_id, 'lotes.editar')));
create policy escrita_alterar on curvas_crescimento for update
  using (exists (select 1 from especies g where g.id = curvas_crescimento.especie_id and app.pode(g.empresa_id, 'lotes.editar')))
  with check (exists (select 1 from especies g where g.id = curvas_crescimento.especie_id and app.pode(g.empresa_id, 'lotes.editar')));
create policy escrita_apagar on curvas_crescimento for delete using (exists (
  select 1 from especies g where g.id = curvas_crescimento.especie_id and app.pode(g.empresa_id, 'lotes.editar')));

-- 2. Espécies: "globais" e "membros" eram duas policies de leitura testadas em cada linha; vira uma só.
--    A escrita continua travada pelas restritivas escrita_* (lotes.editar).
drop policy if exists globais on especies;
drop policy if exists membros on especies;
create policy leitura on especies for select
  using (empresa_id is null or empresa_id in (select app.minhas_empresas()));
create policy membros_inserir on especies for insert with check (empresa_id in (select app.minhas_empresas()));
create policy membros_alterar on especies for update
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy membros_apagar on especies for delete using (empresa_id in (select app.minhas_empresas()));

-- 3. auth.uid() embrulhado em (select ...): calculado uma vez por consulta, não a cada linha.
alter policy proprios on aceites_termos using (user_id = (select auth.uid()));
alter policy proprios_ver on tutoriais_vistos using (user_id = (select auth.uid()));
alter policy proprios_refazer on tutoriais_vistos using (user_id = (select auth.uid()));
alter policy proprios_marcar on tutoriais_vistos with check (user_id = (select auth.uid()));
alter policy escrita_alterar on manutencoes
  using (app.pode(empresa_id, 'manutencao.editar') or (created_by = (select auth.uid()) and app.pode(empresa_id, 'manutencao.lancar')))
  with check (app.pode(empresa_id, 'manutencao.editar') or (created_by = (select auth.uid()) and app.pode(empresa_id, 'manutencao.lancar')));
alter policy escrita_apagar on manutencoes
  using (app.pode(empresa_id, 'manutencao.editar') or (created_by = (select auth.uid()) and app.pode(empresa_id, 'manutencao.lancar')));

-- 4. Telas do master: e_master(empresa_id) rodava em cada linha (entregas de webhook crescem sem parar).
--    Agora o conjunto de empresas onde a pessoa é master sai uma vez por consulta.
create or replace function app.empresas_master() returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.empresa_id from usuarios_empresa u
  where u.user_id = auth.uid() and u.ativo and u.is_admin and app.e_master(u.empresa_id)
$$;
revoke all on function app.empresas_master() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.empresas_master() to authenticated, service_role;
  end if;
end $$;
alter policy membros on api_chaves using (empresa_id in (select app.empresas_master()));
alter policy membros on api_webhooks using (empresa_id in (select app.empresas_master()));
alter policy membros on api_webhook_entregas using (empresa_id in (select app.empresas_master()));
alter policy membros on convites using (empresa_id in (select app.empresas_master()));
alter policy membros on logins_locais using (empresa_id in (select app.empresas_master()));

-- 5. Orçamento sem chave primária (o histórico e a replicação precisam de uma).
alter table orcamentos add column if not exists id uuid not null default gen_random_uuid();
do $$
begin
  if not exists (select 1 from pg_index where indrelid = 'public.orcamentos'::regclass and indisprimary) then
    alter table orcamentos add primary key (id);
  end if;
end $$;

-- 6. Índice em toda chave estrangeira sem um (68): apagar o pai e juntar pela chave deixam de varrer a filha.
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tabela, c.conrelid as rel,
           string_agg(quote_ident(a.attname), ', ' order by k.ord) as colunas,
           string_agg(a.attname, '_' order by k.ord) as nome
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)
    group by c.oid, c.conrelid
  loop
    -- Duas FKs nas mesmas colunas dariam o mesmo índice: o segundo já encontra o primeiro.
    if not exists (select 1 from pg_class where relname = left(r.tabela::text || '_' || r.nome || '_fk', 63) and relnamespace = 'public'::regnamespace) then
      execute format('create index %I on %s (%s)', left(r.tabela::text || '_' || r.nome || '_fk', 63), r.tabela, r.colunas);
    end if;
  end loop;
end $$;

-- 7. Funções plpgsql sem search_path fixo (function_search_path_mutable). As de SQL puro ficam sem, de propósito:
--    com search_path o planejador deixa de embutir a função na consulta (app.hoje nas views, por exemplo).
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_language l on l.oid = p.prolang
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where p.pronamespace in ('public'::regnamespace, 'app'::regnamespace) and l.lanname = 'plpgsql'
      and p.proconfig is null and d.objid is null
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;

-- 8. btree_gist fora do schema public (extension_in_public). No Supabase o schema extensions existe; no Postgres
--    dos testes não, e a extensão fica onde está.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions')
     and exists (select 1 from pg_extension where extname = 'btree_gist' and extnamespace = 'public'::regnamespace) then
    alter extension btree_gist set schema extensions;
  end if;
end $$;

-- 9. Sobras sem uso: app.pode_titulo_tipo (substituída por pode_titulo_linha) e desfazer_conciliacao (o botão
--    chama desconciliar direto).
drop function if exists app.pode_titulo_tipo(uuid, text);
drop function if exists public.desfazer_conciliacao(uuid);

select app.travar_referencias();
