-- Água volta ao apontamento como campo opcional, ligado por empresa (pedido do Nicolas em 2026-10-30).
-- Saiu em 2026-10-28 porque nem toda piscicultura mede a água todo dia; quem mede ganha o sinal mais precoce de
-- problema no lote (a queda do consumo de água vem antes da queda de engorda) nos alertas de Previsões.
-- A coluna apontamento_lancamentos.agua_l nunca saiu; registrar_apontamento já recebia p_agua_l.

alter table empresas add column apontar_qualidade_agua boolean not null default false;

-- App de campo: mesmo corpo da 20261029103100, com p_agua_l no fim (assinatura nova, então troca a função).
drop function if exists public.registrar_lancamento_campo(uuid, uuid, date, text, integer, integer, integer, numeric, text, uuid, jsonb, jsonb, jsonb, boolean);

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

  -- dois celulares mandando o mesmo viveiro, dia e turno ao mesmo tempo: um espera o outro
  perform pg_advisory_xact_lock(hashtextextended(p_viveiro::text || p_data::text || coalesce(p_turno, ''), 0));

  if not coalesce(p_forcar, false) then
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
    -- o mesmo lançamento chegou por outro envio enquanto este esperava
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

revoke all on function public.registrar_lancamento_campo(uuid, uuid, date, text, integer, integer, integer, numeric, text, uuid, jsonb, jsonb, jsonb, boolean, numeric) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.registrar_lancamento_campo(uuid, uuid, date, text, integer, integer, integer, numeric, text, uuid, jsonb, jsonb, jsonb, boolean, numeric) to authenticated;
  end if;
end $$;

select app.travar_referencias();
