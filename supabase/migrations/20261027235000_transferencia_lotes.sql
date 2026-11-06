-- Transferência de lote entre viveiros (alevinagem -> recria -> engorda), com histórico e desfazer.
-- A transferência fecha a alocação de origem na data e abre uma alocação em cada viveiro de destino.
-- Se nem todos os peixes saem, a sobra continua na origem numa alocação nova (motivo 'divisao').

-- ---------------------------------------------------------------------------
-- 1. Histórico
-- ---------------------------------------------------------------------------

create table lote_transferencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lote_id uuid not null references lotes(id) on delete cascade,
  data date not null,                       -- primeiro dia dos peixes no destino
  viveiro_origem_id uuid not null references viveiros(id) on delete restrict,
  alocacao_origem_id uuid not null references lote_alocacoes(id) on delete cascade,
  peixes_origem int not null check (peixes_origem > 0),   -- vivas na origem no dia da transferência
  fase_anterior text not null,
  inicio_producao_anterior date,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on lote_transferencias (lote_id, data);
create index on lote_transferencias (empresa_id, data);

-- As alocações abertas pela transferência (destinos e sobra) somem junto quando ela é desfeita.
alter table lote_alocacoes add column transferencia_id uuid references lote_transferencias(id) on delete cascade;
create index on lote_alocacoes (transferencia_id);

alter table lote_transferencias enable row level security;
create policy membros on lote_transferencias using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on lote_transferencias as restrictive for insert with check (app.pode(empresa_id, 'lotes.editar'));
create policy escrita_alterar on lote_transferencias as restrictive for update
  using (app.pode(empresa_id, 'lotes.editar')) with check (app.pode(empresa_id, 'lotes.editar'));
create policy escrita_apagar on lote_transferencias as restrictive for delete using (app.pode(empresa_id, 'lotes.editar'));

-- ---------------------------------------------------------------------------
-- 2. Transferir
-- ---------------------------------------------------------------------------

-- Fase que o viveiro de destino dá ao lote; o lote só avança (nunca volta de produção para recria).
create or replace function app.fase_do_viveiro(p_finalidade text) returns text
language sql immutable as $$
  select case p_finalidade when 'producao' then 'producao' when 'recria' then 'recria' when 'cria_recria' then 'recria' else 'cria' end
$$;

create or replace function app.ordem_fase(p_fase text) returns int
language sql immutable as $$
  select case p_fase when 'cria' then 1 when 'recria' then 2 when 'producao' then 3 when 'muda' then 4 else 5 end
$$;

-- p_destinos: [{"viveiro": "<uuid>", "qtd": 4000}, ...]. Um destino pode ir sem qtd: recebe todos os peixes que sobram.
create or replace function public.transferir_lote(
  p_lote uuid,
  p_viveiro_origem uuid,
  p_data date,
  p_destinos jsonb,
  p_observacoes text default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_lote lotes%rowtype;
  v_aloc lote_alocacoes%rowtype;
  v_vivas int;
  v_sem_qtd int;
  v_soma int;
  v_tr uuid;
  v_fase text;
  d record;
  v_viveiro viveiros%rowtype;
begin
  select * into v_lote from lotes where id = p_lote for update;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if v_lote.fase = 'descartado' then
    raise exception 'Lote descartado não pode ser transferido' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'Informe a data da transferência; data futura não é aceita' using errcode = 'check_violation';
  end if;

  select * into v_aloc from lote_alocacoes
  where lote_id = p_lote and viveiro_id = p_viveiro_origem and periodo @> p_data and upper_inf(periodo)
  for update;
  if not found then
    raise exception 'O lote não está nesse viveiro de origem nessa data' using errcode = 'check_violation';
  end if;
  if lower(v_aloc.periodo) >= p_data then
    raise exception 'A transferência precisa ser depois de %, quando o lote chegou ao viveiro de origem',
      to_char(lower(v_aloc.periodo), 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios where lote_id = p_lote and viveiro_id = p_viveiro_origem and data >= p_data) then
    raise exception 'Há apontamentos no viveiro de origem a partir de %; use uma data depois do último apontamento de lá',
      to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_vivas
  from apontamentos_diarios
  where lote_id = p_lote and viveiro_id = p_viveiro_origem and data >= lower(v_aloc.periodo) and data < p_data;
  if v_vivas <= 0 then
    raise exception 'Não há peixes vivos no viveiro de origem nessa data' using errcode = 'check_violation';
  end if;

  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Escolha ao menos um viveiro de destino' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where nullif(e->>'viveiro', '') is null) then
    raise exception 'Escolha o viveiro de cada destino' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where (e->>'viveiro')::uuid = p_viveiro_origem) then
    raise exception 'O destino precisa ser outro viveiro' using errcode = 'check_violation';
  end if;
  if (select count(*) <> count(distinct e->>'viveiro') from jsonb_array_elements(p_destinos) e) then
    raise exception 'O mesmo viveiro aparece em dois destinos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where e->>'qtd' is not null and (e->>'qtd')::int <= 0) then
    raise exception 'A quantidade de cada destino precisa ser maior que zero' using errcode = 'check_violation';
  end if;
  select count(*) filter (where e->>'qtd' is null), coalesce(sum((e->>'qtd')::int), 0)
    into v_sem_qtd, v_soma from jsonb_array_elements(p_destinos) e;
  if v_sem_qtd > 1 then
    raise exception 'Informe a quantidade de peixes de cada destino (só um pode ficar com o restante)' using errcode = 'check_violation';
  end if;
  if v_soma > v_vivas or (v_sem_qtd = 1 and v_soma >= v_vivas) then
    raise exception 'O lote tem % peixes vivos no viveiro de origem nessa data', v_vivas using errcode = 'check_violation';
  end if;

  insert into lote_transferencias (empresa_id, lote_id, data, viveiro_origem_id, alocacao_origem_id, peixes_origem,
                                   fase_anterior, inicio_producao_anterior, observacoes)
  values (v_lote.empresa_id, p_lote, p_data, p_viveiro_origem, v_aloc.id, v_vivas,
          v_lote.fase, v_lote.inicio_producao, nullif(trim(p_observacoes), ''))
  returning id into v_tr;

  update lote_alocacoes set periodo = daterange(lower(periodo), p_data) where id = v_aloc.id;

  v_fase := v_lote.fase;
  for d in select (e->>'viveiro')::uuid as viveiro, coalesce((e->>'qtd')::int, v_vivas - v_soma) as qtd
           from jsonb_array_elements(p_destinos) e loop
    select * into v_viveiro from viveiros where id = d.viveiro and empresa_id = v_lote.empresa_id;
    if not found then raise exception 'Viveiro de destino não encontrado nesta empresa' using errcode = 'foreign_key_violation'; end if;
    if not v_viveiro.ativo then raise exception 'O viveiro % está inativo', v_viveiro.nome using errcode = 'check_violation'; end if;
    if d.qtd > v_viveiro.capacidade_peixes then
      raise exception 'O viveiro % comporta % peixes', v_viveiro.nome, v_viveiro.capacidade_peixes using errcode = 'check_violation';
    end if;
    begin
      insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id)
      values (v_lote.empresa_id, p_lote, d.viveiro, d.qtd, daterange(p_data, null), 'transferencia', v_tr);
    exception when exclusion_violation then
      raise exception 'O viveiro % já está ocupado por outro lote em %', v_viveiro.nome, to_char(p_data, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end;
    if v_fase not in ('muda', 'descartado') and app.ordem_fase(app.fase_do_viveiro(v_viveiro.finalidade)) > app.ordem_fase(v_fase) then
      v_fase := app.fase_do_viveiro(v_viveiro.finalidade);
    end if;
  end loop;

  if v_sem_qtd = 0 and v_soma < v_vivas then
    insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id)
    values (v_lote.empresa_id, p_lote, p_viveiro_origem, v_vivas - v_soma, daterange(p_data, null), 'divisao', v_tr);
  end if;

  update lotes set fase = v_fase,
    inicio_producao = case when v_fase = 'producao' and inicio_producao is null then p_data else inicio_producao end,
    updated_at = now()
  where id = p_lote;
  if not found then
    raise exception 'Seu usuário não tem permissão para transferir lotes' using errcode = 'insufficient_privilege';
  end if;
  return v_tr;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Desfazer (só a última do lote e antes de apontar nos viveiros novos)
-- ---------------------------------------------------------------------------

create or replace function public.desfazer_transferencia(p_transferencia uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_tr lote_transferencias%rowtype;
begin
  select * into v_tr from lote_transferencias where id = p_transferencia for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'no_data_found'; end if;
  perform 1 from lotes where id = v_tr.lote_id for update;

  if exists (select 1 from lote_transferencias where lote_id = v_tr.lote_id and id <> v_tr.id
             and (data > v_tr.data or (data = v_tr.data and created_at > v_tr.created_at))) then
    raise exception 'Só dá para desfazer a última transferência do lote' using errcode = 'check_violation';
  end if;
  if exists (select 1 from lote_alocacoes where transferencia_id = v_tr.id and not upper_inf(periodo)) then
    raise exception 'Os peixes já saíram de um dos viveiros de destino; desfaça a transferência seguinte antes' using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios a join lote_alocacoes al
               on al.transferencia_id = v_tr.id and a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id and al.periodo @> a.data) then
    raise exception 'Já há apontamentos nos viveiros depois da transferência; apague-os antes de desfazer' using errcode = 'check_violation';
  end if;

  delete from lote_alocacoes where transferencia_id = v_tr.id;
  delete from lote_transferencias where id = v_tr.id;
  if not found then
    raise exception 'Seu usuário não tem permissão para desfazer transferências' using errcode = 'insufficient_privilege';
  end if;
  update lote_alocacoes set periodo = daterange(lower(periodo), null) where id = v_tr.alocacao_origem_id;
  update lotes set fase = v_tr.fase_anterior, inicio_producao = v_tr.inicio_producao_anterior, updated_at = now()
  where id = v_tr.lote_id;
end $$;

revoke all on function public.transferir_lote(uuid, uuid, date, jsonb, text) from public;
revoke all on function public.desfazer_transferencia(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on lote_transferencias to authenticated;
    grant execute on function public.transferir_lote(uuid, uuid, date, jsonb, text) to authenticated;
    grant execute on function public.desfazer_transferencia(uuid) to authenticated;
    grant execute on function app.fase_do_viveiro(text), app.ordem_fase(text) to authenticated;
  end if;
end $$;
