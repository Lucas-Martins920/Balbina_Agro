-- Automações da operação (estudo docs/estudo-automacao.html, aprovado pelo Nicolas em 2026-11-01).
--
-- automacoes_empresa: o que cada empresa ligou (uma linha por empresa; sem linha = tudo desligado).
-- push_inscricoes: celulares/navegadores que pediram aviso (Web Push). Cada pessoa vê e apaga só as suas.
-- lembretes_enviados: trava para o lembrete de apontamento sair uma vez por turno e dia.
-- A rotina /api/cron/automacoes (chamada a cada 15 minutos pelo pg_cron) faz o envio.

create table automacoes_empresa (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  lembrete_apontamento boolean not null default false,
  lembrete_manha time not null default '10:00',
  lembrete_tarde time not null default '17:00',
  updated_at timestamptz not null default now()
);
alter table automacoes_empresa enable row level security;
create policy membros on automacoes_empresa using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on automacoes_empresa as restrictive for insert with check (app.pode(empresa_id, 'configuracoes.editar'));
create policy escrita_alterar on automacoes_empresa as restrictive for update
  using (app.pode(empresa_id, 'configuracoes.editar')) with check (app.pode(empresa_id, 'configuracoes.editar'));
create policy escrita_apagar on automacoes_empresa as restrictive for delete using (app.pode(empresa_id, 'configuracoes.editar'));

create table push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  aparelho text,
  created_at timestamptz not null default now()
);
create index on push_inscricoes (empresa_id);
create index on push_inscricoes (user_id);
alter table push_inscricoes enable row level security;
create policy membros on push_inscricoes using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
-- cada pessoa só mexe nas próprias inscrições
create policy proprias on push_inscricoes as restrictive using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table lembretes_enviados (
  empresa_id uuid not null references empresas(id) on delete cascade,
  tipo text not null,
  data date not null,
  turno text not null default '',
  enviado_em timestamptz not null default now(),
  primary key (empresa_id, tipo, data, turno)
);
alter table lembretes_enviados enable row level security;
create policy membros on lembretes_enviados for select using (empresa_id in (select app.minhas_empresas()));

-- Viveiros ocupados sem lançamento no turno do dia (para o lembrete).
create or replace function app.viveiros_sem_lancamento(p_empresa uuid, p_data date, p_turno text)
returns table (viveiro_id uuid, viveiro text, lote text)
language sql stable set search_path = public as $$
  select a.viveiro_id, a.setor_nome || ' / ' || a.viveiro_nome, a.lote_codigo
  from alocacoes_atuais a
  where a.empresa_id = p_empresa
    and not exists (
      select 1 from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
      where d.empresa_id = p_empresa and d.viveiro_id = a.viveiro_id and d.data = p_data and l.turno = p_turno)
  order by a.setor_nome, a.viveiro_nome
$$;
revoke all on function app.viveiros_sem_lancamento(uuid, date, text) from public;

-- Lembretes que já passaram da hora e ainda não saíram hoje. Chamada só pelo servidor (service_role):
-- devolve um item por empresa e turno, com os viveiros que faltam, e marca como enviado.
create or replace function public.lembretes_apontamento_devidos()
returns table (empresa_id uuid, turno text, viveiros jsonb)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_hoje date;
  v_agora time;
  v_turno text;
  v_viveiros jsonb;
begin
  for r in select a.*, e.fuso from automacoes_empresa a join empresas e on e.id = a.empresa_id where a.lembrete_apontamento loop
    v_hoje := (now() at time zone r.fuso)::date;
    v_agora := (now() at time zone r.fuso)::time;
    foreach v_turno in array array['manha', 'tarde'] loop
      continue when v_agora < case v_turno when 'manha' then r.lembrete_manha else r.lembrete_tarde end;
      continue when exists (select 1 from lembretes_enviados le where le.empresa_id = r.empresa_id
        and le.tipo = 'apontamento' and le.data = v_hoje and le.turno = v_turno);
      insert into lembretes_enviados (empresa_id, tipo, data, turno) values (r.empresa_id, 'apontamento', v_hoje, v_turno);
      select coalesce(jsonb_agg(jsonb_build_object('viveiro', g.viveiro, 'lote', g.lote)), '[]')
        into v_viveiros from app.viveiros_sem_lancamento(r.empresa_id, v_hoje, v_turno) g;
      continue when v_viveiros = '[]'::jsonb;
      empresa_id := r.empresa_id; turno := v_turno; viveiros := v_viveiros;
      return next;
    end loop;
  end loop;
end $$;
revoke all on function public.lembretes_apontamento_devidos() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.lembretes_apontamento_devidos() from anon, authenticated;
    grant execute on function public.lembretes_apontamento_devidos() to service_role;
  end if;
end $$;

-- Rotina das automações a cada 15 minutos (mesmo esquema da 20261029230000: URL e segredo no Vault).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise notice 'pg_cron, pg_net ou Vault indisponível: rotina de automações não agendada';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.unschedule(jobid) from cron.job where jobname = 'balbina-automacoes';
  perform cron.schedule('balbina-automacoes', '*/15 * * * *', $job$
    select net.http_get(
      url := s.url || '/api/cron/automacoes',
      headers := jsonb_build_object('Authorization', 'Bearer ' || s.segredo),
      timeout_milliseconds := 60000)
    from (select (select decrypted_secret from vault.decrypted_secrets where name = 'balbina_url') as url,
                 (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret') as segredo) s
    where s.url is not null and s.segredo is not null
  $job$);
exception when insufficient_privilege or feature_not_supported or undefined_file then
  raise notice 'Sem permissão para agendar a rotina de automações (%).', sqlerrm;
end $$;

select app.travar_referencias();
