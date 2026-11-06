-- Ovos brancos e vermelhos. A cor vem da espécie do lote (espécies.cor_ovo) e segue o ovo pelo sistema:
-- apontamento -> "Sem classificação" da cor -> classes da cor -> produtos de venda da cor -> pedidos e PDV.
-- Cada classe de ovo passa a ter cor; a empresa ganha as classes de uma cor quando povoa o primeiro lote dela.
--
-- A classificação também registra o que não virou classe: ovos quebrados na máquina e a diferença de
-- contagem entre o apontado no viveiro e o que passou pela classificação. A view diferenca_classificacao
-- compara o apontado com o classificado por dia, lote e cor.

-- ---------------------------------------------------------------------------
-- 1. Cor nas classes
-- ---------------------------------------------------------------------------

alter table classes_peixe add column cor text not null default 'branco' check (cor in ('branco', 'vermelho'));
alter table classes_peixe drop constraint classes_peixe_empresa_id_nome_key;
alter table classes_peixe add constraint classes_peixe_empresa_cor_nome_key unique (empresa_id, cor, nome);
drop index classes_peixe_sem_classificacao;
create unique index classes_peixe_sem_classificacao on classes_peixe (empresa_id, cor) where sem_classificacao;

create or replace function app.cor_ovo_lote(p_lote uuid) returns text
language sql stable security definer set search_path = public as $$
  select g.cor_ovo from lotes l join especies g on g.id = l.especie_id where l.id = p_lote
$$;

-- "Extra" + "branco" -> "Extra branco"; vale para produtos, estoque, pedidos e relatórios
create or replace function app.rotulo_classe(p_nome text, p_cor text) returns text
language sql immutable as $$ select p_nome || ' ' || p_cor $$;

-- As classes que já existiam ficam com a cor da maioria dos lotes da empresa (branco sem lote).
-- A outra cor, se a empresa tiver lote dela, ganha classes próprias logo abaixo.
update classes_peixe c set cor = x.cor
from (
  select l.empresa_id, g.cor_ovo as cor,
         row_number() over (partition by l.empresa_id order by count(*) desc, g.cor_ovo) as n
  from lotes l join especies g on g.id = l.especie_id
  group by l.empresa_id, g.cor_ovo
) x
where x.empresa_id = c.empresa_id and x.n = 1 and c.cor <> x.cor;

-- ---------------------------------------------------------------------------
-- 2. Produtos levam a cor no nome: "Cartela Extra branco", "Ovo Extra vermelho (unidade)"
-- ---------------------------------------------------------------------------

create or replace function app.produto_base_peixe(p_classe uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  c classes_peixe%rowtype;
begin
  select id into v_id from produtos where classe_peixe_id = p_classe and base_estoque;
  if found then return v_id; end if;
  select * into c from classes_peixe where id = p_classe;
  insert into produtos (empresa_id, tipo, nome, unidade, fator_kg, classe_peixe_id, ncm, base_estoque)
  values (c.empresa_id, 'ovo', 'Ovo ' || app.rotulo_classe(c.nome, c.cor) || ' (unidade)', 'un', 1, c.id, '0407.21.00', true)
  on conflict (empresa_id, nome) do update set base_estoque = true, classe_peixe_id = excluded.classe_peixe_id, fator_kg = 1
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.produtos_venda_peixe(p_classe uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c classes_peixe%rowtype;
  v_rotulo text;
  v_unidade text;
  v_nome text; v_sigla text; v_fator int;
  v_outro text; v_outro_fator int;
  v_caixa text; v_caixa_outra text;
begin
  select * into c from classes_peixe where id = p_classe;
  if not found or not c.comercializavel then return; end if;
  v_rotulo := app.rotulo_classe(c.nome, c.cor);
  select unidade_ovo into v_unidade from empresas where id = c.empresa_id;

  if v_unidade = 'duzia' then
    v_nome := 'Dúzia ' || v_rotulo; v_sigla := 'dz'; v_fator := 12;
    v_outro := 'Cartela ' || v_rotulo; v_outro_fator := 30;
    v_caixa := 'Caixa 30 dúzias ' || v_rotulo; v_caixa_outra := 'Caixa 12 cartelas ' || v_rotulo;
  else
    v_nome := 'Cartela ' || v_rotulo; v_sigla := 'ct'; v_fator := 30;
    v_outro := 'Dúzia ' || v_rotulo; v_outro_fator := 12;
    v_caixa := 'Caixa 12 cartelas ' || v_rotulo; v_caixa_outra := 'Caixa 30 dúzias ' || v_rotulo;
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

-- Os produtos automáticos que já existiam ganham a cor no nome (produtos cadastrados à mão ficam como estão)
update produtos p set nome = case
    when p.nome = 'Ovo ' || c.nome || ' (unidade)' then 'Ovo ' || app.rotulo_classe(c.nome, c.cor) || ' (unidade)'
    else p.nome || ' ' || c.cor
  end
from classes_peixe c
where c.id = p.classe_peixe_id
  and p.nome in ('Ovo ' || c.nome || ' (unidade)', 'Dúzia ' || c.nome, 'Cartela ' || c.nome,
                 'Caixa 12 cartelas ' || c.nome, 'Caixa 30 dúzias ' || c.nome)
  and not exists (select 1 from produtos x where x.empresa_id = p.empresa_id and x.nome = case
    when p.nome = 'Ovo ' || c.nome || ' (unidade)' then 'Ovo ' || app.rotulo_classe(c.nome, c.cor) || ' (unidade)'
    else p.nome || ' ' || c.cor end);

-- ---------------------------------------------------------------------------
-- 3. "Sem classificação" por cor e classes da cor criadas quando entra um lote dela
-- ---------------------------------------------------------------------------

create or replace function app.classe_sem_classificacao(p_empresa uuid, p_cor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from classes_peixe where empresa_id = p_empresa and cor = p_cor and sem_classificacao;
  if found then return v_id; end if;
  insert into classes_peixe (empresa_id, nome, comercializavel, ordem, sem_classificacao, cor)
  values (p_empresa, 'Sem classificação', false, -1, true, p_cor)
  on conflict (empresa_id, cor, nome) do update set sem_classificacao = true
  returning id into v_id;
  return v_id;
end $$;

-- a versão antiga (sem cor) continua valendo para os ovos brancos
create or replace function app.classe_sem_classificacao(p_empresa uuid) returns uuid
language sql security definer set search_path = public as $$
  select app.classe_sem_classificacao(p_empresa, 'branco')
$$;

-- Copia as classes da outra cor (nome, pesos, ordem) para a cor pedida, se ela ainda não tem nenhuma.
create or replace function app.garantir_classes_cor(p_empresa uuid, p_cor text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_empresa is null or p_cor is null then return; end if;
  if not exists (select 1 from classes_peixe where empresa_id = p_empresa and cor = p_cor and not sem_classificacao) then
    insert into classes_peixe (empresa_id, nome, peso_min_g, peso_max_g, comercializavel, ordem, cor)
    select empresa_id, nome, peso_min_g, peso_max_g, comercializavel, ordem, p_cor
    from classes_peixe
    where empresa_id = p_empresa and cor <> p_cor and not sem_classificacao
    on conflict do nothing;
  end if;
  perform app.classe_sem_classificacao(p_empresa, p_cor);
end $$;

create or replace function app.classes_da_cor_do_lote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.garantir_classes_cor(new.empresa_id, app.cor_ovo_lote(new.id));
  return null;
end $$;
create trigger classes_da_cor_do_lote after insert or update of especie_id on lotes
  for each row execute function app.classes_da_cor_do_lote();

create or replace function app.classes_da_cor_da_especie() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_empresa uuid;
begin
  for v_empresa in select distinct empresa_id from lotes where especie_id = new.id loop
    perform app.garantir_classes_cor(v_empresa, new.cor_ovo);
  end loop;
  return null;
end $$;
create trigger classes_da_cor_da_especie after update of cor_ovo on especies
  for each row when (old.cor_ovo is distinct from new.cor_ovo)
  execute function app.classes_da_cor_da_especie();

do $$
declare r record;
begin
  for r in select distinct l.empresa_id, g.cor_ovo from lotes l join especies g on g.id = l.especie_id loop
    perform app.garantir_classes_cor(r.empresa_id, r.cor_ovo);
  end loop;
end $$;

-- O apontamento põe os ovos no "Sem classificação" da cor do lote
CREATE OR REPLACE FUNCTION app.lancamento_para_estoque()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a apontamentos_diarios%rowtype; v_produtos uuid[];
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.travar_estoque(old.empresa_id);
    with d as (delete from movimentos_estoque where origem_tabela = 'apontamento_lancamentos' and origem_id = old.id returning produto_id)
    select array_agg(distinct produto_id) into v_produtos from d;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.ovos > 0 then
    select * into a from apontamentos_diarios where id = new.apontamento_id;
    insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, viveiro_id,
                                    origem_tabela, origem_id, created_by)
    values (a.empresa_id,
            app.produto_base_peixe(app.classe_sem_classificacao(a.empresa_id, coalesce(app.cor_ovo_lote(a.lote_id), 'branco'))),
            app.deposito_ovos(a.empresa_id), a.data, 'producao_ovos', new.ovos, a.lote_id, a.viveiro_id,
            'apontamento_lancamentos', new.id, auth.uid());
  end if;
  if v_produtos is not null then perform app.conferir_saldo_peixe(v_produtos); end if;
  return null;
end $function$;

-- Estoque de ovos: "classe" já vem com a cor ("Extra branco"); colunas novas no fim
create or replace view estoque_peixe with (security_invoker = true) as
select c.empresa_id, c.id as classe_id, app.rotulo_classe(c.nome, c.cor) as classe, c.ordem, c.comercializavel, p.id as produto_id,
       coalesce(s.saldo, 0)::bigint as saldo,
       least(coalesce(s.saldo, 0), coalesce(k.ovos, 0))::bigint as em_carencia,
       greatest(coalesce(s.saldo, 0) - coalesce(k.ovos, 0), 0)::bigint as disponivel,
       c.sem_classificacao,
       c.cor,
       c.nome as classe_nome
from classes_peixe c
join produtos p on p.classe_peixe_id = c.id and p.base_estoque
left join (select produto_id, sum(quantidade) as saldo from movimentos_estoque group by produto_id) s on s.produto_id = p.id
left join (select classe_peixe_id, sum(ovos) as ovos from ovos_em_carencia group by classe_peixe_id) k on k.classe_peixe_id = c.id;

-- ---------------------------------------------------------------------------
-- 4. Classificação: uma cor por vez, com quebrados e diferença de contagem
-- ---------------------------------------------------------------------------

alter table despescas add column cor text check (cor in ('branco', 'vermelho'));
alter table despescas add column quebrados int not null default 0 check (quebrados >= 0);
-- diferença de contagem: positivo = faltaram ovos em relação ao apontado; negativo = sobraram
alter table despescas add column diferenca int not null default 0;

update despescas k set cor = coalesce((
  select c.cor from movimentos_estoque m join produtos p on p.id = m.produto_id join classes_peixe c on c.id = p.classe_peixe_id
  where m.origem_tabela = 'despescas' and m.origem_id = k.id limit 1), 'branco');
alter table despescas alter column cor set not null;

alter table despescas drop constraint despescas_total_check;
alter table despescas add constraint despescas_total_check check (total >= 0);
alter table despescas add constraint classificacao_com_quantidade check (total > 0 or quebrados > 0 or diferenca <> 0);

drop function public.registrar_despesca(uuid, date, jsonb, uuid, text, uuid);

create function public.registrar_despesca(
  p_empresa uuid,
  p_data date,
  p_itens jsonb,                -- {"<classe_id>": quantidade, ...}, todas da mesma cor
  p_lote uuid default null,
  p_observacoes text default null,
  p_client_id uuid default null,
  p_cor text default null,      -- obrigatória só quando não há item nem lote para dizer a cor
  p_quebrados int default 0,
  p_diferenca int default 0
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
  v_sem uuid;
  v_cor text;
  v_cores text[];
  v_total int;
  v_saida int;
  v_disponivel bigint;
begin
  if p_client_id is not null then
    select id into v_id from despescas where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if p_data is null or p_data > app.hoje(p_empresa) then
    raise exception 'Data da classificação inválida' using errcode = 'check_violation';
  end if;
  if not app.pode_algum(p_empresa, array['apontamentos.editar', 'estoque.editar']) then
    raise exception 'Seu usuário não tem permissão para classificar ovos' using errcode = 'insufficient_privilege';
  end if;
  if p_lote is not null and not exists (select 1 from lotes where id = p_lote and empresa_id = p_empresa) then
    raise exception 'Lote não encontrado' using errcode = 'check_violation';
  end if;
  if p_cor is not null and p_cor not in ('branco', 'vermelho') then
    raise exception 'Cor do ovo inválida' using errcode = 'check_violation';
  end if;
  if coalesce(p_quebrados, 0) < 0 then
    raise exception 'Ovos quebrados não podem ser negativos' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(coalesce(p_itens, '{}')) <> 'object' or exists (
    select 1 from jsonb_each_text(coalesce(p_itens, '{}')) o
    where o.value !~ '^\d+$'
       or not exists (select 1 from classes_peixe c where c.id::text = o.key and c.empresa_id = p_empresa and not c.sem_classificacao)
  ) then
    raise exception 'Classe de ovo inválida ou quantidade negativa' using errcode = 'check_violation';
  end if;

  select coalesce(sum(value::int), 0) into v_total from jsonb_each_text(coalesce(p_itens, '{}'));
  if v_total <= 0 and coalesce(p_quebrados, 0) = 0 and coalesce(p_diferenca, 0) = 0 then
    raise exception 'Informe quantos ovos foram para cada classe' using errcode = 'check_violation';
  end if;

  -- a cor sai das classes, do lote ou do parâmetro, e todos precisam concordar
  select array_agg(distinct x) into v_cores from (
    select c.cor as x from jsonb_each_text(coalesce(p_itens, '{}')) o join classes_peixe c on c.id::text = o.key where o.value::int > 0
    union select app.cor_ovo_lote(p_lote) where p_lote is not null
    union select p_cor where p_cor is not null
  ) t where x is not null;
  if coalesce(array_length(v_cores, 1), 0) > 1 then
    raise exception 'Classifique ovos brancos e vermelhos separados: as classes, o lote e a cor precisam ser da mesma cor'
      using errcode = 'check_violation';
  end if;
  v_cor := v_cores[1];
  if v_cor is null then
    raise exception 'Informe a cor dos ovos classificados' using errcode = 'check_violation';
  end if;

  v_saida := v_total + coalesce(p_quebrados, 0) + coalesce(p_diferenca, 0);

  v_sem := app.classe_sem_classificacao(p_empresa, v_cor);
  perform app.travar_estoque(p_empresa);   -- mesma trava em toda função que mexe no saldo
  select disponivel into v_disponivel from estoque_peixe where classe_id = v_sem;
  if v_saida > coalesce(v_disponivel, 0) then
    raise exception 'Há só % ovos % sem classificação disponíveis (os em carência não entram)', coalesce(v_disponivel, 0),
      case v_cor when 'vermelho' then 'vermelhos' else 'brancos' end
      using errcode = 'check_violation';
  end if;

  insert into despescas (empresa_id, data, lote_id, total, observacoes, client_id, created_by, cor, quebrados, diferenca)
  values (p_empresa, p_data, p_lote, v_total, nullif(trim(p_observacoes), ''), p_client_id, auth.uid(), v_cor,
          coalesce(p_quebrados, 0), coalesce(p_diferenca, 0))
  returning id into v_id;

  insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, lote_id, origem_tabela, origem_id,
                                  observacao, created_by)
  select p_empresa, app.produto_base_peixe(c), app.deposito_ovos(p_empresa), p_data, t, q, p_lote, 'despescas', v_id, obs, auth.uid()
  from (select v_sem as c, 'classificacao' as t, -v_total as q, null as obs where v_total > 0
        union all
        select key::uuid, 'classificacao', value::int, null from jsonb_each_text(p_itens) where value::int > 0
        union all
        select v_sem, 'perda', -p_quebrados, 'Quebrados na classificação' where coalesce(p_quebrados, 0) > 0
        union all
        select v_sem, 'ajuste', -p_diferenca, case when p_diferenca > 0 then 'Diferença de contagem: faltaram ovos'
                                                   else 'Diferença de contagem: sobraram ovos' end
        where coalesce(p_diferenca, 0) <> 0) x;
  return v_id;
end $$;

revoke all on function public.registrar_despesca(uuid, date, jsonb, uuid, text, uuid, text, int, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.registrar_despesca(uuid, date, jsonb, uuid, text, uuid, text, int, int) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Diferença entre o apontado no viveiro e o que passou pela classificação, por dia, lote e cor
-- ---------------------------------------------------------------------------

create or replace view diferenca_classificacao with (security_invoker = true) as
with apontado as (
  select a.empresa_id, a.data, a.lote_id, g.cor_ovo as cor, sum(a.ovos_total)::bigint as apontado
  from apontamentos_diarios a
  join lotes l on l.id = a.lote_id
  join especies g on g.id = l.especie_id
  group by a.empresa_id, a.data, a.lote_id, g.cor_ovo
),
classes as (
  select m.origem_id as classificacao_id,
         sum(m.quantidade) filter (where c.comercializavel) as comercializaveis,
         sum(m.quantidade) filter (where not c.comercializavel and c.nome ilike 'trinc%') as trincados,
         sum(m.quantidade) filter (where not c.comercializavel and c.nome not ilike 'trinc%') as descarte
  from movimentos_estoque m
  join produtos p on p.id = m.produto_id
  join classes_peixe c on c.id = p.classe_peixe_id
  where m.origem_tabela = 'despescas' and m.tipo = 'classificacao' and m.quantidade > 0
  group by m.origem_id
),
classificado as (
  select k.empresa_id, k.data, k.lote_id, k.cor, sum(k.total)::bigint as classificado,
         coalesce(sum(x.comercializaveis), 0)::bigint as comercializaveis,
         coalesce(sum(x.trincados), 0)::bigint as trincados,
         coalesce(sum(x.descarte), 0)::bigint as descarte,
         sum(k.quebrados)::bigint as quebrados,
         sum(k.diferenca)::bigint as diferenca_contagem
  from despescas k
  left join classes x on x.classificacao_id = k.id
  group by k.empresa_id, k.data, k.lote_id, k.cor
)
select coalesce(a.empresa_id, k.empresa_id) as empresa_id,
       coalesce(a.data, k.data) as data,
       coalesce(a.lote_id, k.lote_id) as lote_id,
       l.codigo as lote_codigo,
       coalesce(a.cor, k.cor) as cor,
       coalesce(a.apontado, 0) as apontado,
       coalesce(k.classificado, 0) as classificado,
       coalesce(k.comercializaveis, 0) as comercializaveis,
       coalesce(k.trincados, 0) as trincados,
       coalesce(k.descarte, 0) as descarte,
       coalesce(k.quebrados, 0) as quebrados,
       coalesce(k.diferenca_contagem, 0) as diferenca_contagem
from apontado a
full join classificado k on k.empresa_id = a.empresa_id and k.data = a.data and k.lote_id = a.lote_id and k.cor = a.cor
left join lotes l on l.id = coalesce(a.lote_id, k.lote_id);

-- ---------------------------------------------------------------------------
-- 6. Vendas e custo do kg com a cor (colunas novas no fim)
-- ---------------------------------------------------------------------------

create or replace view vendas_itens with (security_invoker = true) as
select p.empresa_id, p.id as pedido_id, p.numero, p.data, date_trunc('month', p.data)::date as mes,
       p.cliente_id, c.nome as cliente, i.produto_id, pr.nome as produto, pr.classe_peixe_id,
       case when co.id is not null then app.rotulo_classe(co.nome, co.cor) end as classe,
       i.quantidade, (i.quantidade * coalesce(pr.fator_kg, 0))::bigint as ovos, i.total_cents,
       co.cor
from pedidos_venda p
join contatos c on c.id = p.cliente_id
join pedido_itens i on i.pedido_id = p.id
join produtos pr on pr.id = i.produto_id
left join classes_peixe co on co.id = pr.classe_peixe_id
where p.status in ('faturado', 'entregue');

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
       v.preco_ovo_cents,
       g.cor_ovo,
       vc.preco_ovo_cor_cents
from custos_lote_mensal m
join lotes l on l.id = m.lote_id
join especies g on g.id = l.especie_id
-- preço médio do ovo da mesma cor no mês, para comparar com o custo do lote
left join lateral (
  select sum(i.total_cents)::numeric / nullif(sum(i.ovos), 0) as preco_ovo_cor_cents
  from vendas_itens i where i.empresa_id = m.empresa_id and i.cor = g.cor_ovo and i.mes = m.mes
) vc on true
left join lateral (
  select round(sum(p.total_cents) * 12.0 / nullif(sum(p.ovos), 0))::bigint as preco_duzia_cents,
         sum(p.total_cents)::numeric / nullif(sum(p.ovos), 0) as preco_ovo_cents
  from pedidos p where p.empresa_id = m.empresa_id and p.status in ('faturado', 'entregue')
    and date_trunc('month', p.data) = m.mes
) v on true;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on all functions in schema app to authenticated;
    grant select on estoque_peixe, diferenca_classificacao, vendas_itens, custo_kg_lote to authenticated;
  end if;
end $$;

select app.travar_referencias();
