-- Planejamento de lotes (Gestão > Planejamento): cada piscicultura descreve o próprio manejo (semanas na alevinagem e no
-- recria, idade de descarte, vazio sanitário de cada tipo de viveiro, intervalo entre lotes), cadastra os lotes
-- que pretende povoar e os custos futuros (alevino, vacinas, ração, mão de obra...) para o estudo de viabilidade.
-- A previsão (transferências, renovação dos viveiros de engorda e fluxo de caixa) é calculada na aplicação
-- (src/lib/planejamento.ts) a partir destas tabelas, dos lotes reais e da curva da espécie.

-- ---------------------------------------------------------------------------
-- 1. Permissões: módulo novo "planejamento"
-- ---------------------------------------------------------------------------

create or replace function app.permissoes_perfil(p_perfil text) returns text[]
language sql immutable as $$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver']
    when 'vendedor' then array['vendas.lancar', 'pdv.operar', 'estoque.ver', 'contas-a-receber.ver', 'cobrancas.ver',
      'contatos.editar', 'produtos.ver']
    when 'caixa' then array['pdv.operar', 'vendas.ver']
    when 'financeiro' then array['contas-a-pagar.editar', 'contas-a-receber.editar', 'contas.editar', 'cobrancas.emitir',
      'cartoes.editar', 'conciliacao.editar', 'fluxo-de-caixa.ver', 'relatorios.editar', 'financeiro.fechar', 'custo-do-kg.ver',
      'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar']
    else array[]::text[]
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. Parâmetros de manejo e premissas financeiras (uma linha por empresa; sem linha valem os padrões da tela)
-- ---------------------------------------------------------------------------

create table planejamento_parametros (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  semanas_alevinagem smallint not null default 8 check (semanas_alevinagem between 1 and 20),
  semanas_recria smallint not null default 8 check (semanas_recria between 0 and 20),
  semanas_cultivo smallint not null default 80 check (semanas_cultivo between 40 and 130),
  -- Vazio sanitário: limpeza, desinfecção e descanso do viveiro entre um lote e outro. Mínimo de 15 dias.
  vazio_alevinagem_dias smallint not null default 28 check (vazio_alevinagem_dias between 15 and 180),
  vazio_recria_dias smallint not null default 15 check (vazio_recria_dias between 15 and 180),
  vazio_engorda_dias smallint not null default 30 check (vazio_engorda_dias between 15 and 180),
  intervalo_lotes_semanas smallint not null default 12 check (intervalo_lotes_semanas between 1 and 104),
  peixes_por_lote int check (peixes_por_lote is null or peixes_por_lote > 0),
  especie_id uuid references especies(id) on delete set null,
  horizonte_meses smallint not null default 24 check (horizonte_meses between 6 and 60),
  -- Premissas do estudo de viabilidade
  preco_duzia_cents bigint check (preco_duzia_cents is null or preco_duzia_cents >= 0),
  preco_peixe_descarte_cents bigint check (preco_peixe_descarte_cents is null or preco_peixe_descarte_cents >= 0),
  racao_alevinagem_kg_cents bigint check (racao_alevinagem_kg_cents is null or racao_alevinagem_kg_cents >= 0),
  racao_recria_kg_cents bigint check (racao_recria_kg_cents is null or racao_recria_kg_cents >= 0),
  racao_engorda_kg_cents bigint check (racao_engorda_kg_cents is null or racao_engorda_kg_cents >= 0),
  mortalidade_recria_pct numeric(5,2) not null default 4 check (mortalidade_recria_pct between 0 and 50),
  mortalidade_engorda_pct numeric(5,2) not null default 8 check (mortalidade_engorda_pct between 0 and 60),
  perda_despesca_pct numeric(5,2) not null default 3 check (perda_despesca_pct between 0 and 50),
  updated_at timestamptz not null default now(),
  constraint crescimento_total check (semanas_alevinagem + semanas_recria between 8 and 26),
  constraint descarte_depois_da_recria check (semanas_cultivo > semanas_alevinagem + semanas_recria + 10)
);

-- ---------------------------------------------------------------------------
-- 3. Custos futuros: cada item diz quando incide (fase), sobre o quê (peixe, lote, mês, dúzia) e desde quando vale.
--    Dois itens com a mesma descrição e datas de vigência diferentes = mudança de preço prevista.
-- ---------------------------------------------------------------------------

create table planejamento_custos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  descricao text not null check (btrim(descricao) <> ''),
  categoria text not null check (categoria in ('alevino','vacina','medicamento','racao','mao_obra','energia',
    'embalagem','transporte','manutencao','outros')),
  fase text not null check (fase in ('cria','recria','producao','ciclo')),
  base text not null check (base in ('peixe','lote','mes','duzia')),
  valor_cents bigint not null check (valor_cents >= 0),
  semana smallint check (semana between 1 and 130),
  vigente_desde date,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duzia_so_na_producao check (base <> 'duzia' or fase in ('producao','ciclo')),
  constraint semana_so_em_valor_unico check (semana is null or base in ('peixe','lote'))
);
create index on planejamento_custos (empresa_id);

-- ---------------------------------------------------------------------------
-- 4. Lotes planejados: a data é a do povoamento dos alevinos de 1 dia. Viveiro vazio = escolha automática.
-- ---------------------------------------------------------------------------

create table lotes_planejados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null check (btrim(codigo) <> ''),
  data_povoamento date not null,
  qtd_peixes int not null check (qtd_peixes > 0),
  especie_id uuid references especies(id) on delete set null,
  viveiro_alevinagem_id uuid references viveiros(id) on delete set null,
  viveiro_recria_id uuid references viveiros(id) on delete set null,
  viveiro_engorda_id uuid references viveiros(id) on delete set null,
  situacao text not null default 'planejado' check (situacao in ('planejado','confirmado','povoado','cancelado')),
  lote_id uuid references lotes(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index on lotes_planejados (empresa_id, data_povoamento);

-- Viveiros, espécie e lote precisam ser da mesma empresa; o viveiro precisa servir para a fase.
create or replace function app.confere_lote_planejado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_fin text;
begin
  new.codigo := btrim(new.codigo);
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
    new.updated_at := now();
  end if;
  if new.viveiro_alevinagem_id is not null then
    select finalidade into v_fin from viveiros where id = new.viveiro_alevinagem_id and empresa_id = new.empresa_id;
    if v_fin is null or v_fin not in ('cria','cria_recria') then
      raise exception 'A alevinagem escolhido precisa ser um viveiro de cria desta empresa' using errcode = 'check_violation';
    end if;
  end if;
  if new.viveiro_recria_id is not null then
    select finalidade into v_fin from viveiros where id = new.viveiro_recria_id and empresa_id = new.empresa_id;
    if v_fin is null or v_fin not in ('recria','cria_recria') then
      raise exception 'A recria escolhido precisa ser um viveiro de recria desta empresa' using errcode = 'check_violation';
    end if;
  end if;
  if new.viveiro_engorda_id is not null then
    select finalidade into v_fin from viveiros where id = new.viveiro_engorda_id and empresa_id = new.empresa_id;
    if v_fin is null or v_fin <> 'producao' then
      raise exception 'O viveiro de engorda escolhido precisa ser um viveiro de produção desta empresa' using errcode = 'check_violation';
    end if;
  end if;
  if new.especie_id is not null and not exists (
    select 1 from especies where id = new.especie_id and (empresa_id is null or empresa_id = new.empresa_id)) then
    raise exception 'Espécie de outra empresa' using errcode = 'check_violation';
  end if;
  if new.lote_id is not null and not exists (select 1 from lotes where id = new.lote_id and empresa_id = new.empresa_id) then
    raise exception 'Lote de outra empresa' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger confere_lote_planejado before insert or update on lotes_planejados
  for each row execute function app.confere_lote_planejado();

create or replace function app.confere_parametros_planejamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
  end if;
  new.updated_at := now();
  if new.especie_id is not null and not exists (
    select 1 from especies where id = new.especie_id and (empresa_id is null or empresa_id = new.empresa_id)) then
    raise exception 'Espécie de outra empresa' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger confere_parametros_planejamento before insert or update on planejamento_parametros
  for each row execute function app.confere_parametros_planejamento();

create or replace function app.carimba_custo_planejamento() returns trigger language plpgsql as $$
begin
  new.descricao := btrim(new.descricao);
  if tg_op = 'UPDATE' then
    new.empresa_id := old.empresa_id;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger carimba_custo_planejamento before insert or update on planejamento_custos
  for each row execute function app.carimba_custo_planejamento();

-- ---------------------------------------------------------------------------
-- 5. RLS: membros veem; só quem tem planejamento.editar grava
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['planejamento_parametros', 'planejamento_custos', 'lotes_planejados'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy membros on %I using (empresa_id in (select app.minhas_empresas())) '
      'with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy escrita_inserir on %I as restrictive for insert '
      'with check (app.pode(empresa_id, ''planejamento.editar''))', t);
    execute format('create policy escrita_alterar on %I as restrictive for update '
      'using (app.pode(empresa_id, ''planejamento.editar'')) with check (app.pode(empresa_id, ''planejamento.editar''))', t);
    execute format('create policy escrita_apagar on %I as restrictive for delete '
      'using (app.pode(empresa_id, ''planejamento.editar''))', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on planejamento_parametros, planejamento_custos, lotes_planejados to authenticated;
  end if;
end $$;
