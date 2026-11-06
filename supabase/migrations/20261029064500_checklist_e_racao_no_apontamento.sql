-- Apontamento diário para cria e recria, checklist do viveiro e ração saindo do estoque.
--
-- 1. Checklist diário: cada piscicultura cadastra os itens que confere no viveiro (água, luz, temperatura,
--    comedouros, cama...). O item vale para todos os viveiros, só cria/recria ou só engorda, e pode ser
--    "ok / não ok" ou um número (ex.: temperatura em °C). As respostas ficam por lançamento.
-- 2. Ração do apontamento por tipo: cada lançamento pode dizer quais rações (produtos do tipo ração,
--    vindas da fábrica ou compradas) foram dadas e quantos kg. A saída sai do estoque ao custo médio,
--    com lote e viveiro, e some se o lançamento for excluído. O total de kg continua em racao_kg.
-- 3. Custo do lote: quando a piscicultura baixa a ração pelo estoque no mês, o custo da ração do lote é o
--    valor dessas saídas (a compra dos ingredientes ou da ração já virou estoque e não entra de novo).
--    Os kg apontados sem tipo são valorizados ao custo médio do kg baixado no mês. Sem baixa no mês,
--    vale a regra antiga (contas a pagar de ração rateadas pelos kg). A ração da cria e recria entra
--    no custo do peixe, que é amortizado no custo do kg durante a engorda.

-- ---------------------------------------------------------------------------
-- 1. Checklist
-- ---------------------------------------------------------------------------

create table checklist_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'sim_nao' check (tipo in ('sim_nao', 'numero')),
  unidade text,                                   -- para tipo número: °C, h, L...
  aplica_em text not null default 'todos' check (aplica_em in ('todos', 'cria_recria', 'producao')),
  ordem smallint not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);
create index on checklist_itens (empresa_id, ordem);

alter table checklist_itens enable row level security;
create policy membros on checklist_itens
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on checklist_itens as restrictive for insert
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_alterar on checklist_itens as restrictive for update
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']))
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_apagar on checklist_itens as restrictive for delete
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));

create table apontamento_checklist (
  lancamento_id uuid not null references apontamento_lancamentos(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  item_id uuid not null references checklist_itens(id) on delete restrict,
  ok boolean,
  valor numeric(12,2),
  observacao text,
  primary key (lancamento_id, item_id),
  check (ok is not null or valor is not null)
);
create index on apontamento_checklist (item_id);
create index on apontamento_checklist (empresa_id);

alter table apontamento_checklist enable row level security;
create policy membros on apontamento_checklist
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on apontamento_checklist as restrictive for insert
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_alterar on apontamento_checklist as restrictive for update
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']))
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_apagar on apontamento_checklist as restrictive for delete
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));

-- Itens sugeridos; a piscicultura edita, desativa ou acrescenta.
create or replace function app.checklist_padrao(p_empresa uuid) returns void
language sql security definer set search_path = public as $$
  insert into checklist_itens (empresa_id, nome, tipo, unidade, aplica_em, ordem)
  values (p_empresa, 'Água nos bebedouros', 'sim_nao', null, 'todos', 10),
         (p_empresa, 'Ração nos comedouros', 'sim_nao', null, 'todos', 20),
         (p_empresa, 'Luz e programa de luz', 'sim_nao', null, 'todos', 30),
         (p_empresa, 'Temperatura', 'numero', '°C', 'todos', 40),
         (p_empresa, 'Cortinas e ventilação', 'sim_nao', null, 'todos', 50),
         (p_empresa, 'Cama seca', 'sim_nao', null, 'cria_recria', 60),
         (p_empresa, 'Aquecimento (campânulas)', 'sim_nao', null, 'cria_recria', 70),
         (p_empresa, 'Ninhos limpos', 'sim_nao', null, 'producao', 80)
  on conflict (empresa_id, nome) do nothing
$$;

create or replace function app.checklist_padrao_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.checklist_padrao(new.id);
  return null;
end $$;

create trigger checklist_padrao after insert on empresas
  for each row execute function app.checklist_padrao_empresa();

select app.checklist_padrao(id) from empresas;

-- ---------------------------------------------------------------------------
-- 2. Ração por tipo no lançamento
-- ---------------------------------------------------------------------------

create table apontamento_racoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lancamento_id uuid not null references apontamento_lancamentos(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete restrict,
  deposito_id uuid not null references depositos(id) on delete restrict,
  kg numeric(10,3) not null check (kg > 0),
  custo_unit_cents numeric(14,4),
  created_at timestamptz not null default now()
);
create index on apontamento_racoes (lancamento_id);
create index on apontamento_racoes (produto_id);
create index on apontamento_racoes (deposito_id);
create index on apontamento_racoes (empresa_id);

alter table apontamento_racoes enable row level security;
create policy membros on apontamento_racoes
  using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()));
create policy escrita_inserir on apontamento_racoes as restrictive for insert
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_alterar on apontamento_racoes as restrictive for update
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']))
  with check (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));
create policy escrita_apagar on apontamento_racoes as restrictive for delete
  using (app.pode_algum(empresa_id, array['apontamentos.editar', 'lotes.editar']));

-- A ração do lançamento sai do estoque com lote e viveiro; excluir o lançamento devolve.
create or replace function app.racao_apontamento_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare a apontamentos_diarios%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.travar_estoque(old.empresa_id);
    delete from movimentos_estoque where origem_tabela = 'apontamento_racoes' and origem_id = old.id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select d.* into a from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id
    where l.id = new.lancamento_id;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents,
                                    lote_id, viveiro_id, origem_tabela, origem_id, created_by)
    values (new.empresa_id, new.produto_id, new.deposito_id, a.data, 'consumo_lote', -new.kg, new.custo_unit_cents,
            a.lote_id, a.viveiro_id, 'apontamento_racoes', new.id, auth.uid());
  end if;
  return null;
end $$;

create trigger racao_apontamento_estoque after insert or update or delete on apontamento_racoes
  for each row execute function app.racao_apontamento_estoque();

-- Completa um lançamento já registrado com a ração por tipo e o checklist.
-- p_racoes: [{produto_id, kg, deposito_id?}]  (sem depósito, sai do que tem mais saldo da ração)
-- p_checklist: [{item_id, ok?, valor?, observacao?}]
-- A soma dos kg por tipo não pode passar dos kg do lançamento (registrar_apontamento já recebeu o total).
create or replace function public.completar_lancamento(p_lancamento uuid, p_racoes jsonb default '[]', p_checklist jsonb default '[]')
returns void language plpgsql set search_path = public as $$
declare
  l apontamento_lancamentos%rowtype;
  a apontamentos_diarios%rowtype;
  v_fin text;
  r record;
  p produtos%rowtype;
  v_dep uuid;
  v_saldo numeric;
begin
  select * into l from apontamento_lancamentos where id = p_lancamento;
  if not found then raise exception 'Lançamento não encontrado' using errcode = 'no_data_found'; end if;
  if not app.pode_algum(l.empresa_id, array['apontamentos.editar', 'lotes.editar']) then
    raise exception 'Seu usuário não pode lançar apontamentos' using errcode = 'insufficient_privilege';
  end if;
  select * into a from apontamentos_diarios where id = l.apontamento_id;
  select finalidade into v_fin from viveiros where id = a.viveiro_id;

  if jsonb_typeof(coalesce(p_racoes, '[]')) <> 'array' or jsonb_typeof(coalesce(p_checklist, '[]')) <> 'array' then
    raise exception 'Formato inválido' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(coalesce(p_racoes, '[]')) > 0 then
    if (select sum((x->>'kg')::numeric) from jsonb_array_elements(p_racoes) x)
       + coalesce((select sum(kg) from apontamento_racoes where lancamento_id = l.id), 0) > l.racao_kg + 0.001 then
      raise exception 'A ração por tipo passa do total de kg do lançamento' using errcode = 'check_violation';
    end if;
    perform app.travar_estoque(l.empresa_id);
    for r in select (x->>'produto_id')::uuid as produto, sum((x->>'kg')::numeric) as kg,
                    (array_agg(nullif(x->>'deposito_id', '')::uuid))[1] as deposito
             from jsonb_array_elements(p_racoes) x group by 1 loop
      select * into p from produtos where id = r.produto and empresa_id = l.empresa_id;
      if not found or p.tipo <> 'racao' then
        raise exception 'Escolha uma ração cadastrada' using errcode = 'check_violation';
      end if;
      if r.kg is null or r.kg <= 0 then
        raise exception 'Informe os kg de %', p.nome using errcode = 'check_violation';
      end if;
      v_dep := r.deposito;
      if v_dep is null then
        select d.id into v_dep from depositos d where d.empresa_id = l.empresa_id
        order by app.saldo_produto(p.id, d.id) desc, d.nome limit 1;
      elsif not exists (select 1 from depositos where id = v_dep and empresa_id = l.empresa_id) then
        raise exception 'Depósito inválido' using errcode = 'check_violation';
      end if;
      v_saldo := coalesce(app.saldo_produto(p.id, v_dep), 0);
      if v_dep is null or v_saldo < r.kg then
        raise exception 'Saldo insuficiente de %: há % kg no estoque. Lance a produção da fábrica ou a compra antes.',
          p.nome, round(v_saldo, 1) using errcode = 'check_violation';
      end if;
      insert into apontamento_racoes (empresa_id, lancamento_id, produto_id, deposito_id, kg, custo_unit_cents)
      values (l.empresa_id, l.id, p.id, v_dep, r.kg, p.custo_medio_cents);
    end loop;
  end if;

  for r in select (x->>'item_id')::uuid as item, (x->>'ok')::boolean as ok, (x->>'valor')::numeric as valor,
                  nullif(trim(x->>'observacao'), '') as obs
           from jsonb_array_elements(coalesce(p_checklist, '[]')) x loop
    if not exists (select 1 from checklist_itens where id = r.item and empresa_id = l.empresa_id) then
      raise exception 'Item do checklist inválido' using errcode = 'check_violation';
    end if;
    if r.ok is null and r.valor is null then continue; end if;
    insert into apontamento_checklist (lancamento_id, empresa_id, item_id, ok, valor, observacao)
    values (l.id, l.empresa_id, r.item, r.ok, r.valor, r.obs)
    on conflict (lancamento_id, item_id) do update set ok = excluded.ok, valor = excluded.valor, observacao = excluded.observacao;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Custo do lote com a ração baixada do estoque
-- ---------------------------------------------------------------------------

create or replace function public.calcular_custos_mes(p_empresa uuid, p_mes date) returns int
language plpgsql set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_estoque boolean;
  v_n int;
begin
  if not exists (select 1 from empresas where id = p_empresa) then
    raise exception 'Empresa não encontrada' using errcode = 'no_data_found';
  end if;

  delete from custos_lote_mensal where empresa_id = p_empresa and mes = v_mes;

  -- a piscicultura baixou ração pelo estoque neste mês?
  v_estoque := exists (
    select 1 from movimentos_estoque m join produtos p on p.id = m.produto_id
    where m.empresa_id = p_empresa and m.tipo = 'consumo_lote' and p.tipo = 'racao' and m.lote_id is not null
      and m.data >= v_mes and m.data < v_fim);

  with dia as (
    select a.lote_id, a.viveiro_id, g.setor_id, a.data, a.peixes_inicio_dia, a.ovos_total, a.racao_kg
    from apontamentos_diarios a join viveiros g on g.id = a.viveiro_id
    where a.empresa_id = p_empresa and a.data >= v_mes and a.data < v_fim
  ),
  lote_mes as (
    select lote_id, sum(peixes_inicio_dia)::numeric as peixes_dia, count(distinct data) as dias,
           sum(ovos_total)::bigint as ovos, sum(racao_kg)::numeric as racao_kg,
           count(distinct data) filter (where ovos_total > 0) as dias_engorda
    from dia group by lote_id
  ),
  por_viveiro as (select viveiro_id, lote_id, sum(peixes_inicio_dia)::numeric as peixes_dia from dia group by 1, 2),
  por_setor as (select setor_id, lote_id, sum(peixes_inicio_dia)::numeric as peixes_dia from dia group by 1, 2),
  totais as (select sum(peixes_dia) as peixes_dia, sum(racao_kg) as racao_kg from lote_mes),
  -- ração que saiu do estoque para cada lote, ao custo da saída
  racao_estoque as (
    select m.lote_id, sum(-m.quantidade) as kg, sum(-m.quantidade * coalesce(m.custo_unit_cents, 0)) as valor
    from movimentos_estoque m join produtos p on p.id = m.produto_id
    where m.empresa_id = p_empresa and m.tipo = 'consumo_lote' and p.tipo = 'racao' and m.lote_id is not null
      and m.data >= v_mes and m.data < v_fim
    group by m.lote_id
  ),
  custo_kg as (select sum(valor) / nullif(sum(kg), 0) as cents from racao_estoque),
  -- fatias de custo da competência do mês
  fatia as (
    select r.valor_cents::numeric as valor, cc.componente, r.centro_custo_id,
           lo.id as lote_cc, ga.id as viveiro_cc, nu.id as setor_cc
    from agendamentos a
    join agendamento_rateios r on r.agendamento_id = a.id
    join categorias_custo cc on cc.id = r.categoria_id
    left join lotes lo on lo.centro_custo_id = r.centro_custo_id and r.centro_custo_id is not null
    left join viveiros ga on ga.centro_custo_id = r.centro_custo_id and r.centro_custo_id is not null
    left join setores nu on nu.centro_custo_id = r.centro_custo_id and r.centro_custo_id is not null
    where a.empresa_id = p_empresa and a.tipo = 'pagar' and a.status <> 'cancelado' and a.competencia = v_mes
      and cc.componente <> 'peixe'
      and not (v_estoque and cc.componente = 'racao')   -- com baixa pelo estoque, a compra já virou estoque
  ),
  -- cada fatia vira (lote, componente, valor, rateado?)
  destino as (
    select f.lote_cc as lote_id, f.componente, f.valor, false as rateado from fatia f where f.lote_cc is not null
    union all
    select pg.lote_id, f.componente, f.valor * pg.peixes_dia / nullif(sum(pg.peixes_dia) over (partition by f.ctid_g), 0), false
    from (select *, row_number() over () as ctid_g from fatia where viveiro_cc is not null and lote_cc is null) f
    join por_viveiro pg on pg.viveiro_id = f.viveiro_cc
    union all
    select pn.lote_id, f.componente, f.valor * pn.peixes_dia / nullif(sum(pn.peixes_dia) over (partition by f.ctid_n), 0), false
    from (select *, row_number() over () as ctid_n from fatia where setor_cc is not null and lote_cc is null and viveiro_cc is null) f
    join por_setor pn on pn.setor_id = f.setor_cc
    union all
    select lm.lote_id, f.componente,
           case when f.componente = 'racao' and (select racao_kg from totais) > 0
                then f.valor * lm.racao_kg / (select racao_kg from totais)
                else f.valor * lm.peixes_dia / nullif((select peixes_dia from totais), 0) end,
           f.componente <> 'racao'
    from fatia f cross join lote_mes lm
    where f.lote_cc is null and f.viveiro_cc is null and f.setor_cc is null
    union all
    -- ração do estoque: valor das saídas + kg apontados sem tipo ao custo médio do kg no mês
    select lm.lote_id, 'racao',
           coalesce(re.valor, 0) + greatest(lm.racao_kg - coalesce(re.kg, 0), 0) * coalesce((select cents from custo_kg), 0),
           false
    from lote_mes lm left join racao_estoque re on re.lote_id = lm.lote_id
    where v_estoque
  ),
  soma as (
    select lote_id,
           sum(valor) filter (where componente = 'racao') as racao,
           sum(valor) filter (where componente = 'sanidade' and not rateado) as sanidade,
           sum(valor) filter (where componente = 'mao_obra' and not rateado) as mao_obra,
           sum(valor) filter (where componente = 'energia' and not rateado) as energia,
           sum(valor) filter (where componente = 'embalagem' and not rateado) as embalagem,
           sum(valor) filter (where componente = 'outros' and not rateado) as outros,
           sum(valor) filter (where rateado) as indiretos
    from destino group by lote_id
  ),
  -- custo do peixe a amortizar: compra + lançamentos de aquisição no lote + meses de recria já calculados
  peixe as (
    select l.id as lote_id,
           l.custo_aquisicao_cents
             + coalesce((select sum(r.valor_cents) from agendamento_rateios r
                         join agendamentos a on a.id = r.agendamento_id and a.status <> 'cancelado'
                         join categorias_custo cc on cc.id = r.categoria_id and cc.componente = 'peixe'
                         where r.centro_custo_id = l.centro_custo_id), 0)
             + coalesce((select sum(m.custo_total_cents) from custos_lote_mensal m
                         where m.lote_id = l.id and m.mes < v_mes and m.kg_despescados = 0), 0) as base,
           -- início da engorda = primeiro dia com ovos (a ida para o viveiro de produção vem antes)
           coalesce((select min(d.data) from apontamentos_diarios d where d.lote_id = l.id and d.ovos_total > 0),
                    l.inicio_producao) as inicio,
           coalesce(l.previsao_despesca, l.data_nascimento + 80 * 7) as descarte
    from lotes l where l.empresa_id = p_empresa
  )
  insert into custos_lote_mensal (empresa_id, lote_id, mes, peixes_medios, kg_despescados, racao_kg, racao_cents,
    alevinos_cents, sanidade_cents, mao_obra_cents, energia_cents, embalagem_cents, outros_diretos_cents,
    indiretos_rateados_cents, calculado_em)
  select p_empresa, lm.lote_id, v_mes, round(lm.peixes_dia / greatest(lm.dias, 1), 1), lm.ovos, lm.racao_kg,
         round(coalesce(s.racao, 0)),
         case when lm.ovos > 0 and av.inicio is not null and av.descarte > av.inicio
              then round(av.base::numeric * lm.dias_engorda / (av.descarte - av.inicio)) else 0 end,
         round(coalesce(s.sanidade, 0)), round(coalesce(s.mao_obra, 0)), round(coalesce(s.energia, 0)),
         round(coalesce(s.embalagem, 0)), round(coalesce(s.outros, 0)), round(coalesce(s.indiretos, 0)), now()
  from lote_mes lm
  left join soma s on s.lote_id = lm.lote_id
  left join peixe av on av.lote_id = lm.lote_id;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.completar_lancamento(uuid, jsonb, jsonb) from public;
revoke all on function app.checklist_padrao(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on checklist_itens, apontamento_checklist, apontamento_racoes to authenticated;
    grant execute on function public.completar_lancamento(uuid, jsonb, jsonb) to authenticated;
  end if;
end $$;

select app.travar_referencias();
