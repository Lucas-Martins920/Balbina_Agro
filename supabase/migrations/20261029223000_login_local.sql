-- Login por usuário e senha, sem e-mail, criado pelo master da piscicultura.
--
-- Pedido do Nicolas (2026-10-29): na piscicultura tem gente sem e-mail (tratador, fábrica de ração), internet
-- ruim e nenhum sinal de celular para SMS. O master cria a pessoa com um usuário (ex.: "ze.viveiro") e uma
-- senha inicial; ela entra com usuário e senha e troca a senha no primeiro acesso. O login por e-mail
-- continua igual para quem tem e-mail.
--
-- Como funciona por baixo: o Supabase Auth só entra por e-mail, então cada usuário vira um e-mail interno
-- "<usuario>@usuarios.balbina.test" (TLD .test é reservado e nunca entrega e-mail: nem recuperação de senha
-- nem código por e-mail chegam a ninguém). A conta é criada pela chave de serviço, já confirmada, e só
-- entra aqui pelas funções do master. Ela fica presa a uma empresa: não recebe convite de outra.
--
-- 2º fator: sem e-mail, o código por e-mail não serve. O padrão é o app autenticador (funciona sem
-- internet e sem sinal; o código sai do relógio do celular), cadastrado no primeiro acesso. O master pode
-- dispensar o 2º fator de quem só tem cargo operacional; com permissão de financeiro, configurações, notas,
-- master ou acesso total a dispensa não vale (conferido a cada consulta, não só quando foi marcada).

create or replace function app.dominio_login_local() returns text
language sql immutable as $$ select 'usuarios.balbina.test' $$;

create table logins_locais (
  user_id uuid primary key references auth.users (id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  login text not null unique check (login ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  trocar_senha boolean not null default true,
  dispensa_2fa boolean not null default false,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on logins_locais (empresa_id);

alter table logins_locais enable row level security;
-- O master vê os logins da empresa; a própria pessoa usa meu_login_local(). Escrita só pelas funções abaixo.
create policy membros on logins_locais for select using (app.e_master(empresa_id));

-- Módulos em que lançar ou editar impede a dispensa do 2º fator.
create or replace function app.modulos_sensiveis() returns text[]
language sql immutable as $$
  select array['contas-a-pagar', 'contas-a-receber', 'contas', 'cobrancas', 'cartoes', 'conciliacao', 'financeiro',
               'relatorios', 'configuracoes', 'notas', 'custo-do-kg', 'historico']
$$;

-- O usuário pode ficar sem 2º fator? Só se for de cargo operacional em todas as empresas em que está.
create or replace function app.pode_dispensar_2fa(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from usuarios_empresa u
    where u.user_id = p_user
      and (u.is_admin or u.perfil in ('sem_restricao', 'financeiro', 'administrativo', 'cadastros') or exists (
        select 1 from unnest(app.chaves_membro(u.perfil, u.cargo_id, u.permissoes)) c
        where split_part(c, '.', 1) = any (app.modulos_sensiveis()) and c not like '%.ver')))
$$;

create or replace function app.dispensa_2fa_valida() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from logins_locais l where l.user_id = auth.uid() and l.dispensa_2fa)
     and app.pode_dispensar_2fa(auth.uid())
$$;

-- Mesmo corpo de 20261028170000_dispositivos_confiaveis.sql, mais a dispensa do login local
-- (só em sessão aberta com senha, e nunca para quem já cadastrou o app).
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
    when app.dispensa_2fa_valida() then app.sessao_com_senha()
    else not app.exigir_2fa()
  end
$$;

-- Conta de login local fica numa empresa só, e o e-mail interno não recebe convite.
create or replace function app.login_local_uma_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from logins_locais l where l.user_id = new.user_id and l.empresa_id <> new.empresa_id) then
    raise exception 'Usuário com login local pertence a outra empresa' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger login_local_uma_empresa before insert or update of user_id, empresa_id on usuarios_empresa
  for each row execute function app.login_local_uma_empresa();

create or replace function app.convite_sem_login_local() returns trigger
language plpgsql as $$
begin
  if new.email like '%@' || app.dominio_login_local() then
    raise exception 'Este endereço é de um login por usuário e não recebe convite' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger convite_sem_login_local before insert or update of email on convites
  for each row execute function app.convite_sem_login_local();

-- Depois que o servidor criou a conta no Supabase Auth (chave de serviço), o master a liga à empresa.
-- Confere que a conta é mesmo o e-mail interno desse usuário e que ainda não está em empresa nenhuma.
create or replace function public.registrar_login_local(p_empresa uuid, p_user uuid, p_login text, p_nome text, p_perfil text,
                                                        p_permissoes text[] default '{}', p_cargo uuid default null,
                                                        p_dispensa_2fa boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_login text := lower(trim(coalesce(p_login, '')));
  v_email text := lower(trim(coalesce(p_login, ''))) || '@' || app.dominio_login_local();
  v_perfil text;
begin
  perform app.exige_master(p_empresa);
  perform app.valida_acesso(p_perfil, p_permissoes);
  v_perfil := app.perfil_com_cargo(p_empresa, p_perfil, p_cargo);
  if v_login !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado' using errcode = 'check_violation';
  end if;
  if nullif(trim(coalesce(p_nome, '')), '') is null then
    raise exception 'Informe o nome da pessoa' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from auth.users a where a.id = p_user and lower(a.email) = v_email and a.email_confirmed_at is not null) then
    raise exception 'Conta do login não encontrada' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from logins_locais where user_id = p_user or login = v_login)
     or exists (select 1 from usuarios_empresa where user_id = p_user) then
    raise exception 'Este usuário já existe. Escolha outro nome de usuário.' using errcode = 'unique_violation';
  end if;

  insert into logins_locais (user_id, empresa_id, login, criado_por) values (p_user, p_empresa, v_login, auth.uid());
  insert into usuarios_empresa (empresa_id, user_id, email, nome, perfil, cargo_id, is_admin, permissoes)
  values (p_empresa, p_user, v_email, trim(p_nome), v_perfil, p_cargo, false, coalesce(p_permissoes, '{}'));
  if coalesce(p_dispensa_2fa, false) then
    perform public.definir_dispensa_2fa(p_empresa, p_user, true);
  end if;
end $$;

-- Gate das ações do master sobre um login local (nova senha, zerar o app autenticador): devolve o usuário.
create or replace function public.login_local_da_empresa(p_empresa uuid, p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_login text;
begin
  perform app.exige_master(p_empresa);
  select login into v_login from logins_locais where user_id = p_user and empresa_id = p_empresa;
  if v_login is null then raise exception 'Login por usuário não encontrado nesta empresa' using errcode = 'no_data_found'; end if;
  return v_login;
end $$;

-- Nova senha dada pelo master: a pessoa troca de novo no próximo acesso.
create or replace function public.exigir_troca_senha(p_empresa uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.login_local_da_empresa(p_empresa, p_user);
  update logins_locais set trocar_senha = true, updated_at = now() where user_id = p_user;
end $$;

create or replace function public.definir_dispensa_2fa(p_empresa uuid, p_user uuid, p_dispensa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.login_local_da_empresa(p_empresa, p_user);
  if coalesce(p_dispensa, false) and not app.pode_dispensar_2fa(p_user) then
    raise exception 'Só cargos operacionais podem ficar sem 2º fator. Master, financeiro, administrativo e quem lança no financeiro, notas ou configurações precisam do app autenticador.'
      using errcode = 'check_violation';
  end if;
  update logins_locais set dispensa_2fa = coalesce(p_dispensa, false), updated_at = now() where user_id = p_user;
end $$;

-- Para o app: a pessoa logada é de login local? Precisa trocar a senha? Está dispensada do 2º fator?
-- `inicio`: tela enxuta em que ela cai ao entrar (apontamento no celular, checklist de manutenção ou ração).
create or replace function public.meu_login_local() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('login', l.login, 'trocar_senha', l.trocar_senha,
    'dispensa_2fa', l.dispensa_2fa and app.pode_dispensar_2fa(l.user_id),
    'inicio', case
      when not app.pode_dispensar_2fa(l.user_id) then null
      when 'apontamentos.editar' = any (c.chaves) then '/campo'
      when 'manutencao.lancar' = any (c.chaves) or 'manutencao.editar' = any (c.chaves) then '/manutencao/checklist'
      when 'racao.editar' = any (c.chaves) then '/racao'
    end)
  from logins_locais l
  left join lateral (
    select app.chaves_membro(u.perfil, u.cargo_id, u.permissoes) chaves
    from usuarios_empresa u where u.user_id = l.user_id and u.empresa_id = l.empresa_id and u.ativo
  ) c on true
  where l.user_id = auth.uid()
$$;

revoke all on function app.pode_dispensar_2fa(uuid) from public;
revoke all on function public.meu_login_local() from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function app.dominio_login_local() to authenticated;
    grant execute on function app.dispensa_2fa_valida() to authenticated;
    grant execute on function public.registrar_login_local(uuid, uuid, text, text, text, text[], uuid, boolean) to authenticated;
    grant execute on function public.login_local_da_empresa(uuid, uuid) to authenticated;
    grant execute on function public.exigir_troca_senha(uuid, uuid) to authenticated;
    grant execute on function public.definir_dispensa_2fa(uuid, uuid, boolean) to authenticated;
    grant execute on function public.meu_login_local() to authenticated;
  end if;
end $$;

select app.travar_referencias();
