-- Balbina: custo do kg, indicadores do lote e alertas da piscicultura.
--
-- Custo do kg produzido no mês = custo do lote no mês ÷ ganho de biomassa no mês, onde
--   ganho = biomassa no fim − biomassa no início + kg despescados no mês.
-- A biomassa é peixes vivos × peso médio estimado (biometria mais recente andando pela curva da espécie).
-- O custo dos alevinos entra no mês do povoamento. O custo do kg do ciclo divide o custo acumulado pelos kg que o
-- lote tem (biomassa) somados aos que já saíram na despesca.

-- ---------------------------------------------------------------------------
-- 1. Peixes e biomassa do lote num dia
-- ---------------------------------------------------------------------------
-- peixes vivos do lote (todos os viveiros) no início do dia
create or replace function app.peixes_lote(p_lote uuid, p_data date) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(al.qtd_peixes - coalesce((
           select sum(a.mortes + a.descartes) from apontamentos_diarios a
           where a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id
             and a.data >= lower(al.periodo) and a.data < p_data), 0)), 0)::int
  from lote_alocacoes al
  where al.lote_id = p_lote and al.periodo @> p_data
$$;

-- biomassa do lote no início do dia (kg)
create or replace function app.biomassa_lote(p_lote uuid, p_data date) returns numeric
language sql stable security definer set search_path = public as $$
  select round(app.peixes_lote(p_lote, p_data) * coalesce(app.peso_estimado(p_lote, p_data), 0) / 1000.0, 2)
$$;

-- Amônia tóxica (NH3, mg/L) a partir da amônia total, do pH e da temperatura (Emerson et al., 1975).
create or replace function app.amonia_toxica(p_total numeric, p_ph numeric, p_temp numeric) returns numeric
language sql immutable as $$
  select case when p_total is null or p_ph is null or p_temp is null then null
              else round(p_total / (1 + power(10::numeric, (0.09018 + 2729.92 / (p_temp + 273.15)) - p_ph)), 3) end
$$;

-- ---------------------------------------------------------------------------
-- 2. Custos do lote no mês: biomassa e ganho no lugar das dúzias
-- ---------------------------------------------------------------------------
alter table custos_lote_mensal drop column duzias;
alter table custos_lote_mensal alter column kg_despescados type numeric(12,2);
alter table custos_lote_mensal alter column kg_despescados set default 0;
alter table custos_lote_mensal
  add column biomassa_inicio_kg numeric(12,2) not null default 0,
  add column biomassa_fim_kg numeric(12,2) not null default 0;
alter table custos_lote_mensal
  add column ganho_kg numeric(12,2) generated always as (biomassa_fim_kg - biomassa_inicio_kg + kg_despescados) stored;
comment on column custos_lote_mensal.alevinos_cents is 'Alevinos e juvenis: custo de aquisição do lote no mês do povoamento e lançamentos de alevinos ligados ao lote';
comment on column custos_lote_mensal.ganho_kg is 'Biomassa produzida no mês: fim − início + despescado';

-- categoria de custo: aquisição de peixes vira alevinos
alter table categorias drop constraint categorias_componente_custo_check;
update categorias set componente_custo = 'alevinos' where componente_custo = 'peixe';
alter table categorias add constraint categorias_componente_custo_check
  check (componente_custo in ('racao', 'alevinos', 'sanidade', 'mao_obra', 'energia', 'embalagem', 'outros'));

create or replace function app.marcar_componente_custo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.componente_custo is null and new.parent_id is null and new.grupo = 'custo_operacional' then
    new.componente_custo := case new.nome
      when 'Ração e insumos' then 'racao' when 'Alevinos e juvenis' then 'alevinos'
      when 'Sanidade e qualidade da água' then 'sanidade' when 'Biosseguridade e limpeza' then 'sanidade'
      when 'Mão de obra da produção' then 'mao_obra'
      when 'Energia elétrica' then 'energia' when 'Combustíveis e bombeamento' then 'energia'
      when 'Embalagens e gelo' then 'embalagem' end;
  end if;
  return new;
end $$;

create or replace function public.calcular_custos_mes(p_empresa uuid, p_mes date) returns integer
language plpgsql set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_corte date;
  v_estoque boolean;
  v_n int;
begin
  if not exists (select 1 from empresas where id = p_empresa) then
    raise exception 'Empresa não encontrada' using errcode = 'no_data_found';
  end if;
  v_corte := least(v_fim, app.hoje(p_empresa) + 1);   -- mês em andamento: a biomassa do fim é a de hoje

  delete from custos_lote_mensal where empresa_id = p_empresa and mes = v_mes;

  -- a piscicultura baixou ração pelo estoque neste mês?
  v_estoque := exists (
    select 1 from movimentos_estoque m join produtos p on p.id = m.produto_id
    where m.empresa_id = p_empresa and m.tipo = 'consumo_lote' and p.tipo = 'racao' and m.lote_id is not null
      and m.data >= v_mes and m.data < v_fim);

  -- O rateio usa a biomassa de cada dia (kg·dia), não a contagem de peixes: 15 mil juvenis de 50 g pesam menos
  -- que 8 mil peixes de 1 kg. Sem peso conhecido, cada peixe conta 1 g e o rateio fica pela quantidade.
  with dia as (
    select a.lote_id, a.viveiro_id, g.setor_id, a.data, a.peixes_inicio_dia, a.racao_kg,
           coalesce(a.peixes_inicio_dia, 0) * coalesce(nullif(app.peso_estimado(a.lote_id, a.data), 0), 1) / 1000.0 as biomassa_kg
    from apontamentos_diarios a join viveiros g on g.id = a.viveiro_id
    where a.empresa_id = p_empresa and a.data >= v_mes and a.data < v_fim
  ),
  lote_mes as (
    select lote_id, sum(peixes_inicio_dia)::numeric as peixes_dia, sum(biomassa_kg) as biomassa_dia,
           count(distinct data) as dias, sum(racao_kg)::numeric as racao_kg
    from dia group by lote_id
  ),
  por_viveiro as (select viveiro_id, lote_id, sum(biomassa_kg) as biomassa_dia from dia group by 1, 2),
  por_setor as (select setor_id, lote_id, sum(biomassa_kg) as biomassa_dia from dia group by 1, 2),
  totais as (select sum(biomassa_dia) as biomassa_dia, sum(racao_kg) as racao_kg from lote_mes),
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
      and not (v_estoque and cc.componente = 'racao')   -- com baixa pelo estoque, a compra já virou estoque
  ),
  -- cada fatia vira (lote, componente, valor, rateado?)
  destino as (
    select f.lote_cc as lote_id, f.componente, f.valor, false as rateado from fatia f where f.lote_cc is not null
    union all
    select pg.lote_id, f.componente, f.valor * pg.biomassa_dia / nullif(sum(pg.biomassa_dia) over (partition by f.ctid_g), 0), false
    from (select *, row_number() over () as ctid_g from fatia where viveiro_cc is not null and lote_cc is null) f
    join por_viveiro pg on pg.viveiro_id = f.viveiro_cc
    union all
    select pn.lote_id, f.componente, f.valor * pn.biomassa_dia / nullif(sum(pn.biomassa_dia) over (partition by f.ctid_n), 0), false
    from (select *, row_number() over () as ctid_n from fatia where setor_cc is not null and lote_cc is null and viveiro_cc is null) f
    join por_setor pn on pn.setor_id = f.setor_cc
    union all
    select lm.lote_id, f.componente,
           case when f.componente = 'racao' and (select racao_kg from totais) > 0
                then f.valor * lm.racao_kg / (select racao_kg from totais)
                else f.valor * lm.biomassa_dia / nullif((select biomassa_dia from totais), 0) end,
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
           sum(valor) filter (where componente = 'alevinos' and not rateado) as alevinos,
           sum(valor) filter (where componente = 'sanidade' and not rateado) as sanidade,
           sum(valor) filter (where componente = 'mao_obra' and not rateado) as mao_obra,
           sum(valor) filter (where componente = 'energia' and not rateado) as energia,
           sum(valor) filter (where componente = 'embalagem' and not rateado) as embalagem,
           sum(valor) filter (where componente = 'outros' and not rateado) as outros,
           sum(valor) filter (where rateado) as indiretos
    from destino group by lote_id
  ),
  despescado as (
    select lote_id, sum(kg_total) as kg from despescas
    where empresa_id = p_empresa and data >= v_mes and data < v_fim group by lote_id
  ),
  -- lotes do mês: com apontamento, povoados no mês, despescados no mês ou com custo direto
  alvo as (
    select lote_id from lote_mes
    union select id from lotes where empresa_id = p_empresa and data_povoamento >= v_mes and data_povoamento < v_fim
    union select lote_id from despescado
    union select lote_id from soma where lote_id is not null
  )
  insert into custos_lote_mensal (empresa_id, lote_id, mes, peixes_medios, kg_despescados, biomassa_inicio_kg, biomassa_fim_kg,
    racao_kg, racao_cents, alevinos_cents, sanidade_cents, mao_obra_cents, energia_cents, embalagem_cents,
    outros_diretos_cents, indiretos_rateados_cents, calculado_em)
  select p_empresa, l.id, v_mes, round(coalesce(lm.peixes_dia, 0) / greatest(coalesce(lm.dias, 0), 1), 1),
         coalesce(dp.kg, 0),
         coalesce(app.biomassa_lote(l.id, greatest(v_mes, l.data_povoamento)), 0),
         coalesce(app.biomassa_lote(l.id, v_corte), 0),
         coalesce(lm.racao_kg, 0),
         round(coalesce(s.racao, 0)),
         round(coalesce(s.alevinos, 0)
               + case when l.data_povoamento >= v_mes and l.data_povoamento < v_fim then l.custo_aquisicao_cents else 0 end),
         round(coalesce(s.sanidade, 0)), round(coalesce(s.mao_obra, 0)), round(coalesce(s.energia, 0)),
         round(coalesce(s.embalagem, 0)), round(coalesce(s.outros, 0)), round(coalesce(s.indiretos, 0)), now()
  from alvo t
  join lotes l on l.id = t.lote_id and l.empresa_id = p_empresa and l.data_povoamento < v_fim
  left join lote_mes lm on lm.lote_id = l.id
  left join soma s on s.lote_id = l.id
  left join despescado dp on dp.lote_id = l.id;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Visões do lote
-- ---------------------------------------------------------------------------
create view alocacoes_atuais with (security_invoker = true) as
select al.id, al.empresa_id, al.lote_id, al.viveiro_id, l.codigo as lote_codigo, l.fase, l.data_povoamento, l.especie_id,
       g.nome as viveiro_nome, n.nome as setor_nome, al.qtd_peixes,
       al.qtd_peixes - coalesce(b.baixas, 0) as peixes_atuais,
       (app.hoje(al.empresa_id) - l.data_povoamento) / 7 + 1 as semana,
       app.hoje(al.empresa_id) - l.data_povoamento as dias_cultivo,
       b.ultimo_apontamento,
       pe.peso as peso_medio_g,
       round((al.qtd_peixes - coalesce(b.baixas, 0)) * pe.peso / 1000.0, 1) as biomassa_kg,
       g.area_m2, g.volume_m3,
       round((al.qtd_peixes - coalesce(b.baixas, 0)) / nullif(g.area_m2, 0), 2) as peixes_m2,
       round((al.qtd_peixes - coalesce(b.baixas, 0)) * pe.peso / 1000.0 / nullif(g.volume_m3, 0), 2) as kg_m3,
       bio.data as ultima_biometria,
       app.carencia_ate(al.lote_id, app.hoje(al.empresa_id)) as carencia_ate,
       l.previsao_despesca, l.peso_alvo_g
from lote_alocacoes al
join lotes l on l.id = al.lote_id
join viveiros g on g.id = al.viveiro_id
join setores n on n.id = g.setor_id
left join lateral (
  select sum(a.mortes + a.descartes) as baixas, max(a.data) as ultimo_apontamento
  from apontamentos_diarios a
  where a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id and al.periodo @> a.data
) b on true
left join lateral (select app.peso_estimado(al.lote_id, app.hoje(al.empresa_id)) as peso) pe on true
left join lateral (
  select max(x.data) as data from biometrias x where x.lote_id = al.lote_id
) bio on true
where al.periodo @> app.hoje(al.empresa_id);

create view indicadores_lote_dia with (security_invoker = true) as
select d.*, round(d.peixes * d.peso_medio_g / 1000.0, 1) as biomassa_kg,
       round(100.0 * d.racao_kg / nullif(d.peixes * d.peso_medio_g / 1000.0, 0), 2) as taxa_alimentacao_pct
from (
  select a.empresa_id, a.lote_id, a.data,
         (a.data - l.data_povoamento) / 7 + 1 as semana,
         a.data - l.data_povoamento as dias_cultivo,
         sum(a.peixes_inicio_dia) as peixes,
         sum(a.mortes + a.descartes) as baixas_peixes,
         sum(a.racao_kg) as racao_kg,
         round(1000.0 * sum(a.racao_kg) / nullif(sum(a.peixes_inicio_dia), 0), 1) as consumo_g_peixe_dia,
         round(100.0 * sum(a.mortes + a.descartes) / nullif(sum(a.peixes_inicio_dia), 0), 3) as mortalidade_dia_pct,
         min(a.oxigenio_min_mg_l) as oxigenio_min_mg_l, min(a.temp_min_c) as temp_min_c, max(a.temp_max_c) as temp_max_c,
         min(a.ph_min) as ph_min, max(a.ph_max) as ph_max, max(a.amonia_max_mg_l) as amonia_max_mg_l,
         app.peso_estimado(a.lote_id, a.data) as peso_medio_g
  from apontamentos_diarios a join lotes l on l.id = a.lote_id
  group by a.empresa_id, a.lote_id, a.data, l.data_povoamento
) d;

-- Semana de cultivo (contada do povoamento): consumo, mortalidade, peso, biomassa, conversão alimentar e a curva.
create view indicadores_lote_semana with (security_invoker = true) as
with dia as (
  select a.empresa_id, a.lote_id, l.especie_id, l.qtd_povoada, l.peso_inicial_g, l.data_povoamento,
         (a.data - l.data_povoamento) / 7 + 1 as semana, a.data, a.peixes_inicio_dia, a.mortes + a.descartes as baixas,
         a.racao_kg
  from apontamentos_diarios a join lotes l on l.id = a.lote_id
),
semana as (
  select empresa_id, lote_id, especie_id, qtd_povoada, peso_inicial_g, data_povoamento, semana,
         min(data) as inicio, max(data) as fim, count(distinct data) as dias,
         sum(peixes_inicio_dia) as peixes_dia, sum(baixas) as baixas, sum(racao_kg) as racao_kg
  from dia group by empresa_id, lote_id, especie_id, qtd_povoada, peso_inicial_g, data_povoamento, semana
),
calc as (
  select s.*,
         app.peso_estimado(s.lote_id, s.fim + 1) as peso_medio_g,
         app.peixes_lote(s.lote_id, s.fim + 1) as peixes_fim,
         coalesce((select sum(x.kg_total) from despescas x where x.lote_id = s.lote_id and x.data <= s.fim), 0) as kg_despescados_acum,
         sum(s.baixas) over w as baixas_acum,
         sum(s.racao_kg) over w as racao_acum
  from semana s
  window w as (partition by s.lote_id order by s.semana)
)
select c.empresa_id, c.lote_id, c.semana, c.inicio, c.fim, c.dias,
       round(c.peixes_dia::numeric / nullif(c.dias, 0)) as peixes_medios,
       c.racao_kg,
       round(1000.0 * c.racao_kg / nullif(c.peixes_dia, 0), 1) as consumo_g_peixe_dia,
       c.baixas,
       round(100.0 * c.baixas_acum / nullif(c.qtd_povoada, 0), 2) as mortalidade_acum_pct,
       round(100.0 - 100.0 * c.baixas_acum / nullif(c.qtd_povoada, 0), 2) as sobrevivencia_pct,
       c.peso_medio_g,
       round(c.peixes_fim * c.peso_medio_g / 1000.0, 1) as biomassa_kg,
       c.racao_acum as racao_acum_kg,
       c.kg_despescados_acum,
       -- sem ganho de peso (biometria abaixo da anterior, despesca que revelou menos peixe) não há conversão
       case when c.peixes_fim * c.peso_medio_g / 1000.0 + c.kg_despescados_acum
                 - c.qtd_povoada * coalesce(c.peso_inicial_g, 0) / 1000.0 > 0
            then round(c.racao_acum / (c.peixes_fim * c.peso_medio_g / 1000.0 + c.kg_despescados_acum
                                       - c.qtd_povoada * coalesce(c.peso_inicial_g, 0) / 1000.0), 2) end as conversao_alimentar,
       cv.peso_g as padrao_peso_g,
       cv.consumo_g_peixe_dia as padrao_consumo_g,
       cv.sobrevivencia_pct as padrao_sobrevivencia_pct,
       cv.taxa_alimentacao_pct as padrao_taxa_pct
from calc c
left join curvas_crescimento cv on cv.especie_id = c.especie_id
  and cv.semana = (round(coalesce(app.idade_equivalente(c.especie_id, c.peso_inicial_g), 0) / 7.0) + c.semana)::int;
comment on view indicadores_lote_semana is 'Semana de cultivo: o padrão vem da curva da espécie a partir do peso do povoamento (lote povoado com juvenis começa adiante na curva)';

create view custo_kg_lote with (security_invoker = true) as
select m.empresa_id, m.lote_id, l.codigo as lote_codigo, m.mes, m.peixes_medios, m.biomassa_inicio_kg, m.biomassa_fim_kg,
       m.kg_despescados, m.ganho_kg, m.racao_kg, m.racao_cents, m.alevinos_cents, m.sanidade_cents, m.mao_obra_cents,
       m.energia_cents, m.embalagem_cents, m.outros_diretos_cents, m.indiretos_rateados_cents, m.custo_total_cents,
       m.calculado_em,
       case when m.ganho_kg > 0 then round(m.custo_total_cents / m.ganho_kg)::bigint end as custo_kg_cents,
       case when m.ganho_kg > 0 then round(m.racao_cents / m.ganho_kg)::bigint end as racao_por_kg_cents,
       case when m.ganho_kg > 0 then round(m.racao_kg / m.ganho_kg, 2) end as conversao_alimentar,
       sum(m.custo_total_cents) over w as custo_acumulado_cents,
       sum(m.kg_despescados) over w as despescado_acumulado_kg,
       round(sum(m.custo_total_cents) over w / nullif(m.biomassa_fim_kg + sum(m.kg_despescados) over w, 0))::bigint as custo_kg_ciclo_cents,
       v.preco_kg_cents
from custos_lote_mensal m
join lotes l on l.id = m.lote_id
left join lateral (
  select round(sum(i.total_cents) / nullif(sum(i.kg), 0))::bigint as preco_kg_cents
  from vendas_itens i where i.empresa_id = m.empresa_id and i.mes = m.mes and i.kg > 0
) v on true
window w as (partition by m.lote_id order by m.mes rows between unbounded preceding and current row);

create view margem_cliente_mes with (security_invoker = true) as
with custo as (
  select empresa_id, mes, sum(custo_total_cents) / nullif(sum(ganho_kg) filter (where ganho_kg > 0), 0) as custo_kg_cents
  from custos_lote_mensal group by empresa_id, mes
)
select p.empresa_id, date_trunc('month', p.data)::date as mes, p.cliente_id, p.cliente_nome,
       count(*) as pedidos, round(sum(coalesce(p.kg, 0)), 3) as kg, sum(p.total_cents)::bigint as receita_cents,
       round(sum(p.total_cents) / nullif(sum(p.kg), 0))::bigint as preco_kg_cents,
       round(c.custo_kg_cents)::bigint as custo_kg_cents,
       round(sum(p.total_cents) - c.custo_kg_cents * sum(coalesce(p.kg, 0)))::bigint as margem_cents
from pedidos p
left join custo c on c.empresa_id = p.empresa_id and c.mes = date_trunc('month', p.data)::date
where p.status in ('faturado', 'entregue')
group by p.empresa_id, date_trunc('month', p.data), p.cliente_id, p.cliente_nome, c.custo_kg_cents;

create view medicacoes with (security_invoker = true) as
select e.id, e.empresa_id, e.lote_id, l.codigo as lote_codigo, e.viveiro_id, g.nome as viveiro_nome, e.data, e.tipo, e.status,
       e.medicamento_id, m.nome as medicamento_nome, m.unidade_dose, m.via as medicamento_via, e.dose_por_unidade, e.base_dose,
       e.quantidade, e.dias_tratamento, e.carencia_dias,
       case when e.carencia_dias > 0 then e.data + e.carencia_dias - 1 end as carencia_ate,
       e.lancamento_id, e.observacoes,
       mv.quantidade is not null as baixou_estoque, -mv.quantidade as quantidade_estoque,
       round(-mv.quantidade * mv.custo_unit_cents)::bigint as custo_cents
from eventos_sanitarios e
join lotes l on l.id = e.lote_id
left join viveiros g on g.id = e.viveiro_id
left join medicamentos m on m.id = e.medicamento_id
left join lateral (
  select sum(x.quantidade) as quantidade, max(x.custo_unit_cents) as custo_unit_cents
  from movimentos_estoque x
  where x.origem_tabela = 'eventos_sanitarios' and x.origem_id = e.id and x.tipo = 'consumo_lote'
  having count(*) > 0
) mv on true
where e.medicamento_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Alertas da piscicultura
-- ---------------------------------------------------------------------------
-- Número no formato brasileiro (1.234,5) para as mensagens, sem depender do locale do servidor.
create or replace function app.num_br(p_valor numeric, p_casas int default 1) returns text
language sql immutable set search_path = public as $$
  select translate(to_char(round(p_valor, p_casas),
                           'FM999,999,999,990' || case when p_casas > 0 then '.' || repeat('0', p_casas) else '' end), ',.', '.,')
$$;
grant execute on function app.num_br(numeric, int) to authenticated;

create view alertas with (security_invoker = true) as
-- água: oxigênio, temperatura, pH e amônia do último apontamento (hoje ou ontem)
with agua as (
  select a.empresa_id, a.lote_id, a.lote_codigo, a.viveiro_id, a.viveiro_nome, d.data, d.oxigenio_min_mg_l, d.temp_min_c,
         d.temp_max_c, d.ph_min, d.ph_max, d.amonia_max_mg_l,
         app.amonia_toxica(d.amonia_max_mg_l, coalesce(d.ph_max, d.ph_min), coalesce(d.temp_max_c, d.temp_min_c)) as nh3
  from alocacoes_atuais a
  join lateral (
    select x.* from apontamentos_diarios x
    where x.lote_id = a.lote_id and x.viveiro_id = a.viveiro_id and x.data >= app.hoje(a.empresa_id) - 1
    order by x.data desc limit 1
  ) d on true
)
select w.empresa_id, case when w.oxigenio_min_mg_l < 3 then 'critico' else 'atencao' end as nivel, 'oxigenio' as tipo,
       format('Oxigênio baixo no %s (lote %s)', w.viveiro_nome, w.lote_codigo) as titulo,
       format('%s mg/L em %s. Ideal de 4 a 8 mg/L; abaixo de 3, suspenda a ração e ligue o aerador',
              app.num_br(w.oxigenio_min_mg_l, 1), to_char(w.data, 'DD/MM')) as detalhe,
       '/lotes/' || w.lote_id as link, w.data
from agua w where w.oxigenio_min_mg_l < 4
union all
select w.empresa_id, 'atencao', 'temperatura',
       format('Temperatura da água fora da faixa no %s', w.viveiro_nome),
       format('De %s a %s °C em %s. O tambaqui come melhor entre 28 e 30 °C',
              coalesce(app.num_br(w.temp_min_c, 1), '?'), coalesce(app.num_br(w.temp_max_c, 1), '?'),
              to_char(w.data, 'DD/MM')),
       '/lotes/' || w.lote_id, w.data
from agua w where w.temp_min_c < 24 or w.temp_max_c > 33
union all
select w.empresa_id, 'atencao', 'ph',
       format('pH fora da faixa no %s', w.viveiro_nome),
       format('pH de %s a %s em %s. Referência para o tambaqui: 5 a 7; corrija com calagem se estiver ácido',
              coalesce(app.num_br(w.ph_min, 1), '?'), coalesce(app.num_br(w.ph_max, 1), '?'),
              to_char(w.data, 'DD/MM')),
       '/lotes/' || w.lote_id, w.data
from agua w where w.ph_min < 4.5 or w.ph_max > 8.5
union all
select w.empresa_id, case when coalesce(w.nh3, 0) >= 0.46 then 'critico' else 'atencao' end, 'amonia',
       format('Amônia alta no %s', w.viveiro_nome),
       case when w.nh3 is not null
            then format('Amônia total %s mg/L, tóxica (NH3) %s mg/L em %s. Reduza a ração e renove a água',
                        app.num_br(w.amonia_max_mg_l, 2), app.num_br(w.nh3, 3), to_char(w.data, 'DD/MM'))
            else format('Amônia total %s mg/L em %s. Meça o pH e a temperatura para saber a parte tóxica',
                        app.num_br(w.amonia_max_mg_l, 2), to_char(w.data, 'DD/MM')) end,
       '/lotes/' || w.lote_id, w.data
from agua w where coalesce(w.nh3, 0) >= 0.2 or (w.nh3 is null and w.amonia_max_mg_l >= 1)
union all
-- mortalidade dos últimos 3 dias
select a.empresa_id, case when m.pct > 0.3 then 'critico' else 'atencao' end, 'mortalidade',
       format('Mortalidade alta no lote %s (%s)', a.lote_codigo, a.viveiro_nome),
       format('%s peixes nos últimos 3 dias (%s%% ao dia)', app.num_br(m.baixas, 0), app.num_br(m.pct, 2)),
       '/lotes/' || a.lote_id, app.hoje(a.empresa_id)
from alocacoes_atuais a
join lateral (
  select sum(d.mortes + d.descartes) as baixas,
         round(100.0 * sum(d.mortes + d.descartes) / nullif(sum(d.peixes_inicio_dia), 0), 2) as pct
  from apontamentos_diarios d
  where d.lote_id = a.lote_id and d.viveiro_id = a.viveiro_id and d.data > app.hoje(a.empresa_id) - 3
) m on true
where m.pct > 0.1
union all
-- viveiro sem apontamento
select a.empresa_id, 'atencao', 'apontamento',
       format('Falta apontamento do %s', a.viveiro_nome),
       case when a.ultimo_apontamento is null then format('Lote %s ainda sem nenhum apontamento', a.lote_codigo)
            else format('Último apontamento em %s', to_char(a.ultimo_apontamento, 'DD/MM')) end,
       '/apontamentos', app.hoje(a.empresa_id)
from alocacoes_atuais a
join lote_alocacoes al on al.id = a.id
where lower(al.periodo) < app.hoje(a.empresa_id) - 1
  and coalesce(a.ultimo_apontamento, '-infinity'::date) < app.hoje(a.empresa_id) - 1
union all
-- biometria atrasada: a cada 15 dias até ~70 g, depois todo mês (D1)
select a.empresa_id, 'atencao', 'biometria',
       format('Biometria atrasada no %s (lote %s)', a.viveiro_nome, a.lote_codigo),
       case when a.ultima_biometria is null then format('Nenhuma biometria desde o povoamento em %s', to_char(a.data_povoamento, 'DD/MM'))
            else format('Última em %s; o peso de %s g é estimado pela curva', to_char(a.ultima_biometria, 'DD/MM'),
                        app.num_br(a.peso_medio_g, 0)) end,
       '/lotes/' || a.lote_id, app.hoje(a.empresa_id)
from alocacoes_atuais a
where app.hoje(a.empresa_id) - greatest(coalesce(a.ultima_biometria, a.data_povoamento), a.data_povoamento)
      > case when coalesce(a.peso_medio_g, 0) < 70 then 15 else 30 end
union all
-- crescimento abaixo da curva: última biometria contra o peso esperado desde o povoamento
select x.empresa_id, case when x.relacao < 0.7 then 'critico' else 'atencao' end, 'crescimento',
       format('Lote %s crescendo abaixo da curva', x.lote_codigo),
       format('Biometria de %s: %s g, %s%% do esperado (%s g). Confira a ração, a água e a densidade',
              to_char(x.data, 'DD/MM'), app.num_br(x.peso, 0), round(100 * x.relacao),
              app.num_br(x.esperado, 0)),
       '/lotes/' || x.lote_id, x.data
from (
  select l.empresa_id, l.id as lote_id, l.codigo as lote_codigo, b.data, b.peso_medio_g as peso,
         round(app.peso_curva(l.especie_id, app.idade_equivalente(l.especie_id, l.peso_inicial_g) + (b.data - l.data_povoamento)), 0) as esperado,
         b.peso_medio_g / nullif(app.peso_curva(l.especie_id, app.idade_equivalente(l.especie_id, l.peso_inicial_g) + (b.data - l.data_povoamento)), 0) as relacao
  from lotes l
  join lateral (select * from biometrias y where y.lote_id = l.id order by y.data desc, y.created_at desc limit 1) b on true
  where l.fase <> 'encerrado' and l.peso_inicial_g is not null and b.data - l.data_povoamento >= 21
) x
where x.relacao < 0.85
union all
-- carência de medicamento: não despescar
select l.empresa_id, 'info', 'carencia',
       format('Lote %s em carência', l.codigo),
       format('Não despescar para venda até %s', to_char(app.carencia_ate(l.id, app.hoje(l.empresa_id)), 'DD/MM')),
       '/sanidade', app.hoje(l.empresa_id)
from lotes l
where l.fase <> 'encerrado' and app.carencia_ate(l.id, app.hoje(l.empresa_id)) is not null
union all
-- eventos sanitários programados
select e.empresa_id, case when e.data < app.hoje(e.empresa_id) then 'atencao' else 'info' end, 'sanidade',
       format('%s %s do lote %s', case when e.data < app.hoje(e.empresa_id) then 'Atrasado:' else 'Programado:' end,
              initcap(e.tipo), l.codigo),
       concat_ws(' · ', to_char(e.data, 'DD/MM'), e.dose, e.via),
       '/sanidade', e.data
from eventos_sanitarios e join lotes l on l.id = e.lote_id
where e.status = 'planejado' and e.data <= app.hoje(e.empresa_id) + 7
union all
-- despesca prevista nos próximos 7 dias (ou passada)
select l.empresa_id, case when l.previsao_despesca < app.hoje(l.empresa_id) then 'atencao' else 'info' end, 'despesca',
       format('Despesca %s do lote %s', case when l.previsao_despesca < app.hoje(l.empresa_id) then 'atrasada' else 'prevista' end, l.codigo),
       format('Prevista para %s', to_char(l.previsao_despesca, 'DD/MM')),
       '/lotes/' || l.id, l.previsao_despesca
from lotes l
where l.fase <> 'encerrado' and l.previsao_despesca is not null and l.previsao_despesca <= app.hoje(l.empresa_id) + 7
union all
-- contas vencidas
select t.empresa_id, 'atencao', 'financeiro',
       format('%s conta(s) a %s vencida(s)', count(*), t.tipo),
       format('Total de R$ %s', app.num_br(sum(t.saldo_cents) / 100.0, 2)),
       case when t.tipo = 'pagar' then '/contas-a-pagar?situacao=vencido' else '/contas-a-receber?situacao=vencido' end,
       min(t.vencimento)
from titulos t
where t.situacao = 'vencido'
group by t.empresa_id, t.tipo
union all
-- estoque de pescado negativo
select e.empresa_id, 'critico', 'estoque',
       format('Estoque negativo de peixe %s', lower(e.classe)),
       format('%s kg: confira despescas e pedidos', app.num_br(e.saldo, 2)),
       '/estoque', app.hoje(e.empresa_id)
from estoque_peixe e
where e.saldo < 0;

-- ---------------------------------------------------------------------------
-- 5. Resumo diário (automação): ração, mortes e oxigênio de ontem
-- ---------------------------------------------------------------------------
create or replace function public.resumos_diarios_devidos()
returns table (empresa_id uuid, dia date, resumo jsonb)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_hoje date;
  v_ontem date;
begin
  for r in select a.empresa_id, a.resumo_hora, e.fuso from automacoes_empresa a join empresas e on e.id = a.empresa_id
           where a.resumo_diario and app.empresa_liberada(a.empresa_id) loop
    v_hoje := (now() at time zone r.fuso)::date;
    continue when (now() at time zone r.fuso)::time < r.resumo_hora;
    continue when not app.marcar_aviso(r.empresa_id, 'resumo', v_hoje);
    v_ontem := v_hoje - 1;
    empresa_id := r.empresa_id;
    dia := v_hoje;
    select jsonb_build_object(
      'racao_kg', coalesce(round(sum(d.racao_kg), 1), 0),
      'peixes', coalesce(sum(d.peixes_inicio_dia), 0),
      'mortes', coalesce(sum(d.mortes + d.descartes), 0),
      'oxigenio_min', min(d.oxigenio_min_mg_l),
      'sem_lancamento', (select count(*) from alocacoes_atuais x where x.empresa_id = r.empresa_id
                          and not exists (select 1 from apontamentos_diarios y where y.empresa_id = r.empresa_id
                                          and y.viveiro_id = x.viveiro_id and y.data = v_ontem)),
      'pagar_hoje', (select jsonb_build_object('n', count(*), 'cents', coalesce(sum(t.valor_cents - t.desconto_cents - t.pago_cents), 0))
                     from agendamentos t where t.empresa_id = r.empresa_id and t.tipo = 'pagar'
                       and t.status in ('aberto', 'parcial') and t.vencimento = v_hoje),
      'pagar_vencidas', (select count(*) from agendamentos t where t.empresa_id = r.empresa_id and t.tipo = 'pagar'
                         and t.status in ('aberto', 'parcial') and t.vencimento < v_hoje),
      'receber_hoje', (select jsonb_build_object('n', count(*), 'cents', coalesce(sum(t.valor_cents - t.desconto_cents - t.pago_cents), 0))
                       from agendamentos t where t.empresa_id = r.empresa_id and t.tipo = 'receber'
                         and t.status in ('aberto', 'parcial') and t.vencimento = v_hoje),
      'alertas_criticos', (select count(*) from alertas x where x.empresa_id = r.empresa_id and x.nivel = 'critico'))
    into resumo
    from apontamentos_diarios d where d.empresa_id = r.empresa_id and d.data = v_ontem;
    return next;
  end loop;
end $$;

grant execute on function app.peixes_lote(uuid, date), app.biomassa_lote(uuid, date), app.amonia_toxica(numeric, numeric, numeric)
  to authenticated;

select app.travar_referencias();
