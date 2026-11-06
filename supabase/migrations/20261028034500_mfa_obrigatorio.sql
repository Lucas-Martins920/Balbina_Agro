-- Verificação em duas etapas obrigatória: toda sessão precisa, além da senha, do código do app
-- autenticador (sessão aal2 do Supabase Auth) ou de um código enviado por e-mail.
-- O código por e-mail é conferido pelo servidor do app (Supabase Auth manda e confere o código),
-- que então registra a sessão em sessoes_2fa com a chave de serviço. Quem cadastrou um app
-- autenticador continua precisando dele: o e-mail não substitui o app.

-- Parâmetros gerais do sistema, fora da API. exigir_2fa = 'nao' volta ao 2º fator opcional
-- (só para quem ativou o app), como saída de emergência se o envio de e-mail falhar.
create table if not exists app.parametros (chave text primary key, valor text not null);
insert into app.parametros (chave, valor) values ('exigir_2fa', 'sim') on conflict (chave) do nothing;
revoke all on app.parametros from public;

create or replace function app.exigir_2fa() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select valor <> 'nao' from app.parametros where chave = 'exigir_2fa'), true)
$$;

-- Sessões do Supabase Auth (claim session_id do JWT) que já passaram pelo código por e-mail.
-- O id de sessão é aleatório e morre com ela; linhas antigas não liberam nada.
create table sessoes_2fa (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  metodo text not null check (metodo in ('email', 'link_email', 'app')),
  verificado_em timestamptz not null default now()
);
create index on sessoes_2fa (user_id);
-- Só a chave de serviço grava ou lê; ninguém marca a própria sessão como verificada.
alter table sessoes_2fa enable row level security;
revoke all on sessoes_2fa from anon, authenticated;

create or replace function app.mfa_em_dia() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then true
    when coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then true
    when exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified') then false
    when exists (select 1 from sessoes_2fa s
                 where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid()) then true
    else not app.exigir_2fa()
  end
$$;
