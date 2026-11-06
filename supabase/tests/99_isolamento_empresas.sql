-- Uma empresa não alcança dados de outra apontando, numa linha sua, para o id de um registro alheio.
-- Funções e triggers security definer ignoram o RLS, então a trava fica nas referências.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

create or replace function pg_temp.recusa(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or foreign_key_violation then
  return true;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('99c00000-0000-0000-0000-0000000000a1', 'a@isolamento.com', now()),
  ('99c00000-0000-0000-0000-0000000000b1', 'b@isolamento.com', now());

set role authenticated;
set request.jwt.claims = '{"aal": "aal1"}';
set request.jwt.claim.sub = '99c00000-0000-0000-0000-0000000000b1';
select set_config('t.b', criar_empresa('96333444000317', 'Piscicultura Vítima Ltda')::text, false);
set request.jwt.claim.sub = '99c00000-0000-0000-0000-0000000000a1';
select set_config('t.a', criar_empresa('96333444000406', 'Piscicultura Atacante Ltda')::text, false);
reset role;

-- dados da vítima B
insert into especies (id, empresa_id, nome) values ('99c00000-0000-0000-0000-00000000f001', null, 'Global isolamento');
insert into setores (id, empresa_id, nome) values ('99c00000-0000-0000-0000-00000000b001', current_setting('t.b')::uuid, 'Setor B');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('99c00000-0000-0000-0000-00000000b002', current_setting('t.b')::uuid, '99c00000-0000-0000-0000-00000000b001', 'G1', 'engorda', 1000);
insert into lotes (id, empresa_id, codigo, especie_id, data_povoamento, qtd_povoada, peso_inicial_g)
values ('99c00000-0000-0000-0000-00000000b003', current_setting('t.b')::uuid, 'LB1', '99c00000-0000-0000-0000-00000000f001', '2026-02-01', 1000, 5);
insert into apontamentos_diarios (id, empresa_id, lote_id, viveiro_id, data, peixes_inicio_dia)
values ('99c00000-0000-0000-0000-00000000b004', current_setting('t.b')::uuid, '99c00000-0000-0000-0000-00000000b003', '99c00000-0000-0000-0000-00000000b002', '2026-10-20', 1000);
insert into contatos (id, empresa_id, tipos, nome) values ('99c00000-0000-0000-0000-00000000b005', current_setting('t.b')::uuid, '{cliente}', 'Cliente secreto B');
select set_config('t.cc_b', (select centro_custo_id::text from setores where id = '99c00000-0000-0000-0000-00000000b001'), false);
select set_config('t.conta_b', (select id::text from contas_financeiras where empresa_id = current_setting('t.b')::uuid limit 1), false);
select set_config('t.estoque_b', (select count(*)::text from movimentos_estoque where empresa_id = current_setting('t.b')::uuid), false);

-- o atacante é master da empresa A
set role authenticated;
set request.jwt.claim.sub = '99c00000-0000-0000-0000-0000000000a1';

select pg_temp.ok(pg_temp.recusa(format(
  $$insert into apontamento_lancamentos (empresa_id, apontamento_id, turno, mortes) values (%L, '99c00000-0000-0000-0000-00000000b004', 'manha', 900)$$,
  current_setting('t.a'))), 'não lança mortes no apontamento de outra empresa');
select pg_temp.ok(pg_temp.recusa(format(
  $$insert into biometrias (empresa_id, lote_id, viveiro_id, data, peixes_amostrados, peso_medio_g) values (%L, '99c00000-0000-0000-0000-00000000b003', '99c00000-0000-0000-0000-00000000b002', '2026-10-20', 10, 900)$$,
  current_setting('t.a'))), 'não lança biometria no lote de outra empresa');
select pg_temp.ok(pg_temp.recusa(format(
  $$insert into setores (empresa_id, nome, centro_custo_id) values (%L, 'X', %L)$$, current_setting('t.a'), current_setting('t.cc_b'))),
  'não liga um setor ao centro de custo de outra empresa');
select pg_temp.ok(pg_temp.recusa(format(
  $$insert into viveiros (empresa_id, setor_id, nome, finalidade, capacidade_peixes) values (%L, '99c00000-0000-0000-0000-00000000b001', 'GX', 'engorda', 10)$$,
  current_setting('t.a'))), 'não põe viveiro no setor de outra empresa');
select pg_temp.ok(pg_temp.recusa(format(
  $$insert into importacao_vinculos (empresa_id, origem, entidade, chave, registro_id) values (%L, 'xx', 'conta', 'k1', %L)$$,
  current_setting('t.a'), current_setting('t.conta_b'))), 'não vincula na importação a conta de outra empresa');
select pg_temp.ok(pg_temp.recusa(format(
  $$insert into importacao_vinculos (empresa_id, origem, entidade, chave, registro_id) values (%L, 'xx', 'contato', 'k2', '99c00000-0000-0000-0000-00000000b005')$$,
  current_setting('t.a'))), 'nem o contato de outra empresa');

-- referências da própria empresa e cadastros globais continuam valendo
insert into setores (id, empresa_id, nome) values ('99c00000-0000-0000-0000-00000000a001', current_setting('t.a')::uuid, 'Setor A');
insert into viveiros (empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values (current_setting('t.a')::uuid, '99c00000-0000-0000-0000-00000000a001', 'GA', 'engorda', 10);
insert into lotes (empresa_id, codigo, especie_id, data_povoamento, qtd_povoada)
values (current_setting('t.a')::uuid, 'LA1', '99c00000-0000-0000-0000-00000000f001', '2026-02-01', 10);
select pg_temp.ok(true, 'referências da própria empresa e espécie global continuam aceitas');
reset role;

select pg_temp.ok((select nome from centros_custo where id = current_setting('t.cc_b')::uuid) is distinct from 'X', 'o centro de custo de B ficou intacto');
select pg_temp.ok((select count(*)::text from movimentos_estoque where empresa_id = current_setting('t.b')::uuid) = current_setting('t.estoque_b'), 'o estoque de B ficou intacto');

-- toda referência entre tabelas com empresa_id tem a trava (tabela nova também precisa)
select pg_temp.ok(not exists (
  select 1 from pg_constraint c
  join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1] and fa.attname = 'id'
  where c.contype = 'f' and array_length(c.conkey, 1) = 1
    and c.conrelid <> c.confrelid
    and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'empresa_id' and not a.attisdropped)
    and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'empresa_id' and not a.attisdropped)
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.conrelid and t.tgname = left('mesma_empresa_' || c.conname, 63))
), 'toda chave estrangeira entre tabelas com empresa_id confere a mesma empresa');

\echo TESTES DE ISOLAMENTO ENTRE EMPRESAS PASSARAM
