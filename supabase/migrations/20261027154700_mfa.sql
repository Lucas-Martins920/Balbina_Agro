-- Verificação em duas etapas (MFA por app autenticador, do Supabase Auth).
-- Quem cadastrou um autenticador só enxerga os dados das empresas com a sessão de nível aal2,
-- isto é, depois de digitar o código do app. O app leva a pessoa para /auth/mfa; esta trava
-- garante que uma sessão só com senha (aal1) não lê nem grava nada, mesmo chamando a API direto.

create or replace function app.mfa_em_dia() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

-- Mesmas definições de 20261027050000_assinaturas.sql, agora com a exigência do segundo fator.
create or replace function app.empresas_vinculadas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios_empresa where user_id = auth.uid() and ativo and app.mfa_em_dia()
$$;

create or replace function app.minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.empresa_id from usuarios_empresa u
  join assinaturas a on a.empresa_id = u.empresa_id
  where u.user_id = auth.uid() and u.ativo and app.assinatura_libera(a.status, a.teste_ate, a.pago_ate)
    and app.mfa_em_dia()
$$;

create or replace function app.pode(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app.mfa_em_dia() and app.empresa_liberada(p_empresa) and exists (
    select 1 from usuarios_empresa u
    where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
      and (u.is_admin or u.perfil = 'sem_restricao' or exists (
        select 1 from unnest(app.permissoes_perfil(u.perfil) || u.permissoes) c
        where c = p_perm
           or (p_perm like '%.ver' and (c = '*.ver' or split_part(c, '.', 1) = split_part(p_perm, '.', 1)))))
  )
$$;

-- Para o app saber, sem expor a tabela de fatores, que falta digitar o código do autenticador.
create or replace function mfa_pendente() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not app.mfa_em_dia()
$$;
revoke execute on function mfa_pendente() from public, anon;
grant execute on function mfa_pendente() to authenticated;
