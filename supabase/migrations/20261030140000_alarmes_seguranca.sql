-- Alarmes de segurança no painel do master (verificação dos 27 pontos, ponto 8, 2026-10-30).
-- Avisa quando: alguém da piscicultura erra a senha 5 vezes ou mais na última hora; uma chave da API revogada ou
-- vencida continua sendo usada; avisos da API estão parados há mais de 30 minutos; o extrato de um banco
-- conectado não é lido há mais de 2 dias ou a conexão pede login de novo.

-- Eventos que só o servidor grava (chave de serviço). Sem empresa_id: um login pode estar em várias pisciculturas,
-- e o alarme junta pelo usuário. Ninguém com login lê a tabela; o master vê só o resumo de alertas_seguranca.
create table eventos_seguranca (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('login_falhou', 'api_chave_recusada')),
  user_id uuid,
  chave_id uuid references api_chaves(id) on delete cascade,
  email text,
  ip text,
  criado_em timestamptz not null default now()
);
create index on eventos_seguranca (user_id, criado_em) where tipo = 'login_falhou';
create index on eventos_seguranca (chave_id, criado_em) where tipo = 'api_chave_recusada';
create index on eventos_seguranca (criado_em);
alter table eventos_seguranca enable row level security;
revoke all on eventos_seguranca from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on eventos_seguranca from anon, authenticated;
  end if;
end $$;

-- Senha errada no login (src/app/login/actions.ts, pela chave de serviço). Guarda 30 dias.
create or replace function public.registrar_falha_login(p_email text, p_ip text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
begin
  insert into eventos_seguranca (tipo, user_id, email, ip)
  values ('login_falhou', (select id from auth.users where lower(email) = v_email limit 1), left(v_email, 320), left(p_ip, 64));
  delete from eventos_seguranca where criado_em < now() - interval '30 days';
end $$;

-- Mesma função de antes; chave revogada ou vencida agora deixa registro (um por minuto por chave).
create or replace function public.api_autenticar(p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c api_chaves%rowtype;
begin
  select * into c from api_chaves
  where hash_sha256 = p_hash and revogada_em is null and (expira_em is null or expira_em > now());
  if not found then
    insert into eventos_seguranca (tipo, chave_id)
    select 'api_chave_recusada', k.id from api_chaves k
    where k.hash_sha256 = p_hash
      and not exists (select 1 from eventos_seguranca e where e.tipo = 'api_chave_recusada' and e.chave_id = k.id
                        and e.criado_em > now() - interval '1 minute');
    return null;
  end if;

  insert into api_chaves_uso as u (chave_id) values (c.id)
  on conflict (chave_id) do update set ultimo_uso_em = now() where u.ultimo_uso_em < now() - interval '1 minute';

  return jsonb_build_object(
    'chave_id', c.id,
    'empresa_id', c.empresa_id,
    'nome', c.nome,
    'escopos', to_jsonb(c.escopos),
    'liberada', app.empresa_liberada(c.empresa_id),
    'fuso', app.fuso_empresa(c.empresa_id),
    'modulos', (select case when '*' = any(n.modulos) then null else to_jsonb(n.modulos) end
                from niveis_plano n where n.id = app.nivel_empresa(c.empresa_id)));
end $$;

-- Alarmes da piscicultura, no formato da view alertas (nivel, titulo, detalhe, link). Só o master recebe linhas.
create or replace function public.alertas_seguranca(p_empresa uuid)
returns table (nivel text, titulo text, detalhe text, link text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.e_master(p_empresa) then return; end if;

  return query
  select case when count(*) >= 15 then 'critico' else 'atencao' end,
         'Senha errada em sequência',
         format('%s: %s tentativas na última hora. Se não foi a pessoa, troque a senha dela.', coalesce(u.nome, u.email), count(*)),
         '/configuracoes/usuarios'
  from usuarios_empresa u
  join eventos_seguranca e on e.user_id = u.user_id and e.tipo = 'login_falhou' and e.criado_em > now() - interval '1 hour'
  where u.empresa_id = p_empresa and u.ativo
  group by u.user_id, u.nome, u.email
  having count(*) >= 5;

  return query
  select 'atencao',
         'Chave da API revogada ou vencida em uso',
         format('%s: %s tentativa(s) recusada(s) nas últimas 24 horas. Algum sistema ainda usa essa chave.', k.nome, count(*)),
         '/configuracoes/api'
  from api_chaves k
  join eventos_seguranca e on e.chave_id = k.id and e.tipo = 'api_chave_recusada' and e.criado_em > now() - interval '24 hours'
  where k.empresa_id = p_empresa
  group by k.id, k.nome;

  return query
  select 'atencao',
         'Avisos da API parados',
         format('%s aviso(s) esperando há mais de 30 minutos. Último erro: %s', count(*),
                coalesce((array_agg(x.erro order by x.criado_em desc) filter (where x.erro is not null))[1], 'nenhum')),
         '/configuracoes/api'
  from api_webhook_entregas x
  join api_webhooks w on w.id = x.webhook_id and w.ativo
  where x.empresa_id = p_empresa and x.entregue_em is null and x.criado_em < now() - interval '30 minutes'
  having count(*) > 0;

  return query
  select case when c.status in ('erro', 'precisa_login') then 'critico' else 'atencao' end,
         'Extrato do banco parado',
         case when c.status = 'precisa_login' then format('%s pede para entrar de novo no banco.', coalesce(c.instituicao, 'Banco'))
              when c.status = 'erro' then format('%s: a última leitura deu erro.', coalesce(c.instituicao, 'Banco'))
              else format('%s: extrato não é lido desde %s.', coalesce(c.instituicao, 'Banco'),
                          coalesce(to_char(c.ultima_sincronizacao at time zone app.fuso_empresa(p_empresa), 'DD/MM HH24:MI'), 'a conexão'))
         end,
         '/conciliacao'
  from conexoes_bancarias c
  where c.empresa_id = p_empresa and c.status <> 'desconectada'
    and (c.status in ('erro', 'precisa_login') or coalesce(c.ultima_sincronizacao, c.created_at) < now() - interval '2 days');
end $$;

revoke all on function public.registrar_falha_login(text, text) from public;
revoke all on function public.alertas_seguranca(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.registrar_falha_login(text, text), public.alertas_seguranca(uuid) from anon, authenticated;
    grant execute on function public.registrar_falha_login(text, text) to service_role;
    grant execute on function public.alertas_seguranca(uuid) to authenticated;
  end if;
end $$;
