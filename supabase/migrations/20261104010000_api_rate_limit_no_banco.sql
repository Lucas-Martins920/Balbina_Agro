-- Rate limit da API pública gravado no banco (revisão geral, item P6).
-- Antes ficava na memória do servidor (Map<chave_id, {minuto, chamadas}>), o que perdia
-- a contagem entre deploys e não funcionava com vários workers da Vercel.
-- Agora cada chamada incrementa uma linha na tabela; a função devolve se ainda está dentro
-- do limite (300/min por chave). O pg_cron limpa as linhas antigas toda hora.

create table if not exists app.api_rate_limit (
  chave_id uuid not null references api_chaves(id) on delete cascade,
  minuto   bigint not null, -- floor(extract(epoch from now()) / 60)
  chamadas int not null default 1,
  primary key (chave_id, minuto)
);

-- Incrementa e devolve true se a chave ainda está dentro do limite. Fica no schema public porque o
-- servidor chama pela API REST (db.rpc), que só enxerga o public; só o service_role pode executar.
create or replace function public.api_dentro_do_limite(p_chave_id uuid, p_limite int default 300)
returns boolean language sql volatile security definer set search_path = public as $$
  insert into app.api_rate_limit (chave_id, minuto, chamadas)
  values (p_chave_id, floor(extract(epoch from now()) / 60)::bigint, 1)
  on conflict (chave_id, minuto) do update set chamadas = app.api_rate_limit.chamadas + 1
  returning chamadas <= p_limite
$$;

-- Limpa linhas com mais de 5 minutos (o último minuto pode ainda receber chamadas).
create or replace function app.api_rate_limit_limpar() returns void
language sql volatile security definer set search_path = public as $$
  delete from app.api_rate_limit where minuto < floor(extract(epoch from now()) / 60)::bigint - 5
$$;

-- Cron: limpa a cada hora (leve, poucas linhas).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'balbina-api-rate-limit-limpar';
    perform cron.schedule('balbina-api-rate-limit-limpar', '15 * * * *', $job$select app.api_rate_limit_limpar()$job$);
  end if;
end $$;

-- A função é chamada pelo servidor (service_role); não expor para anon/authenticated.
revoke all on function public.api_dentro_do_limite(uuid, int) from public;
revoke all on table app.api_rate_limit from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.api_dentro_do_limite(uuid, int) from anon, authenticated;
    revoke all on table app.api_rate_limit from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.api_dentro_do_limite(uuid, int) to service_role;
  end if;
end $$;
