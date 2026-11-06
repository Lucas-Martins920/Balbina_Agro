-- App de campo: insumos aplicados no viveiro (corretivo, fertilizante, medicamento), com o viveiro vazio do preparo,
-- baixa do estoque e reenvio da fila offline sem duplicar.
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
set request.jwt.claim.sub = 'ca400000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('52738491000176', 'Piscicultura Campo Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('ca400000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('ca400000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a1', 'V1', 'engorda', 20000),
  ('ca400000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a1', 'V2', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'C1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 30), 'ca400000-0000-0000-0000-0000000000a2', 8000, 20)::text, false);

-- Corretivo: tipo próprio de produto, com 500 kg de calcário a R$ 0,50 o kg
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('ca400000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corretivo', 'Calcário dolomítico', 'kg'),
  ('ca400000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'corretivo', 'Superfosfato simples', 'kg');
select movimentar_estoque('ca400000-0000-0000-0000-0000000000b1', 'entrada', 500, null, current_date - 20, 25000);
select pg_temp.espera_erro(format($$insert into produtos (empresa_id, tipo, nome, unidade) values (%L, 'adubo', 'X', 'kg')$$,
  current_setting('t.emp')), 'produtos_tipo_check');

-- Calagem no viveiro vazio (preparo antes do povoamento): sem lote, baixa do estoque
select set_config('t.cal', registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a3', current_date - 10,
  'calagem', 'ca400000-0000-0000-0000-0000000000b1', 200, p_observacoes => 'preparo', p_client_id => 'ca400000-0000-0000-0000-0000000000f1')::text, false);
select pg_temp.ok((select lote_id is null and tipo = 'calagem' and status = 'realizado' and quantidade = 200 and carencia_dias = 0
  and dose = 'Calcário dolomítico 200 kg' and viveiro_id = 'ca400000-0000-0000-0000-0000000000a3'
  from eventos_sanitarios where id = current_setting('t.cal')::uuid), 'calagem do preparo fica no viveiro, sem lote');
select pg_temp.ok((select quantidade = -200 and tipo = 'consumo_lote' and lote_id is null and custo_unit_cents = 50
  and viveiro_id = 'ca400000-0000-0000-0000-0000000000a3'
  from movimentos_estoque where origem_tabela = 'eventos_sanitarios' and origem_id = current_setting('t.cal')::uuid),
  'baixa 200 kg ao custo médio, ligada ao viveiro');
select pg_temp.ok((select saldo = 300 from saldos_produtos where produto_id = 'ca400000-0000-0000-0000-0000000000b1'), 'saldo cai para 300 kg');

-- Reenvio da fila não duplica
select pg_temp.ok(registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a3', current_date - 10,
  'calagem', 'ca400000-0000-0000-0000-0000000000b1', 200, p_client_id => 'ca400000-0000-0000-0000-0000000000f1') = current_setting('t.cal')::uuid,
  'mesmo client_id devolve o mesmo manejo');
select pg_temp.ok((select count(*) = 1 from movimentos_estoque where origem_id = current_setting('t.cal')::uuid), 'sem baixa em dobro');

-- Com peixe no viveiro, o manejo vai para o lote
select set_config('t.cal2', registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a2', current_date,
  'calagem', 'ca400000-0000-0000-0000-0000000000b1', 50.5)::text, false);
select pg_temp.ok((select lote_id = current_setting('t.lote')::uuid and dose = 'Calcário dolomítico 50,5 kg'
  from eventos_sanitarios where id = current_setting('t.cal2')::uuid), 'calagem com peixe fica no lote, quantidade com vírgula');
select pg_temp.ok((select lote_id = current_setting('t.lote')::uuid from movimentos_estoque where origem_id = current_setting('t.cal2')::uuid),
  'custo do corretivo vai para o lote');

-- Sem saldo: erro; o celular pode mandar sem baixar
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date, 'adubacao',
  'ca400000-0000-0000-0000-0000000000b2', 30)$$, current_setting('t.emp')), 'Saldo insuficiente de Superfosfato simples');
select set_config('t.adu', registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a2', current_date,
  'adubacao', 'ca400000-0000-0000-0000-0000000000b2', 30, p_baixar_estoque => false)::text, false);
select pg_temp.ok((select tipo = 'adubacao' from eventos_sanitarios where id = current_setting('t.adu')::uuid)
  and not exists (select 1 from movimentos_estoque where origem_id = current_setting('t.adu')::uuid), 'adubação sem baixa fica registrada');

-- Limpeza sem produto
select pg_temp.ok(registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a3', current_date, 'limpeza',
  p_observacoes => 'roçada do talude') is not null, 'manejo sem produto');

-- Cancelar devolve ao estoque (mesma regra da Sanidade)
update eventos_sanitarios set status = 'cancelado' where id = current_setting('t.cal2')::uuid;
select pg_temp.ok((select saldo = 300 from saldos_produtos where produto_id = 'ca400000-0000-0000-0000-0000000000b1'), 'cancelar devolve o calcário');

-- Medicamento pelo campo: regra de registrar_medicacao, com client_id; dose fracionada não arredonda
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('ca400000-0000-0000-0000-0000000000b3', current_setting('t.emp')::uuid, 'medicamento', 'Sal grosso', 'kg');
insert into medicamentos (id, empresa_id, nome, tipo, dose_por_unidade, unidade_dose, via, carencia_dias, produto_id)
values ('ca400000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Banho de sal', 'medicamento', 0.5, 'kg', 'banho', 0,
        'ca400000-0000-0000-0000-0000000000b3');
select set_config('t.med', registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a2', current_date,
  'banho', p_medicamento => 'ca400000-0000-0000-0000-0000000000c1', p_base => 40,
  p_client_id => 'ca400000-0000-0000-0000-0000000000f2')::text, false);
select pg_temp.ok((select medicamento_id = 'ca400000-0000-0000-0000-0000000000c1' and client_id = 'ca400000-0000-0000-0000-0000000000f2'
  and quantidade = 20 and dose like 'Banho de sal, 0,5 kg/m³%' from eventos_sanitarios where id = current_setting('t.med')::uuid),
  'medicação do campo guarda o envio e a dose de 0,5 sem arredondar');
select pg_temp.ok(registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a2', current_date,
  'banho', p_medicamento => 'ca400000-0000-0000-0000-0000000000c1', p_base => 40,
  p_client_id => 'ca400000-0000-0000-0000-0000000000f2') = current_setting('t.med')::uuid, 'reenvio da medicação não duplica');

-- Validações
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a3', current_date, 'banho')$$,
  current_setting('t.emp')), 'banho é aplicado nos peixes');
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date, 'pesca')$$,
  current_setting('t.emp')), 'Escolha o manejo');
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date, 'outro', null, 3)$$,
  current_setting('t.emp')), 'Escolha o produto');
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date, 'calagem',
  'ca400000-0000-0000-0000-0000000000b1')$$, current_setting('t.emp')), 'Informe quanto de Calcário');
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date, 'outro',
  (select id from produtos where empresa_id = %L and tipo = 'peixe' limit 1), 10)$$, current_setting('t.emp'), current_setting('t.emp')),
  'Produto inválido');
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date + 1, 'limpeza')$$,
  current_setting('t.emp')), 'data futura');
select pg_temp.espera_erro(format($$insert into eventos_sanitarios (empresa_id, viveiro_id, data, tipo, status)
  values (%L, 'ca400000-0000-0000-0000-0000000000a3', current_date, 'medicacao', 'realizado')$$, current_setting('t.emp')),
  'eventos_sanitarios_lote_ou_preparo');

-- Outra empresa não lança no viveiro desta
select set_config('t.emp2', criar_empresa('52738491000257', 'Piscicultura Vizinha Ltda')::text, false);
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a2', current_date, 'limpeza')$$,
  current_setting('t.emp2')), 'Viveiro não encontrado');

-- Apontador lança; visualização não
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes) values
  (current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-000000000002', 'personalizado', array['apontamentos.editar']),
  (current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-000000000003', 'visualizacao', '{}');
set role authenticated;
set request.jwt.claim.sub = 'ca400000-0000-0000-0000-000000000002';
select pg_temp.ok(registrar_insumo_viveiro(current_setting('t.emp')::uuid, 'ca400000-0000-0000-0000-0000000000a3', current_date, 'limpeza')
  is not null, 'apontador lança o manejo do viveiro');
set request.jwt.claim.sub = 'ca400000-0000-0000-0000-000000000003';
select pg_temp.espera_erro(format($$select registrar_insumo_viveiro(%L, 'ca400000-0000-0000-0000-0000000000a3', current_date, 'limpeza')$$,
  current_setting('t.emp')), 'não tem permissão');

reset role;
\o
\echo 'TESTES DE INSUMOS DO CAMPO PASSARAM'
