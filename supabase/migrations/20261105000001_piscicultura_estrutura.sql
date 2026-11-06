-- Balbina: a base veio do FINAVI (avicultura de postura). As migrations anteriores foram traduzidas
-- para os nomes da piscicultura (galpão → viveiro, núcleo → setor, linhagem → espécie, aves → peixes,
-- alojamento → povoamento). Daqui em diante o domínio muda de verdade: esta primeira parte cuida da
-- estrutura (setores, viveiros, espécies, curvas, tabela de arraçoamento) e do ciclo do lote.
--
-- Referências técnicas (tambaqui):
--   D1: Corrêa et al., "Criação de tambaquis", Embrapa Amazônia Oriental, 2018.
--   D2: Izel et al., "Produção intensiva de tambaqui em tanques escavados com aeração", Circular Técnica 39,
--       Embrapa Amazônia Ocidental, 2013.

-- ---------------------------------------------------------------------------
-- 0. Visões que mudam de forma: saem agora e voltam em 20261105000006 (custos e indicadores).
-- ---------------------------------------------------------------------------
drop view if exists alertas;
drop view if exists margem_cliente_mes;
drop view if exists custo_kg_lote;
drop view if exists diferenca_classificacao;
drop view if exists saldos_produtos;
drop view if exists estoque_peixe_ponto;
drop view if exists estoque_peixe;
drop view if exists ovos_em_carencia;
drop view if exists indicadores_lote_semana;
drop view if exists indicadores_lote_dia;
drop view if exists alocacoes_atuais;
drop view if exists medicacoes;
drop view if exists vendas_itens;
drop view if exists pedidos;
drop view if exists estoque_produtos;

-- ---------------------------------------------------------------------------
-- 1. Setores (antes núcleos): a licença ambiental substitui o registro sanitário do aviário.
-- ---------------------------------------------------------------------------
alter table setores rename column registro_sanitario to licenca_ambiental;

-- ---------------------------------------------------------------------------
-- 2. Viveiros (antes galpões)
--    finalidade: alevinagem (berçário), recria, engorda ou alevinagem_recria (o mesmo viveiro faz as duas).
--    sistema: tipo de estrutura. area_m2 e volume_m3 dão a densidade (peixes/m² ou kg/m³).
-- ---------------------------------------------------------------------------
alter table viveiros drop constraint viveiros_finalidade_check;
update viveiros set finalidade = case finalidade when 'cria' then 'alevinagem' when 'producao' then 'engorda'
                                                 when 'cria_recria' then 'alevinagem_recria' else finalidade end;
alter table viveiros add constraint viveiros_finalidade_check
  check (finalidade in ('alevinagem', 'recria', 'engorda', 'alevinagem_recria'));

alter table viveiros drop constraint viveiros_sistema_check;
update viveiros set sistema = 'escavado';
alter table viveiros alter column sistema set default 'escavado';
alter table viveiros add constraint viveiros_sistema_check
  check (sistema in ('escavado', 'barragem', 'tanque_rede', 'alvenaria', 'lona', 'outro'));

alter table viveiros
  add column area_m2 numeric(12,2) check (area_m2 is null or area_m2 > 0),
  add column volume_m3 numeric(12,2) check (volume_m3 is null or volume_m3 > 0),
  add column profundidade_m numeric(5,2) check (profundidade_m is null or (profundidade_m > 0 and profundidade_m <= 20));

comment on column viveiros.aeracao is 'Viveiro com aerador (D2: 4 aeradores de 1,5 HP por hectare no sistema intensivo)';
comment on column viveiros.area_m2 is 'Lâmina d''água em m². Base da densidade em peixes/m² nos viveiros escavados';
comment on column viveiros.volume_m3 is 'Volume útil em m³. Base da densidade em kg/m³ nos tanques-rede e de alvenaria';

-- ---------------------------------------------------------------------------
-- 3. Espécies (antes linhagens): sem cor de ovo; o catálogo global passa a ser de peixes.
-- ---------------------------------------------------------------------------
drop trigger if exists classes_da_cor_da_especie on especies;
drop trigger if exists classes_da_cor_do_lote on lotes;
drop function if exists app.classes_da_cor_da_especie();
drop function if exists app.classes_da_cor_do_lote();
drop function if exists app.cor_ovo_lote(uuid);

alter table especies drop column cor_ovo;
alter table especies add column nome_cientifico text;

delete from curvas_crescimento c using especies e
where e.id = c.especie_id and e.empresa_id is null;
delete from especies e
where e.empresa_id is null
  and not exists (select 1 from lotes l where l.especie_id = e.id);

insert into especies (empresa_id, nome, nome_cientifico) values
  (null, 'Tambaqui', 'Colossoma macropomum'),
  (null, 'Tambatinga', 'Colossoma macropomum × Piaractus brachypomus'),
  (null, 'Tambacu', 'Colossoma macropomum × Piaractus mesopotamicus'),
  (null, 'Pirapitinga', 'Piaractus brachypomus'),
  (null, 'Matrinxã', 'Brycon amazonicus'),
  (null, 'Pirarucu', 'Arapaima gigas'),
  (null, 'Jaraqui', 'Semaprochilodus spp.'),
  (null, 'Pacu', 'Piaractus mesopotamicus'),
  (null, 'Curimatã', 'Prochilodus spp.'),
  (null, 'Tilápia-do-nilo', 'Oreochromis niloticus');

-- ---------------------------------------------------------------------------
-- 4. Curva de crescimento da espécie (antes curva padrão da linhagem): peso esperado por semana de
--    cultivo, contada do povoamento. Sem postura, peso de ovo ou ovos por ave.
-- ---------------------------------------------------------------------------
alter table curvas_crescimento drop column pct_engorda;
alter table curvas_crescimento drop column peso_ovo_g;
alter table curvas_crescimento drop column ovos_peixe_povoada_acum;
alter table curvas_crescimento drop constraint curvas_crescimento_semana_check;
alter table curvas_crescimento add constraint curvas_crescimento_semana_check check (semana between 1 and 156);
alter table curvas_crescimento
  add column taxa_alimentacao_pct numeric(5,2) check (taxa_alimentacao_pct is null or taxa_alimentacao_pct between 0 and 30),
  add column refeicoes_dia smallint check (refeicoes_dia is null or refeicoes_dia between 1 and 12),
  add column proteina_pct numeric(4,1) check (proteina_pct is null or proteina_pct between 0 and 70);
comment on table curvas_crescimento is 'Peso esperado (g) por semana de cultivo. A do tambaqui é uma referência: curva de Gompertz ajustada aos pontos publicados pela Embrapa (D1: 0,5 g → 5–7 g em 30 dias; D2: 160 g → 2,62 kg em 10 meses com aeração)';

-- semana | peso (g) | taxa (% do peso vivo por dia, D1 Tabela 3) | refeições | proteína bruta (%) | ração (g/peixe/dia)
insert into curvas_crescimento (especie_id, semana, peso_g, taxa_alimentacao_pct, refeicoes_dia, proteina_pct, consumo_g_peixe_dia)
select e.id, v.semana, v.peso, v.taxa, v.refeicoes, v.proteina, v.consumo
from especies e
cross join (values
    (1, 0.5, 20.0, 6, 55, 0.1),
    (2, 0.9, 19.36, 6, 55, 0.18),
    (3, 1.6, 18.31, 6, 55, 0.29),
    (4, 2.7, 16.62, 6, 55, 0.45),
    (5, 4.4, 14.03, 6, 55, 0.61),
    (6, 6.9, 10.18, 6, 55, 0.7),
    (7, 10.5, 7.45, 4, 40, 0.78),
    (8, 15.5, 7.09, 4, 40, 1.1),
    (9, 22.3, 6.59, 4, 40, 1.47),
    (10, 31.4, 5.72, 4, 40, 1.79),
    (11, 43.0, 5.38, 4, 40, 2.31),
    (12, 57.7, 4.96, 4, 40, 2.86),
    (13, 75.8, 4.13, 4, 32, 3.13),
    (14, 97.8, 3.85, 4, 32, 3.76),
    (15, 124, 3.51, 4, 32, 4.36),
    (16, 155, 3.12, 4, 32, 4.83),
    (17, 190, 2.59, 4, 28, 4.92),
    (18, 230, 2.45, 4, 28, 5.63),
    (19, 275, 2.29, 4, 28, 6.27),
    (20, 324, 2.07, 3, 28, 6.7),
    (21, 378, 2.0, 3, 28, 7.55),
    (22, 436, 1.92, 3, 28, 8.38),
    (23, 499, 1.84, 3, 28, 9.18),
    (24, 565, 1.66, 2, 28, 9.39),
    (25, 634, 1.59, 2, 28, 10.07),
    (26, 706, 1.51, 2, 28, 10.68),
    (27, 780, 1.43, 2, 28, 11.19),
    (28, 856, 1.35, 2, 28, 11.59),
    (29, 934, 1.27, 2, 28, 11.86),
    (30, 1013, 1.0, 2, 28, 10.11),
    (31, 1092, 0.99, 2, 28, 10.78),
    (32, 1171, 0.98, 2, 28, 11.44),
    (33, 1250, 0.97, 2, 28, 12.08),
    (34, 1328, 0.96, 2, 28, 12.7),
    (35, 1405, 0.95, 2, 28, 13.29),
    (36, 1481, 0.94, 2, 28, 13.86),
    (37, 1555, 0.93, 2, 28, 14.4),
    (38, 1627, 0.92, 2, 28, 14.91),
    (39, 1698, 0.91, 2, 28, 15.4),
    (40, 1766, 0.9, 2, 28, 15.86),
    (41, 1832, 0.89, 2, 28, 16.29),
    (42, 1896, 0.88, 2, 28, 16.69),
    (43, 1957, 0.87, 2, 28, 17.07),
    (44, 2016, 0.86, 2, 28, 17.43),
    (45, 2072, 0.86, 2, 28, 17.76),
    (46, 2126, 0.85, 2, 28, 18.07),
    (47, 2177, 0.84, 2, 28, 18.35),
    (48, 2226, 0.84, 2, 28, 18.62),
    (49, 2272, 0.83, 2, 28, 18.87),
    (50, 2316, 0.82, 2, 28, 19.1),
    (51, 2358, 0.82, 2, 28, 19.31),
    (52, 2398, 0.81, 2, 28, 19.51),
    (53, 2435, 0.81, 2, 28, 19.69),
    (54, 2471, 0.8, 2, 28, 19.86),
    (55, 2504, 0.8, 2, 28, 20.03),
    (56, 2536, 0.8, 2, 28, 20.29),
    (57, 2565, 0.8, 2, 28, 20.52),
    (58, 2593, 0.8, 2, 28, 20.75),
    (59, 2620, 0.8, 2, 28, 20.96),
    (60, 2644, 0.8, 2, 28, 21.15)
  ) as v(semana, peso, taxa, refeicoes, proteina, consumo)
where e.empresa_id is null and e.nome = 'Tambaqui';

-- ---------------------------------------------------------------------------
-- 5. Tabela de arraçoamento por faixa de peso (D1, Tabela 3): é ela que sugere a ração do dia.
--    A taxa cai em linha reta do início ao fim da faixa (ex.: alevinagem de 20% a 10% do peso vivo).
-- ---------------------------------------------------------------------------
create table tabela_arracoamento (
  id uuid primary key default gen_random_uuid(),
  especie_id uuid not null references especies(id) on delete cascade,
  fase text not null check (btrim(fase) <> ''),
  peso_min_g numeric(10,2) not null check (peso_min_g >= 0),
  peso_max_g numeric(10,2) not null,
  proteina_pct numeric(4,1) check (proteina_pct is null or proteina_pct between 0 and 70),
  granulo text,
  taxa_inicio_pct numeric(5,2) not null check (taxa_inicio_pct between 0 and 30),
  taxa_fim_pct numeric(5,2) not null check (taxa_fim_pct between 0 and 30),
  refeicoes smallint not null check (refeicoes between 1 and 12),
  fonte text,
  created_at timestamptz not null default now(),
  check (peso_max_g > peso_min_g),
  unique (especie_id, peso_min_g)
);
create index on tabela_arracoamento (especie_id);
alter table tabela_arracoamento enable row level security;
create policy leitura on tabela_arracoamento for select using (
  exists (select 1 from especies e where e.id = tabela_arracoamento.especie_id
          and (e.empresa_id is null or e.empresa_id in (select app.minhas_empresas()))));
create policy escrita_inserir on tabela_arracoamento for insert with check (
  exists (select 1 from especies e where e.id = tabela_arracoamento.especie_id and app.pode(e.empresa_id, 'lotes.editar')));
create policy escrita_alterar on tabela_arracoamento for update using (
  exists (select 1 from especies e where e.id = tabela_arracoamento.especie_id and app.pode(e.empresa_id, 'lotes.editar')))
  with check (
  exists (select 1 from especies e where e.id = tabela_arracoamento.especie_id and app.pode(e.empresa_id, 'lotes.editar')));
create policy escrita_apagar on tabela_arracoamento for delete using (
  exists (select 1 from especies e where e.id = tabela_arracoamento.especie_id and app.pode(e.empresa_id, 'lotes.editar')));
grant select, insert, update, delete on tabela_arracoamento to authenticated;

insert into tabela_arracoamento (especie_id, fase, peso_min_g, peso_max_g, proteina_pct, granulo, taxa_inicio_pct, taxa_fim_pct, refeicoes, fonte)
select e.id, v.fase, v.pmin, v.pmax, v.pb, v.granulo, v.ti, v.tf, v.ref, 'Embrapa (Corrêa et al., 2018), Tabela 3'
from especies e
cross join (values
    ('Alevinagem',   0.5,    7.0,   55, 'farelada/pó', 20.0, 10.0, 6),
    ('Recria I',     7.0,   25.0,   40, '1–2 mm',       7.7,  6.4, 4),
    ('Recria II',   25.0,   70.0,   40, '2–4 mm',       5.9,  4.6, 4),
    ('Recria III',  70.0,  188.0,   32, '4–6 mm',       4.2,  2.7, 4),
    ('Recria IV',  188.0,  298.0,   28, '8 mm',         2.6,  2.2, 4),
    ('Engorda I',  298.0,  530.0,   28, '8 mm',         2.1,  1.8, 3),
    ('Engorda II', 530.0, 1000.0,   28, '8 mm',         1.7,  1.2, 2),
    ('Engorda III',1000.0, 2500.0,  28, '10 mm',        1.0,  0.8, 2)
  ) as v(fase, pmin, pmax, pb, granulo, ti, tf, ref)
where e.empresa_id is null and e.nome = 'Tambaqui';

-- Faixa da tabela para um peso: a última faixa vale também acima do teto (peixe maior que 2,5 kg).
create or replace function app.faixa_arracoamento(p_especie uuid, p_peso_g numeric)
returns tabela_arracoamento language sql stable security definer set search_path = public as $$
  select t.* from tabela_arracoamento t
  where t.especie_id = p_especie and p_peso_g is not null
  order by (p_peso_g >= t.peso_min_g and p_peso_g < t.peso_max_g) desc,
           (p_peso_g >= t.peso_max_g) desc, t.peso_max_g desc
  limit 1
$$;

-- Taxa de arraçoamento (% do peso vivo por dia) para um peso médio: interpolada dentro da faixa.
create or replace function app.taxa_arracoamento(p_especie uuid, p_peso_g numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select round(f.taxa_inicio_pct + (f.taxa_fim_pct - f.taxa_inicio_pct)
           * least(greatest((p_peso_g - f.peso_min_g) / nullif(f.peso_max_g - f.peso_min_g, 0), 0), 1), 2)
  from app.faixa_arracoamento(p_especie, p_peso_g) f
  where f.id is not null
$$;

-- ---------------------------------------------------------------------------
-- 6. Lotes: sem data de nascimento, recria comprada ou início de postura. O ciclo conta do povoamento.
--    fase: alevinagem, recria, engorda; encerrado quando sai o último peixe (despesca total ou perda).
-- ---------------------------------------------------------------------------
alter table lotes drop constraint povoamento_apos_nascimento;
alter table lotes drop column data_nascimento;
alter table lotes drop column custo_recria_cents;
alter table lotes drop column inicio_producao;
alter table lotes drop column ciclos_previstos_semanas;
alter table lotes drop constraint lotes_fase_check;
update lotes set fase = case fase when 'cria' then 'alevinagem' when 'producao' then 'engorda'
                                  when 'muda' then 'engorda' when 'descartado' then 'encerrado' else fase end;
alter table lotes alter column fase set default 'alevinagem';
alter table lotes add constraint lotes_fase_check check (fase in ('alevinagem', 'recria', 'engorda', 'encerrado'));
alter table lotes
  add column peso_inicial_g numeric(10,2) check (peso_inicial_g is null or peso_inicial_g > 0),
  add column peso_alvo_g numeric(10,2) check (peso_alvo_g is null or peso_alvo_g > 0),
  add column encerrado_em date,
  add column motivo_encerramento text;
comment on column lotes.custo_aquisicao_cents is 'Custo dos alevinos ou juvenis do povoamento';
comment on column lotes.peso_inicial_g is 'Peso médio no povoamento (g): ponto de partida da biomassa e da curva';
comment on column lotes.peso_alvo_g is 'Peso médio planejado para a despesca (g)';
comment on column lotes.encerrado_em is 'Último dia com peixes do lote (despesca total ou encerramento)';

alter table lote_transferencias drop column inicio_producao_anterior;

alter table lote_alocacoes drop constraint lote_alocacoes_motivo_check;
alter table lote_alocacoes add constraint lote_alocacoes_motivo_check
  check (motivo in ('povoamento', 'transferencia', 'divisao', 'despesca'));

-- checklist: o que vale para a alevinagem/recria e o que vale para a engorda
alter table checklist_itens drop constraint checklist_itens_aplica_em_check;
update checklist_itens set aplica_em = case aplica_em when 'cria_recria' then 'alevinagem_recria'
                                                      when 'producao' then 'engorda' else aplica_em end;
alter table checklist_itens add constraint checklist_itens_aplica_em_check
  check (aplica_em in ('todos', 'alevinagem_recria', 'engorda'));

create or replace function app.checklist_padrao(p_empresa uuid) returns void
language sql security definer set search_path = public as $$
  insert into checklist_itens (empresa_id, nome, tipo, unidade, aplica_em, ordem)
  values (p_empresa, 'Aeradores funcionando', 'sim_nao', null, 'todos', 10),
         (p_empresa, 'Peixes comendo bem', 'sim_nao', null, 'todos', 20),
         (p_empresa, 'Ração consumida sem sobra', 'sim_nao', null, 'todos', 30),
         (p_empresa, 'Sem peixes boquejando na superfície', 'sim_nao', null, 'todos', 40),
         (p_empresa, 'Entrada e saída de água desobstruídas', 'sim_nao', null, 'todos', 50),
         (p_empresa, 'Telas e cercas contra predadores', 'sim_nao', null, 'alevinagem_recria', 60),
         (p_empresa, 'Nitrito', 'numero', 'mg/L', 'engorda', 70)
  on conflict (empresa_id, nome) do nothing
$$;

-- fase que um viveiro dá ao lote, e a ordem das fases
create or replace function app.fase_do_viveiro(p_finalidade text) returns text
language sql immutable as $$
  select case p_finalidade when 'engorda' then 'engorda' when 'recria' then 'recria'
                           when 'alevinagem_recria' then 'recria' else 'alevinagem' end
$$;

create or replace function app.ordem_fase(p_fase text) returns integer
language sql immutable as $$
  select case p_fase when 'alevinagem' then 1 when 'recria' then 2 when 'engorda' then 3 else 4 end
$$;

-- lote planejado: cada etapa só aceita viveiro com a finalidade certa
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
    if v_fin is null or v_fin not in ('alevinagem', 'alevinagem_recria') then
      raise exception 'O viveiro da alevinagem precisa ser um viveiro de alevinagem desta empresa' using errcode = 'check_violation';
    end if;
  end if;
  if new.viveiro_recria_id is not null then
    select finalidade into v_fin from viveiros where id = new.viveiro_recria_id and empresa_id = new.empresa_id;
    if v_fin is null or v_fin not in ('recria', 'alevinagem_recria') then
      raise exception 'O viveiro da recria precisa ser um viveiro de recria desta empresa' using errcode = 'check_violation';
    end if;
  end if;
  if new.viveiro_engorda_id is not null then
    select finalidade into v_fin from viveiros where id = new.viveiro_engorda_id and empresa_id = new.empresa_id;
    if v_fin is null or v_fin <> 'engorda' then
      raise exception 'O viveiro da engorda precisa ser um viveiro de engorda desta empresa' using errcode = 'check_violation';
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

create or replace function app.lote_sem_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from apontamentos_diarios where lote_id = old.id)
     or exists (select 1 from eventos_sanitarios where lote_id = old.id)
     or exists (select 1 from movimentos_estoque where lote_id = old.id) then
    raise exception 'O lote % já tem apontamentos ou movimentos e não pode ser excluído. Encerre o lote.', old.codigo
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Povoar, editar, transferir e encerrar lote
-- ---------------------------------------------------------------------------
drop function if exists public.povoar_lote(uuid, text, uuid, date, date, uuid, integer, bigint, uuid);
create function public.povoar_lote(p_empresa uuid, p_codigo text, p_especie uuid, p_povoamento date, p_viveiro uuid,
                                   p_qtd integer, p_peso_inicial_g numeric, p_custo_cents bigint default 0,
                                   p_fornecedor uuid default null, p_peso_alvo_g numeric default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v_viveiro viveiros%rowtype;
  v_lote uuid;
begin
  select * into v_viveiro from viveiros where id = p_viveiro and empresa_id = p_empresa;
  if not found then
    raise exception 'Viveiro não encontrado nesta empresa' using errcode = 'foreign_key_violation';
  end if;
  if not v_viveiro.ativo then
    raise exception 'O viveiro % está inativo', v_viveiro.nome using errcode = 'check_violation';
  end if;
  if p_qtd is null or p_qtd <= 0 then
    raise exception 'Informe quantos peixes foram povoados' using errcode = 'check_violation';
  end if;
  if p_qtd > v_viveiro.capacidade_peixes then
    raise exception 'O viveiro % comporta % peixes', v_viveiro.nome, v_viveiro.capacidade_peixes using errcode = 'check_violation';
  end if;
  if p_peso_inicial_g is null or p_peso_inicial_g <= 0 then
    raise exception 'Informe o peso médio dos peixes no povoamento (g)' using errcode = 'check_violation';
  end if;
  if p_povoamento is null or p_povoamento > app.hoje(p_empresa) then
    raise exception 'Informe a data do povoamento; data futura não é aceita' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from especies where id = p_especie and (empresa_id is null or empresa_id = p_empresa)) then
    raise exception 'Espécie não encontrada' using errcode = 'foreign_key_violation';
  end if;

  insert into lotes (empresa_id, codigo, especie_id, data_povoamento, qtd_povoada, peso_inicial_g, peso_alvo_g,
                     custo_aquisicao_cents, fornecedor_id, fase)
  values (p_empresa, trim(p_codigo), p_especie, p_povoamento, p_qtd, p_peso_inicial_g, p_peso_alvo_g,
          coalesce(p_custo_cents, 0), p_fornecedor, app.fase_do_viveiro(v_viveiro.finalidade))
  returning id into v_lote;

  begin
    insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo)
    values (p_empresa, v_lote, p_viveiro, p_qtd, daterange(p_povoamento, null), 'povoamento');
  exception when exclusion_violation then
    raise exception 'O viveiro % já tem um lote em %', v_viveiro.nome, to_char(p_povoamento, 'DD/MM/YYYY')
      using errcode = 'check_violation';
  end;
  return v_lote;
end $$;

drop function if exists public.editar_lote(uuid, text, uuid, date, date, integer, bigint, text, uuid, date, text);
create function public.editar_lote(p_lote uuid, p_codigo text, p_especie uuid, p_povoamento date, p_qtd integer,
                                   p_peso_inicial_g numeric, p_custo_cents bigint, p_fase text, p_fornecedor uuid default null,
                                   p_previsao_despesca date default null, p_peso_alvo_g numeric default null,
                                   p_observacoes text default null)
returns void language plpgsql set search_path = public as $$
declare
  v_lote lotes%rowtype;
  v_aloc lote_alocacoes%rowtype;
  v_n int;
  v_cap int;
begin
  select * into v_lote from lotes where id = p_lote;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if nullif(trim(p_codigo), '') is null then raise exception 'Informe o código do lote' using errcode = 'check_violation'; end if;
  if p_qtd is null or p_qtd <= 0 then raise exception 'Informe a quantidade de peixes' using errcode = 'check_violation'; end if;
  if p_peso_inicial_g is not null and p_peso_inicial_g <= 0 then
    raise exception 'O peso médio do povoamento precisa ser maior que zero' using errcode = 'check_violation';
  end if;
  if p_fase is null or p_fase not in ('alevinagem', 'recria', 'engorda') then
    raise exception 'Fase inválida: escolha alevinagem, recria ou engorda (o lote encerra pela despesca)' using errcode = 'check_violation';
  end if;
  if v_lote.fase = 'encerrado' then
    raise exception 'O lote % está encerrado e não pode ser editado', v_lote.codigo using errcode = 'check_violation';
  end if;
  if not exists (select 1 from especies where id = p_especie and (empresa_id is null or empresa_id = v_lote.empresa_id)) then
    raise exception 'Espécie não encontrada' using errcode = 'foreign_key_violation';
  end if;

  if p_povoamento is distinct from v_lote.data_povoamento or p_qtd is distinct from v_lote.qtd_povoada then
    select count(*) into v_n from lote_alocacoes where lote_id = p_lote;
    if v_n <> 1 then
      raise exception 'O lote já foi transferido, dividido ou despescado: data de povoamento e quantidade não podem mais mudar aqui'
        using errcode = 'check_violation';
    end if;
    select * into v_aloc from lote_alocacoes where lote_id = p_lote;
    if exists (select 1 from apontamentos_diarios where lote_id = p_lote and data < p_povoamento)
       or exists (select 1 from biometrias where lote_id = p_lote and data < p_povoamento) then
      raise exception 'Há apontamentos ou biometrias antes da nova data de povoamento' using errcode = 'check_violation';
    end if;
    select capacidade_peixes into v_cap from viveiros where id = v_aloc.viveiro_id;
    if p_qtd > v_cap then
      raise exception 'O viveiro comporta % peixes', v_cap using errcode = 'check_violation';
    end if;
    update lote_alocacoes set qtd_peixes = p_qtd, periodo = daterange(p_povoamento, upper(v_aloc.periodo))
    where id = v_aloc.id;
  end if;

  update lotes set
    codigo = trim(p_codigo), especie_id = p_especie, data_povoamento = p_povoamento, qtd_povoada = p_qtd,
    peso_inicial_g = coalesce(p_peso_inicial_g, peso_inicial_g), peso_alvo_g = p_peso_alvo_g,
    custo_aquisicao_cents = coalesce(p_custo_cents, 0), fase = p_fase, fornecedor_id = p_fornecedor,
    previsao_despesca = p_previsao_despesca, observacoes = nullif(trim(p_observacoes), ''), updated_at = now()
  where id = p_lote;
  if not found then
    raise exception 'Seu usuário não tem permissão para editar lotes' using errcode = 'insufficient_privilege';
  end if;

  if v_aloc.id is not null then
    perform app.recalcular_peixes(p_lote, v_aloc.viveiro_id, least(p_povoamento, v_lote.data_povoamento));
  end if;
end $$;

create or replace function public.transferir_lote(p_lote uuid, p_viveiro_origem uuid, p_data date, p_destinos jsonb,
                                                  p_observacoes text default null)
returns uuid language plpgsql set search_path = public as $$
declare
  v_lote lotes%rowtype;
  v_aloc lote_alocacoes%rowtype;
  v_vivas int;
  v_sem_qtd int;
  v_soma int;
  v_tr uuid;
  v_fase text;
  d record;
  v_viveiro viveiros%rowtype;
begin
  select * into v_lote from lotes where id = p_lote for update;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if v_lote.fase = 'encerrado' then
    raise exception 'Lote encerrado não pode ser transferido' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > app.hoje(v_lote.empresa_id) then
    raise exception 'Informe a data da transferência; data futura não é aceita' using errcode = 'check_violation';
  end if;

  select * into v_aloc from lote_alocacoes
  where lote_id = p_lote and viveiro_id = p_viveiro_origem and periodo @> p_data and upper_inf(periodo)
  for update;
  if not found then
    raise exception 'O lote não está nesse viveiro de origem nessa data' using errcode = 'check_violation';
  end if;
  if lower(v_aloc.periodo) >= p_data then
    raise exception 'A transferência precisa ser depois de %, quando o lote chegou ao viveiro de origem',
      to_char(lower(v_aloc.periodo), 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios where lote_id = p_lote and viveiro_id = p_viveiro_origem and data >= p_data) then
    raise exception 'Há apontamentos no viveiro de origem a partir de %; use uma data depois do último apontamento de lá',
      to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  select v_aloc.qtd_peixes - coalesce(sum(mortes + descartes), 0) into v_vivas
  from apontamentos_diarios
  where lote_id = p_lote and viveiro_id = p_viveiro_origem and data >= lower(v_aloc.periodo) and data < p_data;
  if v_vivas <= 0 then
    raise exception 'Não há peixes vivos no viveiro de origem nessa data' using errcode = 'check_violation';
  end if;

  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) = 0 then
    raise exception 'Escolha ao menos um viveiro de destino' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where nullif(e->>'viveiro', '') is null) then
    raise exception 'Escolha o viveiro de cada destino' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where (e->>'viveiro')::uuid = p_viveiro_origem) then
    raise exception 'O destino precisa ser outro viveiro' using errcode = 'check_violation';
  end if;
  if (select count(*) <> count(distinct e->>'viveiro') from jsonb_array_elements(p_destinos) e) then
    raise exception 'O mesmo viveiro aparece em dois destinos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_array_elements(p_destinos) e where e->>'qtd' is not null and (e->>'qtd')::int <= 0) then
    raise exception 'A quantidade de cada destino precisa ser maior que zero' using errcode = 'check_violation';
  end if;
  select count(*) filter (where e->>'qtd' is null), coalesce(sum((e->>'qtd')::int), 0)
    into v_sem_qtd, v_soma from jsonb_array_elements(p_destinos) e;
  if v_sem_qtd > 1 then
    raise exception 'Informe a quantidade de peixes de cada destino (só um pode ficar com o restante)' using errcode = 'check_violation';
  end if;
  if v_soma > v_vivas or (v_sem_qtd = 1 and v_soma >= v_vivas) then
    raise exception 'O lote tem % peixes vivos no viveiro de origem nessa data', v_vivas using errcode = 'check_violation';
  end if;

  insert into lote_transferencias (empresa_id, lote_id, data, viveiro_origem_id, alocacao_origem_id, peixes_origem,
                                   fase_anterior, observacoes)
  values (v_lote.empresa_id, p_lote, p_data, p_viveiro_origem, v_aloc.id, v_vivas, v_lote.fase, nullif(trim(p_observacoes), ''))
  returning id into v_tr;

  update lote_alocacoes set periodo = daterange(lower(periodo), p_data) where id = v_aloc.id;

  v_fase := v_lote.fase;
  for d in select (e->>'viveiro')::uuid as viveiro, coalesce((e->>'qtd')::int, v_vivas - v_soma) as qtd
           from jsonb_array_elements(p_destinos) e loop
    select * into v_viveiro from viveiros where id = d.viveiro and empresa_id = v_lote.empresa_id;
    if not found then raise exception 'Viveiro de destino não encontrado nesta empresa' using errcode = 'foreign_key_violation'; end if;
    if not v_viveiro.ativo then raise exception 'O viveiro % está inativo', v_viveiro.nome using errcode = 'check_violation'; end if;
    if d.qtd > v_viveiro.capacidade_peixes then
      raise exception 'O viveiro % comporta % peixes', v_viveiro.nome, v_viveiro.capacidade_peixes using errcode = 'check_violation';
    end if;
    begin
      insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id)
      values (v_lote.empresa_id, p_lote, d.viveiro, d.qtd, daterange(p_data, null), 'transferencia', v_tr);
    exception when exclusion_violation then
      raise exception 'O viveiro % já está ocupado por outro lote em %', v_viveiro.nome, to_char(p_data, 'DD/MM/YYYY')
        using errcode = 'check_violation';
    end;
    if app.ordem_fase(app.fase_do_viveiro(v_viveiro.finalidade)) > app.ordem_fase(v_fase) then
      v_fase := app.fase_do_viveiro(v_viveiro.finalidade);
    end if;
  end loop;

  if v_sem_qtd = 0 and v_soma < v_vivas then
    insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo, motivo, transferencia_id)
    values (v_lote.empresa_id, p_lote, p_viveiro_origem, v_vivas - v_soma, daterange(p_data, null), 'divisao', v_tr);
  end if;

  update lotes set fase = v_fase, updated_at = now() where id = p_lote;
  if not found then
    raise exception 'Seu usuário não tem permissão para transferir lotes' using errcode = 'insufficient_privilege';
  end if;
  return v_tr;
end $$;

create or replace function public.desfazer_transferencia(p_transferencia uuid)
returns void language plpgsql set search_path = public as $$
declare
  v_tr lote_transferencias%rowtype;
begin
  select * into v_tr from lote_transferencias where id = p_transferencia for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'no_data_found'; end if;
  perform 1 from lotes where id = v_tr.lote_id for update;

  if exists (select 1 from lote_transferencias where lote_id = v_tr.lote_id and id <> v_tr.id
             and (data > v_tr.data or (data = v_tr.data and created_at > v_tr.created_at))) then
    raise exception 'Só dá para desfazer a última transferência do lote' using errcode = 'check_violation';
  end if;
  if exists (select 1 from lote_alocacoes where transferencia_id = v_tr.id and not upper_inf(periodo)) then
    raise exception 'Os peixes já saíram de um dos viveiros de destino; desfaça a transferência ou a despesca seguinte antes'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios a join lote_alocacoes al
               on al.transferencia_id = v_tr.id and a.lote_id = al.lote_id and a.viveiro_id = al.viveiro_id and al.periodo @> a.data)
     or exists (select 1 from biometrias b join lote_alocacoes al
               on al.transferencia_id = v_tr.id and b.lote_id = al.lote_id and b.viveiro_id = al.viveiro_id and al.periodo @> b.data) then
    raise exception 'Já há apontamentos ou biometrias nos viveiros depois da transferência; apague-os antes de desfazer'
      using errcode = 'check_violation';
  end if;

  delete from lote_alocacoes where transferencia_id = v_tr.id;
  delete from lote_transferencias where id = v_tr.id;
  if not found then
    raise exception 'Seu usuário não tem permissão para desfazer transferências' using errcode = 'insufficient_privilege';
  end if;
  update lote_alocacoes set periodo = daterange(lower(periodo), null) where id = v_tr.alocacao_origem_id;
  update lotes set fase = v_tr.fase_anterior, updated_at = now() where id = v_tr.lote_id;
end $$;

-- Encerrar sem despesca: perda total, venda de alevinos, peixes levados para outra propriedade.
-- O último dia com peixes é p_data; os viveiros ficam livres a partir do dia seguinte.
create or replace function public.encerrar_lote(p_lote uuid, p_data date, p_motivo text)
returns void language plpgsql set search_path = public as $$
declare
  v_lote lotes%rowtype;
begin
  -- confere a permissão antes de travar a linha: sem lotes.editar o "for update" nem enxerga o lote
  select * into v_lote from lotes where id = p_lote;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if not app.pode(v_lote.empresa_id, 'lotes.editar') then
    raise exception 'Seu usuário não tem permissão para encerrar lotes' using errcode = 'insufficient_privilege';
  end if;
  select * into v_lote from lotes where id = p_lote for update;
  if v_lote.fase = 'encerrado' then
    raise exception 'O lote % já está encerrado', v_lote.codigo using errcode = 'check_violation';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Informe o motivo do encerramento' using errcode = 'check_violation';
  end if;
  if p_data is null or p_data > app.hoje(v_lote.empresa_id) then
    raise exception 'Informe a data do encerramento; data futura não é aceita' using errcode = 'check_violation';
  end if;
  if exists (select 1 from lote_alocacoes where lote_id = p_lote and upper_inf(periodo) and lower(periodo) > p_data) then
    raise exception 'O lote entrou num viveiro depois de %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;
  if exists (select 1 from apontamentos_diarios where lote_id = p_lote and data > p_data)
     or exists (select 1 from biometrias where lote_id = p_lote and data > p_data) then
    raise exception 'Há apontamentos ou biometrias depois de %', to_char(p_data, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  update lote_alocacoes set periodo = daterange(lower(periodo), p_data + 1)
  where lote_id = p_lote and upper_inf(periodo);
  update lotes set fase = 'encerrado', encerrado_em = p_data, motivo_encerramento = trim(p_motivo), updated_at = now()
  where id = p_lote;
end $$;

-- Desfaz o encerramento feito por encerrar_lote (a despesca total se desfaz em desfazer_despesca).
create or replace function public.reabrir_lote(p_lote uuid)
returns void language plpgsql set search_path = public as $$
declare
  v_lote lotes%rowtype;
  r record;
begin
  -- confere a permissão antes de travar a linha: sem lotes.editar o "for update" nem enxerga o lote
  select * into v_lote from lotes where id = p_lote;
  if not found then raise exception 'Lote não encontrado' using errcode = 'no_data_found'; end if;
  if not app.pode(v_lote.empresa_id, 'lotes.editar') then
    raise exception 'Seu usuário não tem permissão para reabrir lotes' using errcode = 'insufficient_privilege';
  end if;
  select * into v_lote from lotes where id = p_lote for update;
  if v_lote.fase <> 'encerrado' or v_lote.encerrado_em is null then
    raise exception 'O lote % não está encerrado', v_lote.codigo using errcode = 'check_violation';
  end if;
  if exists (select 1 from despescas where lote_id = p_lote and tipo = 'total') then
    raise exception 'O lote foi encerrado por uma despesca total: desfaça a despesca' using errcode = 'check_violation';
  end if;
  for r in select al.id, v.nome from lote_alocacoes al join viveiros v on v.id = al.viveiro_id
           where al.lote_id = p_lote and upper(al.periodo) = v_lote.encerrado_em + 1
             and not exists (select 1 from lote_transferencias t where t.alocacao_origem_id = al.id) loop
    begin
      update lote_alocacoes set periodo = daterange(lower(periodo), null) where id = r.id;
    exception when exclusion_violation then
      raise exception 'O viveiro % já recebeu outro lote; transfira esse lote antes de reabrir', r.nome using errcode = 'check_violation';
    end;
  end loop;
  update lotes set fase = coalesce((select app.fase_do_viveiro(v.finalidade) from lote_alocacoes al
                                    join viveiros v on v.id = al.viveiro_id
                                    where al.lote_id = p_lote and upper_inf(al.periodo)
                                    order by app.ordem_fase(app.fase_do_viveiro(v.finalidade)) desc limit 1), 'engorda'),
                   encerrado_em = null, motivo_encerramento = null, updated_at = now()
  where id = p_lote;
end $$;

grant execute on function app.faixa_arracoamento(uuid, numeric), app.taxa_arracoamento(uuid, numeric),
  app.fase_do_viveiro(text), app.ordem_fase(text) to authenticated;
revoke all on function public.povoar_lote(uuid, text, uuid, date, uuid, integer, numeric, bigint, uuid, numeric),
  public.editar_lote(uuid, text, uuid, date, integer, numeric, bigint, text, uuid, date, numeric, text),
  public.encerrar_lote(uuid, date, text), public.reabrir_lote(uuid) from public, anon;
grant execute on function public.povoar_lote(uuid, text, uuid, date, uuid, integer, numeric, bigint, uuid, numeric),
  public.editar_lote(uuid, text, uuid, date, integer, numeric, bigint, text, uuid, date, numeric, text),
  public.encerrar_lote(uuid, date, text), public.reabrir_lote(uuid) to authenticated;

select app.travar_referencias();
