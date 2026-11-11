-- Biometria em grupos e parâmetros da ração (fase 2 do estoque de ração, pedido do Nicolas de 11/11/2026).
--
-- Na pesagem a amostra (ex.: 50 peixes de um lote de 2.500) é pesada em grupos: cada puçá ou balde tem um
-- número de peixes e um peso. O peso médio da biometria é o peso total dividido pelo total de peixes (média
-- ponderada), nunca a média dos pesos médios dos grupos.
--
-- - biometria_grupos: ordem, peixes, peso em kg, peso médio do grupo (calculado), ponto de captura, observação.
-- - biometrias ganha jejum (horas), temperatura, oxigênio e a população viva no dia (estimada pelo sistema).
-- - registrar_biometria_grupos: grava a biometria concluída e os grupos numa transação; o client_id do celular
--   torna o reenvio inofensivo (não duplica biometria nem grupos). O rascunho fica no aparelho até concluir.
-- - corrigir_grupos_biometria: troca os grupos de uma biometria já lançada e recalcula os totais.
-- - racao_parametros: por empresa, a reserva de sacos (padrão 10), o prazo de entrega do fornecedor e o tamanho
--   da amostra (padrão 2% do lote, entre 30 e 100 peixes: 50 para 2.500).
-- Reversão: drop das funções novas, de biometria_grupos e racao_parametros e das colunas novas de biometrias.

-- ---------------------------------------------------------------------------
-- 1. Grupos da biometria
-- ---------------------------------------------------------------------------
alter table biometrias
  add column jejum_horas numeric(4,1) check (jejum_horas is null or jejum_horas between 0 and 96),
  add column temperatura_c numeric(4,1) check (temperatura_c is null or temperatura_c between 0 and 45),
  add column oxigenio_mg_l numeric(5,2) check (oxigenio_mg_l is null or oxigenio_mg_l between 0 and 30),
  add column populacao_viva integer check (populacao_viva is null or populacao_viva >= 0);
comment on column biometrias.populacao_viva is 'Peixes vivos no viveiro no dia da biometria (povoados menos baixas), estimado pelo sistema';

create table biometria_grupos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  biometria_id uuid not null references biometrias(id) on delete cascade,
  ordem smallint not null check (ordem between 1 and 500),
  peixes integer not null check (peixes between 1 and 100000),
  peso_kg numeric(10,3) not null check (peso_kg > 0),
  peso_medio_g numeric(10,2) generated always as (round(peso_kg * 1000 / peixes, 2)) stored,
  ponto_captura text check (ponto_captura is null or length(ponto_captura) <= 120),
  observacao text check (observacao is null or length(observacao) <= 500),
  created_at timestamptz not null default now(),
  unique (biometria_id, ordem)
);
comment on table biometria_grupos is 'Grupos pesados numa biometria (peixes e peso de cada puçá/balde); o peso médio da biometria é a soma dos pesos ÷ a soma dos peixes';
create index on biometria_grupos (empresa_id);
alter table biometria_grupos enable row level security;
create policy membros on biometria_grupos using (empresa_id in (select app.minhas_empresas()));
-- gravação só pelas funções (que conferem a permissão e recalculam a biometria)
create policy escrita_inserir on biometria_grupos as restrictive for insert with check (false);
create policy escrita_alterar on biometria_grupos as restrictive for update using (false);
create policy escrita_apagar on biometria_grupos as restrictive for delete using (false);
revoke all on biometria_grupos from anon;
grant select on biometria_grupos to authenticated;

-- Confere os grupos (jsonb [{peixes, peso_kg, ponto_captura?, observacao?}]) e devolve peixes e peso total em g
create or replace function app.conferir_grupos_biometria(p_grupos jsonb, out peixes integer, out peso_total_g numeric)
language plpgsql immutable set search_path = public as $$
declare g jsonb; n int := 0;
begin
  if p_grupos is null or jsonb_typeof(p_grupos) <> 'array' or jsonb_array_length(p_grupos) = 0 then
    raise exception 'Informe pelo menos um grupo pesado' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_grupos) > 500 then raise exception 'No máximo 500 grupos por biometria' using errcode = 'check_violation'; end if;
  peixes := 0; peso_total_g := 0;
  for g in select value from jsonb_array_elements(p_grupos) loop
    n := n + 1;
    if (g->>'peixes') is null or (g->>'peixes') !~ '^\d+$' or (g->>'peixes')::int <= 0 then
      raise exception 'Grupo %: informe quantos peixes foram pesados', n using errcode = 'check_violation';
    end if;
    if (g->>'peso_kg') is null or (g->>'peso_kg') !~ '^\d+(\.\d+)?$' or (g->>'peso_kg')::numeric <= 0 then
      raise exception 'Grupo %: o peso precisa ser maior que zero', n using errcode = 'check_violation';
    end if;
    peixes := peixes + (g->>'peixes')::int;
    peso_total_g := peso_total_g + round((g->>'peso_kg')::numeric, 3) * 1000;
  end loop;
end $$;

create or replace function app.gravar_grupos_biometria(p_biometria uuid, p_empresa uuid, p_grupos jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from biometria_grupos where biometria_id = p_biometria;
  insert into biometria_grupos (empresa_id, biometria_id, ordem, peixes, peso_kg, ponto_captura, observacao)
  select p_empresa, p_biometria, ord, (g->>'peixes')::int, round((g->>'peso_kg')::numeric, 3),
         nullif(left(trim(g->>'ponto_captura'), 120), ''), nullif(left(trim(g->>'observacao'), 500), '')
  from jsonb_array_elements(p_grupos) with ordinality as x(g, ord);
end $$;
revoke all on function app.gravar_grupos_biometria(uuid, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 2. Lançar a biometria concluída com os grupos (site e celular)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_biometria_grupos(
  p_empresa uuid, p_viveiro uuid, p_data date, p_grupos jsonb,
  p_client_id uuid default null, p_lote uuid default null, p_origem text default 'web',
  p_observacoes text default null, p_jejum_horas numeric default null, p_temperatura_c numeric default null,
  p_oxigenio_mg_l numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_peixes int;
  v_peso numeric;
  v_pop int;
  b biometrias%rowtype;
begin
  -- reenvio do celular: devolve a mesma biometria, sem duplicar grupos
  if p_client_id is not null then
    select id into v_id from biometrias where client_id = p_client_id and empresa_id = p_empresa;
    if found then return v_id; end if;
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar biometria' using errcode = 'insufficient_privilege';
  end if;
  select c.peixes, c.peso_total_g into v_peixes, v_peso from app.conferir_grupos_biometria(p_grupos) c;
  perform pg_advisory_xact_lock(hashtextextended('biometria:' || coalesce(p_client_id::text, p_viveiro::text || p_data::text), 0));
  if p_client_id is not null then
    select id into v_id from biometrias where client_id = p_client_id and empresa_id = p_empresa;
    if found then return v_id; end if;
  end if;
  v_id := registrar_biometria(p_empresa, p_viveiro, p_data, v_peixes, v_peso, null, null, null, p_observacoes,
                              p_client_id, p_lote, p_origem);
  select * into b from biometrias where id = v_id;
  select greatest(a.qtd_peixes - coalesce((select sum(d.mortes + d.descartes) from apontamentos_diarios d
                                           where d.lote_id = a.lote_id and d.viveiro_id = a.viveiro_id
                                             and a.periodo @> d.data and d.data <= p_data), 0), 0)
    into v_pop
  from lote_alocacoes a where a.lote_id = b.lote_id and a.viveiro_id = p_viveiro and a.periodo @> p_data;
  update biometrias set jejum_horas = p_jejum_horas, temperatura_c = p_temperatura_c, oxigenio_mg_l = p_oxigenio_mg_l,
                        populacao_viva = v_pop
  where id = v_id;
  perform app.gravar_grupos_biometria(v_id, p_empresa, p_grupos);
  return v_id;
end $$;
revoke all on function public.registrar_biometria_grupos(uuid, uuid, date, jsonb, uuid, uuid, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.registrar_biometria_grupos(uuid, uuid, date, jsonb, uuid, uuid, text, text, numeric, numeric, numeric) to authenticated;

-- Corrigir os grupos (somar, corrigir ou tirar um grupo) de uma biometria já lançada
create or replace function public.corrigir_grupos_biometria(p_biometria uuid, p_grupos jsonb) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  b biometrias%rowtype;
  v_peixes int;
  v_peso numeric;
begin
  select * into b from biometrias where id = p_biometria;
  if not found or b.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Biometria não encontrada' using errcode = 'no_data_found';
  end if;
  if not app.pode_algum(b.empresa_id, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não tem permissão para lançar biometria' using errcode = 'insufficient_privilege';
  end if;
  select c.peixes, c.peso_total_g into v_peixes, v_peso from app.conferir_grupos_biometria(p_grupos) c;
  update biometrias set peixes_amostrados = v_peixes, peso_total_g = v_peso, peso_medio_g = round(v_peso / v_peixes, 2)
  where id = b.id;
  perform app.gravar_grupos_biometria(b.id, b.empresa_id, p_grupos);
  return round(v_peso / v_peixes, 2);
end $$;
revoke all on function public.corrigir_grupos_biometria(uuid, jsonb) from public, anon;
grant execute on function public.corrigir_grupos_biometria(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Parâmetros da ração por empresa (sem linha = padrão)
-- ---------------------------------------------------------------------------
create table racao_parametros (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  reserva_sacos smallint not null default 10 check (reserva_sacos between 0 and 200),
  prazo_entrega_dias smallint not null default 7 check (prazo_entrega_dias between 0 and 90),
  amostra_pct numeric(4,1) not null default 2 check (amostra_pct > 0 and amostra_pct <= 100),
  amostra_min integer not null default 30 check (amostra_min between 1 and 10000),
  amostra_max integer not null default 100 check (amostra_max between 1 and 10000),
  updated_at timestamptz not null default now(),
  check (amostra_max >= amostra_min)
);
comment on table racao_parametros is 'Reserva de sacos de ração à frente, prazo do fornecedor e tamanho da amostra da biometria, por empresa';
alter table racao_parametros enable row level security;
create policy membros on racao_parametros using (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on racao_parametros as restrictive for insert
  with check (app.pode_algum(empresa_id, array['racao.editar', 'estoque.editar']));
create policy escrita_alterar on racao_parametros as restrictive for update
  using (app.pode_algum(empresa_id, array['racao.editar', 'estoque.editar']));
create policy escrita_apagar on racao_parametros as restrictive for delete
  using (app.pode_algum(empresa_id, array['racao.editar', 'estoque.editar']));
revoke all on racao_parametros from anon;
grant select, insert, update, delete on racao_parametros to authenticated;

-- Zerar o sistema leva os grupos junto com as biometrias (cascade) e os parâmetros ficam (são configuração)

select app.travar_referencias();
