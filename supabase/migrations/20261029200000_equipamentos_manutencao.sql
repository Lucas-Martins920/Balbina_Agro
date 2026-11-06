-- Manutenções da piscicultura inteira: viveiros, fábrica de ração, classificação e estrutura geral.
--
-- Pedido do Nicolas (2026-10-29): cadastrar os equipamentos e estruturas (comedouros, bebedouros, exaustores,
-- nebulizadores, gerador, esteiras de ovos; na fábrica moedor, peneira, misturador, balança e os motores;
-- a classificadora de ovos) para acompanhar a manutenção preventiva, a troca programada no fim da vida útil,
-- checklists diários/semanais/mensais e um relatório da manutenção da piscicultura toda. Menu próprio "Manutenções".
--
-- Modelo (manutenção preventiva por tempo ou por uso, como no TPM):
-- 1. `equipamentos`: o item, com local (viveiro, fábrica de ração, classificação ou piscicultura), "faz parte de"
--    (o motor do moedor), quantidade, marca/modelo, instalação, vida útil em meses, valor de compra e, se tiver
--    horímetro, a leitura de horas.
-- 2. `planos_manutencao`: o que fazer e de quanto em quanto tempo. Vence pelo que chegar primeiro: dias ou horas.
--    `ultima_data`/`ultimas_horas` guardam quando foi feita antes do sistema; depois vale o histórico.
--    Planos de até 31 dias formam os checklists diário (1 dia), semanal (até 7) e mensal (até 31).
-- 3. `manutencoes`: o histórico (preventiva, corretiva, inspeção ou troca do equipamento), com custo, horas
--    paradas, resultado do checklist (ok/problema) e, se quiser, a conta a pagar no centro de custo do local.
--    Troca do equipamento renova a vida útil.
-- 4. Views `agenda_manutencao` e `equipamentos_situacao`; o que vence, os problemas do checklist, os parados e
--    o fim da vida útil entram nos alertas do painel.
--
-- Permissões novas: "manutencao.ver", "manutencao.lancar" (registrar manutenção e checklist: perfil apontador)
-- e "manutencao.editar" (cadastro de equipamentos e planos: perfil cadastros). Entra em todos os planos Balbina.

-- ---------------------------------------------------------------------------
-- 1. Permissões e planos
-- ---------------------------------------------------------------------------

update niveis_plano set modulos = modulos || 'manutencao'::text
where not ('*' = any(modulos) or 'manutencao' = any(modulos));

create or replace function app.permissoes_perfil(p_perfil text) returns text[]
language sql immutable as $$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar', 'manutencao.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver', 'manutencao.lancar']
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
-- 2. Tabelas
-- ---------------------------------------------------------------------------

create table equipamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  local text not null default 'viveiro' check (local in ('viveiro', 'fabrica_racao', 'classificacao', 'piscicultura')),
  viveiro_id uuid references viveiros(id) on delete cascade,
  pai_id uuid references equipamentos(id) on delete set null,
  tipo text not null default 'outro' check (tipo in (
    'comedouro', 'bebedouro', 'ventilacao', 'nebulizacao', 'aquecimento', 'iluminacao', 'coleta_ovos', 'remocao_esterco',
    'cortina', 'gaiola', 'estrutura', 'gerador', 'eletrica', 'hidraulica', 'motor_eletrico', 'moinho', 'peneira',
    'misturador', 'balanca', 'transportador', 'silo', 'classificadora', 'compressor', 'veiculo', 'outro')),
  nome text not null check (length(trim(nome)) > 0),
  quantidade integer not null default 1 check (quantidade between 1 and 1000000),
  marca text,
  modelo text,
  numero_serie text,
  potencia text,                    -- placa do motor: "10 cv, 220/380 V, 1750 rpm"
  instalado_em date,
  vida_util_meses integer check (vida_util_meses between 1 and 1200),
  valor_cents bigint check (valor_cents >= 0),
  usa_horimetro boolean not null default false,
  horas_uso numeric(12,1) check (horas_uso >= 0),
  situacao text not null default 'operando' check (situacao in ('operando', 'parado', 'baixado')),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viveiro_do_local check ((local = 'viveiro') = (viveiro_id is not null)),
  constraint nao_e_parte_de_si check (pai_id is distinct from id)
);
create unique index equipamentos_nome_no_local on equipamentos (empresa_id, local, coalesce(viveiro_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
create index on equipamentos (viveiro_id);
create index on equipamentos (pai_id);

create table planos_manutencao (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  equipamento_id uuid not null references equipamentos(id) on delete cascade,
  descricao text not null check (length(trim(descricao)) > 0),
  tipo text not null default 'preventiva' check (tipo in ('preventiva', 'inspecao', 'limpeza', 'lubrificacao', 'calibracao', 'troca_peca')),
  intervalo_dias integer check (intervalo_dias between 1 and 3650),
  intervalo_horas numeric(10,1) check (intervalo_horas > 0),
  aviso_dias integer not null default 7 check (aviso_dias between 0 and 365),
  ultima_data date,
  ultimas_horas numeric(12,1) check (ultimas_horas >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tem_intervalo check (intervalo_dias is not null or intervalo_horas is not null)
);
create index on planos_manutencao (equipamento_id);
create index on planos_manutencao (empresa_id);

create table manutencoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  equipamento_id uuid not null references equipamentos(id) on delete cascade,
  plano_id uuid references planos_manutencao(id) on delete set null,
  data date not null,
  tipo text not null default 'preventiva' check (tipo in ('preventiva', 'corretiva', 'inspecao', 'troca_equipamento')),
  descricao text not null check (length(trim(descricao)) > 0),
  resultado text check (resultado in ('ok', 'problema')),
  origem text not null default 'manual' check (origem in ('manual', 'checklist')),
  horas numeric(12,1) check (horas >= 0),
  horas_parado numeric(8,1) check (horas_parado >= 0),
  custo_cents bigint not null default 0 check (custo_cents >= 0),
  responsavel text,
  contato_id uuid references contatos(id) on delete set null,
  agendamento_id uuid references agendamentos(id) on delete set null,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on manutencoes (equipamento_id, data desc);
create index on manutencoes (plano_id, data desc);
create index on manutencoes (empresa_id, data desc);
create index on manutencoes (contato_id);
create index on manutencoes (agendamento_id);

alter table equipamentos enable row level security;
alter table planos_manutencao enable row level security;
alter table manutencoes enable row level security;
create policy membros on equipamentos using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy membros on planos_manutencao using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));
create policy membros on manutencoes using (empresa_id in (select app.minhas_empresas()))
  with check (empresa_id in (select app.minhas_empresas()));

create policy escrita_inserir on equipamentos as restrictive for insert with check (app.pode(empresa_id, 'manutencao.editar'));
create policy escrita_alterar on equipamentos as restrictive for update
  using (app.pode(empresa_id, 'manutencao.editar')) with check (app.pode(empresa_id, 'manutencao.editar'));
create policy escrita_apagar on equipamentos as restrictive for delete using (app.pode(empresa_id, 'manutencao.editar'));
create policy escrita_inserir on planos_manutencao as restrictive for insert with check (app.pode(empresa_id, 'manutencao.editar'));
create policy escrita_alterar on planos_manutencao as restrictive for update
  using (app.pode(empresa_id, 'manutencao.editar')) with check (app.pode(empresa_id, 'manutencao.editar'));
create policy escrita_apagar on planos_manutencao as restrictive for delete using (app.pode(empresa_id, 'manutencao.editar'));
create policy escrita_inserir on manutencoes as restrictive for insert
  with check (app.pode_algum(empresa_id, array['manutencao.editar', 'manutencao.lancar']));
create policy escrita_alterar on manutencoes as restrictive for update
  using (app.pode_algum(empresa_id, array['manutencao.editar', 'manutencao.lancar']))
  with check (app.pode_algum(empresa_id, array['manutencao.editar', 'manutencao.lancar']));
create policy escrita_apagar on manutencoes as restrictive for delete
  using (app.pode_algum(empresa_id, array['manutencao.editar', 'manutencao.lancar']));

-- ---------------------------------------------------------------------------
-- 3. Regras
-- ---------------------------------------------------------------------------

create or replace function app.equipamento_conferir() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := trim(new.nome);
  new.updated_at := now();
  if new.local <> 'viveiro' then new.viveiro_id := null; end if;
  if not new.usa_horimetro then new.horas_uso := null; end if;
  if new.pai_id is not null and exists (
    with recursive acima(id, nivel) as (
      select pai_id, 1 from equipamentos where id = new.pai_id
      union all
      select e.pai_id, a.nivel + 1 from equipamentos e join acima a on e.id = a.id where a.nivel < 20
    ) select 1 from acima where id = new.id
  ) then
    raise exception 'Um equipamento não pode fazer parte de uma peça dele mesmo' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger conferir before insert or update on equipamentos for each row execute function app.equipamento_conferir();

create or replace function app.plano_manutencao_conferir() returns trigger
language plpgsql set search_path = public as $$
declare v_horimetro boolean;
begin
  new.descricao := trim(new.descricao);
  new.updated_at := now();
  select usa_horimetro into v_horimetro from equipamentos where id = new.equipamento_id;
  if new.intervalo_horas is not null and not v_horimetro then
    raise exception 'Intervalo em horas só vale para equipamento com horímetro' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger conferir before insert or update on planos_manutencao for each row execute function app.plano_manutencao_conferir();

create or replace function app.manutencao_conferir() returns trigger
language plpgsql set search_path = public as $$
begin
  new.descricao := trim(new.descricao);
  if new.data > app.hoje(new.empresa_id) then
    raise exception 'Manutenção feita não pode ter data futura' using errcode = 'check_violation';
  end if;
  if new.plano_id is not null and not exists (select 1 from planos_manutencao where id = new.plano_id and equipamento_id = new.equipamento_id) then
    raise exception 'O plano de manutenção é de outro equipamento' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger conferir before insert or update on manutencoes for each row execute function app.manutencao_conferir();

-- Manutenção lançada atualiza o equipamento: horímetro (nunca volta), troca renova a vida útil.
-- Security definer porque quem só lança manutenção não edita o cadastro.
create or replace function app.manutencao_aplicar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update equipamentos e set
    horas_uso = case when e.usa_horimetro and new.horas is not null then greatest(coalesce(e.horas_uso, 0), new.horas) else e.horas_uso end,
    instalado_em = case when new.tipo = 'troca_equipamento' and new.data >= coalesce(e.instalado_em, '-infinity') then new.data else e.instalado_em end
  where e.id = new.equipamento_id;
  return new;
end $$;
revoke all on function app.manutencao_aplicar() from public;
create trigger aplicar after insert or update of horas, tipo, data on manutencoes
  for each row execute function app.manutencao_aplicar();

-- Nome do local para telas, alertas e relatório
create or replace function app.nome_local(p_local text, p_viveiro text) returns text
language sql immutable as $$
  select case p_local when 'viveiro' then coalesce(p_viveiro, 'Viveiro') when 'fabrica_racao' then 'Fábrica de ração'
                      when 'classificacao' then 'Classificação' else 'Piscicultura (geral)' end
$$;

-- ---------------------------------------------------------------------------
-- 4. Views
-- ---------------------------------------------------------------------------

-- Agenda: cada plano com a última vez feita, a próxima e a situação. Vence pelo que chegar primeiro.
-- "proxima" = dentro do aviso (dias, nunca mais que o intervalo: o diário só avisa no dia) ou nos últimos 10% das horas.
create view agenda_manutencao with (security_invoker = true) as
with base as (
  select p.id, p.empresa_id, p.equipamento_id, p.descricao, p.tipo, p.intervalo_dias, p.intervalo_horas, p.aviso_dias, p.ativo,
         e.nome as equipamento_nome, e.tipo as equipamento_tipo, e.local, e.viveiro_id, app.nome_local(e.local, g.nome) as local_nome,
         e.situacao as equipamento_situacao, e.usa_horimetro, e.horas_uso,
         greatest(m.ultima_data, p.ultima_data, case when m.ultima_data is null and p.ultima_data is null then coalesce(e.instalado_em, p.created_at::date) end) as ultima_data,
         greatest(m.ultimas_horas, p.ultimas_horas, case when m.ultimas_horas is null and p.ultimas_horas is null then 0 end) as ultimas_horas,
         m.vezes, app.hoje(p.empresa_id) as hoje
  from planos_manutencao p
  join equipamentos e on e.id = p.equipamento_id
  left join viveiros g on g.id = e.viveiro_id
  left join lateral (select max(x.data) as ultima_data, max(x.horas) as ultimas_horas, count(*) as vezes
                     from manutencoes x where x.plano_id = p.id) m on true
), prox as (
  select b.*,
         (b.ultima_data + b.intervalo_dias) as proxima_data,
         (b.ultimas_horas + b.intervalo_horas) as proximas_horas,
         (b.ultima_data + b.intervalo_dias) - b.hoje as dias_restantes,
         case when b.intervalo_horas is not null then (b.ultimas_horas + b.intervalo_horas) - coalesce(b.horas_uso, 0) end as horas_restantes
  from base b
)
select id, empresa_id, equipamento_id, descricao, tipo, intervalo_dias, intervalo_horas, aviso_dias, ativo,
       equipamento_nome, equipamento_tipo, local, viveiro_id, local_nome, equipamento_situacao, usa_horimetro, horas_uso,
       ultima_data, ultimas_horas, coalesce(vezes, 0)::int as vezes, proxima_data, proximas_horas, dias_restantes, horas_restantes,
       case
         when dias_restantes < 0 or horas_restantes <= 0 then 'vencida'
         when dias_restantes <= least(aviso_dias, intervalo_dias - 1) or horas_restantes <= intervalo_horas * 0.1 then 'proxima'
         else 'em_dia'
       end as situacao,
       case when intervalo_dias = 1 then 'diario' when intervalo_dias <= 7 then 'semanal' when intervalo_dias <= 31 then 'mensal' end as checklist
from prox;

-- Equipamento com vida útil, valor que resta (depreciação linear) e planos vencidos.
create view equipamentos_situacao with (security_invoker = true) as
select e.id, e.empresa_id, e.local, e.viveiro_id, app.nome_local(e.local, g.nome) as local_nome, e.pai_id, e.tipo, e.nome, e.quantidade,
       e.marca, e.modelo, e.numero_serie, e.potencia, e.instalado_em, e.vida_util_meses, e.valor_cents, e.usa_horimetro, e.horas_uso,
       e.situacao, e.observacoes,
       (e.instalado_em + make_interval(months => e.vida_util_meses))::date as fim_vida_util,
       ((e.instalado_em + make_interval(months => e.vida_util_meses))::date - app.hoje(e.empresa_id)) as dias_vida_restantes,
       case when e.valor_cents is not null and e.vida_util_meses is not null and e.instalado_em is not null then
         greatest(0, round(e.valor_cents * (1 - (app.hoje(e.empresa_id) - e.instalado_em)::numeric / nullif((e.instalado_em + make_interval(months => e.vida_util_meses))::date - e.instalado_em, 0))))::bigint
       end as valor_residual_cents,
       coalesce(a.vencidas, 0)::int as planos_vencidos,
       coalesce(a.proximas, 0)::int as planos_proximos,
       coalesce(a.planos, 0)::int as planos,
       u.ultima_manutencao,
       coalesce(u.custo_12m_cents, 0)::bigint as custo_12m_cents
from equipamentos e
left join viveiros g on g.id = e.viveiro_id
left join lateral (
  select count(*) filter (where ag.situacao = 'vencida') as vencidas, count(*) filter (where ag.situacao = 'proxima') as proximas, count(*) as planos
  from agenda_manutencao ag where ag.equipamento_id = e.id and ag.ativo
) a on true
left join lateral (
  select max(m.data) as ultima_manutencao,
         sum(m.custo_cents) filter (where m.data > app.hoje(e.empresa_id) - 365) as custo_12m_cents
  from manutencoes m where m.equipamento_id = e.id
) u on true;

-- Problemas apontados no checklist que ainda não tiveram conserto (corretiva ou troca depois deles)
create view problemas_manutencao with (security_invoker = true) as
select m.id, m.empresa_id, m.equipamento_id, e.nome as equipamento_nome, app.nome_local(e.local, g.nome) as local_nome,
       m.data, m.descricao, m.observacoes
from manutencoes m
join equipamentos e on e.id = m.equipamento_id
left join viveiros g on g.id = e.viveiro_id
where m.resultado = 'problema' and e.situacao <> 'baixado'
  and not exists (select 1 from manutencoes c where c.equipamento_id = m.equipamento_id
                  and c.tipo in ('corretiva', 'troca_equipamento') and (c.data, c.created_at) > (m.data, m.created_at));

-- ---------------------------------------------------------------------------
-- 5. Funções
-- ---------------------------------------------------------------------------

-- Centro de custo onde cai o gasto do equipamento: o do viveiro, ou o da fábrica de ração (tipo fabrica_racao).
create or replace function app.centro_custo_equipamento(p_equipamento uuid) returns uuid
language sql stable set search_path = public as $$
  select case e.local
    when 'viveiro' then (select centro_custo_id from viveiros where id = e.viveiro_id)
    when 'fabrica_racao' then (select id from centros_custo where empresa_id = e.empresa_id and tipo = 'fabrica_racao' and ativo order by created_at limit 1)
  end
  from equipamentos e where e.id = p_equipamento
$$;

-- Quem só lança manutenção pode marcar o equipamento como parado ou operando, sem editar o cadastro.
create or replace function app.situacao_equipamento(p_empresa uuid, p_equipamento uuid, p_situacao text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.pode_algum(p_empresa, array['manutencao.editar', 'manutencao.lancar']) then
    raise exception 'Seu usuário não tem permissão para lançar manutenção' using errcode = 'insufficient_privilege';
  end if;
  update equipamentos set situacao = p_situacao
  where id = p_equipamento and empresa_id = p_empresa and situacao <> 'baixado' and p_situacao in ('operando', 'parado');
end $$;
revoke all on function app.situacao_equipamento(uuid, uuid, text) from public;

-- Registra a manutenção feita. Com p_conta ({"categoria_id", "vencimento", "forma_pagamento"}) e custo, agenda a
-- conta a pagar no centro de custo do local (permissão de contas a pagar, pelo RLS dos títulos).
-- p_situacao muda o equipamento para operando ou parado depois do serviço (equipamento baixado não muda).
create or replace function public.registrar_manutencao(
  p_empresa uuid, p_equipamento uuid, p_data date, p_tipo text, p_descricao text,
  p_plano uuid default null, p_horas numeric default null, p_horas_parado numeric default null,
  p_custo_cents bigint default 0, p_responsavel text default null, p_contato uuid default null,
  p_observacoes text default null, p_situacao text default null, p_conta jsonb default null
) returns uuid language plpgsql set search_path = public as $$
declare
  e equipamentos%rowtype;
  v_id uuid;
  v_titulo uuid;
begin
  select * into e from equipamentos where id = p_equipamento and empresa_id = p_empresa;
  if not found then raise exception 'Equipamento não encontrado' using errcode = 'no_data_found'; end if;
  if p_situacao is not null and p_situacao not in ('operando', 'parado') then
    raise exception 'Situação do equipamento: operando ou parado' using errcode = 'check_violation';
  end if;

  insert into manutencoes (empresa_id, equipamento_id, plano_id, data, tipo, descricao, horas, horas_parado, custo_cents,
                           responsavel, contato_id, observacoes)
  values (p_empresa, p_equipamento, p_plano, p_data, p_tipo, p_descricao, p_horas, p_horas_parado, coalesce(p_custo_cents, 0),
          nullif(trim(p_responsavel), ''), p_contato, nullif(trim(p_observacoes), ''))
  returning id into v_id;

  if p_situacao is not null and e.situacao <> 'baixado' and e.situacao <> p_situacao then
    perform app.situacao_equipamento(p_empresa, p_equipamento, p_situacao);
  end if;

  if p_conta is not null and coalesce(p_custo_cents, 0) > 0 then
    v_titulo := public.agendar_titulo(
      p_empresa, 'pagar',
      format('Manutenção: %s - %s', e.nome, trim(p_descricao)),
      coalesce(nullif(p_conta->>'vencimento', '')::date, p_data),
      date_trunc('month', p_data)::date,
      p_custo_cents,
      jsonb_build_array(jsonb_build_object('categoria_id', p_conta->>'categoria_id',
                                           'centro_custo_id', app.centro_custo_equipamento(p_equipamento), 'valor_cents', p_custo_cents)),
      p_contato, 'Manutenção de equipamento', 1, nullif(p_conta->>'forma_pagamento', ''));
    update manutencoes set agendamento_id = v_titulo where id = v_id;
  end if;
  return v_id;
end $$;

-- Checklist: grava de uma vez os itens marcados. p_itens: [{"plano_id", "resultado": "ok"|"problema", "observacao"}]
-- Item com problema fica nos alertas até ter um conserto (corretiva ou troca) lançado depois.
create or replace function public.registrar_checklist(p_empresa uuid, p_data date, p_itens jsonb, p_responsavel text default null)
returns integer language plpgsql set search_path = public as $$
declare
  r jsonb;
  p planos_manutencao%rowtype;
  v_n integer := 0;
begin
  for r in select x from jsonb_array_elements(coalesce(p_itens, '[]')) x loop
    if coalesce(r->>'resultado', '') not in ('ok', 'problema') then
      raise exception 'Marque cada item como ok ou problema' using errcode = 'check_violation';
    end if;
    select * into p from planos_manutencao where id = (r->>'plano_id')::uuid and empresa_id = p_empresa;
    if not found then raise exception 'Item do checklist não encontrado' using errcode = 'no_data_found'; end if;
    insert into manutencoes (empresa_id, equipamento_id, plano_id, data, tipo, descricao, resultado, origem, responsavel, observacoes)
    values (p_empresa, p.equipamento_id, p.id, p_data, case when p.tipo = 'inspecao' then 'inspecao' else 'preventiva' end,
            p.descricao, r->>'resultado', 'checklist', nullif(trim(p_responsavel), ''), nullif(trim(r->>'observacao'), ''));
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Marque ao menos um item do checklist' using errcode = 'check_violation'; end if;
  return v_n;
end $$;

-- Salva o equipamento e os planos dele de uma vez. Plano que saiu da lista é apagado (o histórico fica, sem o vínculo).
-- p_planos: [{"id"?, "descricao", "tipo", "intervalo_dias", "intervalo_horas", "aviso_dias", "ultima_data", "ultimas_horas", "ativo"}]
create or replace function public.salvar_equipamento(p_empresa uuid, p_id uuid, p_dados jsonb, p_planos jsonb default '[]')
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid := p_id;
  v_mantidos uuid[] := '{}';
  v_plano uuid;
  r jsonb;
begin
  if p_id is null then
    insert into equipamentos (empresa_id, local, viveiro_id, pai_id, tipo, nome, quantidade, marca, modelo, numero_serie, potencia,
                              instalado_em, vida_util_meses, valor_cents, usa_horimetro, horas_uso, situacao, observacoes)
    values (p_empresa, coalesce(nullif(p_dados->>'local', ''), 'viveiro'), nullif(p_dados->>'viveiro_id', '')::uuid,
            nullif(p_dados->>'pai_id', '')::uuid, p_dados->>'tipo', p_dados->>'nome', coalesce((p_dados->>'quantidade')::int, 1),
            nullif(p_dados->>'marca', ''), nullif(p_dados->>'modelo', ''), nullif(p_dados->>'numero_serie', ''), nullif(p_dados->>'potencia', ''),
            nullif(p_dados->>'instalado_em', '')::date, (p_dados->>'vida_util_meses')::int, (p_dados->>'valor_cents')::bigint,
            coalesce((p_dados->>'usa_horimetro')::boolean, false), (p_dados->>'horas_uso')::numeric,
            coalesce(nullif(p_dados->>'situacao', ''), 'operando'), nullif(p_dados->>'observacoes', ''))
    returning id into v_id;
  else
    update equipamentos set
      local = coalesce(nullif(p_dados->>'local', ''), 'viveiro'), viveiro_id = nullif(p_dados->>'viveiro_id', '')::uuid,
      pai_id = nullif(p_dados->>'pai_id', '')::uuid, tipo = p_dados->>'tipo', nome = p_dados->>'nome',
      quantidade = coalesce((p_dados->>'quantidade')::int, 1), marca = nullif(p_dados->>'marca', ''),
      modelo = nullif(p_dados->>'modelo', ''), numero_serie = nullif(p_dados->>'numero_serie', ''), potencia = nullif(p_dados->>'potencia', ''),
      instalado_em = nullif(p_dados->>'instalado_em', '')::date, vida_util_meses = (p_dados->>'vida_util_meses')::int,
      valor_cents = (p_dados->>'valor_cents')::bigint, usa_horimetro = coalesce((p_dados->>'usa_horimetro')::boolean, false),
      horas_uso = (p_dados->>'horas_uso')::numeric, situacao = coalesce(nullif(p_dados->>'situacao', ''), 'operando'),
      observacoes = nullif(p_dados->>'observacoes', '')
    where id = p_id and empresa_id = p_empresa;
    if not found then
      raise exception 'Seu usuário não tem permissão para editar equipamentos' using errcode = 'insufficient_privilege';
    end if;
  end if;

  for r in select x from jsonb_array_elements(coalesce(p_planos, '[]')) x loop
    v_plano := nullif(r->>'id', '')::uuid;
    if v_plano is null then
      insert into planos_manutencao (empresa_id, equipamento_id, descricao, tipo, intervalo_dias, intervalo_horas, aviso_dias,
                                     ultima_data, ultimas_horas, ativo)
      values (p_empresa, v_id, r->>'descricao', coalesce(nullif(r->>'tipo', ''), 'preventiva'), (r->>'intervalo_dias')::int,
              (r->>'intervalo_horas')::numeric, coalesce((r->>'aviso_dias')::int, 7), nullif(r->>'ultima_data', '')::date,
              (r->>'ultimas_horas')::numeric, coalesce((r->>'ativo')::boolean, true))
      returning id into v_plano;
    else
      update planos_manutencao set
        descricao = r->>'descricao', tipo = coalesce(nullif(r->>'tipo', ''), 'preventiva'),
        intervalo_dias = (r->>'intervalo_dias')::int, intervalo_horas = (r->>'intervalo_horas')::numeric,
        aviso_dias = coalesce((r->>'aviso_dias')::int, 7), ultima_data = nullif(r->>'ultima_data', '')::date,
        ultimas_horas = (r->>'ultimas_horas')::numeric, ativo = coalesce((r->>'ativo')::boolean, true)
      where id = v_plano and equipamento_id = v_id;
      if not found then raise exception 'Plano de manutenção não encontrado' using errcode = 'no_data_found'; end if;
    end if;
    v_mantidos := v_mantidos || v_plano;
  end loop;
  delete from planos_manutencao where equipamento_id = v_id and id <> all (v_mantidos);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Alertas do painel: acrescenta à view que já existe (lida do banco para não desfazer o que outras
--    migrations mudaram nela) manutenção vencida/próxima, problema do checklist, parado e fim da vida útil.
-- ---------------------------------------------------------------------------
do $$
declare v_atual text := rtrim(trim(pg_get_viewdef('public.alertas'::regclass)), ';');
begin
  execute 'create or replace view public.alertas with (security_invoker = true) as ' || v_atual || $sql$
union all
select ag.empresa_id,
       case when ag.situacao = 'vencida' then 'atencao' else 'info' end,
       'manutencao',
       format('%s: %s (%s)', case when ag.situacao = 'vencida' then 'Manutenção vencida' else 'Manutenção próxima' end,
              ag.equipamento_nome, ag.local_nome),
       concat_ws(' · ', ag.descricao,
                 case when ag.proxima_data is not null then 'data ' || to_char(ag.proxima_data, 'DD/MM') end,
                 case when ag.proximas_horas is not null then format('%s h', trim(to_char(ag.proximas_horas, 'FM999G999G990'))) end),
       '/manutencao',
       coalesce(ag.proxima_data, app.hoje(ag.empresa_id))
from agenda_manutencao ag
where ag.ativo and ag.equipamento_situacao <> 'baixado' and ag.situacao in ('vencida', 'proxima')
union all
select pm.empresa_id, 'atencao', 'manutencao',
       format('Problema no checklist: %s (%s)', pm.equipamento_nome, pm.local_nome),
       concat_ws(' · ', pm.descricao, pm.observacoes),
       '/manutencao?aba=historico', pm.data
from problemas_manutencao pm
union all
select e.empresa_id, 'critico', 'manutencao',
       format('Equipamento parado: %s (%s)', e.nome, app.nome_local(e.local, g.nome)),
       'Registre o conserto em Manutenções para voltar a operar',
       '/manutencao?aba=equipamentos', app.hoje(e.empresa_id)
from equipamentos e left join viveiros g on g.id = e.viveiro_id
where e.situacao = 'parado'
union all
select s.empresa_id,
       case when s.dias_vida_restantes < 0 then 'atencao' else 'info' end,
       'manutencao',
       format('%s: %s (%s)', case when s.dias_vida_restantes < 0 then 'Vida útil vencida' else 'Fim da vida útil próximo' end, s.nome, s.local_nome),
       format('Troca programada para %s', to_char(s.fim_vida_util, 'MM/YYYY')),
       '/manutencao?aba=equipamentos', s.fim_vida_util
from equipamentos_situacao s
where s.situacao <> 'baixado' and s.dias_vida_restantes <= 90
$sql$;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on equipamentos, planos_manutencao, manutencoes to authenticated;
    grant select on agenda_manutencao, equipamentos_situacao, problemas_manutencao, alertas to authenticated;
    grant execute on function public.registrar_manutencao(uuid, uuid, date, text, text, uuid, numeric, numeric, bigint, text, uuid, text, text, jsonb) to authenticated;
    grant execute on function public.registrar_checklist(uuid, date, jsonb, text) to authenticated;
    grant execute on function public.salvar_equipamento(uuid, uuid, jsonb, jsonb) to authenticated;
    grant execute on function app.situacao_equipamento(uuid, uuid, text) to authenticated;
    grant execute on function app.nome_local(text, text) to authenticated;
    grant execute on function app.centro_custo_equipamento(uuid) to authenticated;
  end if;
end $$;
revoke execute on function public.registrar_manutencao(uuid, uuid, date, text, text, uuid, numeric, numeric, bigint, text, uuid, text, text, jsonb) from public, anon;
revoke execute on function public.registrar_checklist(uuid, date, jsonb, text) from public, anon;
revoke execute on function public.salvar_equipamento(uuid, uuid, jsonb, jsonb) from public, anon;

select app.travar_referencias();
