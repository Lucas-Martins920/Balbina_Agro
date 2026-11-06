-- Causa das baixas: cada lançamento diz por que os peixes morreram ou foram descartes (opcional), o dia
-- soma as causas dos turnos e a view mortalidade_causas junta por lote e mês.
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

insert into auth.users (id, email, email_confirmed_at) values
  ('ca5a0000-0000-0000-0000-000000000001', 'dono@causas.com', now()),
  ('ca5a0000-0000-0000-0000-000000000002', 'outro@causas.com', now());

set role authenticated;
set request.jwt.claim.sub = 'ca5a0000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('11444777000242', 'Piscicultura Causas Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('ca5a0000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('ca5a0000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'ca5a0000-0000-0000-0000-0000000000a1', 'G1', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'K1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), 'ca5a0000-0000-0000-0000-0000000000a2', 10000, 5)::text, false);

select set_config('t.m', registrar_apontamento(current_setting('t.emp')::uuid, null, 'ca5a0000-0000-0000-0000-0000000000a2',
  current_date - 1, 'manha', 3, 1)::text, false);
select set_config('t.t', registrar_apontamento(current_setting('t.emp')::uuid, null, 'ca5a0000-0000-0000-0000-0000000000a2',
  current_date - 1, 'tarde', 2, 0)::text, false);

-- informar a causa depois é só um update do lançamento: não mexe em estoque
select set_config('t.saldo_antes', (select coalesce(sum(saldo), 0)::text from saldos_produtos where empresa_id = current_setting('t.emp')::uuid), false);
update apontamento_lancamentos set causas_morte = '{"doenca": 2, "oxigenio": 1}' where id = current_setting('t.m')::uuid;
update apontamento_lancamentos set causas_morte = '{"doenca": 1}' where id = current_setting('t.t')::uuid;
select pg_temp.ok((select causas_morte = '{"doenca": 3, "oxigenio": 1}'::jsonb from apontamentos_diarios
  where lote_id = current_setting('t.lote')::uuid and data = current_date - 1), 'o dia soma as causas dos dois turnos');
select pg_temp.ok((select coalesce(sum(saldo), 0)::text from saldos_produtos where empresa_id = current_setting('t.emp')::uuid) = current_setting('t.saldo_antes'),
  'informar a causa não mexe no estoque');
select pg_temp.ok(not exists (select 1 from movimentos_estoque where origem_tabela = 'apontamento_lancamentos'
  and origem_id in (current_setting('t.m')::uuid, current_setting('t.t')::uuid)), 'nenhum movimento de estoque é criado');

select pg_temp.espera_erro($$update apontamento_lancamentos set causas_morte = '{"doenca": 5}' where id = current_setting('t.m')::uuid$$, 'causas_validas');
select pg_temp.espera_erro($$update apontamento_lancamentos set causas_morte = '{"virus_x": 1}' where id = current_setting('t.m')::uuid$$, 'causas_validas');
select pg_temp.espera_erro($$update apontamento_lancamentos set causas_morte = '{"doenca": 1.5}' where id = current_setting('t.m')::uuid$$, 'causas_validas');
select pg_temp.espera_erro($$update apontamento_lancamentos set causas_morte = '[1]' where id = current_setting('t.m')::uuid$$, 'causas_validas');

select pg_temp.ok((select sum(peixes) = 3 from mortalidade_causas where lote_id = current_setting('t.lote')::uuid and causa = 'doenca')
  and (select sum(peixes) = 1 from mortalidade_causas where lote_id = current_setting('t.lote')::uuid and causa = 'oxigenio'),
  'view junta as causas por lote');

-- excluir o turno da tarde tira a causa dele do dia
delete from apontamento_lancamentos where id = current_setting('t.t')::uuid;
select pg_temp.ok((select causas_morte = '{"doenca": 2, "oxigenio": 1}'::jsonb from apontamentos_diarios
  where lote_id = current_setting('t.lote')::uuid and data = current_date - 1), 'excluir um turno tira as causas dele');

-- outra piscicultura não vê
set request.jwt.claim.sub = 'ca5a0000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) = 0 from mortalidade_causas where lote_id = current_setting('t.lote')::uuid), 'causas isoladas por empresa');
reset role;

\o
\echo 'TESTES DAS CAUSAS DE MORTALIDADE PASSARAM'
