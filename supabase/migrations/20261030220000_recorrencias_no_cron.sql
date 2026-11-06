-- Recorrências: o horizonte de títulos futuros passa a ser renovado uma vez por dia pelo pg_cron,
-- para todas as empresas. Antes, as telas de contas a pagar/receber e o fluxo de caixa chamavam
-- gerar_recorrencias a cada abertura (uma escrita por visita). criar_recorrencia continua gerando na hora.

create or replace function app.gerar_recorrencias_todas() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_n int := 0;
begin
  for v_empresa in select distinct empresa_id from recorrencias where status = 'ativa' loop
    v_n := v_n + app.gerar_recorrencias_base(v_empresa);
  end loop;
  return v_n;
end $$;

revoke all on function app.gerar_recorrencias_todas() from public, anon, authenticated;

-- Todo dia às 07:10 UTC (03:10 em Manaus). Sem pg_cron (testes do banco) fica só a função.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponível: renovação diária das recorrências não agendada';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'balbina-recorrencias';
  perform cron.schedule('balbina-recorrencias', '10 7 * * *', 'select app.gerar_recorrencias_todas()');
exception when insufficient_privilege or feature_not_supported or undefined_file then
  raise notice 'Sem permissão para agendar a renovação das recorrências (%)', sqlerrm;
end $$;
