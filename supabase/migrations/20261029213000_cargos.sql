-- Cargos: perfis prontos com nome de função da piscicultura e cargos criados pelo master.
--
-- Pedido do Nicolas (2026-10-29): o master cadastra os usuários da empresa e dá um cargo a cada um
-- (financeiro, administrativo, gerente da piscicultura, tratador, fabricante de ração, manutenção geral e
-- outros que ele quiser). Já existiam o master, os convites e os perfis com permissões por módulo
-- (20261026000011_usuarios_permissoes.sql); aqui entram:
-- 1. Perfis prontos novos: administrativo, gerente_piscicultura, tratador, fabrica_racao e manutencao.
-- 2. `cargos`: cargos da empresa, criados e editados só pelo master, cada um com a sua lista de permissões.
--    Usuário com cargo fica no perfil 'personalizado' e recebe as permissões do cargo; mudar o cargo muda
--    o acesso de todos que o têm. Cargo em uso (usuário ou convite) não pode ser apagado.
-- 3. Nome da pessoa no cadastro do usuário e no convite (antes só o e-mail).
-- 4. app.pode e minhas_permissoes somam: perfil + cargo + permissões extras do usuário.

-- ---------------------------------------------------------------------------
-- 1. Perfis prontos
-- ---------------------------------------------------------------------------

create or replace function app.perfis_validos() returns text[]
language sql immutable as $$
  select array['sem_restricao', 'cadastros', 'visualizacao', 'personalizado', 'apontador', 'vendedor', 'caixa', 'financeiro',
               'administrativo', 'gerente_piscicultura', 'tratador', 'fabrica_racao', 'manutencao']
$$;

alter table usuarios_empresa drop constraint usuarios_empresa_perfil_check;
alter table usuarios_empresa add constraint usuarios_empresa_perfil_check check (perfil = any (app.perfis_validos()));
alter table convites drop constraint convites_perfil_check;
alter table convites add constraint convites_perfil_check check (perfil = any (app.perfis_validos()));

-- Mesmo corpo de 20261029200000_equipamentos_manutencao.sql, mais os cargos da piscicultura.
create or replace function app.permissoes_perfil(p_perfil text) returns text[]
language sql immutable as $$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar', 'manutencao.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver', 'manutencao.lancar']
    when 'vendedor' then array['vendas.lancar', 'pdv.operar', 'estoque.ver', 'contas-a-receber.ver', 'cobrancas.ver',
      'contatos.editar', 'produtos.ver']
    when 'caixa' then array['pdv.operar', 'vendas.ver']
    when 'financeiro' then array['contas-a-pagar.editar', 'contas-a-receber.editar', 'contas.editar', 'cobrancas.emitir',
      'cartoes.editar', 'conciliacao.editar', 'fluxo-de-caixa.ver', 'relatorios.editar', 'financeiro.fechar', 'custo-do-kg.ver',
      'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar']
    -- Escritório: vê tudo, cuida dos cadastros, das contas a pagar e receber, dos pedidos e das notas.
    when 'administrativo' then array['*.ver', 'contatos.editar', 'produtos.editar', 'categorias.editar', 'centros-de-custo.editar',
      'contas-a-pagar.editar', 'contas-a-receber.editar', 'vendas.lancar', 'notas.editar', 'configuracoes.editar']
    -- Operação de campo inteira: viveiros, lotes, apontamento, sanidade, estoque, ração, manutenção e planejamento.
    when 'gerente_piscicultura' then array['piscicultura.editar', 'lotes.editar', 'apontamentos.editar', 'sanidade.editar', 'estoque.editar',
      'racao.editar', 'manutencao.editar', 'manutencao.lancar', 'planejamento.editar', 'custo-do-kg.ver', 'produtos.ver', 'contatos.ver']
    -- Cuida do viveiro: apontamento diário (ovos, mortes, ração, medicamentos) e checklist de manutenção.
    when 'tratador' then array['apontamentos.editar', 'piscicultura.ver', 'lotes.ver', 'sanidade.ver', 'manutencao.lancar']
    when 'fabrica_racao' then array['racao.editar', 'produtos.ver', 'estoque.ver', 'manutencao.lancar']
    when 'manutencao' then array['manutencao.editar', 'manutencao.lancar', 'piscicultura.ver', 'estoque.ver', 'produtos.ver']
    else array[]::text[]
  end
$$;

create or replace function public.permissoes_dos_perfis() returns jsonb
language sql immutable as $$
  select jsonb_object_agg(p, to_jsonb(app.permissoes_perfil(p)))
  from unnest(app.perfis_validos()) p
  where p not in ('sem_restricao', 'personalizado')
$$;

-- ---------------------------------------------------------------------------
-- 2. Cargos da empresa
-- ---------------------------------------------------------------------------

create table cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  descricao text check (length(descricao) <= 300),
  permissoes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cargos_nome_unico on cargos (empresa_id, lower(trim(nome)));

alter table cargos enable row level security;
-- Todos da empresa veem os cargos (o nome aparece na tela de cada um); só o master grava, pelas funções abaixo.
create policy membros on cargos for select using (empresa_id in (select app.minhas_empresas()));

alter table usuarios_empresa
  add column nome text check (length(nome) <= 120),
  add column cargo_id uuid references cargos(id);
alter table convites
  add column nome text check (length(nome) <= 120),
  add column cargo_id uuid references cargos(id);
create index usuarios_empresa_cargo on usuarios_empresa (cargo_id) where cargo_id is not null;

-- Perfil + cargo + permissões extras. É a lista de chaves que app.pode confere.
create or replace function app.chaves_membro(p_perfil text, p_cargo uuid, p_permissoes text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select app.permissoes_perfil(p_perfil)
    || coalesce((select g.permissoes from cargos g where g.id = p_cargo), '{}')
    || coalesce(p_permissoes, '{}')
$$;

-- Mesmo corpo de 20261027224100_planos_balbina.sql, com o cargo somado às chaves.
create or replace function app.pode(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app.mfa_em_dia() and app.empresa_liberada(p_empresa) and app.plano_inclui(p_empresa, split_part(p_perm, '.', 1)) and exists (
    select 1 from usuarios_empresa u
    where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
      and (u.is_admin or u.perfil = 'sem_restricao' or exists (
        select 1 from unnest(app.chaves_membro(u.perfil, u.cargo_id, u.permissoes)) c
        where c = p_perm
           or (p_perm like '%.ver' and (c = '*.ver' or split_part(c, '.', 1) = split_part(p_perm, '.', 1)))))
  )
$$;

create or replace function public.minhas_permissoes(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'master', u.is_admin,
    'perfil', u.perfil,
    'cargo', g.nome,
    'total', u.is_admin or u.perfil = 'sem_restricao',
    'chaves', to_jsonb(app.chaves_membro(u.perfil, u.cargo_id, u.permissoes)),
    'nivel', n.id,
    'nome_plano', n.nome,
    'modulos', case when '*' = any(n.modulos) then null else to_jsonb(n.modulos) end)
  from usuarios_empresa u
  left join cargos g on g.id = u.cargo_id
  left join niveis_plano n on n.id = app.nivel_empresa(p_empresa)
  where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
$$;

create or replace function app.valida_acesso(p_perfil text, p_permissoes text[]) returns void
language plpgsql immutable as $$
begin
  if p_perfil is null or not (p_perfil = any (app.perfis_validos())) then
    raise exception 'Perfil inválido: %', p_perfil using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(coalesce(p_permissoes, '{}')) c where c !~ '^[a-z-]+\.[a-z]+$') then
    raise exception 'Permissão em formato inválido' using errcode = 'check_violation';
  end if;
end $$;

-- Confere que o cargo é desta empresa e devolve o perfil a gravar (com cargo, o perfil é 'personalizado').
create or replace function app.perfil_com_cargo(p_empresa uuid, p_perfil text, p_cargo uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if p_cargo is null then return p_perfil; end if;
  if not exists (select 1 from cargos where id = p_cargo and empresa_id = p_empresa) then
    raise exception 'Cargo não encontrado nesta empresa' using errcode = 'no_data_found';
  end if;
  return 'personalizado';
end $$;

-- Cria (p_id null) ou altera um cargo. Devolve o id.
create or replace function public.salvar_cargo(p_empresa uuid, p_id uuid, p_nome text, p_descricao text, p_permissoes text[])
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := trim(coalesce(p_nome, ''));
  v_perms text[];
  v_id uuid;
begin
  perform app.exige_master(p_empresa);
  perform app.valida_acesso('personalizado', p_permissoes);
  if v_nome = '' then raise exception 'Dê um nome ao cargo' using errcode = 'check_violation'; end if;
  select coalesce(array_agg(distinct c order by c), '{}') into v_perms from unnest(coalesce(p_permissoes, '{}')) c;
  if cardinality(v_perms) = 0 then
    raise exception 'Marque pelo menos uma permissão para o cargo' using errcode = 'check_violation';
  end if;
  if exists (select 1 from cargos where empresa_id = p_empresa and lower(trim(nome)) = lower(v_nome) and id is distinct from p_id) then
    raise exception 'Já existe um cargo com o nome %', v_nome using errcode = 'unique_violation';
  end if;

  if p_id is null then
    insert into cargos (empresa_id, nome, descricao, permissoes)
    values (p_empresa, v_nome, nullif(trim(p_descricao), ''), v_perms)
    returning id into v_id;
  else
    update cargos set nome = v_nome, descricao = nullif(trim(p_descricao), ''), permissoes = v_perms, updated_at = now()
     where id = p_id and empresa_id = p_empresa
    returning id into v_id;
    if v_id is null then raise exception 'Cargo não encontrado nesta empresa' using errcode = 'no_data_found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.apagar_cargo(p_cargo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_em_uso int;
begin
  select empresa_id into v_empresa from cargos where id = p_cargo;
  if v_empresa is null then raise exception 'Cargo não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exige_master(v_empresa);
  select (select count(*) from usuarios_empresa where cargo_id = p_cargo) + (select count(*) from convites where cargo_id = p_cargo)
    into v_em_uso;
  if v_em_uso > 0 then
    raise exception 'Este cargo está com % usuário(s) ou convite(s). Troque o cargo deles antes de apagar.', v_em_uso
      using errcode = 'foreign_key_violation';
  end if;
  delete from cargos where id = p_cargo;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Convite e cadastro do usuário com nome e cargo
-- ---------------------------------------------------------------------------

drop function public.convidar_usuario(uuid, text, text, text[], boolean);
drop function public.atualizar_usuario(uuid, uuid, text, text[], boolean, boolean);

-- Mesmo corpo de 20261026000011_usuarios_permissoes.sql, mais nome e cargo.
create or replace function public.convidar_usuario(p_empresa uuid, p_email text, p_perfil text,
                                                   p_permissoes text[] default '{}', p_master boolean default false,
                                                   p_nome text default null, p_cargo uuid default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_perfil text;
  v_user uuid;
begin
  perform app.exige_master(p_empresa);
  perform app.valida_acesso(p_perfil, p_permissoes);
  v_perfil := app.perfil_com_cargo(p_empresa, p_perfil, p_cargo);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = 'check_violation';
  end if;
  if exists (select 1 from usuarios_empresa where empresa_id = p_empresa and email = v_email) then
    raise exception 'Este e-mail já tem acesso à empresa' using errcode = 'unique_violation';
  end if;

  select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_user is not null then
    insert into usuarios_empresa (empresa_id, user_id, email, nome, perfil, cargo_id, is_admin, permissoes)
    values (p_empresa, v_user, v_email, v_nome, v_perfil, p_cargo, coalesce(p_master, false), coalesce(p_permissoes, '{}'))
    on conflict (empresa_id, user_id) do nothing;
    if found then return 'adicionado'; end if;
    raise exception 'Este usuário já tem acesso à empresa' using errcode = 'unique_violation';
  end if;

  insert into convites (empresa_id, email, nome, perfil, cargo_id, is_admin, permissoes, convidado_por)
  values (p_empresa, v_email, v_nome, v_perfil, p_cargo, coalesce(p_master, false), coalesce(p_permissoes, '{}'), auth.uid())
  on conflict (empresa_id, email) do update
    set nome = excluded.nome, perfil = excluded.perfil, cargo_id = excluded.cargo_id, is_admin = excluded.is_admin,
        permissoes = excluded.permissoes, convidado_por = excluded.convidado_por, created_at = now();
  return 'convidado';
end $$;

-- Mesmo corpo de 20261026000011_usuarios_permissoes.sql, levando nome e cargo do convite.
create or replace function public.aceitar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_n int;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  update usuarios_empresa set email = v_email where user_id = auth.uid() and email is distinct from v_email;

  insert into usuarios_empresa (empresa_id, user_id, email, nome, perfil, cargo_id, is_admin, permissoes)
  select c.empresa_id, auth.uid(), v_email, c.nome, c.perfil, c.cargo_id, c.is_admin, c.permissoes from convites c where c.email = v_email
  on conflict (empresa_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  delete from convites where email = v_email;
  return v_n;
end $$;

create or replace function public.atualizar_usuario(p_empresa uuid, p_user uuid, p_perfil text, p_permissoes text[],
                                                    p_master boolean, p_ativo boolean,
                                                    p_nome text default null, p_cargo uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_perfil text;
begin
  perform app.exige_master(p_empresa);
  perform app.valida_acesso(p_perfil, p_permissoes);
  v_perfil := app.perfil_com_cargo(p_empresa, p_perfil, p_cargo);
  update usuarios_empresa
     set perfil = v_perfil, cargo_id = p_cargo, permissoes = coalesce(p_permissoes, '{}'), is_admin = coalesce(p_master, false),
         ativo = coalesce(p_ativo, true), nome = nullif(trim(coalesce(p_nome, '')), ''), updated_at = now()
   where empresa_id = p_empresa and user_id = p_user;
  if not found then raise exception 'Usuário não encontrado nesta empresa' using errcode = 'no_data_found'; end if;
  perform app.exige_um_master(p_empresa);
end $$;

-- Só chamadas por dentro de app.pode, minhas_permissoes e das funções do master (todas security definer):
-- direto, deixariam ler as permissões do cargo de outra empresa pelo id.
revoke all on function app.chaves_membro(text, uuid, text[]) from public;
revoke all on function app.perfil_com_cargo(uuid, text, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.perfis_validos() to authenticated;
    grant execute on function public.salvar_cargo(uuid, uuid, text, text, text[]) to authenticated;
    grant execute on function public.apagar_cargo(uuid) to authenticated;
    grant execute on function public.convidar_usuario(uuid, text, text, text[], boolean, text, uuid) to authenticated;
    grant execute on function public.atualizar_usuario(uuid, uuid, text, text[], boolean, boolean, text, uuid) to authenticated;
  end if;
end $$;

select app.travar_referencias();
