-- Bloqueio temporário do login: 5 senhas erradas em 15 minutos na mesma conta travam novas tentativas
-- até 15 minutos depois da última. Antes só havia o alarme no painel do master (alertas_seguranca).
-- O login (src/app/login/actions.ts) consulta pela chave de serviço antes de chamar o Supabase Auth;
-- com o bloqueio ativo ele nem tenta, então o prazo não se renova sozinho.

create or replace function public.login_bloqueado_ate(p_email text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(criado_em) + interval '15 minutes'
  from eventos_seguranca
  where tipo = 'login_falhou' and email = lower(trim(p_email)) and criado_em > now() - interval '15 minutes'
  having count(*) >= 5
$$;

revoke all on function public.login_bloqueado_ate(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.login_bloqueado_ate(text) from anon, authenticated;
    grant execute on function public.login_bloqueado_ate(text) to service_role;
  end if;
end $$;

create index if not exists eventos_seguranca_login_email on eventos_seguranca (email, criado_em) where tipo = 'login_falhou';
