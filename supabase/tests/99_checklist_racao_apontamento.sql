-- Apontamento de cria/recria com checklist e ração por tipo saindo do estoque; custo do lote pela baixa.
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
set request.jwt.claim.sub = '99c99c99-0000-4000-8000-00000000c001';
select set_config('t.emp', criar_empresa('31415926000171', 'Piscicultura Checklist Ltda')::text, false);
select set_config('t.mes', date_trunc('month', app.hoje(current_setting('t.emp')::uuid))::date::text, false);

select pg_temp.ok((select count(*) >= 5 from checklist_itens where empresa_id = current_setting('t.emp')::uuid),
  'empresa nova já tem o checklist sugerido');

insert into setores (id, empresa_id, nome) values ('99c00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('99c00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, '99c00000-0000-0000-0000-000000000001', 'Alevinagem', 'alevinagem', 10000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'C-01',
  (select id from especies where empresa_id is null limit 1), current_setting('t.mes')::date,
  '99c00000-0000-0000-0000-0000000000a1', 5000, 5)::text, false);

insert into depositos (id, empresa_id, nome, tipo) values
  ('99c00000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'Fábrica', 'racao');
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('99c00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'racao', 'Inicial', 'kg'),
  ('99c00000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'racao', 'Crescimento', 'kg'),
  ('99c00000-0000-0000-0000-0000000000b3', current_setting('t.emp')::uuid, 'outro', 'Milho', 'kg');
select registrar_entrada('99c00000-0000-0000-0000-0000000000b1', '99c00000-0000-0000-0000-0000000000d1', current_setting('t.mes')::date, 1000, 200000);
select registrar_entrada('99c00000-0000-0000-0000-0000000000b2', '99c00000-0000-0000-0000-0000000000d1', current_setting('t.mes')::date, 1000, 150000);

-- Lançamento da alevinagem: 300 kg de ração (200 Inicial + 100 Crescimento) e checklist
select set_config('t.l1', registrar_apontamento(current_setting('t.emp')::uuid, null, '99c00000-0000-0000-0000-0000000000a1',
  current_setting('t.mes')::date, 'manha', 3, 0, 300)::text, false);
select completar_lancamento(current_setting('t.l1')::uuid,
  '[{"produto_id":"99c00000-0000-0000-0000-0000000000b1","kg":200},{"produto_id":"99c00000-0000-0000-0000-0000000000b2","kg":100}]',
  jsonb_build_array(
    jsonb_build_object('item_id', (select id from checklist_itens where empresa_id = current_setting('t.emp')::uuid and nome = 'Nitrito'), 'valor', 0.3),
    jsonb_build_object('item_id', (select id from checklist_itens where empresa_id = current_setting('t.emp')::uuid and nome = 'Telas e cercas contra predadores'), 'ok', false, 'observacao', 'tela rasgada perto do monge')));

select pg_temp.ok((select saldo = 800 from estoque_produtos where produto_id = '99c00000-0000-0000-0000-0000000000b1'), 'ração Inicial sai do estoque da fábrica');
select pg_temp.ok((select saldo = 900 from estoque_produtos where produto_id = '99c00000-0000-0000-0000-0000000000b2'), 'ração Crescimento sai do estoque da fábrica');
select pg_temp.ok((select bool_and(lote_id = current_setting('t.lote')::uuid and viveiro_id = '99c00000-0000-0000-0000-0000000000a1' and tipo = 'consumo_lote')
  from movimentos_estoque where origem_tabela = 'apontamento_racoes'), 'saída com lote, viveiro e tipo consumo');
select pg_temp.ok((select count(*) = 2 from apontamento_checklist where lancamento_id = current_setting('t.l1')::uuid), 'checklist do lançamento gravado');
select pg_temp.ok((select racao_kg = 300 and mortes = 3 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid),
  'dia da alevinagem soma ração e mortes');

-- Validações
select pg_temp.espera_erro(format($$select completar_lancamento(%L, '[{"produto_id":"99c00000-0000-0000-0000-0000000000b1","kg":10}]')$$,
  current_setting('t.l1')), 'passa do total');
select set_config('t.l2', registrar_apontamento(current_setting('t.emp')::uuid, null, '99c00000-0000-0000-0000-0000000000a1',
  current_setting('t.mes')::date, 'tarde', 0, 0, 5000)::text, false);
select pg_temp.espera_erro(format($$select completar_lancamento(%L, '[{"produto_id":"99c00000-0000-0000-0000-0000000000b1","kg":5000}]')$$,
  current_setting('t.l2')), 'Saldo insuficiente de Inicial');
select pg_temp.espera_erro(format($$select completar_lancamento(%L, '[{"produto_id":"99c00000-0000-0000-0000-0000000000b3","kg":10}]')$$,
  current_setting('t.l2')), 'ração cadastrada');
delete from apontamento_lancamentos where id = current_setting('t.l2')::uuid;

-- Custo: com baixa pelo estoque, a conta a pagar de ração não entra de novo
select pg_temp.ok(calcular_custos_mes(current_setting('t.emp')::uuid, current_setting('t.mes')::date) = 1, 'custo do mês calculado');
select pg_temp.ok((select racao_cents = 200 * 200 + 100 * 150 from custos_lote_mensal where lote_id = current_setting('t.lote')::uuid),
  'custo da ração do lote = valor da ração que saiu do estoque');

-- Excluir o lançamento devolve a ração
delete from apontamento_lancamentos where id = current_setting('t.l1')::uuid;
select pg_temp.ok((select saldo = 1000 from estoque_produtos where produto_id = '99c00000-0000-0000-0000-0000000000b1'), 'excluir o lançamento devolve a ração ao estoque');
select pg_temp.ok(not exists (select 1 from apontamento_checklist where lancamento_id = current_setting('t.l1')::uuid), 'checklist sai junto');

-- Outra empresa não usa o checklist desta
set request.jwt.claim.sub = '99c99c99-0000-4000-8000-00000000c002';
select set_config('t.emp2', criar_empresa('31415926000252', 'Outra Piscicultura Ltda')::text, false);
select pg_temp.espera_erro(format($$insert into checklist_itens (empresa_id, nome) values (%L, 'Invasor')$$, current_setting('t.emp')), 'row-level security');

reset role;
