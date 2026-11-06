-- Medicamentos e vitaminas: cadastro com dose por kg de ração (ou por m³ de água no banho) e aplicação no
-- apontamento, com carência antes da despesca e baixa do produto no estoque.
\set ON_ERROR_STOP on

create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: era esperado erro contendo "%" em: %', p_trecho, p_sql;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if position(p_trecho in sqlerrm) = 0 then
    raise exception 'FALHOU: erro diferente do esperado. Esperado "%", veio "%"', p_trecho, sqlerrm;
  end if;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

set role authenticated;
set request.jwt.claim.sub = '9ed00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('55666777000188', 'Piscicultura Remédio Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('9ed00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9ed00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a1', 'G1', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'M1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '9ed00000-0000-0000-0000-0000000000a2', 10000, 5)::text, false);

-- Produtos de estoque: antibiótico em kg (converte de g sozinho) e vitamina em frasco (precisa do fator)
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('9ed00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'medicamento', 'Oxitetraciclina 50%', 'kg'),
  ('9ed00000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'medicamento', 'Vitamina C frasco', 'fr');
select movimentar_estoque('9ed00000-0000-0000-0000-0000000000b1', 'entrada', 2, null, current_date, 40000);  -- R$ 200,00 o kg

-- Cadastro
insert into medicamentos (id, empresa_id, nome, tipo, principio_ativo, dose_por_unidade, unidade_dose, via, carencia_dias, produto_id)
values ('9ed00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Oxitetra 50', 'medicamento', 'Oxitetraciclina', 5, 'g', 'racao', 21,
        '9ed00000-0000-0000-0000-0000000000b1');
select pg_temp.ok((select dose_por_unidade_estoque = 1000 from medicamentos where id = '9ed00000-0000-0000-0000-0000000000c1'),
  'g para kg converte sozinho (1 kg = 1000 g)');
select pg_temp.espera_erro(format($$insert into medicamentos (empresa_id, nome, tipo, dose_por_unidade, unidade_dose, produto_id)
  values (%L, 'Vit C', 'vitamina', 1, 'ml', '9ed00000-0000-0000-0000-0000000000b2')$$, current_setting('t.emp')), 'Quantos ml');
insert into medicamentos (id, empresa_id, nome, tipo, dose_por_unidade, unidade_dose, produto_id, dose_por_unidade_estoque)
values ('9ed00000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, 'Vitamina C', 'vitamina', 1, 'ml',
        '9ed00000-0000-0000-0000-0000000000b2', 500);
insert into medicamentos (id, empresa_id, nome, tipo, unidade_dose, via)
values ('9ed00000-0000-0000-0000-0000000000c3', current_setting('t.emp')::uuid, 'Vacina estreptococose', 'vacina', 'un', 'injetavel');
select pg_temp.espera_erro(format($$insert into medicamentos (empresa_id, nome, unidade_dose, via) values (%L, 'W', 'ml', 'ocular')$$,
  current_setting('t.emp')), 'medicamentos_via_check');
select pg_temp.espera_erro(format($$insert into medicamentos (empresa_id, nome, tipo, unidade_dose) values (%L, 'X', 'veneno', 'ml')$$,
  current_setting('t.emp')), 'medicamentos_tipo_check');
select pg_temp.espera_erro(format($$insert into medicamentos (empresa_id, nome, unidade_dose, carencia_dias) values (%L, 'Y', 'ml', -1)$$,
  current_setting('t.emp')), 'medicamentos_carencia_dias_check');

-- Apontamento com medicação na ração: 3 dias, 5 g por kg de ração em 100 kg de ração = 500 g = 0,5 kg do produto
select set_config('t.lanc', registrar_apontamento(current_setting('t.emp')::uuid, null, '9ed00000-0000-0000-0000-0000000000a2',
  current_date - 1, 'manha')::text, false);
select set_config('t.ev', registrar_medicacao(current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a2', current_date - 1,
  '9ed00000-0000-0000-0000-0000000000c1', 3, null, 100, null, 'columnariose', current_setting('t.lanc')::uuid)::text, false);
select pg_temp.ok((select tipo = 'medicacao' and status = 'realizado' and lote_id = current_setting('t.lote')::uuid and dose_por_unidade = 5
  and base_dose = 100 and quantidade = 500 and dias_tratamento = 3 and carencia_dias = 24 and via = 'ração'
  from eventos_sanitarios where id = current_setting('t.ev')::uuid),
  'vira manejo de sanidade com a dose do cadastro e carência de 3 dias de tratamento + 21');
select pg_temp.ok((select quantidade = -0.5 and tipo = 'consumo_lote' and lote_id = current_setting('t.lote')::uuid and custo_unit_cents = 20000
  from movimentos_estoque where origem_tabela = 'eventos_sanitarios' and origem_id = current_setting('t.ev')::uuid),
  'baixa 0,5 kg do estoque para o lote, ao custo médio');
select pg_temp.ok((select saldo = 1.5 from saldos_produtos where produto_id = '9ed00000-0000-0000-0000-0000000000b1'), 'saldo do produto cai');
select pg_temp.ok((select carencia_ate = current_date + 22 from medicacoes where id = current_setting('t.ev')::uuid)
  and app.carencia_ate(current_setting('t.lote')::uuid, current_date) = current_date + 22, 'lote fica em carência até o fim do tratamento + 21 dias');
select pg_temp.ok((select custo_cents = 10000 and baixou_estoque from medicacoes where id = current_setting('t.ev')::uuid),
  'custo da medicação aparece para o lote');

-- Reenvio do app offline não duplica
select pg_temp.ok(registrar_medicacao(current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a2', current_date - 1,
  '9ed00000-0000-0000-0000-0000000000c1', 3, null, 100, null, 'columnariose', current_setting('t.lanc')::uuid) = current_setting('t.ev')::uuid,
  'mesma medicação no mesmo lançamento devolve o mesmo registro');
select pg_temp.ok((select count(*) = 1 from movimentos_estoque where origem_id = current_setting('t.ev')::uuid), 'sem baixa em dobro');

-- Sem saldo suficiente: registra o tratamento (carência vale), mas não baixa
select set_config('t.ev2', registrar_medicacao(current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a2', current_date,
  '9ed00000-0000-0000-0000-0000000000c1', 1, 1, null, 5000)::text, false);
select pg_temp.ok((select not baixou_estoque and custo_cents is null from medicacoes where id = current_setting('t.ev2')::uuid),
  'sem saldo o tratamento fica registrado sem baixa');

-- Vitamina sem carência, 1 ml por kg de ração convertido pelo frasco de 500 ml; sem saldo do frasco: não baixa
select set_config('t.ev3', registrar_medicacao(current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a2', current_date,
  '9ed00000-0000-0000-0000-0000000000c2', 5, null, 200)::text, false);
select pg_temp.ok((select tipo = 'vitamina' and carencia_dias = 0 and quantidade = 200 from eventos_sanitarios where id = current_setting('t.ev3')::uuid),
  'vitamina sem carência não segura a despesca');

-- Validações
select pg_temp.espera_erro(format($$select registrar_medicacao(%L, '9ed00000-0000-0000-0000-0000000000a2', current_date + 1, '9ed00000-0000-0000-0000-0000000000c1')$$,
  current_setting('t.emp')), 'data futura');
select pg_temp.espera_erro(format($$select registrar_medicacao(%L, '9ed00000-0000-0000-0000-0000000000a2', current_date, '9ed00000-0000-0000-0000-0000000000c1', 0)$$,
  current_setting('t.emp')), 'Dias de tratamento');
select pg_temp.espera_erro(format($$select registrar_medicacao(%L, '9ed00000-0000-0000-0000-0000000000a2', current_date - 500, '9ed00000-0000-0000-0000-0000000000c1')$$,
  current_setting('t.emp')), 'Nenhum lote');

-- Excluir o lançamento leva a medicação junto e devolve o produto ao estoque
delete from apontamento_lancamentos where id = current_setting('t.lanc')::uuid;
select pg_temp.ok(not exists (select 1 from eventos_sanitarios where id = current_setting('t.ev')::uuid), 'medicação sai com o lançamento');
select pg_temp.ok((select saldo = 2 from saldos_produtos where produto_id = '9ed00000-0000-0000-0000-0000000000b1'), 'produto volta ao estoque');

-- Cancelar na Sanidade também devolve
select set_config('t.ev4', registrar_medicacao(current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a2', current_date,
  '9ed00000-0000-0000-0000-0000000000c1', 1, null, null, 1000)::text, false);
select pg_temp.ok((select saldo = 1 from saldos_produtos where produto_id = '9ed00000-0000-0000-0000-0000000000b1'), 'baixa de 1.000 g = 1 kg');
update eventos_sanitarios set status = 'cancelado' where id = current_setting('t.ev4')::uuid;
select pg_temp.ok((select saldo = 2 from saldos_produtos where produto_id = '9ed00000-0000-0000-0000-0000000000b1'), 'cancelar devolve ao estoque');

-- Outra empresa não usa o medicamento desta
select set_config('t.emp2', criar_empresa('55666777000269', 'Piscicultura Vizinha Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('9ed00000-0000-0000-0000-0000000000d1', current_setting('t.emp2')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9ed00000-0000-0000-0000-0000000000d2', current_setting('t.emp2')::uuid, '9ed00000-0000-0000-0000-0000000000d1', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.emp2')::uuid, 'V1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '9ed00000-0000-0000-0000-0000000000d2', 5000, 5);
select pg_temp.espera_erro(format($$select registrar_medicacao(%L, '9ed00000-0000-0000-0000-0000000000d2', current_date, '9ed00000-0000-0000-0000-0000000000c1')$$,
  current_setting('t.emp2')), 'Medicamento não encontrado');

-- Apontador sem sanidade.editar lança a medicação junto com o apontamento; visualização não
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes) values
  (current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-000000000002', 'personalizado', array['apontamentos.editar']),
  (current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-000000000003', 'visualizacao', '{}');
set role authenticated;
set request.jwt.claim.sub = '9ed00000-0000-0000-0000-000000000002';
select pg_temp.ok(registrar_medicacao(current_setting('t.emp')::uuid, '9ed00000-0000-0000-0000-0000000000a2', current_date,
  '9ed00000-0000-0000-0000-0000000000c3') is not null, 'apontador registra a vacina');
select pg_temp.espera_erro(format($$insert into medicamentos (empresa_id, nome, unidade_dose) values (%L, 'Z', 'ml')$$, current_setting('t.emp')), 'row-level security');
set request.jwt.claim.sub = '9ed00000-0000-0000-0000-000000000003';
select pg_temp.espera_erro(format($$select registrar_medicacao(%L, '9ed00000-0000-0000-0000-0000000000a2', current_date, '9ed00000-0000-0000-0000-0000000000c3')$$,
  current_setting('t.emp')), 'não tem permissão');

reset role;
\o
\echo 'TESTES DE MEDICAMENTOS PASSARAM'
