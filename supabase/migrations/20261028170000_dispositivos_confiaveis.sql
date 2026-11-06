-- "Confiar neste dispositivo por 14 dias" na verificação em duas etapas.
-- Depois do código (app ou e-mail), o navegador ganha um cookie com um token aleatório; aqui fica
-- só o hash. Num login novo nesse navegador, o servidor confere o token e registra a sessão em
-- sessoes_2fa como 'dispositivo_app' ou 'dispositivo_email', conforme o fator que criou a confiança.
-- Quem tem app autenticador só é liberado por 'app' ou 'dispositivo_app': confiança criada pelo
-- e-mail (antes de ativar o app) não vale.

create table dispositivos_confiaveis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  metodo text not null check (metodo in ('app', 'email')),
  descricao text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);
create index on dispositivos_confiaveis (user_id);
-- Só a chave de serviço grava ou lê.
alter table dispositivos_confiaveis enable row level security;
revoke all on dispositivos_confiaveis from anon, authenticated;

alter table sessoes_2fa drop constraint sessoes_2fa_metodo_check;
alter table sessoes_2fa add constraint sessoes_2fa_metodo_check
  check (metodo in ('email', 'link_email', 'app', 'dispositivo_app', 'dispositivo_email'));

-- O Supabase deixa entrar só pelo e-mail (link ou código). Uma sessão assim não pode valer como os
-- dois fatores: o código por e-mail e o dispositivo confiável só completam sessão aberta com senha.
create or replace function app.sessao_com_senha() returns boolean
language sql stable as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
                                            then auth.jwt() -> 'amr' else '[]'::jsonb end) a
    where a ->> 'method' = 'password' or a #>> '{}' = 'password')
$$;

create or replace function app.mfa_em_dia() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then true
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then true
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
      then app.sessao_com_senha() and exists (
        select 1 from sessoes_2fa s
        where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid()
          and s.metodo in ('app', 'dispositivo_app'))
    when exists (select 1 from sessoes_2fa s
                 where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid())
      then app.sessao_com_senha()
    else not app.exigir_2fa()
  end
$$;
