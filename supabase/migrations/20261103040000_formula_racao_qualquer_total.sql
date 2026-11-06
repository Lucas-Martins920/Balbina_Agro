-- Fórmula de ração sem trava de 1.000 kg (pedido do Nicolas, 2026-11-03).
-- A batida pode ter qualquer total (ex.: 1.050 kg ou 600 kg). Guardamos o kg de cada ingrediente
-- na batida (formula_itens.kg) e o total (formulas_racao.total_kg); kg_por_tonelada continua sendo a
-- proporção normalizada para 1 t, então produção, custo da tonelada e abastecimento seguem iguais.

alter table formulas_racao add column total_kg numeric(10,3) not null default 1000 check (total_kg > 0);
alter table formula_itens add column kg numeric(10,3) check (kg > 0);
update formula_itens set kg = kg_por_tonelada where kg is null;   -- fórmulas antigas fechavam 1.000 kg
alter table formula_itens alter column kg set not null;

-- p_itens: [{insumo_id, kg}] com o kg de cada ingrediente na batida, de qualquer total.
-- Aceita ainda {insumo_id, kg_por_tonelada} (lido como kg na batida) para chamadas antigas.
create or replace function public.salvar_formula(p_racao uuid, p_fase text, p_itens jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  r produtos%rowtype;
  v_soma numeric;
  v_id uuid;
begin
  select * into r from produtos where id = p_racao;
  if not found or r.tipo <> 'racao' then raise exception 'Escolha um produto do tipo ração' using errcode = 'check_violation'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A fórmula precisa de ingredientes' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x
             where coalesce((x->>'kg')::numeric, (x->>'kg_por_tonelada')::numeric, 0) <= 0) then
    raise exception 'Informe a quantidade de cada ingrediente' using errcode = 'check_violation';
  end if;
  select sum(coalesce((x->>'kg')::numeric, (x->>'kg_por_tonelada')::numeric)) into v_soma from jsonb_array_elements(p_itens) x;
  if exists (select 1 from jsonb_array_elements(p_itens) x
             left join produtos i on i.id = (x->>'insumo_id')::uuid and i.empresa_id = r.empresa_id
             where i.id is null or i.tipo not in ('insumo_racao', 'medicamento', 'outro') or i.id = p_racao) then
    raise exception 'Ingrediente inválido na fórmula' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_itens) x
             where round(coalesce((x->>'kg')::numeric, (x->>'kg_por_tonelada')::numeric) * 1000 / v_soma, 3) <= 0) then
    raise exception 'Um ingrediente ficou pequeno demais para o total da batida (menos de 1 g por tonelada)' using errcode = 'check_violation';
  end if;

  perform 1 from produtos where id = p_racao for update;
  update formulas_racao set vigente = false where produto_racao_id = p_racao and vigente;
  insert into formulas_racao (empresa_id, produto_racao_id, fase, versao, total_kg)
  values (r.empresa_id, p_racao, coalesce(nullif(trim(p_fase), ''), r.nome),
          coalesce((select max(versao) from formulas_racao where produto_racao_id = p_racao), 0) + 1,
          round(v_soma, 3))
  returning id into v_id;
  insert into formula_itens (formula_id, insumo_id, kg, kg_por_tonelada)
  select v_id, (x->>'insumo_id')::uuid, sum(coalesce((x->>'kg')::numeric, (x->>'kg_por_tonelada')::numeric)),
         round(sum(coalesce((x->>'kg')::numeric, (x->>'kg_por_tonelada')::numeric)) * 1000 / v_soma, 3)
  from jsonb_array_elements(p_itens) x group by 2;
  return v_id;
end $$;

-- Custo da tonelada e também da batida da fórmula (total_kg), ao custo médio de hoje.
create or replace view custo_formulas with (security_invoker = true) as
select f.empresa_id, f.id as formula_id, f.produto_racao_id, r.nome as racao, f.fase, f.versao,
       round(sum(fi.kg_por_tonelada * i.custo_medio_cents))::bigint as custo_tonelada_cents,
       count(*) as ingredientes,
       f.total_kg,
       round(sum(fi.kg * i.custo_medio_cents))::bigint as custo_batida_cents
from formulas_racao f
join produtos r on r.id = f.produto_racao_id
join formula_itens fi on fi.formula_id = f.id
join produtos i on i.id = fi.insumo_id
where f.vigente
group by f.id, r.nome;
