-- Testes das regras que vivem no banco. Qualquer falha aborta com erro.
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

-- Toda tabela com empresa_id precisa de RLS
select pg_temp.ok(not exists (
  select 1 from information_schema.columns c join pg_class k on k.relname = c.table_name and k.relkind = 'r'
  join pg_namespace n on n.oid = k.relnamespace and n.nspname = 'public'
  where c.table_schema = 'public' and c.column_name = 'empresa_id' and not k.relrowsecurity),
  'toda tabela com empresa_id tem RLS habilitado');

-- Onboarding como usuário A
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select set_config('teste.emp_a', criar_empresa('12.345.678/0001-99', 'Piscicultura A Ltda', 'Piscicultura A')::text, false);
select pg_temp.ok((select count(*) from empresas) = 1, 'usuário A vê a própria empresa');
select pg_temp.ok((select count(*) from categorias) >= 30, 'plano de categorias padrão carregado');
select pg_temp.ok((select string_agg(nome, ',' order by ordem) from classes_peixe where not sem_classificacao) = 'Pequeno,Médio,Grande,Extra,Descarte'
  and (select nome from classes_peixe where sem_classificacao) = 'Inteiro', 'classes de tamanho do peixe carregadas, mais a Inteiro (despesca sem separar)');
select pg_temp.ok((select peso_min_g = 1000 and peso_max_g = 2000 from classes_peixe where nome = 'Médio'), 'classe guarda a faixa de peso por peixe em gramas');
select pg_temp.ok(not (select comercializavel from classes_peixe where nome = 'Descarte'), 'descarte não é comercializável');
select pg_temp.ok((select count(*) from categorias c join categorias p on p.id = c.parent_id where p.nome = 'Ração e insumos') = 6, 'subcategorias de ração ligadas ao pai');
select pg_temp.espera_erro($$select criar_empresa('123', 'X')$$, 'Informe o CNPJ');
select pg_temp.espera_erro($$select criar_empresa('12345678000199', 'Outra')$$, 'Já existe');

-- Usuário B não enxerga nada de A
set request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select pg_temp.ok((select count(*) from empresas) = 0, 'usuário B não vê empresa de A');
select pg_temp.ok((select count(*) from categorias) = 0, 'usuário B não vê categorias de A');
select pg_temp.espera_erro(format($$insert into contatos (empresa_id, tipos, nome) values (%L, '{cliente}', 'Intruso')$$, current_setting('teste.emp_a')), 'row-level security');

-- Sem login não cria empresa
reset request.jwt.claim.sub;
select pg_temp.espera_erro($$select criar_empresa('11222333000144', 'Sem login')$$, 'Faça login');

-- De volta como A: financeiro
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select set_config('teste.cat', (select id::text from categorias where nome = 'Milho'), false);
select set_config('teste.conta', (select id::text from contas_financeiras limit 1), false);

-- Título sem rateio não pode ser gravado
select pg_temp.espera_erro(format($$
  insert into agendamentos (empresa_id, tipo, descricao, vencimento, competencia, valor_cents)
  values (%L, 'pagar', 'sem rateio', '2026-11-10', '2026-11-01', 10000);
  set constraints all immediate$$, current_setting('teste.emp_a')), 'Rateio do agendamento');

-- Título com rateio fechando: ok
begin;
insert into agendamentos (id, empresa_id, tipo, descricao, vencimento, competencia, valor_cents)
values ('44444444-4444-4444-4444-444444444444', current_setting('teste.emp_a')::uuid, 'pagar', 'Milho outubro', '2026-11-10', '2026-11-01', 10000);
insert into agendamento_rateios (empresa_id, agendamento_id, categoria_id, valor_cents) values
  (current_setting('teste.emp_a')::uuid, '44444444-4444-4444-4444-444444444444', current_setting('teste.cat')::uuid, 6000),
  (current_setting('teste.emp_a')::uuid, '44444444-4444-4444-4444-444444444444', current_setting('teste.cat')::uuid, 4000);
commit;

insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents)
values (current_setting('teste.emp_a')::uuid, '44444444-4444-4444-4444-444444444444', current_setting('teste.conta')::uuid, '2026-11-10', 3000);
select pg_temp.ok((select status from agendamentos where id = '44444444-4444-4444-4444-444444444444') = 'parcial', 'baixa parcial deixa título parcial');
insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents)
values (current_setting('teste.emp_a')::uuid, '44444444-4444-4444-4444-444444444444', current_setting('teste.conta')::uuid, '2026-11-12', 7000);
select pg_temp.ok((select status from agendamentos where id = '44444444-4444-4444-4444-444444444444') = 'quitado', 'baixa total quita o título');

-- Mês fechado bloqueia mexer em baixa
insert into periodos_fechados (empresa_id, mes) values (current_setting('teste.emp_a')::uuid, '2026-11-01');
select pg_temp.espera_erro($$delete from baixas where data = '2026-11-12'$$, 'está fechado');
select pg_temp.ok((select pago_cents from agendamentos where id = '44444444-4444-4444-4444-444444444444') = 10000, 'baixa no mês fechado continua lá');

-- Piscicultura
insert into especies (id, empresa_id, nome) values ('77777777-7777-7777-7777-777777777777', current_setting('teste.emp_a')::uuid, 'Espécie teste');
insert into setores (id, empresa_id, nome) values ('55555555-5555-5555-5555-555555555555', current_setting('teste.emp_a')::uuid, 'Setor 1');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('66666666-6666-6666-6666-666666666666', current_setting('teste.emp_a')::uuid, '55555555-5555-5555-5555-555555555555', 'G1', 'engorda', 20000);
select pg_temp.espera_erro(format($$insert into viveiros (empresa_id, setor_id, nome, finalidade, capacidade_peixes) values (%L, '55555555-5555-5555-5555-555555555555', 'GX', 'postura', 10)$$,
  current_setting('teste.emp_a')), 'viveiros_finalidade_check');
insert into lotes (id, empresa_id, codigo, especie_id, data_povoamento, qtd_povoada, peso_inicial_g) values
  ('88888888-8888-8888-8888-888888888888', current_setting('teste.emp_a')::uuid, 'L01', '77777777-7777-7777-7777-777777777777', '2026-05-01', 18000, 500),
  ('99999999-9999-9999-9999-999999999999', current_setting('teste.emp_a')::uuid, 'L02', '77777777-7777-7777-7777-777777777777', '2026-06-01', 18000, 500);
insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo)
values (current_setting('teste.emp_a')::uuid, '88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 18000, '[2026-05-01,)');
select pg_temp.espera_erro(format($$insert into lote_alocacoes (empresa_id, lote_id, viveiro_id, qtd_peixes, periodo)
  values (%L, '99999999-9999-9999-9999-999999999999', '66666666-6666-6666-6666-666666666666', 18000, '[2026-06-01,)')$$, current_setting('teste.emp_a')), 'exclusion constraint');

insert into apontamentos_diarios (empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia, mortes, racao_kg, oxigenio_min_mg_l, temp_min_c, temp_max_c, client_id)
values (current_setting('teste.emp_a')::uuid, '88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', '2026-10-20', 17800, 3, 178, 4.2, 28.5, 30.1, 'cccccccc-cccc-cccc-cccc-cccccccccccc');
select pg_temp.espera_erro(format($$insert into apontamentos_diarios (empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia, client_id)
  values (%L, '88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', '2026-10-21', 17797, 'cccccccc-cccc-cccc-cccc-cccccccccccc')$$, current_setting('teste.emp_a')), 'duplicate key');
select pg_temp.espera_erro(format($$insert into apontamentos_diarios (empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia, mortes)
  values (%L, '88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', '2026-10-22', 10, 11)$$, current_setting('teste.emp_a')), 'baixas_cabem');

select pg_temp.ok((select consumo_g_peixe_dia from indicadores_lote_dia where data = '2026-10-20') = 10.0, 'consumo de ração em gramas por peixe no dia');
select pg_temp.ok((select mortalidade_dia_pct from indicadores_lote_dia where data = '2026-10-20') = 0.017, 'mortalidade do dia sobre os peixes do início do dia');
select pg_temp.ok((select semana = 25 and dias_cultivo = 172 from indicadores_lote_dia where data = '2026-10-20'), 'semana e dias de cultivo contados do povoamento');
select pg_temp.ok((select peso_medio_g = 500 and biomassa_kg = 8900.0 and taxa_alimentacao_pct = 2.00 from indicadores_lote_dia where data = '2026-10-20'),
  'sem curva nem biometria o peso fica no do povoamento; biomassa e taxa de alimentação sobre ela');
select pg_temp.ok((select oxigenio_min_mg_l = 4.2 and temp_min_c = 28.5 and temp_max_c = 30.1 from indicadores_lote_dia where data = '2026-10-20'),
  'qualidade da água do dia no indicador');

set request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select pg_temp.ok((select count(*) from indicadores_lote_dia) = 0, 'view de indicadores respeita RLS');

reset role;
\o
\echo 'TODOS OS TESTES PASSARAM'
