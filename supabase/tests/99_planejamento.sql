-- Planejamento de lotes: vazio sanitário mínimo, viveiros coerentes com a fase, isolamento entre empresas e permissões.
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
set request.jwt.claim.sub = '99a99a99-0000-4000-8000-00000000a001';
select set_config('t.emp', criar_empresa('99333444000177', 'Piscicultura Planejamento Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('99a00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('99a00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-000000000001', 'Alevinagem', 'alevinagem', 10000),
  ('99a00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-000000000001', 'Recria', 'recria', 10000),
  ('99a00000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-000000000001', 'Engorda 1', 'engorda', 10000);

-- Parâmetros: sem prazo pré-preenchido (cada piscicultura informa o seu manejo); o vazio sanitário vai de 0 a 120 dias
select pg_temp.espera_erro(format($$insert into planejamento_parametros (empresa_id) values (%L)$$, current_setting('t.emp')), 'semanas_alevinagem');
insert into planejamento_parametros (empresa_id, semanas_alevinagem, semanas_recria, semanas_cultivo,
  vazio_alevinagem_dias, vazio_recria_dias, vazio_engorda_dias, intervalo_lotes_semanas)
  values (current_setting('t.emp')::uuid, 4, 12, 48, 15, 15, 20, 8);
select pg_temp.ok((select semanas_alevinagem = 4 and semanas_recria = 12 and semanas_cultivo = 48 and intervalo_lotes_semanas = 8
  and peso_povoamento_g = 1 and mortalidade_recria_pct = 15 and mortalidade_engorda_pct = 5
  from planejamento_parametros where empresa_id = current_setting('t.emp')::uuid), 'parâmetros guardam o manejo informado pela piscicultura');
update planejamento_parametros set meta_peixes = 20000, peso_povoamento_g = 30 where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok(true, 'meta de peixes e peso do juvenil no povoamento são guardados');
select pg_temp.espera_erro(format($$update planejamento_parametros set meta_peixes = 0 where empresa_id = %L$$,
  current_setting('t.emp')), 'meta_peixes');
select pg_temp.espera_erro(format($$update planejamento_parametros set peso_povoamento_g = 0 where empresa_id = %L$$,
  current_setting('t.emp')), 'peso_povoamento_g');
select pg_temp.espera_erro(format($$update planejamento_parametros set vazio_alevinagem_dias = 121 where empresa_id = %L$$,
  current_setting('t.emp')), 'vazio_alevinagem_dias');
select pg_temp.espera_erro(format($$update planejamento_parametros set vazio_engorda_dias = -1 where empresa_id = %L$$,
  current_setting('t.emp')), 'vazio_engorda_dias');
update planejamento_parametros set vazio_alevinagem_dias = 0, semanas_alevinagem = 0, intervalo_lotes_semanas = 9
where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok(true, 'povoar direto na recria, sem alevinagem nem vazio, é aceito');
select pg_temp.espera_erro(format($$update planejamento_parametros set semanas_cultivo = 12 where empresa_id = %L$$,
  current_setting('t.emp')), 'engorda_depois_da_recria');

-- Lote planejado: viveiro precisa servir para a fase
insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes, viveiro_alevinagem_id, viveiro_recria_id, viveiro_engorda_id)
values (current_setting('t.emp')::uuid, ' P-01 ', current_date + 30, 9000,
  '99a00000-0000-0000-0000-0000000000a1', '99a00000-0000-0000-0000-0000000000a2', '99a00000-0000-0000-0000-0000000000a3');
select pg_temp.ok((select codigo = 'P-01' from lotes_planejados where empresa_id = current_setting('t.emp')::uuid), 'código sem espaços');
select pg_temp.espera_erro(format($$insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes, viveiro_alevinagem_id)
  values (%L, 'P-02', current_date, 100, '99a00000-0000-0000-0000-0000000000a3')$$, current_setting('t.emp')), 'viveiro de alevinagem');
select pg_temp.espera_erro(format($$insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes, viveiro_recria_id)
  values (%L, 'P-02', current_date, 100, '99a00000-0000-0000-0000-0000000000a3')$$, current_setting('t.emp')), 'viveiro de recria');
select pg_temp.espera_erro(format($$insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes, viveiro_engorda_id)
  values (%L, 'P-02', current_date, 100, '99a00000-0000-0000-0000-0000000000a1')$$, current_setting('t.emp')), 'viveiro de engorda');

-- Custos futuros: por kg só na engorda (ou no ciclo todo), semana só em valor único
insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents, semana)
values (current_setting('t.emp')::uuid, 'Alevino de tambaqui', 'alevino', 'alevinagem', 'peixe', 25, 1);
insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents, vigente_desde)
values (current_setting('t.emp')::uuid, 'Alevino de tambaqui', 'alevino', 'alevinagem', 'peixe', 30, current_date + 180);
insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents)
values (current_setting('t.emp')::uuid, 'Gelo e caixa da despesca', 'embalagem', 'engorda', 'kg', 40);
select pg_temp.espera_erro(format($$insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents)
  values (%L, 'Gelo', 'embalagem', 'recria', 'kg', 10)$$, current_setting('t.emp')), 'kg_so_na_engorda');
select pg_temp.espera_erro(format($$insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents)
  values (%L, 'Bandeja', 'embalagem', 'engorda', 'duzia', 10)$$, current_setting('t.emp')), 'planejamento_custos_base_check');
select pg_temp.espera_erro(format($$insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents, semana)
  values (%L, 'Luz', 'energia', 'engorda', 'mes', 10, 20)$$, current_setting('t.emp')), 'semana_so_em_valor_unico');

-- Outra empresa não vê nem usa os viveiros desta
set request.jwt.claim.sub = '99a99a99-0000-4000-8000-00000000a002';
select set_config('t.emp2', criar_empresa('99333444000258', 'Outra Piscicultura Ltda')::text, false);
select pg_temp.ok((select count(*) from lotes_planejados) = 0 and (select count(*) from planejamento_custos) = 0
  and (select count(*) from planejamento_parametros) = 0, 'outra empresa não enxerga o planejamento');
select pg_temp.espera_erro(format($$insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes, viveiro_alevinagem_id)
  values (%L, 'X', current_date, 100, '99a00000-0000-0000-0000-0000000000a1')$$, current_setting('t.emp2')), 'viveiro de alevinagem');
select pg_temp.espera_erro(format($$insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes)
  values (%L, 'X', current_date, 100)$$, current_setting('t.emp')), 'row-level security');

-- Permissões: visualização só lê; cadastros e financeiro editam
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes) values
  (current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-0000000000f1', 'visualizacao', '{}'),
  (current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-0000000000f2', 'financeiro', '{}'),
  (current_setting('t.emp')::uuid, '99a00000-0000-0000-0000-0000000000f3', 'apontador', '{}');
set role authenticated;
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select count(*) from lotes_planejados) = 1, 'visualização enxerga o planejamento');
select pg_temp.espera_erro(format($$insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents)
  values (%L, 'Vacina', 'vacina', 'alevinagem', 'peixe', 100)$$, current_setting('t.emp')), 'row-level security');
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000f2';
insert into planejamento_custos (empresa_id, descricao, categoria, fase, base, valor_cents)
values (current_setting('t.emp')::uuid, 'Programa de vacinas', 'vacina', 'recria', 'peixe', 180);
select pg_temp.ok(true, 'perfil financeiro cadastra custo futuro');
set request.jwt.claim.sub = '99a00000-0000-0000-0000-0000000000f3';
select pg_temp.ok((select count(*) from lotes_planejados) = 1, 'membro vê o planejamento');
update lotes_planejados set qtd_peixes = 1 where codigo = 'P-01';
reset role;
select pg_temp.ok((select qtd_peixes = 9000 from lotes_planejados where codigo = 'P-01'), 'apontador não altera o plano');

\o
\echo 'TESTES DE PLANEJAMENTO PASSARAM'
