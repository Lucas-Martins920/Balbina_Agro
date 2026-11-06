-- Usuários e permissões: usuário master por empresa, convites, perfis com permissões por módulo
-- e escrita no banco travada pela permissão do módulo (policies restritivas).
--
-- Chaves de permissão: "<modulo>.ver" e "<modulo>.editar" (vendas usa lancar/cancelar/precos,
-- cobrancas usa emitir, PDV usa pdv.operar, fechamento usa financeiro.fechar).
-- O catálogo exibido na tela fica em src/lib/permissoes.ts; os perfis prontos ficam aqui.

-- ---------------------------------------------------------------------------
-- 1. Membros: e-mail, bloqueio e perfis novos
-- ---------------------------------------------------------------------------

alter table usuarios_empresa
  add column email text,
  add column ativo boolean not null default true,
  add column updated_at timestamptz not null default now();

alter table usuarios_empresa drop constraint usuarios_empresa_perfil_check;
alter table usuarios_empresa add constraint usuarios_empresa_perfil_check
  check (perfil in ('sem_restricao','cadastros','visualizacao','personalizado','apontador','vendedor','caixa','financeiro'));

-- Preenche o e-mail de quem já estava cadastrado (no Supabase o e-mail mora em auth.users)
do $$
begin
  if to_regclass('auth.users') is not null then
    execute 'update usuarios_empresa u set email = lower(a.email) from auth.users a where a.id = u.user_id and u.email is null';
  end if;
end $$;

-- Usuário bloqueado deixa de enxergar a empresa
create or replace function app.minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from usuarios_empresa where user_id = auth.uid() and ativo
$$;

-- Permissões que cada perfil pronto dá. '*.ver' = ver todos os módulos.
create or replace function app.permissoes_perfil(p_perfil text) returns text[]
language sql immutable as $$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver']
    when 'vendedor' then array['vendas.lancar', 'pdv.operar', 'estoque.ver', 'contas-a-receber.ver', 'cobrancas.ver']
    when 'caixa' then array['pdv.operar', 'vendas.ver']
    when 'financeiro' then array['contas-a-pagar.editar', 'contas-a-receber.editar', 'contas.editar', 'cobrancas.emitir',
      'cartoes.editar', 'conciliacao.editar', 'fluxo-de-caixa.ver', 'relatorios.editar', 'financeiro.fechar', 'custo-do-kg.ver']
    else array[]::text[]
  end
$$;

-- Regra única de permissão (a mesma de src/lib/permissoes.ts):
-- master e "sem restrição" podem tudo; "x.ver" vale para quem tem qualquer chave do módulo x.
create or replace function app.pode(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from usuarios_empresa u
    where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
      and (u.is_admin or u.perfil = 'sem_restricao' or exists (
        select 1 from unnest(app.permissoes_perfil(u.perfil) || u.permissoes) c
        where c = p_perm
           or (p_perm like '%.ver' and (c = '*.ver' or split_part(c, '.', 1) = split_part(p_perm, '.', 1)))))
  )
$$;

create or replace function app.pode_algum(p_empresa uuid, p_perms text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(p_perms) p where app.pode(p_empresa, p))
$$;

create or replace function app.e_master(p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios_empresa
                 where empresa_id = p_empresa and user_id = auth.uid() and ativo and is_admin)
$$;

-- Nome antigo, usado por fechar_mes/reabrir_mes
create or replace function app.tem_permissao(p_empresa uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select app.pode(p_empresa, p_perm)
$$;

-- Para o app montar menu e telas
create or replace function public.minhas_permissoes(p_empresa uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'master', u.is_admin,
    'perfil', u.perfil,
    'total', u.is_admin or u.perfil = 'sem_restricao',
    'chaves', to_jsonb(app.permissoes_perfil(u.perfil) || u.permissoes))
  from usuarios_empresa u
  where u.empresa_id = p_empresa and u.user_id = auth.uid() and u.ativo
$$;

create or replace function public.permissoes_dos_perfis() returns jsonb
language sql immutable as $$
  select jsonb_object_agg(p, to_jsonb(app.permissoes_perfil(p)))
  from unnest(array['visualizacao','cadastros','apontador','vendedor','caixa','financeiro']) p
$$;

-- ---------------------------------------------------------------------------
-- 2. Convites e gestão de usuários (só o master)
-- ---------------------------------------------------------------------------

create table convites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  perfil text not null check (perfil in ('sem_restricao','cadastros','visualizacao','personalizado','apontador','vendedor','caixa','financeiro')),
  is_admin boolean not null default false,
  permissoes text[] not null default '{}',
  convidado_por uuid,
  created_at timestamptz not null default now(),
  unique (empresa_id, email)
);

alter table convites enable row level security;
create policy membros on convites for select using (app.e_master(empresa_id));

create or replace function app.valida_acesso(p_perfil text, p_permissoes text[]) returns void
language plpgsql immutable as $$
begin
  if p_perfil not in ('sem_restricao','cadastros','visualizacao','personalizado','apontador','vendedor','caixa','financeiro') then
    raise exception 'Perfil inválido: %', p_perfil using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(coalesce(p_permissoes, '{}')) c where c !~ '^[a-z-]+\.[a-z]+$') then
    raise exception 'Permissão em formato inválido' using errcode = 'check_violation';
  end if;
end $$;

create or replace function app.exige_master(p_empresa uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode gerenciar usuários' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Sempre sobra pelo menos um master ativo
create or replace function app.exige_um_master(p_empresa uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from usuarios_empresa where empresa_id = p_empresa and is_admin and ativo) then
    raise exception 'A empresa precisa de pelo menos um usuário master ativo' using errcode = 'check_violation';
  end if;
end $$;

-- Convida por e-mail. Se a pessoa já tem conta confirmada, entra na hora; senão fica o convite,
-- aceito no primeiro login com esse e-mail. Retorna 'adicionado' ou 'convidado'.
create or replace function public.convidar_usuario(p_empresa uuid, p_email text, p_perfil text,
                                                   p_permissoes text[] default '{}', p_master boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
begin
  perform app.exige_master(p_empresa);
  perform app.valida_acesso(p_perfil, p_permissoes);
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = 'check_violation';
  end if;
  if exists (select 1 from usuarios_empresa where empresa_id = p_empresa and email = v_email) then
    raise exception 'Este e-mail já tem acesso à empresa' using errcode = 'unique_violation';
  end if;

  select id into v_user from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_user is not null then
    insert into usuarios_empresa (empresa_id, user_id, email, perfil, is_admin, permissoes)
    values (p_empresa, v_user, v_email, p_perfil, coalesce(p_master, false), coalesce(p_permissoes, '{}'))
    on conflict (empresa_id, user_id) do nothing;
    if found then return 'adicionado'; end if;
    raise exception 'Este usuário já tem acesso à empresa' using errcode = 'unique_violation';
  end if;

  insert into convites (empresa_id, email, perfil, is_admin, permissoes, convidado_por)
  values (p_empresa, v_email, p_perfil, coalesce(p_master, false), coalesce(p_permissoes, '{}'), auth.uid())
  on conflict (empresa_id, email) do update
    set perfil = excluded.perfil, is_admin = excluded.is_admin, permissoes = excluded.permissoes,
        convidado_por = excluded.convidado_por, created_at = now();
  return 'convidado';
end $$;

-- Chamado depois do login: entra nas empresas que convidaram o e-mail confirmado do usuário.
create or replace function public.aceitar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_n int;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  update usuarios_empresa set email = v_email where user_id = auth.uid() and email is distinct from v_email;

  insert into usuarios_empresa (empresa_id, user_id, email, perfil, is_admin, permissoes)
  select c.empresa_id, auth.uid(), v_email, c.perfil, c.is_admin, c.permissoes from convites c where c.email = v_email
  on conflict (empresa_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  delete from convites where email = v_email;
  return v_n;
end $$;

create or replace function public.cancelar_convite(p_convite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_empresa uuid;
begin
  select empresa_id into v_empresa from convites where id = p_convite;
  if v_empresa is null then raise exception 'Convite não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exige_master(v_empresa);
  delete from convites where id = p_convite;
end $$;

create or replace function public.atualizar_usuario(p_empresa uuid, p_user uuid, p_perfil text, p_permissoes text[],
                                                    p_master boolean, p_ativo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.exige_master(p_empresa);
  perform app.valida_acesso(p_perfil, p_permissoes);
  update usuarios_empresa
     set perfil = p_perfil, permissoes = coalesce(p_permissoes, '{}'), is_admin = coalesce(p_master, false),
         ativo = coalesce(p_ativo, true), updated_at = now()
   where empresa_id = p_empresa and user_id = p_user;
  if not found then raise exception 'Usuário não encontrado nesta empresa' using errcode = 'no_data_found'; end if;
  perform app.exige_um_master(p_empresa);
end $$;

create or replace function public.remover_usuario(p_empresa uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.exige_master(p_empresa);
  delete from usuarios_empresa where empresa_id = p_empresa and user_id = p_user;
  if not found then raise exception 'Usuário não encontrado nesta empresa' using errcode = 'no_data_found'; end if;
  perform app.exige_um_master(p_empresa);
end $$;

-- Quem cria a empresa vira master e já fica com o e-mail registrado
create or replace function public.criar_empresa(p_cnpj text, p_razao_social text, p_nome_fantasia text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
begin
  if v_uid is null then
    raise exception 'Faça login para criar uma empresa' using errcode = 'insufficient_privilege';
  end if;
  if v_cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ deve ter 14 dígitos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from empresas where cnpj = v_cnpj) then
    raise exception 'Já existe uma empresa com este CNPJ' using errcode = 'unique_violation';
  end if;

  insert into empresas (cnpj, razao_social, nome_fantasia)
  values (v_cnpj, trim(p_razao_social), nullif(trim(p_nome_fantasia), ''))
  returning id into v_id;

  insert into usuarios_empresa (empresa_id, user_id, email, perfil, is_admin)
  values (v_id, v_uid, (select lower(email) from auth.users where id = v_uid), 'sem_restricao', true);

  perform app.carregar_padroes(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tabelas do setor: antes qualquer membro podia se dar master ou apagar a empresa
-- ---------------------------------------------------------------------------

drop policy membros on usuarios_empresa;
create policy membros on usuarios_empresa for select using (empresa_id in (select app.minhas_empresas()));

drop policy membros on empresas;
create policy membros on empresas for select using (id in (select app.minhas_empresas()));
create policy editar on empresas for update
  using (app.pode(id, 'configuracoes.editar')) with check (app.pode(id, 'configuracoes.editar'));

drop policy membros on audit_log;
create policy membros on audit_log for select using (empresa_id in (select app.minhas_empresas()));

-- ---------------------------------------------------------------------------
-- 4. Escrita por módulo: policies restritivas somam-se à policy "membros"
-- ---------------------------------------------------------------------------

-- Títulos: contas a pagar/receber e os módulos que geram títulos (venda, cartão, compra, conciliação)
create or replace function app.pode_titulo_tipo(p_empresa uuid, p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'pagar' then app.pode_algum(p_empresa, array['contas-a-pagar.editar', 'conciliacao.editar', 'cartoes.editar',
                                                       'racao.editar', 'estoque.editar', 'lotes.editar'])
    when 'receber' then app.pode_algum(p_empresa, array['contas-a-receber.editar', 'conciliacao.editar', 'vendas.lancar', 'pdv.operar'])
    else false
  end
$$;

create or replace function app.pode_titulo(p_agendamento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select app.pode_titulo_tipo(empresa_id, tipo) from agendamentos where id = p_agendamento), false)
$$;

do $$
declare
  r record;
  v_cond text;
begin
  for r in select * from (values
    ('setores', array['piscicultura.editar']),
    ('viveiros', array['piscicultura.editar']),
    ('lotes', array['lotes.editar']),
    ('lote_alocacoes', array['lotes.editar']),
    ('especies', array['lotes.editar']),
    ('apontamentos_diarios', array['apontamentos.editar', 'lotes.editar']),
    ('eventos_sanitarios', array['sanidade.editar']),
    ('contatos', array['contas-a-pagar.editar', 'contas-a-receber.editar', 'vendas.lancar', 'pdv.operar', 'cobrancas.emitir',
                       'configuracoes.editar', 'estoque.editar', 'racao.editar']),
    ('categorias', array['configuracoes.editar']),
    ('centros_custo', array['configuracoes.editar']),
    ('classes_peixe', array['configuracoes.editar', 'estoque.editar']),
    ('contas_financeiras', array['contas.editar', 'cartoes.editar', 'cobrancas.emitir', 'pdv.operar']),
    ('recorrencia_reajustes', array['contas-a-pagar.editar', 'contas-a-receber.editar']),
    ('periodos_fechados', array['financeiro.fechar']),
    ('transferencias', array['contas.editar', 'conciliacao.editar', 'cartoes.editar']),
    ('importacoes_extrato', array['conciliacao.editar']),
    ('movimentos_bancarios', array['conciliacao.editar']),
    ('conciliacoes', array['conciliacao.editar']),
    ('regras_conciliacao', array['conciliacao.editar']),
    ('perfis_cobranca', array['cobrancas.emitir']),
    ('cobrancas', array['cobrancas.emitir']),
    ('notas_fiscais', array['vendas.lancar', 'pdv.operar']),
    ('remessas_cnab', array['contas-a-pagar.editar']),
    ('orcamentos', array['relatorios.editar']),
    ('documentos', array['contas-a-pagar.editar', 'contas-a-receber.editar', 'conciliacao.editar']),
    ('depositos', array['estoque.editar', 'racao.editar']),
    ('produtos', array['estoque.editar', 'racao.editar', 'vendas.precos']),
    ('movimentos_estoque', array['estoque.editar', 'racao.editar', 'apontamentos.editar', 'sanidade.editar', 'vendas.lancar', 'pdv.operar']),
    ('formulas_racao', array['racao.editar']),
    ('ordens_producao_racao', array['racao.editar']),
    ('pedidos_venda', array['vendas.lancar', 'pdv.operar']),
    ('tabelas_preco', array['vendas.precos']),
    ('custos_lote_mensal', array['custo-do-kg.editar'])
  ) t(tabela, perms)
  loop
    v_cond := format('app.pode_algum(empresa_id, %L::text[])', r.perms);
    execute format('create policy escrita_inserir on %I as restrictive for insert with check (%s)', r.tabela, v_cond);
    execute format('create policy escrita_alterar on %I as restrictive for update using (%s) with check (%s)', r.tabela, v_cond, v_cond);
    execute format('create policy escrita_apagar on %I as restrictive for delete using (%s)', r.tabela, v_cond);
  end loop;
end $$;

-- Títulos e o que pendura neles seguem o tipo do título
create policy escrita_inserir on agendamentos as restrictive for insert with check (app.pode_titulo_tipo(empresa_id, tipo));
create policy escrita_alterar on agendamentos as restrictive for update
  using (app.pode_titulo_tipo(empresa_id, tipo)) with check (app.pode_titulo_tipo(empresa_id, tipo));
create policy escrita_apagar on agendamentos as restrictive for delete using (app.pode_titulo_tipo(empresa_id, tipo));

create policy escrita_inserir on recorrencias as restrictive for insert
  with check (app.pode(empresa_id, case tipo when 'pagar' then 'contas-a-pagar.editar' else 'contas-a-receber.editar' end));
create policy escrita_alterar on recorrencias as restrictive for update
  using (app.pode(empresa_id, case tipo when 'pagar' then 'contas-a-pagar.editar' else 'contas-a-receber.editar' end));
create policy escrita_apagar on recorrencias as restrictive for delete
  using (app.pode(empresa_id, case tipo when 'pagar' then 'contas-a-pagar.editar' else 'contas-a-receber.editar' end));

do $$
declare t text;
begin
  foreach t in array array['agendamento_rateios', 'baixas'] loop
    execute format('create policy escrita_inserir on %I as restrictive for insert with check (app.pode_titulo(agendamento_id))', t);
    execute format('create policy escrita_alterar on %I as restrictive for update using (app.pode_titulo(agendamento_id)) with check (app.pode_titulo(agendamento_id))', t);
    execute format('create policy escrita_apagar on %I as restrictive for delete using (app.pode_titulo(agendamento_id))', t);
  end loop;
end $$;

-- Cancelar pedido exige vendas.cancelar
create policy cancelar on pedidos_venda as restrictive for update
  using (true) with check (status <> 'cancelado' or app.pode(empresa_id, 'vendas.cancelar'));

-- Tabelas filhas sem empresa_id: valem as permissões do pai
create policy escrita_inserir on apontamento_ovos as restrictive for insert with check (
  exists (select 1 from apontamentos_diarios a where a.id = apontamento_id and app.pode(a.empresa_id, 'apontamentos.editar')));
create policy escrita_alterar on apontamento_ovos as restrictive for update using (
  exists (select 1 from apontamentos_diarios a where a.id = apontamento_id and app.pode(a.empresa_id, 'apontamentos.editar')));
create policy escrita_apagar on apontamento_ovos as restrictive for delete using (
  exists (select 1 from apontamentos_diarios a where a.id = apontamento_id and app.pode(a.empresa_id, 'apontamentos.editar')));

create policy escrita_inserir on pedido_itens as restrictive for insert with check (
  exists (select 1 from pedidos_venda p where p.id = pedido_id and app.pode_algum(p.empresa_id, array['vendas.lancar', 'pdv.operar'])));
create policy escrita_alterar on pedido_itens as restrictive for update using (
  exists (select 1 from pedidos_venda p where p.id = pedido_id and app.pode_algum(p.empresa_id, array['vendas.lancar', 'pdv.operar'])));
create policy escrita_apagar on pedido_itens as restrictive for delete using (
  exists (select 1 from pedidos_venda p where p.id = pedido_id and app.pode_algum(p.empresa_id, array['vendas.lancar', 'pdv.operar'])));

create policy escrita_inserir on formula_itens as restrictive for insert with check (
  exists (select 1 from formulas_racao f where f.id = formula_id and app.pode(f.empresa_id, 'racao.editar')));
create policy escrita_alterar on formula_itens as restrictive for update using (
  exists (select 1 from formulas_racao f where f.id = formula_id and app.pode(f.empresa_id, 'racao.editar')));
create policy escrita_apagar on formula_itens as restrictive for delete using (
  exists (select 1 from formulas_racao f where f.id = formula_id and app.pode(f.empresa_id, 'racao.editar')));

drop policy membros_escrita on curvas_crescimento;
create policy membros_escrita on curvas_crescimento for all
  using (exists (select 1 from especies g where g.id = especie_id and g.empresa_id in (select app.minhas_empresas())))
  with check (exists (select 1 from especies g where g.id = especie_id and app.pode(g.empresa_id, 'lotes.editar')));

-- ---------------------------------------------------------------------------
-- 5. Dados derivados: triggers e rotinas internas escrevem em nome do sistema
-- (quem lança o apontamento move o estoque mesmo sem permissão de estoque)
-- ---------------------------------------------------------------------------

alter function app.atualiza_saldo_agendamento() security definer set search_path = public;
alter function app.ovos_para_estoque() security definer set search_path = public;
alter function app.produtos_da_classe() security definer set search_path = public;
alter function app.produto_base_peixe(uuid) security definer set search_path = public;
alter function app.deposito_ovos(uuid) security definer set search_path = public;
alter function app.cc_automatico() security definer set search_path = public;
alter function app.recalcular_peixes(uuid, uuid, date) security definer set search_path = public;
alter function app.atualizar_custo_medio(uuid, numeric, numeric) security definer set search_path = public;

-- Abrir contas a pagar/receber ou o fluxo de caixa gera os títulos recorrentes que faltam,
-- mesmo para quem só tem permissão de ver.
alter function public.gerar_recorrencias(uuid) rename to gerar_recorrencias_base;
alter function public.gerar_recorrencias_base(uuid) set schema app;
revoke all on function app.gerar_recorrencias_base(uuid) from public;

create or replace function public.gerar_recorrencias(p_empresa uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if p_empresa not in (select app.minhas_empresas()) then return 0; end if;
  return app.gerar_recorrencias_base(p_empresa);
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.convidar_usuario(uuid, text, text, text[], boolean) from public;
revoke all on function public.aceitar_convites() from public;
revoke all on function public.cancelar_convite(uuid) from public;
revoke all on function public.atualizar_usuario(uuid, uuid, text, text[], boolean, boolean) from public;
revoke all on function public.remover_usuario(uuid, uuid) from public;
revoke all on function public.minhas_permissoes(uuid) from public;
revoke all on function public.gerar_recorrencias(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.convidar_usuario(uuid, text, text, text[], boolean) to authenticated;
    grant execute on function public.aceitar_convites() to authenticated;
    grant execute on function public.cancelar_convite(uuid) to authenticated;
    grant execute on function public.atualizar_usuario(uuid, uuid, text, text[], boolean, boolean) to authenticated;
    grant execute on function public.remover_usuario(uuid, uuid) to authenticated;
    grant execute on function public.minhas_permissoes(uuid) to authenticated;
    grant execute on function public.permissoes_dos_perfis() to authenticated;
    grant execute on function public.gerar_recorrencias(uuid) to authenticated;
    grant execute on function app.pode(uuid, text) to authenticated;
    grant execute on function app.pode_algum(uuid, text[]) to authenticated;
    grant execute on function app.e_master(uuid) to authenticated;
    grant execute on function app.permissoes_perfil(text) to authenticated;
    grant execute on function app.pode_titulo_tipo(uuid, text) to authenticated;
    grant execute on function app.pode_titulo(uuid) to authenticated;
    grant execute on function app.valida_acesso(text, text[]) to authenticated;
    grant execute on function app.exige_master(uuid) to authenticated;
    grant execute on function app.exige_um_master(uuid) to authenticated;
  end if;
end $$;
