-- Assistente de início: o passo a passo que leva a piscicultura recém-assinada até o primeiro apontamento.
-- Cada passo se dá por feito sozinho, pelo que já existe no banco (viveiro, lote, estoque inicial...).
-- O usuário master pode pular um passo, esconder o assistente e retomar depois. Quando não falta
-- nenhum passo, concluido_em é gravado e o assistente some de vez, mesmo que algo seja apagado depois.
-- Passos de módulos que o plano não inclui (ex.: contas bancárias no Basic) não contam.

create table assistente_inicio (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  pulados text[] not null default '{}',
  escondido boolean not null default false,
  concluido_em timestamptz,
  updated_at timestamptz not null default now()
);

alter table assistente_inicio enable row level security;
create policy membros on assistente_inicio for select using (empresa_id in (select app.minhas_empresas()));
-- Escrita só pelas funções abaixo, que conferem o master.
revoke insert, update, delete on assistente_inicio from anon, authenticated;

-- Os passos, na ordem em que aparecem, com o módulo do plano de que cada um depende.
create or replace function app.passos_assistente() returns table (id text, modulo text, ordem int)
language sql immutable as $$
  values ('piscicultura', 'piscicultura', 1), ('lotes', 'lotes', 2), ('estoque', 'estoque', 3),
         ('contas', 'contas', 4), ('apontamento', 'apontamentos', 5), ('equipe', 'configuracoes', 6)
$$;

create or replace function app.passo_feito(p_empresa uuid, p_passo text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_passo
    when 'piscicultura' then exists (select 1 from viveiros where empresa_id = p_empresa)
    when 'lotes' then exists (select 1 from lotes where empresa_id = p_empresa)
    -- saldo inicial: ajuste (manual ou pela planilha) ou entrada de compra
    when 'estoque' then exists (select 1 from movimentos_estoque where empresa_id = p_empresa and tipo in ('ajuste', 'entrada_compra'))
    -- a empresa nasce com o "Caixa da piscicultura" zerado: vale saldo inicial, outra conta ou extrato
    when 'contas' then exists (select 1 from contas_financeiras where empresa_id = p_empresa and saldo_inicial_cents <> 0)
      or (select count(*) from contas_financeiras where empresa_id = p_empresa) > 1
      or exists (select 1 from movimentos_bancarios where empresa_id = p_empresa)
    when 'apontamento' then exists (select 1 from apontamentos_diarios where empresa_id = p_empresa)
    when 'equipe' then (select count(*) from usuarios_empresa where empresa_id = p_empresa) > 1
      or exists (select 1 from convites where empresa_id = p_empresa)
    else false
  end
$$;

-- Situação do assistente para a tela. Só o master vê (null para os outros usuários).
create or replace function public.assistente_inicio(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v assistente_inicio;
  v_passos jsonb;
  v_faltam int;
begin
  if not app.e_master(p_empresa) then return null; end if;
  select * into v from assistente_inicio where empresa_id = p_empresa;

  select jsonb_agg(jsonb_build_object('id', p.id, 'feito', app.passo_feito(p_empresa, p.id),
                                      'pulado', p.id = any(coalesce(v.pulados, '{}'))) order by p.ordem)
    into v_passos
  from app.passos_assistente() p
  where app.plano_inclui(p_empresa, p.modulo);

  select count(*) into v_faltam from jsonb_array_elements(v_passos) e
  where not (e->>'feito')::boolean and not (e->>'pulado')::boolean;

  if v.concluido_em is null and v_faltam = 0 then
    insert into assistente_inicio (empresa_id, concluido_em) values (p_empresa, now())
    on conflict (empresa_id) do update set concluido_em = now(), updated_at = now();
    v.concluido_em := now();
  end if;

  return jsonb_build_object('passos', v_passos, 'faltam', v_faltam,
                            'escondido', coalesce(v.escondido, false), 'concluido', v.concluido_em is not null);
end $$;

-- Pular um passo (p_pular = false volta a pedir o passo).
create or replace function public.assistente_pular(p_empresa uuid, p_passo text, p_pular boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master configura o início da empresa' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from app.passos_assistente() where id = p_passo) then
    raise exception 'Passo desconhecido: %', p_passo using errcode = 'check_violation';
  end if;
  insert into assistente_inicio (empresa_id, pulados) values (p_empresa, case when p_pular then array[p_passo] else '{}' end)
  on conflict (empresa_id) do update
    set pulados = case when p_pular then array(select distinct unnest(assistente_inicio.pulados || p_passo))
                       else array_remove(assistente_inicio.pulados, p_passo) end,
        updated_at = now();
end $$;

-- Esconder o assistente do painel ("depois eu vejo") ou trazê-lo de volta. Retomar um concluído reabre e limpa os pulos.
create or replace function public.assistente_esconder(p_empresa uuid, p_esconder boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master configura o início da empresa' using errcode = 'insufficient_privilege';
  end if;
  insert into assistente_inicio (empresa_id, escondido) values (p_empresa, p_esconder)
  on conflict (empresa_id) do update
    set escondido = p_esconder,
        concluido_em = case when p_esconder then assistente_inicio.concluido_em end,
        pulados = case when p_esconder or assistente_inicio.concluido_em is null then assistente_inicio.pulados else '{}' end,
        updated_at = now();
end $$;

-- Empresas que já estavam em uso (viveiro e lote cadastrados) não ganham o assistente de repente.
insert into assistente_inicio (empresa_id, concluido_em)
select e.id, now() from empresas e
where exists (select 1 from viveiros g where g.empresa_id = e.id) and exists (select 1 from lotes l where l.empresa_id = e.id)
on conflict do nothing;

revoke all on function app.passos_assistente() from public;
revoke all on function app.passo_feito(uuid, text) from public;
revoke all on function public.assistente_inicio(uuid) from public;
revoke all on function public.assistente_pular(uuid, text, boolean) from public;
revoke all on function public.assistente_esconder(uuid, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.assistente_inicio(uuid) to authenticated;
    grant execute on function public.assistente_pular(uuid, text, boolean) to authenticated;
    grant execute on function public.assistente_esconder(uuid, boolean) to authenticated;
  end if;
end $$;

select app.travar_referencias();
