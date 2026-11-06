-- API pública do Balbina: outros sistemas (ERP, contábil, financeiro, loja) leem e lançam dados da
-- empresa com uma chave de API, e recebem avisos (webhooks) quando algo muda.
--
-- Chave: o master cria em Configurações > API e escolhe os escopos ("contas-a-pagar.ver", ...).
-- O token aparece uma vez só; aqui fica o hash SHA-256. O servidor (service role) confere o hash em
-- api_autenticar(), que devolve a empresa, os escopos e os módulos do plano: escopo fora do plano não vale.
-- As rotas /api/v1 filtram tudo pela empresa da chave; as travas de referência (mesma_empresa_*) e as
-- regras dos triggers continuam valendo, porque elas não dependem do RLS.
--
-- Webhooks: triggers em títulos, vendas, contatos, produtos e estoque enfileiram o evento em
-- api_webhook_entregas para cada webhook ativo da empresa que assinou aquele evento (e só se o plano
-- inclui o módulo). O servidor entrega com assinatura HMAC e tenta de novo com espera crescente.
--
-- Histórico: o que a API grava aparece como "API: <nome da chave>" (cabeçalho x-balbina-chave, aceito só
-- de quem usa a chave de serviço).

-- ---------------------------------------------------------------------------
-- Catálogo de escopos e eventos (o app tem a mesma lista em src/lib/api/escopos.ts)
-- ---------------------------------------------------------------------------

create or replace function app.api_escopos() returns text[]
language sql immutable as $$
  select array['contas-a-pagar.ver', 'contas-a-pagar.editar', 'contas-a-receber.ver', 'contas-a-receber.editar',
               'contas.ver', 'categorias.ver', 'centros-de-custo.ver', 'contatos.ver', 'contatos.editar',
               'produtos.ver', 'produtos.editar', 'vendas.ver', 'estoque.ver']
$$;

create or replace function app.api_eventos() returns text[]
language sql immutable as $$
  select array['lancamento.criado', 'lancamento.alterado', 'venda.criada', 'venda.alterada',
               'contato.criado', 'contato.alterado', 'produto.criado', 'produto.alterado', 'estoque.movimentado']
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table api_chaves (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 80),
  prefixo text not null,                       -- começo do token, para reconhecer a chave na lista
  hash_sha256 text not null unique check (hash_sha256 ~ '^[0-9a-f]{64}$'),
  escopos text[] not null check (cardinality(escopos) > 0 and escopos <@ app.api_escopos()),
  criada_por uuid,
  criada_em timestamptz not null default now(),
  expira_em timestamptz,
  revogada_em timestamptz,
  revogada_por uuid
);
create index on api_chaves (empresa_id);

-- Último uso fica fora de api_chaves para não encher o histórico a cada chamada.
create table api_chaves_uso (
  chave_id uuid primary key references api_chaves(id) on delete cascade,
  ultimo_uso_em timestamptz not null default now()
);

create table api_webhooks (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  url text not null check (url ~ '^https://[^\s/?#@]+(/[^\s]*)?$' and length(url) <= 500),
  eventos text[] not null check (cardinality(eventos) > 0 and eventos <@ app.api_eventos()),
  segredo_cifrado text not null,               -- AES-GCM com BALBINA_CHAVE_CRIPTO; assina cada entrega
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on api_webhooks (empresa_id) where ativo;

create table api_webhook_entregas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  webhook_id uuid not null references api_webhooks(id) on delete cascade,
  evento text not null,
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  tentativas int not null default 0,
  proxima_em timestamptz not null default now(),
  reservada_ate timestamptz,
  entregue_em timestamptz,
  status_http int,
  erro text
);
create index api_webhook_entregas_pendentes on api_webhook_entregas (proxima_em) where entregue_em is null;
create index on api_webhook_entregas (webhook_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Acesso: o master vê chaves e webhooks (sem hash nem segredo) e mexe só pelas funções abaixo.
-- Entregas e uso: só o servidor.
-- ---------------------------------------------------------------------------

alter table api_chaves enable row level security;
alter table api_chaves_uso enable row level security;
alter table api_webhooks enable row level security;
alter table api_webhook_entregas enable row level security;

create policy membros on api_chaves for select using (app.e_master(empresa_id));
create policy membros on api_webhooks for select using (app.e_master(empresa_id));
create policy membros on api_webhook_entregas for select using (app.e_master(empresa_id));
create policy membros on api_chaves_uso for select using (chave_id in (select id from api_chaves));

revoke all on api_chaves, api_chaves_uso, api_webhooks, api_webhook_entregas from anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select (id, empresa_id, nome, prefixo, escopos, criada_por, criada_em, expira_em, revogada_em, revogada_por) on api_chaves to authenticated;
    grant select (id, empresa_id, url, eventos, ativo, criado_por, criado_em, updated_at) on api_webhooks to authenticated;
    grant select (id, empresa_id, webhook_id, evento, criado_em, tentativas, proxima_em, entregue_em, status_http, erro) on api_webhook_entregas to authenticated;
    grant select on api_chaves_uso to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funções do master (tela Configurações > API)
-- ---------------------------------------------------------------------------

create or replace function app.exige_master(p_empresa uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master gerencia a API da empresa' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- O token é gerado e "hasheado" no servidor; o banco nunca vê o token.
create or replace function public.criar_chave_api(p_empresa uuid, p_nome text, p_escopos text[], p_hash text, p_prefixo text,
                                                  p_expira_em timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform app.exige_master(p_empresa);
  if (select count(*) from api_chaves where empresa_id = p_empresa and revogada_em is null) >= 20 then
    raise exception 'Limite de 20 chaves ativas. Revogue as que não usa mais' using errcode = 'check_violation';
  end if;
  if p_expira_em is not null and p_expira_em <= now() then
    raise exception 'A validade precisa ser uma data futura' using errcode = 'check_violation';
  end if;
  insert into api_chaves (empresa_id, nome, prefixo, hash_sha256, escopos, criada_por, expira_em)
  values (p_empresa, trim(p_nome), p_prefixo, p_hash, (select array_agg(distinct e order by e) from unnest(p_escopos) e), auth.uid(), p_expira_em)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.revogar_chave_api(p_chave uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from api_chaves where id = p_chave;
  if v_empresa is null then raise exception 'Chave não encontrada' using errcode = 'no_data_found'; end if;
  perform app.exige_master(v_empresa);
  update api_chaves set revogada_em = now(), revogada_por = auth.uid() where id = p_chave and revogada_em is null;
end $$;

-- O segredo é cifrado no servidor (precisa voltar ao texto para assinar as entregas).
create or replace function public.criar_webhook_api(p_empresa uuid, p_url text, p_eventos text[], p_segredo_cifrado text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform app.exige_master(p_empresa);
  if (select count(*) from api_webhooks where empresa_id = p_empresa) >= 10 then
    raise exception 'Limite de 10 webhooks por empresa' using errcode = 'check_violation';
  end if;
  insert into api_webhooks (empresa_id, url, eventos, segredo_cifrado, criado_por)
  values (p_empresa, trim(p_url), (select array_agg(distinct e order by e) from unnest(p_eventos) e), p_segredo_cifrado, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.alterar_webhook_api(p_webhook uuid, p_ativo boolean, p_excluir boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from api_webhooks where id = p_webhook;
  if v_empresa is null then raise exception 'Webhook não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exige_master(v_empresa);
  if p_excluir then
    delete from api_webhooks where id = p_webhook;
  else
    update api_webhooks set ativo = p_ativo, updated_at = now() where id = p_webhook;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funções do servidor (service role): autenticar a chave e reservar entregas
-- ---------------------------------------------------------------------------

-- null = chave inexistente, revogada ou vencida. modulos null = o plano libera todos.
create or replace function public.api_autenticar(p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c api_chaves%rowtype;
begin
  select * into c from api_chaves
  where hash_sha256 = p_hash and revogada_em is null and (expira_em is null or expira_em > now());
  if not found then return null; end if;

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

-- Reserva um lote de entregas pendentes por 2 minutos (duas rotinas ao mesmo tempo não pegam a mesma).
create or replace function public.api_reservar_entregas(p_limite int default 50)
returns table (id uuid, empresa_id uuid, webhook_id uuid, evento text, dados jsonb, criado_em timestamptz, tentativas int,
               url text, segredo_cifrado text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with lote as (
    select e.id from api_webhook_entregas e
    join api_webhooks w on w.id = e.webhook_id and w.ativo
    where e.entregue_em is null and e.tentativas < 8 and e.proxima_em <= now()
      and (e.reservada_ate is null or e.reservada_ate < now())
    order by e.proxima_em
    limit least(greatest(p_limite, 1), 200)
    for update of e skip locked
  ), reservadas as (
    update api_webhook_entregas e set reservada_ate = now() + interval '2 minutes'
    from lote where e.id = lote.id
    returning e.*
  )
  select r.id, r.empresa_id, r.webhook_id, r.evento, r.dados, r.criado_em, r.tentativas, w.url, w.segredo_cifrado
  from reservadas r join api_webhooks w on w.id = r.webhook_id;
end $$;

-- Resultado de uma entrega. Falhou: tenta de novo em 1, 2, 4... até 8 tentativas (cerca de 4 horas).
create or replace function public.api_registrar_entrega(p_entrega uuid, p_status int, p_erro text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update api_webhook_entregas set
    tentativas = tentativas + 1,
    status_http = p_status,
    erro = left(p_erro, 500),
    reservada_ate = null,
    entregue_em = case when p_erro is null and p_status between 200 and 299 then now() end,
    proxima_em = now() + make_interval(mins => power(2, least(tentativas, 8))::int)
  where id = p_entrega;
end $$;

revoke execute on function public.api_autenticar(text), public.api_reservar_entregas(int), public.api_registrar_entrega(uuid, int, text)
  from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.api_autenticar(text), public.api_reservar_entregas(int), public.api_registrar_entrega(uuid, int, text)
      from anon, authenticated;
    grant execute on function public.criar_chave_api(uuid, text, text[], text, text, timestamptz), public.revogar_chave_api(uuid),
      public.criar_webhook_api(uuid, text, text[], text), public.alterar_webhook_api(uuid, boolean, boolean) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.api_autenticar(text), public.api_reservar_entregas(int), public.api_registrar_entrega(uuid, int, text)
      to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Eventos dos webhooks
-- ---------------------------------------------------------------------------

-- tg_argv: [0] evento da inclusão, [1] evento da edição (vazio = não avisa edição)
create or replace function app.api_enfileirar_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_linha jsonb := to_jsonb(new);
  v_empresa uuid := (v_linha->>'empresa_id')::uuid;
  v_evento text := case tg_op when 'INSERT' then tg_argv[0] else nullif(tg_argv[1], '') end;
  v_modulo text;
begin
  if v_evento is null or not exists (select 1 from api_webhooks w where w.empresa_id = v_empresa and w.ativo) then
    return null;
  end if;
  if tg_op = 'UPDATE' and (v_linha - 'updated_at') = (to_jsonb(old) - 'updated_at') then return null; end if;
  v_modulo := case tg_table_name
    when 'agendamentos' then 'contas-a-' || (v_linha->>'tipo')
    when 'pedidos_venda' then 'vendas'
    when 'movimentos_estoque' then 'estoque'
    else tg_table_name end;
  if not (app.empresa_liberada(v_empresa) and app.plano_inclui(v_empresa, v_modulo)) then return null; end if;

  insert into api_webhook_entregas (empresa_id, webhook_id, evento, dados)
  select v_empresa, w.id, v_evento, app.sem_campos_ocultos(v_linha)
  from api_webhooks w
  where w.empresa_id = v_empresa and w.ativo and v_evento = any(w.eventos);
  return null;
end $$;

create trigger api_webhook after insert or update on agendamentos
  for each row execute function app.api_enfileirar_evento('lancamento.criado', 'lancamento.alterado');
create trigger api_webhook after insert or update on pedidos_venda
  for each row execute function app.api_enfileirar_evento('venda.criada', 'venda.alterada');
create trigger api_webhook after insert or update on contatos
  for each row execute function app.api_enfileirar_evento('contato.criado', 'contato.alterado');
create trigger api_webhook after insert or update on produtos
  for each row execute function app.api_enfileirar_evento('produto.criado', 'produto.alterado');
create trigger api_webhook after insert on movimentos_estoque
  for each row execute function app.api_enfileirar_evento('estoque.movimentado', '');

-- ---------------------------------------------------------------------------
-- Histórico: o que a API grava aparece com o nome da chave
-- ---------------------------------------------------------------------------

-- Só vale para chamadas com a chave de serviço (as rotas /api/v1); um usuário comum não falsifica.
create or replace function app.api_chave_atual() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_id text;
begin
  if auth.uid() is not null or coalesce(auth.jwt()->>'role', '') <> 'service_role' then return null; end if;
  v_id := nullif(current_setting('request.headers', true), '')::jsonb->>'x-balbina-chave';
  if v_id is null or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return (select id from api_chaves where id = v_id::uuid);
end $$;

create or replace function app.registrar_alteracao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb := case when tg_op <> 'INSERT' then app.sem_campos_ocultos(to_jsonb(old)) end;
  v_depois jsonb := case when tg_op <> 'DELETE' then app.sem_campos_ocultos(to_jsonb(new)) end;
  v_linha jsonb := coalesce(v_depois, v_antes);
  v_user uuid := auth.uid();
  v_empresa uuid;
  v_campos text[];
  v_chave uuid;
begin
  if tg_argv[1] = 'empresa_id' then
    v_empresa := (v_linha->>'empresa_id')::uuid;
  elsif tg_argv[1] = 'id' then
    v_empresa := (v_linha->>'id')::uuid;
  elsif v_linha->>tg_argv[1] is not null then
    execute format('select empresa_id from %s where id = $1', tg_argv[2]::regclass) into v_empresa using (v_linha->>tg_argv[1])::uuid;
  end if;
  -- Empresa apagada (ou item apagado junto com o pai): a exclusão do pai já ficou registrada.
  if v_empresa is null or not exists (select 1 from empresas where id = v_empresa) then return null; end if;

  if tg_op = 'UPDATE' then
    select array_agg(d.key order by d.key) into v_campos
    from jsonb_each(v_depois) d
    where d.key <> 'updated_at' and d.value is distinct from v_antes->d.key;
    if v_campos is null then return null; end if;
    select jsonb_object_agg(c, v_antes->c), jsonb_object_agg(c, v_depois->c) into v_antes, v_depois from unnest(v_campos) c;
  end if;

  if v_user is null then v_chave := app.api_chave_atual(); end if;

  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, campos, antes, depois)
  values (
    v_empresa, v_user,
    coalesce((select email from usuarios_empresa where empresa_id = v_empresa and user_id = v_user),
             (select lower(email) from auth.users where id = v_user),
             (select 'API: ' || nome from api_chaves where id = v_chave and empresa_id = v_empresa)),
    tg_table_name,
    (select string_agg(v_linha->>c, '/') from unnest(string_to_array(tg_argv[0], ',')) c),
    lower(tg_op),
    left(coalesce(v_linha->>'descricao', v_linha->>'nome', v_linha->>'codigo', v_linha->>'razao_social',
                  v_linha->>'email', 'nº ' || (v_linha->>'numero'), v_linha->>'cpf_cnpj'), 200),
    v_campos, v_antes, v_depois);
  return null;
end $$;

-- Entregas e uso das chaves são controle técnico: fora do histórico.
create or replace function app.tabelas_sem_historico() returns text[]
language sql immutable as $$
  select array['audit_log', 'custos_lote_mensal', 'importacao_vinculos', 'contas_asaas_segredos',
               'sessoes_2fa', 'dispositivos_confiaveis', 'webhook_eventos', 'aceites_termos',
               'api_chaves_uso', 'api_webhook_entregas']
$$;

select app.travar_referencias();
