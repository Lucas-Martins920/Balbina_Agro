-- Entrega dos avisos (webhooks) da API pública a cada 5 minutos pelo próprio Supabase.
--
-- O agendamento "*/5" do GitHub Actions (webhooks.yml) é só uma sugestão para o GitHub: em 17 horas de
-- 29/10 ele rodou 3 vezes. A Vercel Hobby só agenda uma vez por dia. O pg_cron do Supabase (grátis)
-- roda no horário e chama a mesma rota /api/cron/webhooks pelo pg_net.
--
-- A URL e o CRON_SECRET ficam no Vault do Supabase (nunca no git). Sem os dois segredos a rotina não
-- chama nada. Para ligar, no painel do Supabase > Vault, crie:
--   balbina_url   = o endereço de produção do Balbina (ex.: https://app.seu-dominio.com.br)
--   cron_secret  = o mesmo valor do CRON_SECRET da Vercel
-- Em Postgres sem pg_cron/pg_net (testes do banco) esta migration não faz nada.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise notice 'pg_cron, pg_net ou Vault indisponível: rotina de webhooks no banco não agendada';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  perform cron.unschedule(jobid) from cron.job where jobname = 'balbina-webhooks-api';
  perform cron.schedule('balbina-webhooks-api', '*/5 * * * *', $job$
    select net.http_get(
      url := s.url || '/api/cron/webhooks',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.segredo),
      timeout_milliseconds := 60000)
    from (select (select decrypted_secret from vault.decrypted_secrets where name = 'balbina_url') as url,
                 (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as segredo) s
    where s.url is not null and s.segredo is not null
  $job$);
exception when insufficient_privilege or feature_not_supported or undefined_file then
  raise notice 'Sem permissão para agendar a rotina de webhooks no banco (%); fica só o GitHub Actions.', sqlerrm;
end $$;
