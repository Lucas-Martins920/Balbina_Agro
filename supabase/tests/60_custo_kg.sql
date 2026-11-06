-- Marco 4: custo do kg por lote.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

set role authenticated;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select set_config('t.emp', criar_empresa('44555666000177', 'Piscicultura G Ltda')::text, false);
select set_config('t.inteiro', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and sem_classificacao), false);
select set_config('t.cat', (select jsonb_object_agg(nome, id)::text from categorias where empresa_id = current_setting('t.emp')::uuid), false);
create temp table cat as select key as nome, value::uuid as id from jsonb_each_text(current_setting('t.cat')::jsonb);
grant select on cat to authenticated;

select pg_temp.ok((select componente from categorias_custo where id = (select id from cat where nome = 'Ração extrusada comprada')) = 'racao', 'subcategoria herda o componente de custo do pai');
select pg_temp.ok((select componente from categorias_custo where id = (select id from cat where nome = 'Alevinos')) = 'alevinos', 'compra de alevinos entra no custo como alevinos');
select pg_temp.ok(not exists (select 1 from categorias_custo where id = (select id from cat where nome = 'Contabilidade')), 'despesa administrativa não é custo de produção');

-- Espécie sem curva: o peso fica no da última biometria, e as contas dão números redondos
insert into especies (id, empresa_id, nome) values ('90000000-0000-0000-0000-0000000000e1', current_setting('t.emp')::uuid, 'Tambaqui sem curva');
insert into setores (id, empresa_id, nome) values ('90000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'N1');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('90000000-0000-0000-0000-00000000000a', current_setting('t.emp')::uuid, '90000000-0000-0000-0000-000000000001', 'VA', 'engorda', 20000),
  ('90000000-0000-0000-0000-00000000000b', current_setting('t.emp')::uuid, '90000000-0000-0000-0000-000000000001', 'VB', 'recria', 20000);
select set_config('t.la', povoar_lote(current_setting('t.emp')::uuid, 'A', '90000000-0000-0000-0000-0000000000e1',
  '2026-04-01', '90000000-0000-0000-0000-00000000000a', 10000, 5, 300000)::text, false);
select set_config('t.lb', povoar_lote(current_setting('t.emp')::uuid, 'B', '90000000-0000-0000-0000-0000000000e1',
  '2026-04-10', '90000000-0000-0000-0000-00000000000b', 5000, 5)::text, false);

-- Biometrias: A sai de 400 g para 600 g em setembro; B de 100 g para 200 g
select registrar_biometria(current_setting('t.emp')::uuid, '90000000-0000-0000-0000-00000000000a', '2026-08-31', 50, 20000);
select registrar_biometria(current_setting('t.emp')::uuid, '90000000-0000-0000-0000-00000000000a', '2026-09-30', 50, null, 600);
select registrar_biometria(current_setting('t.emp')::uuid, '90000000-0000-0000-0000-00000000000b', '2026-08-31', 40, 4000);
select registrar_biometria(current_setting('t.emp')::uuid, '90000000-0000-0000-0000-00000000000b', '2026-09-30', 40, 8000);

-- Setembro: A come 100 kg/dia; B (recria) come 30 kg/dia
select count(registrar_apontamento(current_setting('t.emp')::uuid, null, '90000000-0000-0000-0000-00000000000a', d::date, 'manha', 0, 0, 100))
from generate_series('2026-09-01'::date, '2026-09-30', '1 day') d;
select count(registrar_apontamento(current_setting('t.emp')::uuid, null, '90000000-0000-0000-0000-00000000000b', d::date, 'manha', 0, 0, 30))
from generate_series('2026-09-01'::date, '2026-09-30', '1 day') d;

-- Contas por competência
create function pg_temp.conta(p_cat text, p_valor bigint, p_cc uuid, p_comp date default '2026-09-01') returns void language sql as $$
  select null from (select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', p_cat, '2026-09-20', p_comp, p_valor,
    jsonb_build_array(jsonb_build_object('categoria_id', (select id from cat where nome = p_cat), 'centro_custo_id', p_cc, 'valor_cents', p_valor)))) x
$$;
select pg_temp.conta('Ração extrusada comprada', 780000, null);
select pg_temp.conta('Medicamentos', 50000, (select centro_custo_id from lotes where id = current_setting('t.la')::uuid));
select pg_temp.conta('Energia elétrica', 137500, (select centro_custo_id from setores where id = '90000000-0000-0000-0000-000000000001'));
select pg_temp.conta('Contabilidade', 100000, null);
select pg_temp.conta('Mão de obra da produção', 55000, null);
select pg_temp.conta('Alevinos', 200000, (select centro_custo_id from lotes where id = current_setting('t.la')::uuid), '2026-04-01');

-- Abril: os alevinos entram no mês do povoamento (custo do lote + conta lançada no centro de custo dele)
select pg_temp.ok(calcular_custos_mes(current_setting('t.emp')::uuid, '2026-04-20') = 2, 'abril: os dois lotes povoados no mês');
select pg_temp.ok((select alevinos_cents = 500000 and biomassa_inicio_kg = 50 from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-04-01'),
  'alevinos do lote no mês do povoamento; biomassa inicial = peixes × peso dos alevinos');

select pg_temp.ok(calcular_custos_mes(current_setting('t.emp')::uuid, '2026-09-15') = 2, 'custo calculado para os dois lotes do mês');
select pg_temp.ok((select racao_cents from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01') = 600000, 'ração sem centro de custo rateada por kg consumido');
select pg_temp.ok((select racao_cents from custos_lote_mensal where lote_id = current_setting('t.lb')::uuid and mes = '2026-09-01') = 180000, 'lote em recria também recebe a ração que comeu');
select pg_temp.ok((select sanidade_cents from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01') = 50000, 'medicamento no centro de custo do lote é direto');
-- Rateio pela biomassa de cada dia: A tem 4.000 kg (6.000 no dia 30) e B 500 kg (1.000 no dia 30),
-- 122.000 contra 15.500 kg·dia, embora B tenha metade dos peixes de A
select pg_temp.ok((select energia_cents from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01') = 122000, 'energia do setor dividida pela biomassa de cada lote');
select pg_temp.ok((select energia_cents from custos_lote_mensal where lote_id = current_setting('t.lb')::uuid and mes = '2026-09-01') = 15500, 'recria com pouca biomassa recebe pouco do rateio, mesmo com muitos peixes');
select pg_temp.ok((select indiretos_rateados_cents from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01') = 48800, 'mão de obra sem centro de custo vira indireto pela biomassa');
select pg_temp.ok((select alevinos_cents from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01') = 0, 'alevinos não se repetem nos meses seguintes');
select pg_temp.ok((select custo_total_cents from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01') = 600000 + 50000 + 122000 + 48800,
  'despesa administrativa fica fora do custo do kg');
select pg_temp.ok((select biomassa_inicio_kg = 4000 and biomassa_fim_kg = 6000 and ganho_kg = 2000 from custos_lote_mensal
                   where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01'), 'ganho de biomassa do mês = fim - início + despescado');
select pg_temp.ok((select custo_kg_cents = round(820800 / 2000.0) and racao_por_kg_cents = 300 and conversao_alimentar = 1.50 from custo_kg_lote
                   where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01'), 'custo do kg produzido, ração por kg e conversão alimentar');
select pg_temp.ok((select custo_kg_cents = round((180000 + 15500 + 6200) / 500.0) and conversao_alimentar = 1.80 from custo_kg_lote
                   where lote_id = current_setting('t.lb')::uuid and mes = '2026-09-01'), 'custo do kg da recria');
select pg_temp.ok((select custo_acumulado_cents = 1320800 and custo_kg_ciclo_cents = round(1320800 / 6000.0) from custo_kg_lote
                   where lote_id = current_setting('t.la')::uuid and mes = '2026-09-01'), 'custo do ciclo acumula desde o povoamento');
select pg_temp.ok(calcular_custos_mes(current_setting('t.emp')::uuid, '2026-09-01') = 2
  and (select count(*) from custos_lote_mensal where empresa_id = current_setting('t.emp')::uuid and mes = '2026-09-01') = 2, 'recalcular o mês substitui sem duplicar');

-- Outubro: A come até o dia 15 e sai na despesca total (6.600 kg, 9.990 peixes contados)
select count(registrar_apontamento(current_setting('t.emp')::uuid, null, '90000000-0000-0000-0000-00000000000a', d::date, 'manha', 0, 0, 100))
from generate_series('2026-10-01'::date, '2026-10-15', '1 day') d;
select pg_temp.conta('Ração extrusada comprada', 300000, null, '2026-10-01');
select registrar_despesca(current_setting('t.emp')::uuid, '90000000-0000-0000-0000-00000000000a', '2026-10-15', 'total', 6600, 9990);
select pg_temp.ok(calcular_custos_mes(current_setting('t.emp')::uuid, '2026-10-01') = 1, 'outubro: só o lote que comeu e foi despescado');
select pg_temp.ok((select kg_despescados = 6600 and biomassa_fim_kg = 0 and ganho_kg = 600 and custo_total_cents = 300000
                   from custos_lote_mensal where lote_id = current_setting('t.la')::uuid and mes = '2026-10-01'), 'despesca entra no ganho do mês');
select pg_temp.ok((select custo_kg_cents = 500 and despescado_acumulado_kg = 6600 and custo_kg_ciclo_cents = round(1620800 / 6600.0)
                   from custo_kg_lote where lote_id = current_setting('t.la')::uuid and mes = '2026-10-01'), 'custo do kg do ciclo sobre o que foi despescado');

-- Margem por cliente: 6.000 kg vendidos a R$ 9,00
insert into contatos (id, empresa_id, tipos, nome) values ('90000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Atacado G');
select faturar_pedido(criar_pedido(current_setting('t.emp')::uuid, '90000000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', (select id from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe inteiro (kg)'),
    'quantidade', 6000, 'preco_unit_cents', 900)), '2026-10-20'));
select pg_temp.ok((select preco_kg_cents from custo_kg_lote where lote_id = current_setting('t.la')::uuid and mes = '2026-10-01') = 900, 'preço médio do kg vendido no mês');
select pg_temp.ok((select kg = 6000 and preco_kg_cents = 900 and custo_kg_cents = 500 and margem_cents = 6000 * (900 - 500)
                   from margem_cliente_mes where cliente_id = '90000000-0000-0000-0000-0000000000c1'), 'margem do cliente sobre o custo do kg do mês');
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.inteiro')::uuid) = 600, 'sobram 600 kg de peixe inteiro no estoque');

-- Isolamento
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from custo_kg_lote where empresa_id = current_setting('t.emp')::uuid) = 0, 'custo do kg isolado por empresa');
select pg_temp.ok((select count(*) from margem_cliente_mes where empresa_id = current_setting('t.emp')::uuid) = 0, 'margem isolada por empresa');

reset role;
\o
\echo 'TESTES DO MARCO 4 PASSARAM'
