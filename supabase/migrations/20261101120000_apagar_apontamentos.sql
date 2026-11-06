-- Apagar apontamentos (pedido do Nicolas, 2026-11-01).
-- Excluir um lançamento já desfazia tudo pelos triggers (ovos saem do estoque, ração e medicamento voltam,
-- totais do dia e peixes dos dias seguintes recalculam), mas qualquer um com apontamentos.editar apagava
-- qualquer lançamento, de qualquer data, sem volta. Agora:
--   - excluir_lancamento guarda o lançamento inteiro na lixeira (ração por tipo, checklist, medicação e causas)
--     e só então apaga; restaurar_lancamento lança de novo a partir da lixeira;
--   - gerente da piscicultura e master (lotes.editar) apagam qualquer lançamento; tratador e apontador só o que
--     eles mesmos lançaram hoje (para corrigir o erro na hora), regra também no RLS para quem chama a API direto;
--   - o dia inteiro (apontamentos_diarios) só sai direto com lotes.editar; o dia que fica sem lançamentos
--     continua sumindo sozinho pelo trigger, agora security definer.
-- O histórico de alterações (audit_log) já registra quem apagou e quando. Teste: supabase/tests/99_apagar_apontamentos.sql.

-- Quem pode mexer (excluir ou editar) um lançamento: gerente/master qualquer um, tratador só o que fez hoje.
create or replace function app.pode_mexer_lancamento(p_empresa uuid, p_created_by uuid, p_created_at timestamptz)
returns boolean language sql stable set search_path = public as $$
  select app.pode(p_empresa, 'lotes.editar')
      or (p_created_by = auth.uid()
          and (p_created_at at time zone coalesce(app.fuso_empresa(p_empresa), 'America/Manaus'))::date = app.hoje(p_empresa)
          and app.pode(p_empresa, 'apontamentos.editar'))
$$;

drop policy escrita_apagar on apontamento_lancamentos;
create policy escrita_apagar on apontamento_lancamentos as restrictive for delete
  using (app.pode_mexer_lancamento(empresa_id, created_by, created_at));

-- Editar também restrito: tratador só o que fez hoje, gerente/master qualquer um.
drop policy escrita_alterar on apontamento_lancamentos;
create policy escrita_alterar on apontamento_lancamentos as restrictive for update
  using (app.pode_mexer_lancamento(empresa_id, created_by, created_at))
  with check (app.pode_mexer_lancamento(empresa_id, created_by, created_at));

drop policy escrita_apagar on apontamentos_diarios;
create policy escrita_apagar on apontamentos_diarios as restrictive for delete
  using (app.pode(empresa_id, 'lotes.editar'));

-- O total do dia apaga o dia que ficou sem lançamentos: roda como dono para o tratador poder desfazer o seu.
alter function app.totalizar_lancamento() security definer;

-- ---------------------------------------------------------------------------
-- Lixeira
-- ---------------------------------------------------------------------------
create table apontamentos_lixeira (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lancamento_id uuid not null,                    -- id que o lançamento tinha (ele não existe mais)
  lote_id uuid not null references lotes(id) on delete cascade,
  viveiro_id uuid not null references viveiros(id) on delete cascade,
  data date not null,
  turno text not null,
  ovos integer not null,
  mortes integer not null,
  descartes integer not null,
  racao_kg numeric(10,3) not null,
  dados jsonb not null,                           -- {lancamento, racoes, checklist, medicacoes} para restaurar
  motivo text,
  lancado_por uuid,
  lancado_em timestamptz,
  excluido_por uuid,
  excluido_em timestamptz not null default now(),
  restaurado_por uuid,
  restaurado_em timestamptz,
  restaurado_lancamento_id uuid
);
create index on apontamentos_lixeira (empresa_id, excluido_em desc);
create index on apontamentos_lixeira (lote_id);
create index on apontamentos_lixeira (viveiro_id);

-- Só leitura pela API: quem grava são as funções abaixo.
alter table apontamentos_lixeira enable row level security;
create policy membros on apontamentos_lixeira for select
  using (empresa_id in (select app.minhas_empresas()));

create or replace function public.excluir_lancamento(p_lancamento uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  l apontamento_lancamentos%rowtype;
  a apontamentos_diarios%rowtype;
  v_id uuid;
begin
  select * into l from apontamento_lancamentos where id = p_lancamento for update;
  if not found or not app.pode_algum(l.empresa_id, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não tem permissão para excluir apontamentos' using errcode = 'insufficient_privilege';
  end if;
  if not app.pode_mexer_lancamento(l.empresa_id, l.created_by, l.created_at) then
    raise exception 'Você só pode excluir os lançamentos que fez hoje. Para os outros, peça ao gerente da piscicultura ou ao master'
      using errcode = 'insufficient_privilege';
  end if;
  select * into a from apontamentos_diarios where id = l.apontamento_id;

  insert into apontamentos_lixeira (empresa_id, lancamento_id, lote_id, viveiro_id, data, turno, ovos, mortes, descartes, racao_kg,
                                    dados, motivo, lancado_por, lancado_em, excluido_por)
  values (l.empresa_id, l.id, a.lote_id, a.viveiro_id, a.data, l.turno, l.ovos, l.mortes, l.descartes, l.racao_kg,
          jsonb_build_object(
            'lancamento', to_jsonb(l),
            'racoes', coalesce((select jsonb_agg(jsonb_build_object('produto_id', r.produto_id, 'deposito_id', r.deposito_id, 'kg', r.kg))
                                from apontamento_racoes r where r.lancamento_id = l.id), '[]'),
            'checklist', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'ok', c.ok, 'valor', c.valor, 'observacao', c.observacao))
                                   from apontamento_checklist c where c.lancamento_id = l.id), '[]'),
            'medicacoes', coalesce((select jsonb_agg(jsonb_build_object('medicamento_id', e.medicamento_id, 'dias', e.dias_tratamento,
                                      'dose_por_unidade', e.dose_por_unidade, 'agua_l', e.agua_l, 'quantidade', e.quantidade, 'observacoes', e.observacoes))
                                    from eventos_sanitarios e where e.lancamento_id = l.id and e.medicamento_id is not null), '[]')),
          nullif(trim(p_motivo), ''), l.created_by, l.created_at, auth.uid())
  returning id into v_id;

  -- Os triggers desfazem o resto: ovos, ração, medicação, total do dia e peixes dos dias seguintes.
  -- Se os ovos já foram classificados ou vendidos, conferir_saldo_peixe recusa e nada fica na lixeira.
  delete from apontamento_lancamentos where id = l.id;
  return v_id;
end $$;

create or replace function public.restaurar_lancamento(p_lixeira uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  x apontamentos_lixeira%rowtype;
  l jsonb;
  v_id uuid;
  m jsonb;
begin
  select * into x from apontamentos_lixeira where id = p_lixeira for update;
  if not found or not app.pode_algum(x.empresa_id, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não tem permissão para restaurar apontamentos' using errcode = 'insufficient_privilege';
  end if;
  if not app.pode_mexer_lancamento(x.empresa_id, x.excluido_por, x.excluido_em) then
    raise exception 'Você só pode restaurar o que você mesmo excluiu hoje. Para os outros, peça ao gerente da piscicultura ou ao master'
      using errcode = 'insufficient_privilege';
  end if;
  if x.restaurado_em is not null then
    raise exception 'Esse lançamento já foi restaurado' using errcode = 'check_violation';
  end if;
  l := x.dados->'lancamento';

  v_id := registrar_apontamento(x.empresa_id, x.lote_id, x.viveiro_id, x.data, x.turno, x.ovos, x.mortes, x.descartes, x.racao_kg,
                                (l->>'agua_l')::numeric, l->>'observacoes', null, coalesce(l->>'origem', 'web'));
  if coalesce(l->'causas_morte', '{}') <> '{}' then
    update apontamento_lancamentos set causas_morte = l->'causas_morte' where id = v_id;
  end if;
  -- item do checklist ou medicamento apagado do cadastro depois da exclusão fica de fora
  perform completar_lancamento(v_id, x.dados->'racoes',
    coalesce((select jsonb_agg(c) from jsonb_array_elements(x.dados->'checklist') c
              where exists (select 1 from checklist_itens i where i.id = (c->>'item_id')::uuid and i.empresa_id = x.empresa_id)), '[]'));
  for m in select e from jsonb_array_elements(x.dados->'medicacoes') e
           where exists (select 1 from medicamentos md where md.id = (e->>'medicamento_id')::uuid and md.empresa_id = x.empresa_id) loop
    perform registrar_medicacao(x.empresa_id, x.viveiro_id, x.data, (m->>'medicamento_id')::uuid, coalesce((m->>'dias')::int, 1),
                                (m->>'dose_por_unidade')::numeric, (m->>'agua_l')::numeric, (m->>'quantidade')::numeric,
                                m->>'observacoes', v_id);
  end loop;

  update apontamentos_lixeira set restaurado_em = now(), restaurado_por = auth.uid(), restaurado_lancamento_id = v_id
  where id = x.id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Editar lançamento
-- ---------------------------------------------------------------------------
-- Altera os campos do lançamento, recalcula estoque e totais pelos triggers,
-- e refaz ração por tipo e checklist. Medicação não é tocada (editada na Sanidade).
-- Data e viveiro não mudam (para isso: exclua e lance de novo).
create or replace function public.editar_lancamento(
  p_lancamento uuid,
  p_turno text,
  p_ovos integer,
  p_mortes integer,
  p_descartes integer,
  p_racao_kg numeric,
  p_agua_l numeric default null,
  p_observacoes text default '',
  p_causas jsonb default '{}',
  p_racoes jsonb default '[]',
  p_checklist jsonb default '[]'
) returns void language plpgsql security definer set search_path = public as $$
declare
  l apontamento_lancamentos%rowtype;
begin
  select * into l from apontamento_lancamentos where id = p_lancamento for update;
  if not found or not app.pode_algum(l.empresa_id, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não tem permissão para editar apontamentos' using errcode = 'insufficient_privilege';
  end if;
  if not app.pode_mexer_lancamento(l.empresa_id, l.created_by, l.created_at) then
    raise exception 'Você só pode editar os lançamentos que fez hoje. Para os outros, peça ao gerente da piscicultura ou ao master'
      using errcode = 'insufficient_privilege';
  end if;

  -- Apaga ração e checklist existentes: o trigger da ração devolve o kg ao estoque.
  delete from apontamento_racoes where lancamento_id = l.id;
  delete from apontamento_checklist where lancamento_id = l.id;

  -- Atualiza o lançamento. Os triggers:
  --   lancamento_para_estoque: refaz o estoque de ovos (só roda quando ovos muda)
  --   totalizar_lancamento: recalcula o total do dia
  --   conferir_saldo_peixe: barra se os ovos já classificados iriam ficar negativos
  update apontamento_lancamentos set
    turno = p_turno,
    ovos = p_ovos,
    mortes = p_mortes,
    descartes = p_descartes,
    racao_kg = p_racao_kg,
    agua_l = p_agua_l,
    observacoes = nullif(trim(p_observacoes), ''),
    causas_morte = case when p_causas = '{}' or p_causas is null then '{}' else p_causas end
  where id = l.id;

  -- Reinsere ração por tipo e checklist: completar_lancamento confere saldo de ração e insere.
  if jsonb_array_length(coalesce(p_racoes, '[]')) > 0 or jsonb_array_length(coalesce(p_checklist, '[]')) > 0 then
    perform completar_lancamento(l.id, p_racoes, p_checklist);
  end if;
end $$;

revoke all on function app.pode_mexer_lancamento(uuid, uuid, timestamptz) from public;
revoke all on function public.excluir_lancamento(uuid, text) from public;
revoke all on function public.restaurar_lancamento(uuid) from public;
revoke all on function public.editar_lancamento(uuid, text, integer, integer, integer, numeric, numeric, text, jsonb, jsonb, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on apontamentos_lixeira to authenticated;
    grant execute on function app.pode_mexer_lancamento(uuid, uuid, timestamptz) to authenticated;
    grant execute on function public.excluir_lancamento(uuid, text) to authenticated;
    grant execute on function public.restaurar_lancamento(uuid) to authenticated;
    grant execute on function public.editar_lancamento(uuid, text, integer, integer, integer, numeric, numeric, text, jsonb, jsonb, jsonb) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Um lançamento por turno por viveiro/dia (apontamento_id = viveiro + data).
-- Antes dava para lançar vários no mesmo turno; agora dá para editar.
-- ---------------------------------------------------------------------------
create unique index lancamento_turno_unico on apontamento_lancamentos (apontamento_id, turno);

-- Adapta o app de campo: p_forcar agora substitui o lançamento existente em vez de duplicar.
create or replace function public.registrar_lancamento_campo(
  p_empresa uuid,
  p_viveiro uuid,
  p_data date,
  p_turno text,
  p_ovos integer,
  p_mortes integer default 0,
  p_descartes integer default 0,
  p_racao_kg numeric default 0,
  p_observacoes text default null,
  p_client_id uuid default null,
  p_racoes jsonb default '[]',
  p_checklist jsonb default '[]',
  p_medicacao jsonb default null,
  p_forcar boolean default false,
  p_agua_l numeric default null
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_existentes jsonb;
  v_checklist jsonb;
  v_old uuid;
begin
  if p_agua_l is not null and p_agua_l < 0 then
    raise exception 'Água inválida' using errcode = 'check_violation';
  end if;
  if p_client_id is null then
    raise exception 'Identificador do envio obrigatório' using errcode = 'check_violation';
  end if;
  select id into v_id from apontamento_lancamentos where client_id = p_client_id and empresa_id = p_empresa;
  if found then return jsonb_build_object('id', v_id, 'situacao', 'repetido'); end if;

  if jsonb_typeof(coalesce(p_racoes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_checklist, '[]')) <> 'array'
     or (p_medicacao is not null and jsonb_typeof(p_medicacao) not in ('object', 'null')) then
    raise exception 'Formato inválido' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_viveiro::text || p_data::text || coalesce(p_turno, ''), 0));

  if coalesce(p_forcar, false) then
    -- Turno único: forçar agora apaga o existente e insere o novo (os triggers desfazem estoque/totais).
    select l.id into v_old
    from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where d.empresa_id = p_empresa and d.viveiro_id = p_viveiro and d.data = p_data and l.turno = p_turno;
    if found then
      delete from apontamento_lancamentos where id = v_old;
    end if;
  else
    select jsonb_agg(jsonb_build_object('origem', l.origem, 'ovos', l.ovos, 'mortes', l.mortes,
                                        'descartes', l.descartes, 'racao_kg', l.racao_kg, 'criado_em', l.created_at)
                     order by l.created_at)
      into v_existentes
    from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where d.empresa_id = p_empresa and d.viveiro_id = p_viveiro and d.data = p_data and l.turno = p_turno;
    if v_existentes is not null then
      return jsonb_build_object('situacao', 'conflito', 'existentes', v_existentes);
    end if;
  end if;

  begin
    v_id := registrar_apontamento(p_empresa, null, p_viveiro, p_data, p_turno, p_ovos, p_mortes, p_descartes,
                                  p_racao_kg, p_agua_l, p_observacoes, p_client_id, 'app');
  exception when unique_violation then
    select id into v_id from apontamento_lancamentos where client_id = p_client_id and empresa_id = p_empresa;
    if found then return jsonb_build_object('id', v_id, 'situacao', 'repetido'); end if;
    raise;
  end;

  select coalesce(jsonb_agg(x), '[]') into v_checklist
  from jsonb_array_elements(coalesce(p_checklist, '[]')) x
  where exists (select 1 from checklist_itens c where c.id = (x->>'item_id')::uuid and c.empresa_id = p_empresa and c.ativo);

  if jsonb_array_length(coalesce(p_racoes, '[]')) > 0 or jsonb_array_length(v_checklist) > 0 then
    perform completar_lancamento(v_id, coalesce(p_racoes, '[]'), v_checklist);
  end if;

  if p_medicacao is not null and jsonb_typeof(p_medicacao) = 'object' then
    perform registrar_medicacao(p_empresa, p_viveiro, p_data, (p_medicacao->>'medicamento_id')::uuid,
      coalesce((p_medicacao->>'dias')::int, 1), (p_medicacao->>'dose_por_unidade')::numeric,
      (p_medicacao->>'agua_l')::numeric, (p_medicacao->>'quantidade')::numeric, null, v_id);
  end if;

  return jsonb_build_object('id', v_id, 'situacao', 'novo');
end $$;

select app.travar_referencias();
