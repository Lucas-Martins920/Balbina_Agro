-- Balbina: apontamento diário do viveiro, biometria e sanidade da piscicultura.
--
-- O apontamento por turno (manhã/tarde) continua: mortes, descartes, ração (com baixa do estoque por tipo),
-- checklist e medicação. Sai o que era da avicultura (ovos, litros de água, horas de luz) e entra a qualidade
-- da água medida no viveiro. A biometria (pesagem por amostragem) ganha tabela própria: é dela que saem o peso
-- médio, a biomassa e a ração sugerida pela tabela de arraçoamento.
--
-- Faixas de referência do tambaqui (D1: Corrêa et al., Embrapa, 2018): oxigênio dissolvido de 4 a 8 mg/L (abaixo
-- de 3 mg/L suspender o arraçoamento), temperatura de 28 a 30 °C, pH de 5 a 7, amônia tóxica abaixo de 0,46 mg/L.

-- ---------------------------------------------------------------------------
-- 1. Sem estoque de ovos pelo apontamento
-- ---------------------------------------------------------------------------
drop trigger if exists lancamento_para_estoque on apontamento_lancamentos;
drop function if exists app.lancamento_para_estoque();
drop table if exists apontamento_ovos;
drop function if exists app.ovos_para_estoque();
delete from movimentos_estoque where origem_tabela in ('apontamento_lancamentos', 'apontamento_ovos');

-- Causas das baixas do peixe (a lista também está em src/lib/causas-morte.ts). As da granja viram a mais
-- próxima: calor → temperatura, acidente → manejo; prolapso, canibalismo e refugo → outra.
alter table apontamento_lancamentos drop constraint causas_validas;
update apontamento_lancamentos l set causas_morte = (
  select coalesce(jsonb_object_agg(x.k, x.v), '{}') from (
    select case e.key when 'calor' then 'temperatura' when 'acidente' then 'manejo'
                      when 'prolapso' then 'outra' when 'canibalismo' then 'outra' when 'refugo' then 'outra'
                      else e.key end as k,
           sum(e.value::numeric)::bigint as v
    from jsonb_each(l.causas_morte) e group by 1) x)
where l.causas_morte ?| array['calor', 'acidente', 'prolapso', 'canibalismo', 'refugo'];
create or replace function app.causas_morte_validas(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) e
       where e.key not in ('oxigenio', 'qualidade_agua', 'doenca', 'temperatura', 'predador', 'manejo', 'outra')
          or jsonb_typeof(e.value) <> 'number'
          or e.value::numeric <> trunc(e.value::numeric)
          or e.value::numeric < 0)
$$;
alter table apontamento_lancamentos add constraint causas_validas
  check (app.causas_morte_validas(causas_morte) and app.soma_causas_morte(causas_morte) <= mortes + descartes);
update apontamentos_diarios d set causas_morte = (
  select coalesce(jsonb_object_agg(c.causa, c.peixes), '{}')
  from (select e.key as causa, sum(e.value::numeric)::bigint as peixes
        from apontamento_lancamentos l, jsonb_each(l.causas_morte) e
        where l.apontamento_id = d.id group by e.key having sum(e.value::numeric) > 0) c)
where d.causas_morte <> '{}';

-- ---------------------------------------------------------------------------
-- 2. Qualidade da água no lançamento; resumo do dia no apontamento
-- ---------------------------------------------------------------------------
alter table apontamento_lancamentos drop column ovos;
alter table apontamento_lancamentos drop column agua_l;
alter table apontamento_lancamentos
  add column temperatura_c numeric(4,1) check (temperatura_c is null or temperatura_c between 0 and 45),
  add column oxigenio_mg_l numeric(5,2) check (oxigenio_mg_l is null or oxigenio_mg_l between 0 and 30),
  add column ph numeric(4,2) check (ph is null or ph between 0 and 14),
  add column transparencia_cm numeric(5,1) check (transparencia_cm is null or transparencia_cm between 0 and 500),
  add column amonia_mg_l numeric(6,3) check (amonia_mg_l is null or amonia_mg_l between 0 and 50);
comment on column apontamento_lancamentos.temperatura_c is 'Temperatura da água (°C). Tambaqui: conforto entre 28 e 30 °C';
comment on column apontamento_lancamentos.oxigenio_mg_l is 'Oxigênio dissolvido (mg/L), de preferência medido ao amanhecer. Abaixo de 3 mg/L suspender a ração';
comment on column apontamento_lancamentos.ph is 'pH da água. Tambaqui: entre 5 e 7';
comment on column apontamento_lancamentos.transparencia_cm is 'Transparência no disco de Secchi (cm)';
comment on column apontamento_lancamentos.amonia_mg_l is 'Amônia total (mg/L)';

alter table apontamentos_diarios drop column ovos_total;
alter table apontamentos_diarios drop column peso_medio_ovo_g;
alter table apontamentos_diarios drop column agua_l;
alter table apontamentos_diarios drop column horas_luz;
alter table apontamentos_diarios
  add column oxigenio_min_mg_l numeric(5,2),
  add column ph_min numeric(4,2),
  add column ph_max numeric(4,2),
  add column transparencia_cm numeric(5,1),
  add column amonia_max_mg_l numeric(6,3);
comment on column apontamentos_diarios.temp_min_c is 'Menor temperatura da água apontada no dia';
comment on column apontamentos_diarios.temp_max_c is 'Maior temperatura da água apontada no dia';
comment on column apontamentos_diarios.oxigenio_min_mg_l is 'Menor oxigênio dissolvido apontado no dia';

alter table apontamentos_lixeira drop column ovos;

-- Lê um número do objeto da água ("5,2" ou 5.2). Vazio vira nulo; texto que não é número é recusado.
create or replace function app.numero_agua(p_agua jsonb, p_chave text) returns numeric
language plpgsql immutable set search_path = public as $$
declare v text;
begin
  if p_agua is null or jsonb_typeof(p_agua) <> 'object' then return null; end if;
  v := nullif(btrim(replace(p_agua->>p_chave, ',', '.')), '');
  if v is null then return null; end if;
  if v !~ '^-?\d+(\.\d+)?$' then
    raise exception 'Valor inválido para % da água: %', replace(p_chave, '_', ' '), p_agua->>p_chave using errcode = 'check_violation';
  end if;
  return v::numeric;
end $$;

create or replace function app.totalizar_apontamento(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  a apontamentos_diarios%rowtype;
  t record;
  v_causas jsonb;
begin
  select * into a from apontamentos_diarios where id = p_id for update;
  if not found then return; end if;
  select count(*) as n, coalesce(sum(mortes), 0) as mortes, coalesce(sum(descartes), 0) as descartes,
         coalesce(sum(racao_kg), 0) as racao_kg,
         min(temperatura_c) as temp_min, max(temperatura_c) as temp_max, min(oxigenio_mg_l) as od_min,
         min(ph) as ph_min, max(ph) as ph_max, max(amonia_mg_l) as amonia_max,
         (array_agg(transparencia_cm order by created_at desc) filter (where transparencia_cm is not null))[1] as transparencia,
         string_agg(observacoes, ' · ' order by turno, created_at) as observacoes
  into t from apontamento_lancamentos where apontamento_id = p_id;
  if t.n = 0 then
    delete from apontamentos_diarios where id = p_id;
  else
    select coalesce(jsonb_object_agg(c.causa, c.peixes), '{}') into v_causas
    from (select e.key as causa, sum(e.value::numeric)::bigint as peixes
          from apontamento_lancamentos l, jsonb_each(l.causas_morte) e
          where l.apontamento_id = p_id group by e.key having sum(e.value::numeric) > 0) c;
    update apontamentos_diarios set mortes = t.mortes, descartes = t.descartes, racao_kg = t.racao_kg,
      temp_min_c = t.temp_min, temp_max_c = t.temp_max, oxigenio_min_mg_l = t.od_min, ph_min = t.ph_min, ph_max = t.ph_max,
      amonia_max_mg_l = t.amonia_max, transparencia_cm = t.transparencia,
      observacoes = t.observacoes, causas_morte = v_causas, updated_at = now()
    where id = p_id;
  end if;
  perform app.recalcular_peixes(a.lote_id, a.viveiro_id, a.data);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Registrar, editar, excluir e restaurar lançamento
-- ---------------------------------------------------------------------------
drop function if exists public.registrar_apontamento(uuid, uuid, uuid, date, text, integer, integer, integer, numeric, numeric, text, uuid, text);
create function public.registrar_apontamento(p_empresa uuid, p_lote uuid, p_viveiro uuid, p_data date, p_turno text,
                                             p_mortes integer default 0, p_descartes integer default 0,
                                             p_racao_kg numeric default 0, p_agua jsonb default null,
                                             p_observacoes text default null, p_client_id uuid default null,
                                             p_origem text default 'web')
returns uuid language plpgsql set search_path = public as $$
declare
  v_aloc lote_alocacoes%rowtype;
  v_peixes int;
  v_dia uuid;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from apontamento_lancamentos where client_id = p_client_id;
    if found then return v_id; end if;   -- reenvio do app offline
  end if;

  if p_data > app.hoje(p_empresa) then
    raise exception 'Não dá para apontar uma data futura' using errcode = 'check_violation';
  end if;
  if p_turno is null or p_turno not in ('manha', 'tarde') then
    raise exception 'Informe o turno: manhã ou tarde' using errcode = 'check_violation';
  end if;
  if coalesce(p_mortes, 0) < 0 or coalesce(p_descartes, 0) < 0 or coalesce(p_racao_kg, 0) < 0 then
    raise exception 'Mortes, descartes e ração não podem ser negativos' using errcode = 'check_violation';
  end if;
  if p_agua is not null and jsonb_typeof(p_agua) not in ('object', 'null') then
    raise exception 'Qualidade da água em formato inválido' using errcode = 'check_violation';
  end if;

  -- sem lote informado, vale o lote que estava no viveiro naquele dia
  select * into v_aloc from lote_alocacoes
  where (p_lote is null or lote_id = p_lote) and viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data;
  if not found then
    if p_lote is null then
      raise exception 'Nenhum lote estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
    raise exception 'O lote não estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  p_lote := v_aloc.lote_id;

  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_peixes
  from apontamentos_diarios
  where lote_id = p_lote and viveiro_id = p_viveiro and data < p_data and data >= lower(v_aloc.periodo);

  insert into apontamentos_diarios (empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia, origem, created_by)
  values (p_empresa, p_lote, p_viveiro, p_data, v_peixes, p_origem, auth.uid())
  on conflict (lote_id, viveiro_id, data) do update set updated_at = now()
  returning id into v_dia;

  insert into apontamento_lancamentos (empresa_id, apontamento_id, turno, mortes, descartes, racao_kg,
                                       temperatura_c, oxigenio_mg_l, ph, transparencia_cm, amonia_mg_l,
                                       observacoes, origem, client_id, created_by)
  values (p_empresa, v_dia, p_turno, coalesce(p_mortes, 0), coalesce(p_descartes, 0), coalesce(p_racao_kg, 0),
          app.numero_agua(p_agua, 'temperatura_c'), app.numero_agua(p_agua, 'oxigenio_mg_l'), app.numero_agua(p_agua, 'ph'),
          app.numero_agua(p_agua, 'transparencia_cm'), app.numero_agua(p_agua, 'amonia_mg_l'),
          nullif(trim(p_observacoes), ''), p_origem, p_client_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

drop function if exists public.editar_lancamento(uuid, text, integer, integer, integer, numeric, numeric, text, jsonb, jsonb, jsonb);
create function public.editar_lancamento(p_lancamento uuid, p_turno text, p_mortes integer, p_descartes integer,
                                         p_racao_kg numeric, p_agua jsonb default null, p_observacoes text default '',
                                         p_causas jsonb default '{}', p_racoes jsonb default '[]', p_checklist jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
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
  if p_agua is not null and jsonb_typeof(p_agua) not in ('object', 'null') then
    raise exception 'Qualidade da água em formato inválido' using errcode = 'check_violation';
  end if;

  -- Apaga ração e checklist existentes: o trigger da ração devolve o kg ao estoque.
  delete from apontamento_racoes where lancamento_id = l.id;
  delete from apontamento_checklist where lancamento_id = l.id;

  -- totalizar_lancamento recalcula o total do dia e os peixes dos dias seguintes.
  update apontamento_lancamentos set
    turno = p_turno,
    mortes = p_mortes,
    descartes = p_descartes,
    racao_kg = p_racao_kg,
    temperatura_c = app.numero_agua(p_agua, 'temperatura_c'),
    oxigenio_mg_l = app.numero_agua(p_agua, 'oxigenio_mg_l'),
    ph = app.numero_agua(p_agua, 'ph'),
    transparencia_cm = app.numero_agua(p_agua, 'transparencia_cm'),
    amonia_mg_l = app.numero_agua(p_agua, 'amonia_mg_l'),
    observacoes = nullif(trim(p_observacoes), ''),
    causas_morte = case when p_causas = '{}' or p_causas is null then '{}' else p_causas end
  where id = l.id;

  -- Reinsere ração por tipo e checklist: completar_lancamento confere saldo de ração e insere.
  if jsonb_array_length(coalesce(p_racoes, '[]')) > 0 or jsonb_array_length(coalesce(p_checklist, '[]')) > 0 then
    perform completar_lancamento(l.id, p_racoes, p_checklist);
  end if;
end $$;

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

  insert into apontamentos_lixeira (empresa_id, lancamento_id, lote_id, viveiro_id, data, turno, mortes, descartes, racao_kg,
                                    dados, motivo, lancado_por, lancado_em, excluido_por)
  values (l.empresa_id, l.id, a.lote_id, a.viveiro_id, a.data, l.turno, l.mortes, l.descartes, l.racao_kg,
          jsonb_build_object(
            'lancamento', to_jsonb(l),
            'racoes', coalesce((select jsonb_agg(jsonb_build_object('produto_id', r.produto_id, 'deposito_id', r.deposito_id, 'kg', r.kg))
                                from apontamento_racoes r where r.lancamento_id = l.id), '[]'),
            'checklist', coalesce((select jsonb_agg(jsonb_build_object('item_id', c.item_id, 'ok', c.ok, 'valor', c.valor, 'observacao', c.observacao))
                                   from apontamento_checklist c where c.lancamento_id = l.id), '[]'),
            'medicacoes', coalesce((select jsonb_agg(jsonb_build_object('medicamento_id', e.medicamento_id, 'dias', e.dias_tratamento,
                                      'dose_por_unidade', e.dose_por_unidade, 'base_dose', e.base_dose, 'quantidade', e.quantidade,
                                      'observacoes', e.observacoes))
                                    from eventos_sanitarios e where e.lancamento_id = l.id and e.medicamento_id is not null), '[]')),
          nullif(trim(p_motivo), ''), l.created_by, l.created_at, auth.uid())
  returning id into v_id;

  -- Os triggers desfazem o resto: ração, medicação, total do dia e peixes dos dias seguintes.
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

  v_id := registrar_apontamento(x.empresa_id, x.lote_id, x.viveiro_id, x.data, x.turno, x.mortes, x.descartes, x.racao_kg,
            jsonb_build_object('temperatura_c', l->'temperatura_c', 'oxigenio_mg_l', l->'oxigenio_mg_l', 'ph', l->'ph',
                               'transparencia_cm', l->'transparencia_cm', 'amonia_mg_l', l->'amonia_mg_l'),
            l->>'observacoes', null, coalesce(l->>'origem', 'web'));
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
                                (m->>'dose_por_unidade')::numeric, coalesce(m->>'base_dose', m->>'agua_l')::numeric,
                                (m->>'quantidade')::numeric, m->>'observacoes', v_id);
  end loop;

  update apontamentos_lixeira set restaurado_em = now(), restaurado_por = auth.uid(), restaurado_lancamento_id = v_id
  where id = x.id;
  return v_id;
end $$;

drop function if exists public.registrar_lancamento_campo(uuid, uuid, date, text, integer, integer, integer, numeric, text, uuid, jsonb, jsonb, jsonb, boolean, numeric);
create function public.registrar_lancamento_campo(p_empresa uuid, p_viveiro uuid, p_data date, p_turno text,
                                                  p_mortes integer default 0, p_descartes integer default 0,
                                                  p_racao_kg numeric default 0, p_observacoes text default null,
                                                  p_client_id uuid default null, p_racoes jsonb default '[]',
                                                  p_checklist jsonb default '[]', p_medicacao jsonb default null,
                                                  p_forcar boolean default false, p_agua jsonb default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_existentes jsonb;
  v_checklist jsonb;
  v_old uuid;
begin
  if p_client_id is null then
    raise exception 'Identificador do envio obrigatório' using errcode = 'check_violation';
  end if;
  select id into v_id from apontamento_lancamentos where client_id = p_client_id and empresa_id = p_empresa;
  if found then return jsonb_build_object('id', v_id, 'situacao', 'repetido'); end if;

  if jsonb_typeof(coalesce(p_racoes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_checklist, '[]')) <> 'array'
     or (p_medicacao is not null and jsonb_typeof(p_medicacao) not in ('object', 'null'))
     or (p_agua is not null and jsonb_typeof(p_agua) not in ('object', 'null')) then
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
    select jsonb_agg(jsonb_build_object('origem', l.origem, 'mortes', l.mortes, 'descartes', l.descartes,
                                        'racao_kg', l.racao_kg, 'oxigenio_mg_l', l.oxigenio_mg_l,
                                        'temperatura_c', l.temperatura_c, 'criado_em', l.created_at)
                     order by l.created_at)
      into v_existentes
    from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where d.empresa_id = p_empresa and d.viveiro_id = p_viveiro and d.data = p_data and l.turno = p_turno;
    if v_existentes is not null then
      return jsonb_build_object('situacao', 'conflito', 'existentes', v_existentes);
    end if;
  end if;

  begin
    v_id := registrar_apontamento(p_empresa, null, p_viveiro, p_data, p_turno, p_mortes, p_descartes,
                                  p_racao_kg, p_agua, p_observacoes, p_client_id, 'app');
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
      coalesce(p_medicacao->>'base_dose', p_medicacao->>'agua_l')::numeric, (p_medicacao->>'quantidade')::numeric, null, v_id);
  end if;

  return jsonb_build_object('id', v_id, 'situacao', 'novo');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Sanidade: medicação na ração ou na água (banho), carência antes da despesca
-- ---------------------------------------------------------------------------
-- pesagem vira biometria (seção 5); debicagem e muda não existem no peixe
alter table eventos_sanitarios drop constraint eventos_sanitarios_tipo_check;
update eventos_sanitarios set tipo = 'outro' where tipo in ('debicagem', 'muda');
alter table eventos_sanitarios add constraint eventos_sanitarios_tipo_check
  check (tipo in ('vacina', 'medicacao', 'vitamina', 'banho', 'calagem', 'adubacao', 'exame', 'limpeza', 'pesagem', 'outro'));
alter table eventos_sanitarios drop column carencia_descartada;
alter table eventos_sanitarios rename column agua_l to base_dose;
alter table eventos_sanitarios rename constraint eventos_sanitarios_agua_l_check to eventos_sanitarios_base_dose_check;
comment on column eventos_sanitarios.base_dose is 'Base da dose: kg de ração (medicação na ração) ou m³ de água (banho ou aplicação no viveiro)';
comment on column eventos_sanitarios.carencia_dias is 'Dias, contados da data do evento, em que o lote não pode ser despescado para venda';

alter table medicamentos drop constraint medicamentos_via_check;
update medicamentos set via = case via when 'agua' then 'agua' when 'racao' then 'racao' when 'injetavel' then 'injetavel' else 'outro' end;
alter table medicamentos alter column via set default 'racao';
alter table medicamentos add constraint medicamentos_via_check check (via in ('racao', 'banho', 'agua', 'injetavel', 'outro'));
comment on column medicamentos.via is 'racao: misturado na ração (dose por kg de ração); banho ou agua: dose por m³ de água';
comment on column medicamentos.dose_por_unidade is 'Dose por kg de ração (via ração) ou por m³ de água (banho e água do viveiro)';
comment on column medicamentos.carencia_dias is 'Período de carência: dias após o fim do tratamento em que o peixe não pode ser despescado para consumo';

drop function if exists public.descartar_ovos_carencia(uuid);

drop function if exists public.registrar_medicacao(uuid, uuid, date, uuid, integer, numeric, numeric, numeric, text, uuid);
create function public.registrar_medicacao(p_empresa uuid, p_viveiro uuid, p_data date, p_medicamento uuid,
                                           p_dias integer default 1, p_dose_por_unidade numeric default null,
                                           p_base numeric default null, p_quantidade numeric default null,
                                           p_observacoes text default null, p_lancamento uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m medicamentos%rowtype;
  p produtos%rowtype;
  v_lote uuid;
  v_id uuid;
  v_dose numeric;
  v_qtd numeric;
  v_estoque numeric;
  v_dep uuid;
  v_saldo numeric;
begin
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'sanidade.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar medicação' using errcode = 'insufficient_privilege';
  end if;
  select * into m from medicamentos where id = p_medicamento and empresa_id = p_empresa;
  if not found then raise exception 'Medicamento não encontrado' using errcode = 'no_data_found'; end if;

  if p_lancamento is not null then
    select id into v_id from eventos_sanitarios where lancamento_id = p_lancamento and medicamento_id = p_medicamento;
    if found then return v_id; end if;   -- reenvio do app offline
    select d.viveiro_id, d.data, d.lote_id into p_viveiro, p_data, v_lote
    from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where l.id = p_lancamento and l.empresa_id = p_empresa;
    if not found then raise exception 'Lançamento do apontamento não encontrado' using errcode = 'no_data_found'; end if;
  end if;

  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Não dá para lançar medicação em data futura' using errcode = 'check_violation';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 120 then
    raise exception 'Dias de tratamento: de 1 a 120' using errcode = 'check_violation';
  end if;
  if (p_dose_por_unidade is not null and p_dose_por_unidade <= 0) or (p_base is not null and p_base <= 0)
     or (p_quantidade is not null and p_quantidade <= 0) then
    raise exception 'Dose, base (kg de ração ou m³ de água) e quantidade precisam ser maiores que zero' using errcode = 'check_violation';
  end if;

  if v_lote is null then
    select lote_id into v_lote from lote_alocacoes
    where viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data;
    if not found then
      raise exception 'Nenhum lote estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
  end if;

  v_dose := coalesce(p_dose_por_unidade, m.dose_por_unidade);
  v_qtd := coalesce(p_quantidade, v_dose * p_base);

  insert into eventos_sanitarios (empresa_id, lote_id, viveiro_id, data, tipo, produto_id, via, dose, carencia_dias,
                                  observacoes, status, medicamento_id, dose_por_unidade, base_dose, quantidade, dias_tratamento, lancamento_id)
  values (p_empresa, v_lote, p_viveiro, p_data,
          case m.tipo when 'medicamento' then 'medicacao' when 'outro' then 'medicacao' else m.tipo end,
          m.produto_id,
          case m.via when 'agua' then 'água do viveiro' when 'racao' then 'ração' when 'banho' then 'banho'
                     when 'injetavel' then 'injetável' else null end,
          concat_ws(', ', m.nome,
                    case when v_dose is not null then format('%s %s/%s', replace(trim_scale(v_dose)::text, '.', ','), m.unidade_dose,
                                                             case m.via when 'racao' then 'kg de ração' else 'm³' end) end,
                    case when p_dias > 1 then format('%s dias', p_dias) end),
          case when m.carencia_dias > 0 then p_dias + m.carencia_dias else 0 end,
          nullif(trim(p_observacoes), ''), 'realizado', m.id, v_dose, p_base, v_qtd, p_dias, p_lancamento)
  returning id into v_id;

  -- Baixa do estoque: só com produto ligado, quantidade conhecida e saldo para isso
  if m.produto_id is not null and v_qtd is not null and m.dose_por_unidade_estoque is not null then
    select * into p from produtos where id = m.produto_id;
    v_estoque := round(v_qtd / m.dose_por_unidade_estoque, 3);
    if v_estoque > 0 then
      perform app.travar_estoque(p_empresa);
      select deposito_id, sum(quantidade) into v_dep, v_saldo from movimentos_estoque
      where produto_id = p.id group by deposito_id order by sum(quantidade) desc limit 1;
      if coalesce(v_saldo, 0) >= v_estoque then
        insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents, lote_id, viveiro_id,
                                        origem_tabela, origem_id, observacao, created_by)
        values (p_empresa, p.id, v_dep, p_data, 'consumo_lote', -v_estoque, p.custo_medio_cents, v_lote, p_viveiro,
                'eventos_sanitarios', v_id, format('Medicação: %s', m.nome), auth.uid());
      end if;
    end if;
  end if;
  return v_id;
end $$;

-- Até quando o lote está em carência (último dia em que não pode ser despescado). Nulo: livre.
create or replace function app.carencia_ate(p_lote uuid, p_data date default null) returns date
language sql stable security definer set search_path = public as $$
  select max(e.data + e.carencia_dias - 1)
  from eventos_sanitarios e
  where e.lote_id = p_lote and e.status = 'realizado' and e.carencia_dias > 0
    and e.data <= coalesce(p_data, app.hoje(e.empresa_id))
    and e.data + e.carencia_dias - 1 >= coalesce(p_data, app.hoje(e.empresa_id))
$$;

-- ---------------------------------------------------------------------------
-- 5. Biometria: pesagem de uma amostra do viveiro
--    D1 recomenda amostrar ~10% dos peixes a cada 15 dias até a recria II e depois uma vez por mês.
-- ---------------------------------------------------------------------------
create table biometrias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  viveiro_id uuid not null references viveiros(id) on delete restrict,
  data date not null,
  peixes_amostrados integer not null check (peixes_amostrados between 1 and 100000),
  peso_total_g numeric(12,1) check (peso_total_g is null or peso_total_g > 0),
  peso_medio_g numeric(10,2) not null check (peso_medio_g > 0 and peso_medio_g <= 100000),
  comprimento_medio_cm numeric(6,1) check (comprimento_medio_cm is null or comprimento_medio_cm between 0.1 and 300),
  uniformidade_pct numeric(5,2) check (uniformidade_pct is null or uniformidade_pct between 0 and 100),
  observacoes text,
  origem text not null default 'web' check (origem in ('web', 'app', 'importacao')),
  client_id uuid unique,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (lote_id, viveiro_id, data)
);
create index on biometrias (empresa_id, data);
create index on biometrias (lote_id, data);
create index on biometrias (viveiro_id);
comment on table biometrias is 'Pesagem por amostragem: peso médio do lote no viveiro naquele dia (base da biomassa e da ração sugerida)';
comment on column biometrias.uniformidade_pct is 'Peixes da amostra com peso até 10% acima ou abaixo da média';

alter table biometrias enable row level security;
create policy membros on biometrias
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on biometrias as restrictive for insert
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_alterar on biometrias as restrictive for update
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']))
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_apagar on biometrias as restrictive for delete
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));

-- A pesagem que antes era evento sanitário vira biometria
insert into biometrias (empresa_id, lote_id, viveiro_id, data, peixes_amostrados, peso_medio_g, uniformidade_pct, observacoes, created_at)
select e.empresa_id, e.lote_id, coalesce(e.viveiro_id, al.viveiro_id), e.data, 1, e.peso_medio_g, e.uniformidade_pct, e.observacoes, e.created_at
from eventos_sanitarios e
left join lateral (select a.viveiro_id from lote_alocacoes a where a.lote_id = e.lote_id and a.periodo @> e.data limit 1) al on true
where e.tipo = 'pesagem' and e.peso_medio_g is not null and coalesce(e.viveiro_id, al.viveiro_id) is not null
on conflict do nothing;
delete from eventos_sanitarios where tipo = 'pesagem';
alter table eventos_sanitarios drop constraint eventos_sanitarios_tipo_check;
alter table eventos_sanitarios add constraint eventos_sanitarios_tipo_check
  check (tipo in ('vacina', 'medicacao', 'vitamina', 'banho', 'calagem', 'adubacao', 'exame', 'limpeza', 'outro'));
alter table eventos_sanitarios drop column peso_medio_g;
alter table eventos_sanitarios drop column uniformidade_pct;

create or replace function public.registrar_biometria(p_empresa uuid, p_viveiro uuid, p_data date, p_peixes integer,
                                                      p_peso_total_g numeric default null, p_peso_medio_g numeric default null,
                                                      p_comprimento_cm numeric default null, p_uniformidade_pct numeric default null,
                                                      p_observacoes text default null, p_client_id uuid default null,
                                                      p_lote uuid default null, p_origem text default 'web')
returns uuid language plpgsql set search_path = public as $$
declare
  v_aloc lote_alocacoes%rowtype;
  v_medio numeric;
  v_id uuid;
begin
  if p_client_id is not null then
    select id into v_id from biometrias where client_id = p_client_id and empresa_id = p_empresa;
    if found then return v_id; end if;   -- reenvio do app offline
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar biometria' using errcode = 'insufficient_privilege';
  end if;
  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Informe a data da biometria; data futura não é aceita' using errcode = 'check_violation';
  end if;
  if p_peixes is null or p_peixes <= 0 then
    raise exception 'Informe quantos peixes foram pesados na amostra' using errcode = 'check_violation';
  end if;
  if p_peso_total_g is null and p_peso_medio_g is null then
    raise exception 'Informe o peso total da amostra ou o peso médio' using errcode = 'check_violation';
  end if;
  if coalesce(p_peso_total_g, 1) <= 0 or coalesce(p_peso_medio_g, 1) <= 0 then
    raise exception 'O peso precisa ser maior que zero' using errcode = 'check_violation';
  end if;
  v_medio := round(coalesce(p_peso_total_g / p_peixes, p_peso_medio_g), 2);

  select * into v_aloc from lote_alocacoes
  where (p_lote is null or lote_id = p_lote) and viveiro_id = p_viveiro and empresa_id = p_empresa and periodo @> p_data;
  if not found then
    raise exception 'Nenhum lote estava neste viveiro em %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  begin
    insert into biometrias (empresa_id, lote_id, viveiro_id, data, peixes_amostrados, peso_total_g, peso_medio_g,
                            comprimento_medio_cm, uniformidade_pct, observacoes, origem, client_id, created_by)
    values (p_empresa, v_aloc.lote_id, p_viveiro, p_data, p_peixes, p_peso_total_g, v_medio, p_comprimento_cm,
            p_uniformidade_pct, nullif(trim(p_observacoes), ''), coalesce(nullif(p_origem, ''), 'web'), p_client_id, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    if p_client_id is not null and exists (select 1 from biometrias where client_id = p_client_id) then
      select id into v_id from biometrias where client_id = p_client_id;
      return v_id;
    end if;
    raise exception 'Já existe uma biometria deste viveiro em %: edite ou apague a anterior', to_char(p_data, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Peso esperado, biomassa e ração sugerida
--
--    A curva da espécie (curvas_crescimento) dá o peso por semana de cultivo. O peso estimado de um lote num dia
--    parte da última biometria (ou do peso do povoamento), acha a "idade equivalente" desse peso na curva e anda
--    pela curva os dias que passaram. Sem curva, fica o último peso medido.
-- ---------------------------------------------------------------------------

-- peso da curva numa idade em dias (interpolação linear entre as semanas)
create or replace function app.peso_curva(p_especie uuid, p_dias numeric) returns numeric
language sql stable security definer set search_path = public as $$
  with c as (select semana, peso_g from curvas_crescimento where especie_id = p_especie and peso_g is not null),
  pos as (select greatest(p_dias, 0) / 7.0 + 1 as s),
  a as (select c.* from c, pos where c.semana <= pos.s order by c.semana desc limit 1),
  b as (select c.* from c, pos where c.semana > pos.s order by c.semana limit 1)
  select case
    when not exists (select 1 from c) then null
    when not exists (select 1 from a) then (select peso_g from b)
    when not exists (select 1 from b) then (select peso_g from a)
    else (select a.peso_g + (b.peso_g - a.peso_g) * ((select s from pos) - a.semana) / (b.semana - a.semana) from a, b)
  end
$$;

-- idade (dias de cultivo pela curva) em que a espécie chega a um peso
create or replace function app.idade_equivalente(p_especie uuid, p_peso_g numeric) returns numeric
language sql stable security definer set search_path = public as $$
  with c as (select semana, peso_g from curvas_crescimento where especie_id = p_especie and peso_g is not null),
  a as (select * from c where peso_g <= p_peso_g order by peso_g desc, semana desc limit 1),
  b as (select * from c where peso_g > p_peso_g order by peso_g, semana limit 1)
  select case
    when p_peso_g is null or not exists (select 1 from c) then null
    when not exists (select 1 from a) then 0
    when not exists (select 1 from b) then ((select semana from a) - 1) * 7.0
    else (select ((a.semana - 1) + (b.semana - a.semana) * (p_peso_g - a.peso_g) / nullif(b.peso_g - a.peso_g, 0)) * 7.0 from a, b)
  end
$$;

-- peso médio estimado do lote num dia (g)
create or replace function app.peso_estimado(p_lote uuid, p_data date) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  l lotes%rowtype;
  v_ref_data date;
  v_ref_peso numeric;
  v_idade numeric;
  v_curva numeric;
begin
  select * into l from lotes where id = p_lote;
  if not found or p_data is null then return null; end if;
  select data, peso_medio_g into v_ref_data, v_ref_peso from biometrias
  where lote_id = p_lote and data <= p_data
  order by data desc, created_at desc limit 1;
  if v_ref_data is null then
    v_ref_data := l.data_povoamento;
    v_ref_peso := l.peso_inicial_g;
  end if;
  if v_ref_peso is null then return null; end if;
  if p_data <= v_ref_data then return round(v_ref_peso, 1); end if;
  v_idade := app.idade_equivalente(l.especie_id, v_ref_peso);
  if v_idade is null then return round(v_ref_peso, 1); end if;
  v_curva := app.peso_curva(l.especie_id, v_idade + (p_data - v_ref_data));
  -- a curva só faz o peso subir: peixe acima do fim da curva fica no peso medido
  return round(greatest(coalesce(v_curva, v_ref_peso), v_ref_peso), 1);
end $$;

-- peixes vivos do lote num viveiro no início de um dia
create or replace function app.peixes_no_viveiro(p_lote uuid, p_viveiro uuid, p_data date) returns integer
language sql stable security definer set search_path = public as $$
  select (al.qtd_peixes - coalesce((select sum(a.mortes + a.descartes) from apontamentos_diarios a
                                    where a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id
                                      and a.data >= lower(al.periodo) and a.data < p_data), 0))::int
  from lote_alocacoes al
  where al.lote_id = p_lote and al.viveiro_id = p_viveiro and al.periodo @> p_data
  limit 1
$$;

-- Ração sugerida para o lote no viveiro num dia: biomassa × taxa da tabela de arraçoamento.
-- O alerta lembra a regra da água: com oxigênio abaixo de 3 mg/L no dia, não arraçoar.
create or replace function public.racao_sugerida(p_viveiro uuid, p_data date default null)
returns table (lote_id uuid, lote_codigo text, peixes integer, peso_medio_g numeric, biomassa_kg numeric, fase_tabela text,
               taxa_pct numeric, racao_kg numeric, refeicoes smallint, racao_por_refeicao_kg numeric, proteina_pct numeric,
               granulo text, ultima_biometria date, oxigenio_min_mg_l numeric, alerta text)
language plpgsql stable set search_path = public as $$
declare
  v_data date;
  v_aloc lote_alocacoes%rowtype;
  l lotes%rowtype;
  f tabela_arracoamento%rowtype;
  v_od numeric;
begin
  select * into v_aloc from lote_alocacoes al
  where al.viveiro_id = p_viveiro and al.empresa_id in (select app.minhas_empresas())
    and al.periodo @> coalesce(p_data, app.hoje(al.empresa_id));
  if not found then return; end if;
  v_data := coalesce(p_data, app.hoje(v_aloc.empresa_id));
  select * into l from lotes where id = v_aloc.lote_id;

  lote_id := l.id;
  lote_codigo := l.codigo;
  peixes := app.peixes_no_viveiro(l.id, p_viveiro, v_data);
  peso_medio_g := app.peso_estimado(l.id, v_data);
  biomassa_kg := round(peixes * peso_medio_g / 1000.0, 1);
  select max(b.data) into ultima_biometria from biometrias b where b.lote_id = l.id and b.data <= v_data;
  f := app.faixa_arracoamento(l.especie_id, peso_medio_g);
  if f.id is not null then
    fase_tabela := f.fase;
    taxa_pct := app.taxa_arracoamento(l.especie_id, peso_medio_g);
    racao_kg := round(biomassa_kg * taxa_pct / 100.0, 1);
    refeicoes := f.refeicoes;
    racao_por_refeicao_kg := round(racao_kg / f.refeicoes, 1);
    proteina_pct := f.proteina_pct;
    granulo := f.granulo;
  end if;
  select min(a.oxigenio_min_mg_l) into v_od from apontamentos_diarios a
  where a.lote_id = l.id and a.viveiro_id = p_viveiro and a.data = v_data;
  oxigenio_min_mg_l := v_od;
  alerta := case
    when v_od is not null and v_od < 3 then 'Oxigênio abaixo de 3 mg/L: suspenda a ração até a água melhorar'
    when f.id is null then 'Sem tabela de arraçoamento para a espécie deste lote'
    when peso_medio_g is null then 'Sem peso do lote: faça uma biometria'
    when ultima_biometria is null or v_data - ultima_biometria > case when peso_medio_g < 70 then 15 else 30 end
      then 'Biometria atrasada: o peso é estimado pela curva'
  end;
  return next;
end $$;

grant execute on function app.numero_agua(jsonb, text), app.carencia_ate(uuid, date), app.peso_curva(uuid, numeric),
  app.idade_equivalente(uuid, numeric), app.peso_estimado(uuid, date), app.peixes_no_viveiro(uuid, uuid, date) to authenticated;
revoke all on function public.registrar_apontamento(uuid, uuid, uuid, date, text, integer, integer, numeric, jsonb, text, uuid, text),
  public.editar_lancamento(uuid, text, integer, integer, numeric, jsonb, text, jsonb, jsonb, jsonb),
  public.excluir_lancamento(uuid, text),
  public.restaurar_lancamento(uuid),
  public.registrar_lancamento_campo(uuid, uuid, date, text, integer, integer, numeric, text, uuid, jsonb, jsonb, jsonb, boolean, jsonb),
  public.registrar_medicacao(uuid, uuid, date, uuid, integer, numeric, numeric, numeric, text, uuid),
  public.registrar_biometria(uuid, uuid, date, integer, numeric, numeric, numeric, numeric, text, uuid, uuid, text),
  public.racao_sugerida(uuid, date) from public, anon;
grant execute on function public.registrar_apontamento(uuid, uuid, uuid, date, text, integer, integer, numeric, jsonb, text, uuid, text),
  public.editar_lancamento(uuid, text, integer, integer, numeric, jsonb, text, jsonb, jsonb, jsonb),
  public.excluir_lancamento(uuid, text),
  public.restaurar_lancamento(uuid),
  public.registrar_lancamento_campo(uuid, uuid, date, text, integer, integer, numeric, text, uuid, jsonb, jsonb, jsonb, boolean, jsonb),
  public.registrar_medicacao(uuid, uuid, date, uuid, integer, numeric, numeric, numeric, text, uuid),
  public.registrar_biometria(uuid, uuid, date, integer, numeric, numeric, numeric, numeric, text, uuid, uuid, text),
  public.racao_sugerida(uuid, date) to authenticated;

select app.travar_referencias();
