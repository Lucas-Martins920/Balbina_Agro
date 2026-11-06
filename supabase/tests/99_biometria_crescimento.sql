-- Biometria, peso estimado pela curva do tambaqui, ração sugerida pela tabela de arraçoamento, alertas da água e
-- do crescimento, e encerramento do lote sem despesca (perda total) com reabertura.
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
set request.jwt.claim.sub = 'b10a0000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('41222333000155', 'Piscicultura Biometria Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('b10a0000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes, area_m2, volume_m3)
values ('b10a0000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000a1', 'V1', 'engorda',
        20000, 5000, 7500);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'B1', (select id from especies where nome = 'Tambaqui' and empresa_id is null),
  current_date - 70, 'b10a0000-0000-0000-0000-0000000000a2', 10000, 30)::text, false);

-- Sem biometria, o peso parte do povoamento e anda pela curva do tambaqui
select pg_temp.ok(app.peso_estimado(current_setting('t.lote')::uuid, current_date - 70) = 30, 'no povoamento vale o peso dos juvenis');
select pg_temp.ok(app.peso_estimado(current_setting('t.lote')::uuid, current_date - 56) between 50 and 60,
  'duas semanas depois o peso segue a curva (30 g viram ~55 g)');

-- Validações da biometria
select pg_temp.espera_erro(format($$select registrar_biometria(%L, 'b10a0000-0000-0000-0000-0000000000a2', current_date + 1, 50, 7500)$$,
  current_setting('t.emp')), 'data futura');
select pg_temp.espera_erro(format($$select registrar_biometria(%L, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 40, 0, 7500)$$,
  current_setting('t.emp')), 'quantos peixes');
select pg_temp.espera_erro(format($$select registrar_biometria(%L, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 40, 50)$$,
  current_setting('t.emp')), 'peso total da amostra ou o peso médio');
select pg_temp.espera_erro(format($$select registrar_biometria(%L, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 80, 50, 7500)$$,
  current_setting('t.emp')), 'Nenhum lote estava neste viveiro');

-- Biometria pelo app: 50 peixes pesando 7,5 kg
select set_config('t.b1', registrar_biometria(current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 40,
  50, 7500, null, 18.5, 80, 'amostra na margem', 'b10a0000-0000-0000-0000-0000000000c1', null, 'app')::text, false);
select pg_temp.ok((select peso_medio_g = 150 and peixes_amostrados = 50 and comprimento_medio_cm = 18.5 and uniformidade_pct = 80
  and origem = 'app' and lote_id = current_setting('t.lote')::uuid from biometrias where id = current_setting('t.b1')::uuid),
  'peso médio = peso total ÷ peixes da amostra');
select pg_temp.ok(registrar_biometria(current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 40,
  50, 7500, null, null, null, null, 'b10a0000-0000-0000-0000-0000000000c1') = current_setting('t.b1')::uuid,
  'reenvio do app offline devolve a mesma biometria');
select pg_temp.espera_erro(format($$select registrar_biometria(%L, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 40, 30, null, 160)$$,
  current_setting('t.emp')), 'Já existe uma biometria');
select pg_temp.ok((select count(*) = 1 from biometrias where lote_id = current_setting('t.lote')::uuid), 'uma biometria por viveiro e dia');

-- Peso estimado parte da última biometria
select pg_temp.ok(app.peso_estimado(current_setting('t.lote')::uuid, current_date - 40) = 150, 'no dia da biometria vale o peso medido');
select pg_temp.ok(app.peso_estimado(current_setting('t.lote')::uuid, current_date - 1) between 380 and 430,
  '39 dias depois a curva leva os 150 g a ~400 g');
select pg_temp.ok((select peso_medio_g = app.peso_estimado(lote_id, current_date) and biomassa_kg = round(peixes_atuais * peso_medio_g / 1000.0, 1)
  and peixes_m2 = 2 and ultima_biometria = current_date - 40 and dias_cultivo = 70
  from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid), 'viveiro mostra peso, biomassa, densidade e a última biometria');

-- Ração sugerida: biomassa × taxa da faixa de peso na tabela de arraçoamento
create temp table s1 as select * from racao_sugerida('b10a0000-0000-0000-0000-0000000000a2', current_date - 1);
select pg_temp.ok((select peixes = 10000 and peso_medio_g = app.peso_estimado(lote_id, current_date - 1)
  and biomassa_kg = round(10000 * peso_medio_g / 1000.0, 1) from s1), 'ração sugerida parte dos peixes vivos e do peso estimado');
select pg_temp.ok((select fase_tabela = 'Engorda I' and refeicoes = 3 and proteina_pct = 28 and taxa_pct between 1.8 and 2.1
  and racao_kg = round(biomassa_kg * taxa_pct / 100.0, 1) and racao_por_refeicao_kg = round(racao_kg / 3, 1) from s1),
  'peixe de ~400 g come ~2% da biomassa em 3 tratos, ração de 28% de proteína');
select pg_temp.ok((select alerta like 'Biometria atrasada%' from s1), 'biometria com mais de 30 dias avisa que o peso é estimado');

-- Biometria nova abaixo da curva corrige o peso e acende o alerta de crescimento
select registrar_biometria(current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 1, 40, null, 200);
create temp table s2 as select * from racao_sugerida('b10a0000-0000-0000-0000-0000000000a2', current_date - 1);
select pg_temp.ok((select peso_medio_g = 200 and fase_tabela = 'Recria IV' and alerta is null and ultima_biometria = current_date - 1 from s2),
  'biometria em dia: ração da faixa do peso medido, sem alerta');
select pg_temp.ok((select nivel = 'critico' and detalhe like '%200 g, 65% do esperado (309 g)%' from alertas
  where empresa_id = current_setting('t.emp')::uuid and tipo = 'crescimento'), 'lote 35% abaixo da curva vira alerta crítico');

-- Água: oxigênio baixo suspende a ração e vira alerta com número em português
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'b10a0000-0000-0000-0000-0000000000a2', current_date, 'manha', 20, 0, 50,
  '{"oxigenio_mg_l": 2.6, "temperatura_c": 31.5, "ph": 6.8}');
select pg_temp.ok((select oxigenio_min_mg_l = 2.6 and alerta like 'Oxigênio abaixo de 3 mg/L%' and peixes = 10000
  from racao_sugerida('b10a0000-0000-0000-0000-0000000000a2', current_date)), 'com oxigênio abaixo de 3 mg/L a sugestão é suspender a ração');
select pg_temp.ok((select nivel = 'critico' and detalhe like '2,6 mg/L em %' from alertas
  where empresa_id = current_setting('t.emp')::uuid and tipo = 'oxigenio'), 'alerta de oxigênio crítico, com vírgula decimal');

-- Encerrar sem despesca (perda total) e reabrir
select pg_temp.espera_erro(format($$select encerrar_lote(%L, current_date + 1, 'Perda total')$$, current_setting('t.lote')), 'data futura');
select pg_temp.espera_erro(format($$select encerrar_lote(%L, current_date, '  ')$$, current_setting('t.lote')), 'motivo do encerramento');
select pg_temp.espera_erro(format($$select encerrar_lote(%L, current_date - 2, 'Perda total')$$, current_setting('t.lote')),
  'apontamentos ou biometrias depois');
select encerrar_lote(current_setting('t.lote')::uuid, current_date, ' Perda total por falta de oxigênio ');
select pg_temp.ok((select fase = 'encerrado' and encerrado_em = current_date and motivo_encerramento = 'Perda total por falta de oxigênio'
  from lotes where id = current_setting('t.lote')::uuid), 'lote encerrado com data e motivo');
select pg_temp.ok((select upper(periodo) = current_date + 1 from lote_alocacoes where lote_id = current_setting('t.lote')::uuid),
  'o viveiro fica livre a partir do dia seguinte');
select pg_temp.espera_erro(format($$select encerrar_lote(%L, current_date, 'De novo')$$, current_setting('t.lote')), 'já está encerrado');
select reabrir_lote(current_setting('t.lote')::uuid);
select pg_temp.ok((select fase = 'engorda' and encerrado_em is null and motivo_encerramento is null from lotes where id = current_setting('t.lote')::uuid)
  and (select upper_inf(periodo) from lote_alocacoes where lote_id = current_setting('t.lote')::uuid), 'reabrir devolve o lote ao viveiro');
select pg_temp.espera_erro(format($$select reabrir_lote(%L)$$, current_setting('t.lote')), 'não está encerrado');

-- Permissões: o tratador pesa, mas não encerra lote; quem só visualiza não pesa
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values
  (current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000f1', 'tratador'),
  (current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000f2', 'visualizacao');
set role authenticated;
set request.jwt.claim.sub = 'b10a0000-0000-0000-0000-0000000000f1';
select pg_temp.ok(registrar_biometria(current_setting('t.emp')::uuid, 'b10a0000-0000-0000-0000-0000000000a2', current_date, 30, 6300) is not null,
  'tratador lança a biometria');
select pg_temp.espera_erro(format($$select encerrar_lote(%L, current_date, 'Perda')$$, current_setting('t.lote')), 'não tem permissão para encerrar');
set request.jwt.claim.sub = 'b10a0000-0000-0000-0000-0000000000f2';
select pg_temp.ok((select count(*) = 3 from biometrias where lote_id = current_setting('t.lote')::uuid), 'visualização enxerga as biometrias');
select pg_temp.espera_erro(format($$select registrar_biometria(%L, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 2, 30, 6000)$$,
  current_setting('t.emp')), 'não tem permissão para lançar biometria');

-- Outra piscicultura não vê nem grava
set request.jwt.claim.sub = 'b10a0000-0000-0000-0000-000000000002';
select set_config('t.emp2', criar_empresa('41222333000236', 'Outra Piscicultura Ltda')::text, false);
select pg_temp.ok((select count(*) = 0 from biometrias) and not exists (select 1 from racao_sugerida('b10a0000-0000-0000-0000-0000000000a2', current_date)),
  'biometria e ração sugerida isoladas por empresa');
select pg_temp.espera_erro(format($$insert into biometrias (empresa_id, lote_id, viveiro_id, data, peixes_amostrados, peso_medio_g)
  values (%L, %L, 'b10a0000-0000-0000-0000-0000000000a2', current_date - 3, 10, 100)$$, current_setting('t.emp'), current_setting('t.lote')),
  'row-level security');

reset role;
\o
\echo 'TESTES DE BIOMETRIA E CRESCIMENTO PASSARAM'
