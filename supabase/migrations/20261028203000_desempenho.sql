-- Desempenho: "hoje" da empresa sem passar pelo RLS a cada linha.
-- app.hoje(empresa) é embutida nas views (titulos.situacao, fluxo_previsto, alocacoes_atuais, alertas...) e
-- era avaliada linha a linha. Como lia public.empresas com o RLS do usuário, cada chamada refazia a checagem
-- de vínculo e 2º fator (~0,3 ms): 4 mil títulos em aberto levavam mais de 1 s só nisso.
-- O fuso vem agora de uma função security definer (~5 µs). Ela só devolve o nome do fuso de uma empresa
-- cujo id a pessoa já precisa ter; nenhum dado da empresa sai por ela.
create or replace function app.fuso_empresa(p_empresa uuid) returns text
language sql stable security definer set search_path = public as $$
  select e.fuso from empresas e where e.id = p_empresa
$$;

-- Continua SQL simples (sem security definer) para o planejador embutir nas views.
create or replace function app.hoje(p_empresa uuid) returns date
language sql stable as $$
  select (now() at time zone coalesce(app.fuso_empresa(p_empresa), 'America/Manaus'))::date
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.fuso_empresa(uuid) to authenticated, service_role;
  end if;
end $$;

-- Histórico: a policy chamava app.pode(empresa_id, ...) linha a linha (plano, assinatura, 2º fator e perfil
-- a cada linha). Agora as empresas em que a pessoa pode ver o histórico são calculadas uma vez por consulta.
create or replace function app.empresas_onde_pode(p_perm text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.empresa_id from usuarios_empresa u
  where u.user_id = auth.uid() and u.ativo and app.pode(u.empresa_id, p_perm)
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.empresas_onde_pode(text) to authenticated;
  end if;
end $$;

drop policy membros on audit_log;
create policy membros on audit_log for select using (empresa_id in (select app.empresas_onde_pode('historico.ver')));
