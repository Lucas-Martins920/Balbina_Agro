-- Marco 4: custo do kg por lote e mês, sobre o financeiro real (competência).
--
-- Regras (docs/replica/architecture.md, decisão 4):
-- * Entra no custo do kg o que está em categorias de custo operacional, pela competência.
-- * Lançado no centro de custo do lote: direto no lote. Do viveiro ou do setor: dividido entre os lotes
--   que estavam lá no mês, por peixes-dia. Sem centro de custo de produção: rateado entre todos os lotes,
--   a ração por kg consumido e o resto por peixes-dia.
-- * O peixe (compra + recria) é amortizada em linha reta do início da engorda até o descarte previsto
--   (padrão: 80 semanas de idade). Lançamentos na categoria de aquisição de peixes com o centro de custo
--   do lote somam ao custo do peixe em vez de entrar no mês.

alter table categorias add column componente_custo text
  check (componente_custo in ('racao','peixe','sanidade','mao_obra','energia','embalagem','outros'));

update categorias set componente_custo = case nome
  when 'Ração e insumos' then 'racao'
  when 'Aquisição de peixes' then 'peixe'
  when 'Vacinas e medicamentos' then 'sanidade'
  when 'Mão de obra da produção' then 'mao_obra'
  when 'Energia elétrica' then 'energia'
  when 'Embalagens' then 'embalagem'
end
where parent_id is null and grupo = 'custo_operacional';

-- empresas novas: mesma marcação no plano padrão
create or replace function app.marcar_componente_custo() returns trigger language plpgsql as $$
begin
  if new.componente_custo is null and new.parent_id is null and new.grupo = 'custo_operacional' then
    new.componente_custo := case new.nome
      when 'Ração e insumos' then 'racao' when 'Aquisição de peixes' then 'peixe'
      when 'Vacinas e medicamentos' then 'sanidade' when 'Mão de obra da produção' then 'mao_obra'
      when 'Energia elétrica' then 'energia' when 'Embalagens' then 'embalagem' end;
  end if;
  return new;
end $$;
create trigger marcar_componente_custo before insert on categorias
  for each row execute function app.marcar_componente_custo();

-- componente efetivo: o da categoria, senão o do pai, senão "outros"
create view categorias_custo with (security_invoker = true) as
select c.id, c.empresa_id, coalesce(c.componente_custo, p.componente_custo, 'outros') as componente
from categorias c left join categorias p on p.id = c.parent_id
where c.grupo = 'custo_operacional' and c.sentido = 'saida';

create or replace function public.calcular_custos_mes(p_empresa uuid, p_mes date) returns int
language plpgsql set search_path = public as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_n int;
begin
  if not exists (select 1 from empresas where id = p_empresa) then
    raise exception 'Empresa não encontrada' using errcode = 'no_data_found';
  end if;

  delete from custos_lote_mensal where empresa_id = p_empresa and mes = v_mes;

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

-- Custo por dúzia e preço médio de venda no mesmo mês
create view custo_kg_lote with (security_invoker = true) as
select m.empresa_id, m.lote_id, l.codigo as lote_codigo, m.mes, m.peixes_medios, m.kg_despescados, m.duzias, m.racao_kg,
       m.racao_cents, m.alevinos_cents, m.sanidade_cents, m.mao_obra_cents, m.energia_cents, m.embalagem_cents,
       m.outros_diretos_cents, m.indiretos_rateados_cents, m.custo_total_cents, m.calculado_em,
       case when m.duzias > 0 then round(m.custo_total_cents / m.duzias) end::bigint as custo_duzia_cents,
       case when m.duzias > 0 then round(m.racao_cents / m.duzias) end::bigint as racao_duzia_cents,
       round(m.racao_kg / nullif(m.duzias, 0), 3) as kg_racao_duzia,
       v.preco_duzia_cents
from custos_lote_mensal m
join lotes l on l.id = m.lote_id
left join lateral (
  select round(sum(p.total_cents) * 12.0 / nullif(sum(p.ovos), 0))::bigint as preco_duzia_cents
  from pedidos p where p.empresa_id = m.empresa_id and p.status in ('faturado', 'entregue')
    and date_trunc('month', p.data) = m.mes
) v on true;

-- Margem por cliente no mês: preço médio da dúzia contra o custo médio da piscicultura
create view margem_cliente_mes with (security_invoker = true) as
with custo as (
  select empresa_id, mes, round(sum(custo_total_cents) / nullif(sum(duzias), 0))::bigint as custo_duzia_cents
  from custos_lote_mensal group by empresa_id, mes
)
select p.empresa_id, date_trunc('month', p.data)::date as mes, p.cliente_id, p.cliente_nome,
       count(*) as pedidos, sum(p.ovos)::bigint as ovos, sum(p.total_cents)::bigint as receita_cents,
       round(sum(p.total_cents) * 12.0 / nullif(sum(p.ovos), 0))::bigint as preco_duzia_cents,
       c.custo_duzia_cents,
       round(sum(p.total_cents) - c.custo_duzia_cents * sum(p.ovos) / 12.0)::bigint as margem_cents
from pedidos p
left join custo c on c.empresa_id = p.empresa_id and c.mes = date_trunc('month', p.data)::date
where p.status in ('faturado', 'entregue')
group by p.empresa_id, date_trunc('month', p.data), p.cliente_id, p.cliente_nome, c.custo_duzia_cents;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant execute on function public.calcular_custos_mes(uuid, date) to authenticated;
    grant select on categorias_custo, custo_kg_lote, margem_cliente_mes to authenticated;
  end if;
end $$;
