-- Apontamento por turno: no viveiro só se conta o total de ovos, em quantos lançamentos
-- forem precisos no dia (manhã e tarde). A separação por classe acontece depois, na classificação.
--
-- apontamentos_diarios continua com uma linha por lote + viveiro + dia, agora como soma
-- dos lançamentos; indicadores, custo do kg e alertas seguem lendo dela.

-- ---------------------------------------------------------------------------
-- 1. Classe "Sem classificação": recebe os ovos recolhidos até passarem pela classificação
-- ---------------------------------------------------------------------------

alter table classes_peixe add column sem_classificacao boolean not null default false;
create unique index classes_peixe_sem_classificacao on classes_peixe (empresa_id) where sem_classificacao;

create or replace function app.classe_sem_classificacao(p_empresa uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from classes_peixe where empresa_id = p_empresa and sem_classificacao;
  if found then return v_id; end if;
  insert into classes_peixe (empresa_id, nome, comercializavel, ordem, sem_classificacao)
  values (p_empresa, 'Sem classificação', false, -1, true)
  on conflict (empresa_id, nome) do update set sem_classificacao = true
  returning id into v_id;
  return v_id;
end $$;

do $$
declare e uuid;
begin
  for e in select id from empresas loop
    perform app.classe_sem_classificacao(e);
  end loop;
end $$;

-- empresa nova ganha a classe junto com as demais
create or replace function app.classe_sem_classificacao_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.classe_sem_classificacao(new.id);
  return null;
end $$;
create trigger classe_sem_classificacao after insert on empresas
  for each row execute function app.classe_sem_classificacao_empresa();

create or replace function app.protege_sem_classificacao() returns trigger language plpgsql as $$
begin
  -- empresa sendo excluída leva as classes junto
  if tg_op = 'DELETE' and old.sem_classificacao and exists (select 1 from empresas where id = old.empresa_id) then
    raise exception 'A classe Sem classificação recebe a produção do apontamento e não pode ser excluída'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.sem_classificacao is distinct from new.sem_classificacao then
    raise exception 'Não dá para mudar qual classe recebe a produção sem classificação' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger protege_sem_classificacao before update or delete on classes_peixe
  for each row execute function app.protege_sem_classificacao();

-- o estoque mostra qual classe é a da produção ainda não classificada
create or replace view estoque_peixe with (security_invoker = true) as
select c.empresa_id, c.id as classe_id, c.nome as classe, c.ordem, c.comercializavel, p.id as produto_id,
       coalesce(s.saldo, 0)::bigint as saldo,
       least(coalesce(s.saldo, 0), coalesce(k.ovos, 0))::bigint as em_carencia,
       greatest(coalesce(s.saldo, 0) - coalesce(k.ovos, 0), 0)::bigint as disponivel,
       c.sem_classificacao
from classes_peixe c
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (select produto_id, sum(quantidade) as saldo from movimentos_estoque group by produto_id) s on s.produto_id = p.id
left join (select classe_peixe_id, sum(ovos) as ovos from ovos_em_carencia group by classe_peixe_id) k on k.classe_peixe_id = c.id;

-- ---------------------------------------------------------------------------
-- 2. Lançamentos do dia, cada um com o seu turno
-- ---------------------------------------------------------------------------

create table apontamento_lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  apontamento_id uuid not null references apontamentos_diarios(id) on delete cascade,
  turno text not null check (turno in ('manha', 'tarde')),
  ovos int not null default 0 check (ovos >= 0),
  mortes int not null default 0 check (mortes >= 0),
  descartes int not null default 0 check (descartes >= 0),
  racao_kg numeric(10,3) not null default 0 check (racao_kg >= 0),
  agua_l numeric(10,1) check (agua_l >= 0),
  observacoes text,
  origem text not null default 'web' check (origem in ('web','app','importacao','sensor')),
  client_id uuid unique,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on apontamento_lancamentos (apontamento_id);
create index on apontamento_lancamentos (empresa_id, created_at);

alter table apontamento_lancamentos enable row level security;
create policy membros on apontamento_lancamentos
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on apontamento_lancamentos as restrictive for insert
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_alterar on apontamento_lancamentos as restrictive for update
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']))
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_apagar on apontamento_lancamentos as restrictive for delete
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));

-- O que já foi apontado vira um lançamento da manhã. O estoque dele já entrou por classe
-- (apontamento_ovos), por isso a cópia acontece antes do gatilho de estoque existir.
insert into apontamento_lancamentos (empresa_id, apontamento_id, turno, ovos, mortes, descartes, racao_kg, agua_l,
                                     observacoes, origem, client_id, created_by, created_at)
select empresa_id, id, 'manha', ovos_total, mortes, descartes, racao_kg, agua_l, observacoes, origem, client_id,
       created_by, created_at
from apontamentos_diarios;

-- Ovos do lançamento entram no estoque como "Sem classificação"
create or replace function app.lancamento_para_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare a apontamentos_diarios%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    delete from movimentos_estoque where origem_tabela = 'apontamento_lancamentos' and origem_id = old.id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.ovos > 0 then
    select * into a from apontamentos_diarios where id = new.apontamento_id;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, viveiro_id,
                                    origem_tabela, origem_id, created_by)
    values (a.empresa_id, app.produto_base_peixe(app.classe_sem_classificacao(a.empresa_id)), app.deposito_ovos(a.empresa_id),
            a.data, 'producao_ovos', new.ovos, a.lote_id, a.viveiro_id, 'apontamento_lancamentos', new.id, auth.uid());
  end if;
  return null;
end $$;

create trigger lancamento_para_estoque after insert or update or delete on apontamento_lancamentos
  for each row execute function app.lancamento_para_estoque();

-- O dia é a soma dos lançamentos; sem lançamento, o dia some.
create or replace function app.totalizar_apontamento(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  a apontamentos_diarios%rowtype;
  t record;
begin
  select * into a from apontamentos_diarios where id = p_id for update;
  if not found then return; end if;
  select count(*) as n, coalesce(sum(ovos), 0) as ovos, coalesce(sum(mortes), 0) as mortes,
         coalesce(sum(descartes), 0) as descartes, coalesce(sum(racao_kg), 0) as racao_kg, sum(agua_l) as agua_l,
         string_agg(observacoes, ' · ' order by turno, created_at) as observacoes
  into t from apontamento_lancamentos where apontamento_id = p_id;
  if t.n = 0 then
    delete from apontamentos_diarios where id = p_id;
  else
    update apontamentos_diarios set ovos_total = t.ovos, mortes = t.mortes, descartes = t.descartes,
      racao_kg = t.racao_kg, agua_l = t.agua_l, observacoes = t.observacoes, updated_at = now()
    where id = p_id;
  end if;
  perform app.recalcular_peixes(a.lote_id, a.viveiro_id, a.data);
end $$;

create or replace function app.totalizar_lancamento() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform app.totalizar_apontamento(old.apontamento_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.apontamento_id <> old.apontamento_id) then
    perform app.totalizar_apontamento(new.apontamento_id);
  end if;
  return null;
end $$;

create trigger totalizar_lancamento after insert or update or delete on apontamento_lancamentos
  for each row execute function app.totalizar_lancamento();

-- ---------------------------------------------------------------------------
-- 3. Registrar um lançamento (web e app de campo)
-- ---------------------------------------------------------------------------

drop function public.registrar_apontamento(uuid, uuid, uuid, date, jsonb, int, int, numeric, numeric, text, uuid, text);

create function public.registrar_apontamento(
  p_empresa uuid,
  p_lote uuid,
  p_viveiro uuid,
  p_data date,
  p_turno text,
  p_ovos int,
  p_mortes int default 0,
  p_descartes int default 0,
  p_racao_kg numeric default 0,
  p_agua_l numeric default null,
  p_observacoes text default null,
  p_client_id uuid default null,
  p_origem text default 'web'
) returns uuid   -- id do lançamento
language plpgsql set search_path = public as $$
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

  if p_data > current_date then
    raise exception 'Não dá para apontar uma data futura' using errcode = 'check_violation';
  end if;
  if p_turno is null or p_turno not in ('manha', 'tarde') then
    raise exception 'Informe o turno: manhã ou tarde' using errcode = 'check_violation';
  end if;
  if p_ovos is null or p_ovos < 0 then
    raise exception 'Informe a quantidade de ovos do lançamento' using errcode = 'check_violation';
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

  insert into apontamento_lancamentos (empresa_id, apontamento_id, turno, ovos, mortes, descartes, racao_kg, agua_l,
                                       observacoes, origem, client_id, created_by)
  values (p_empresa, v_dia, p_turno, p_ovos, coalesce(p_mortes, 0), coalesce(p_descartes, 0), coalesce(p_racao_kg, 0),
          p_agua_l, nullif(trim(p_observacoes), ''), p_origem, p_client_id, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Classificação: tira do "Sem classificação" e põe em cada classe
-- ---------------------------------------------------------------------------

alter table movimentos_estoque drop constraint movimentos_estoque_tipo_check;
alter table movimentos_estoque add constraint movimentos_estoque_tipo_check check (tipo in ('entrada_compra','producao_ovos',
  'producao_racao','consumo_lote','consumo_producao','venda','ajuste','transferencia','perda','classificacao'));

create table despescas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  data date not null,
  lote_id uuid references lotes(id) on delete restrict,
  total int not null check (total > 0),
  observacoes text,
  client_id uuid unique,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on despescas (empresa_id, data);

alter table despescas enable row level security;
create policy membros on despescas
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on despescas as restrictive for insert
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'estoque.editar']));
create policy escrita_alterar on despescas as restrictive for update
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'estoque.editar']))
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'estoque.editar']));
create policy escrita_apagar on despescas as restrictive for delete
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'estoque.editar']));

-- Excluir a classificação desfaz os movimentos dela
create or replace function app.desfaz_classificacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from movimentos_estoque where origem_tabela = 'despescas' and origem_id = old.id;
  return null;
end $$;
create trigger desfaz_classificacao after delete on despescas
  for each row execute function app.desfaz_classificacao();

-- Ovos em carência continuam sem classificação: só se classifica o disponível.
create or replace function public.registrar_despesca(
  p_empresa uuid,
  p_data date,
  p_itens jsonb,                -- {"<classe_id>": quantidade, ...}
  p_lote uuid default null,
  p_observacoes text default null,
  p_client_id uuid default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_sem uuid;
  v_total int;
  v_disponivel bigint;
begin
  if p_client_id is not null then
    select id into v_id from despescas where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'Data da classificação inválida' using errcode = 'check_violation';
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'estoque.editar']) then
    raise exception 'Seu usuário não tem permissão para classificar ovos' using errcode = 'insufficient_privilege';
  end if;
  if p_lote is not null and not exists (select 1 from lotes where id = p_lote and empresa_id = p_empresa) then
    raise exception 'Lote não encontrado' using errcode = 'check_violation';
  end if;

  v_sem := app.classe_sem_classificacao(p_empresa);
  if jsonb_typeof(coalesce(p_itens, '{}')) <> 'object' or exists (
    select 1 from jsonb_each_text(coalesce(p_itens, '{}')) o
    where o.value !~ '^\d+$'
       or not exists (select 1 from classes_peixe c where c.id::text = o.key and c.empresa_id = p_empresa and not c.sem_classificacao)
  ) then
    raise exception 'Classe de ovo inválida ou quantidade negativa' using errcode = 'check_violation';
  end if;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(coalesce(p_itens, '{}'));
  if v_total <= 0 then
    raise exception 'Informe quantos ovos foram para cada classe' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('registrar_despesca:' || p_empresa));   -- duas ao mesmo tempo não passam do saldo
  select disponivel into v_disponivel from estoque_peixe where classe_id = v_sem;
  if v_total > coalesce(v_disponivel, 0) then
    raise exception 'Há só % ovos sem classificação disponíveis (os em carência não entram)', coalesce(v_disponivel, 0)
      using errcode = 'check_violation';
  end if;

  insert into despescas (empresa_id, data, lote_id, total, observacoes, client_id, created_by)
  values (p_empresa, p_data, p_lote, v_total, nullif(trim(p_observacoes), ''), p_client_id, auth.uid())
  returning id into v_id;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, origem_tabela, origem_id, created_by)
  select p_empresa, app.produto_base_peixe(c), app.deposito_ovos(p_empresa), p_data, 'classificacao', q, p_lote,
         'despescas', v_id, auth.uid()
  from (select v_sem as c, -v_total as q
        union all
        select key::uuid, value::int from jsonb_each_text(p_itens) where value::int > 0) x;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Permissões
-- ---------------------------------------------------------------------------

alter function app.recalcular_peixes(uuid, uuid, date) security definer set search_path = public;
revoke all on function public.registrar_apontamento(uuid, uuid, uuid, date, text, int, int, int, numeric, numeric, text, uuid, text) from public;
revoke all on function public.registrar_despesca(uuid, date, jsonb, uuid, text, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.registrar_apontamento(uuid, uuid, uuid, date, text, int, int, int, numeric, numeric, text, uuid, text) to authenticated;
    grant execute on function public.registrar_despesca(uuid, date, jsonb, uuid, text, uuid) to authenticated;
  end if;
end $$;
