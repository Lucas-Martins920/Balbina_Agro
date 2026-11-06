-- Transferência de lote entre viveiros: alevinagem -> recria -> engorda, divisão, histórico, desfazer e permissões.
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
set request.jwt.claim.sub = '99b99b99-0000-4000-8000-00000000b001';
select set_config('t.emp', criar_empresa('99444555000188', 'Piscicultura Transferência Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('99b00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('99b00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, '99b00000-0000-0000-0000-000000000001', 'Alevinagem', 'alevinagem', 10000),
  ('99b00000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, '99b00000-0000-0000-0000-000000000001', 'Recria', 'recria', 10000),
  ('99b00000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, '99b00000-0000-0000-0000-000000000001', 'Engorda 1', 'engorda', 5000),
  ('99b00000-0000-0000-0000-0000000000a4', current_setting('t.emp')::uuid, '99b00000-0000-0000-0000-000000000001', 'Engorda 2', 'engorda', 5000),
  ('99b00000-0000-0000-0000-0000000000a5', current_setting('t.emp')::uuid, '99b00000-0000-0000-0000-000000000001', 'Engorda 3', 'engorda', 100);

select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'T-01',
  (select id from especies where empresa_id is null limit 1), current_date - 119,
  '99b00000-0000-0000-0000-0000000000a1', 8000, 5)::text, false);
select pg_temp.ok((select fase = 'alevinagem' from lotes where id = current_setting('t.lote')::uuid), 'lote povoado no viveiro de alevinagem começa na alevinagem');

-- 20 baixas na alevinagem
select registrar_apontamento(current_setting('t.emp')::uuid, current_setting('t.lote')::uuid,
  '99b00000-0000-0000-0000-0000000000a1', current_date - 70, 'manha', 20);

-- Validações
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date + 1, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a2"}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a1'), 'data futura');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 75, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a2"}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a1'), 'apontamentos no viveiro de origem');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 60, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a1"}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a1'), 'outro viveiro');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 60, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a2","qtd":9000}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a1'), '7980 peixes');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 60, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a2"}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a3'), 'não está nesse viveiro');

-- Alevinagem -> recria: todos os peixes vivos vão para a recria
select set_config('t.tr1', transferir_lote(current_setting('t.lote')::uuid, '99b00000-0000-0000-0000-0000000000a1',
  current_date - 60, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a2"}]', 'Fim da alevinagem')::text, false);
select pg_temp.ok((select fase = 'recria' from lotes where id = current_setting('t.lote')::uuid), 'lote passa para a recria');
select pg_temp.ok((select al.qtd_peixes = 7980 and al.viveiro_id = '99b00000-0000-0000-0000-0000000000a2' and al.motivo = 'transferencia'
  from alocacoes_atuais a join lote_alocacoes al using (id) where a.lote_id = current_setting('t.lote')::uuid), 'recria recebe os 7980 peixes vivos');
select pg_temp.ok((select upper(periodo) = current_date - 60 from lote_alocacoes
  where lote_id = current_setting('t.lote')::uuid and viveiro_id = '99b00000-0000-0000-0000-0000000000a1'), 'alevinagem fica livre a partir da data');
select pg_temp.ok((select peixes_origem = 7980 and observacoes = 'Fim da alevinagem' from lote_transferencias where id = current_setting('t.tr1')::uuid),
  'histórico guarda os peixes e a observação');
select pg_temp.espera_erro(format($$select registrar_apontamento(%L, %L, %L, current_date - 50, 'manha', 1)$$,
  current_setting('t.emp'), current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a1'), 'não estava neste viveiro');
select pg_temp.espera_erro(format($$select editar_lote(%L, 'T-01', (select especie_id from lotes where id = %L), current_date - 118, 8000, 5, 0, 'recria')$$,
  current_setting('t.lote'), current_setting('t.lote')), 'transferido');

-- Alevinagem livre recebe outro lote; ocupado não
select povoar_lote(current_setting('t.emp')::uuid, 'T-02', (select id from especies where empresa_id is null limit 1),
  current_date - 9, '99b00000-0000-0000-0000-0000000000a1', 5000, 5);
select pg_temp.ok(true, 'alevinagem liberada aceita lote novo');

-- Desfazer só a última transferência e enquanto não houver apontamento no destino
select registrar_apontamento(current_setting('t.emp')::uuid, current_setting('t.lote')::uuid,
  '99b00000-0000-0000-0000-0000000000a2', current_date - 30, 'manha', 30);
select pg_temp.espera_erro(format($$select desfazer_transferencia(%L)$$, current_setting('t.tr1')), 'apontamentos');

-- Recria -> engorda dividido em dois viveiros, sobrando peixes na recria
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 20, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a5","qtd":200}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a2'), 'comporta 100');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 20, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a1","qtd":100}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a2'), 'ocupado');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date - 20, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a3"},{"viveiro":"99b00000-0000-0000-0000-0000000000a4"}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a2'), 'quantidade');
select set_config('t.tr2', transferir_lote(current_setting('t.lote')::uuid, '99b00000-0000-0000-0000-0000000000a2', current_date - 20,
  '[{"viveiro":"99b00000-0000-0000-0000-0000000000a3","qtd":4000},{"viveiro":"99b00000-0000-0000-0000-0000000000a4","qtd":3900}]')::text, false);
select pg_temp.ok((select fase = 'engorda' from lotes where id = current_setting('t.lote')::uuid)
  and (select data = current_date - 20 from lote_transferencias where id = current_setting('t.tr2')::uuid),
  'lote entra na engorda na data da transferência');
select pg_temp.ok((select count(*) = 3 and sum(qtd_peixes) = 7950 from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid),
  'dois viveiros de engorda e 50 peixes que ficaram na recria');
select pg_temp.ok((select qtd_peixes = 50 and motivo = 'divisao' from lote_alocacoes
  where lote_id = current_setting('t.lote')::uuid and viveiro_id = '99b00000-0000-0000-0000-0000000000a2' and upper_inf(periodo)),
  'sobra continua na recria');

-- Transferência anterior não se desfaz depois de outra
select pg_temp.espera_erro(format($$select desfazer_transferencia(%L)$$, current_setting('t.tr1')), 'última');

-- Desfazer a última volta tudo como estava
select desfazer_transferencia(current_setting('t.tr2')::uuid);
select pg_temp.ok((select fase = 'recria' from lotes where id = current_setting('t.lote')::uuid), 'desfazer volta a fase');
select pg_temp.ok((select count(*) = 1 and sum(qtd_peixes) = 7980 from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid
  and viveiro_id = '99b00000-0000-0000-0000-0000000000a2'), 'desfazer devolve o lote à recria');
select pg_temp.ok((select peixes_atuais = 7950 from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid), 'peixes vivos continuam certos');
select pg_temp.ok(not exists (select 1 from lote_transferencias where id = current_setting('t.tr2')::uuid), 'histórico desfeito sai da lista');

-- Outra empresa não vê nem transfere
set request.jwt.claim.sub = '99b99b99-0000-4000-8000-00000000b002';
select criar_empresa('99444555000269', 'Outra Piscicultura Ltda');
select pg_temp.ok((select count(*) = 0 from lote_transferencias), 'outra empresa não vê as transferências');
select pg_temp.espera_erro(format($$select transferir_lote(%L, %L, current_date, '[{"viveiro":"99b00000-0000-0000-0000-0000000000a3"}]')$$,
  current_setting('t.lote'), '99b00000-0000-0000-0000-0000000000a2'), 'Lote não encontrado');

reset role;
\echo TESTES DE TRANSFERÊNCIA DE LOTES PASSARAM
