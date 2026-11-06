-- Ovos em cartelas e caixas: no Amazonas não se trabalha com dúzia, e sim com cartela de 30 ovos e caixa
-- de 12 cartelas. Cada empresa escolhe a unidade em que conta e vende (cartela é o padrão; dúzia continua
-- valendo para quem usa). A caixa tem 360 ovos nos dois casos. O estoque segue guardado em ovos.

-- ---------------------------------------------------------------------------
-- 1. Unidade da empresa
-- ---------------------------------------------------------------------------

alter table empresas add column unidade_ovo text not null default 'cartela'
  check (unidade_ovo in ('cartela', 'duzia'));

-- ---------------------------------------------------------------------------
-- 2. Produtos de venda de cada classe seguem a unidade: Cartela (30) ou Dúzia (12), mais a caixa (360).
--    O produto da outra unidade fica inativo (pedidos antigos continuam apontando para ele).
-- ---------------------------------------------------------------------------

create or replace function app.produtos_venda_peixe(p_classe uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c classes_peixe%rowtype;
  v_unidade text;
  v_nome text; v_sigla text; v_fator int;
  v_outro text; v_outro_fator int;
  v_caixa text; v_caixa_outra text;
begin
  select * into c from classes_peixe where id = p_classe;
  if not found or not c.comercializavel then return; end if;
  select unidade_ovo into v_unidade from empresas where id = c.empresa_id;

  if v_unidade = 'duzia' then
    v_nome := 'Dúzia ' || c.nome; v_sigla := 'dz'; v_fator := 12;
    v_outro := 'Cartela ' || c.nome; v_outro_fator := 30;
    v_caixa := 'Caixa 30 dúzias ' || c.nome; v_caixa_outra := 'Caixa 12 cartelas ' || c.nome;
  else
    v_nome := 'Cartela ' || c.nome; v_sigla := 'ct'; v_fator := 30;
    v_outro := 'Dúzia ' || c.nome; v_outro_fator := 12;
    v_caixa := 'Caixa 12 cartelas ' || c.nome; v_caixa_outra := 'Caixa 30 dúzias ' || c.nome;
  end if;

  insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm)
  values (c.empresa_id, 'ovo', v_nome, v_sigla, v_fator, c.id, '0407.21.00')
  on conflict (empresa_id, nome) do update set ativo = true
    where produtos.classe_peixe_id = excluded.classe_peixe_id and produtos.fator_kg = excluded.fator_kg;

  update produtos set ativo = false
  where classe_peixe_id = c.id and nome = v_outro and fator_kg = v_outro_fator and not base_estoque and ativo;

  -- a caixa é a mesma (360 ovos); só o nome acompanha a unidade
  if not exists (select 1 from produtos where empresa_id = c.empresa_id and nome = v_caixa) then
    update produtos set nome = v_caixa
    where classe_peixe_id = c.id and nome = v_caixa_outra and fator_kg = 360 and not base_estoque;
    if not found then
      insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm)
      values (c.empresa_id, 'ovo', v_caixa, 'cx', 360, c.id, '0407.21.00')
      on conflict do nothing;
    end if;
  end if;
end $$;

create or replace function app.produtos_da_classe() returns trigger language plpgsql as $$
begin
  perform app.produto_base_peixe(new.id);
  perform app.produtos_venda_peixe(new.id);
  return new;
end $$;

create or replace function app.unidade_ovo_mudou() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_classe uuid;
begin
  for v_classe in select id from classes_peixe where empresa_id = new.id and comercializavel loop
    perform app.produtos_venda_peixe(v_classe);
  end loop;
  return null;
end $$;

create trigger unidade_ovo_mudou after update of unidade_ovo on empresas
  for each row when (old.unidade_ovo is distinct from new.unidade_ovo)
  execute function app.unidade_ovo_mudou();

-- empresas que já existiam passam a vender em cartela
do $$
declare v_classe uuid;
begin
  for v_classe in select id from classes_peixe where comercializavel loop
    perform app.produtos_venda_peixe(v_classe);
  end loop;
end $$;

-- a cartela nova herda os preços em vigor da dúzia da mesma classe (30/12 do preço)
insert into tabelas_preco (empresa_id, produto_id, cliente_id, lista_id, preco_cents, vigencia)
select t.empresa_id, ct.id, t.cliente_id, t.lista_id, round(t.preco_cents * 30 / 12.0), t.vigencia
from tabelas_preco t
join produtos dz on dz.id = t.produto_id and dz.unidade = 'dz' and dz.fator_kg = 12
join produtos ct on ct.classe_peixe_id = dz.classe_peixe_id and ct.unidade = 'ct' and ct.fator_kg = 30 and not ct.base_estoque
where (upper_inf(t.vigencia) or upper(t.vigencia) > current_date)
  and not exists (select 1 from tabelas_preco x where x.produto_id = ct.id);

-- ---------------------------------------------------------------------------
-- 3. Custo e preço por ovo, para a tela mostrar em cartela, dúzia ou caixa sem arredondar duas vezes.
--    As colunas por dúzia continuam (só acrescento colunas no fim das views).
-- ---------------------------------------------------------------------------

create or replace view custo_kg_lote with (security_invoker = true) as
select m.empresa_id, m.lote_id, l.codigo as lote_codigo, m.mes, m.peixes_medios, m.kg_despescados, m.duzias, m.racao_kg,
       m.racao_cents, m.alevinos_cents, m.sanidade_cents, m.mao_obra_cents, m.energia_cents, m.embalagem_cents,
       m.outros_diretos_cents, m.indiretos_rateados_cents, m.custo_total_cents, m.calculado_em,
       case when m.duzias > 0 then round(m.custo_total_cents / m.duzias) end::bigint as custo_duzia_cents,
       case when m.duzias > 0 then round(m.racao_cents / m.duzias) end::bigint as racao_duzia_cents,
       round(m.racao_kg / nullif(m.duzias, 0), 3) as kg_racao_duzia,
       v.preco_duzia_cents,
       m.custo_total_cents::numeric / nullif(m.kg_despescados, 0) as custo_ovo_cents,
       m.racao_kg / nullif(m.kg_despescados, 0) as kg_racao_ovo,
       v.preco_ovo_cents
from custos_lote_mensal m
join lotes l on l.id = m.lote_id
left join lateral (
  select round(sum(p.total_cents) * 12.0 / nullif(sum(p.ovos), 0))::bigint as preco_duzia_cents,
         sum(p.total_cents)::numeric / nullif(sum(p.ovos), 0) as preco_ovo_cents
  from pedidos p where p.empresa_id = m.empresa_id and p.status in ('faturado', 'entregue')
    and date_trunc('month', p.data) = m.mes
) v on true;

create or replace view margem_cliente_mes with (security_invoker = true) as
with custo as (
  select empresa_id, mes, round(sum(custo_total_cents) / nullif(sum(duzias), 0))::bigint as custo_duzia_cents,
         sum(custo_total_cents)::numeric / nullif(sum(kg_despescados), 0) as custo_ovo_cents
  from custos_lote_mensal group by empresa_id, mes
)
select p.empresa_id, date_trunc('month', p.data)::date as mes, p.cliente_id, p.cliente_nome,
       count(*) as pedidos, sum(p.ovos)::bigint as ovos, sum(p.total_cents)::bigint as receita_cents,
       round(sum(p.total_cents) * 12.0 / nullif(sum(p.ovos), 0))::bigint as preco_duzia_cents,
       c.custo_duzia_cents,
       round(sum(p.total_cents) - c.custo_ovo_cents * sum(p.ovos))::bigint as margem_cents,
       sum(p.total_cents)::numeric / nullif(sum(p.ovos), 0) as preco_ovo_cents,
       c.custo_ovo_cents
from pedidos p
left join custo c on c.empresa_id = p.empresa_id and c.mes = date_trunc('month', p.data)::date
where p.status in ('faturado', 'entregue')
group by p.empresa_id, date_trunc('month', p.data), p.cliente_id, p.cliente_nome, c.custo_duzia_cents, c.custo_ovo_cents;

-- ---------------------------------------------------------------------------
-- 4. Planejamento: o preço do ovo vale para um número de ovos (12, 30 ou 360) e o custo de embalagem
--    pode ser por dúzia, cartela ou caixa.
-- ---------------------------------------------------------------------------

alter table planejamento_parametros rename column preco_duzia_cents to preco_kg_cents;
alter table planejamento_parametros rename constraint planejamento_parametros_preco_duzia_cents_check to planejamento_parametros_preco_kg_cents_check;
alter table planejamento_parametros add column preco_ovos_por smallint not null default 12 check (preco_ovos_por in (12, 30, 360));
alter table planejamento_parametros alter column preco_ovos_por set default 30;

alter table planejamento_custos drop constraint planejamento_custos_base_check;
alter table planejamento_custos add constraint planejamento_custos_base_check
  check (base in ('peixe', 'lote', 'mes', 'duzia', 'cartela', 'caixa'));
alter table planejamento_custos drop constraint duzia_so_na_producao;
alter table planejamento_custos add constraint ovos_so_na_producao
  check (base not in ('duzia', 'cartela', 'caixa') or fase in ('producao', 'ciclo'));
