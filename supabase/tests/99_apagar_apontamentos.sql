-- Apagar apontamentos: vai para a lixeira com tudo o que tinha, desfaz estoque e totais, e dá para restaurar.
-- Tratador só apaga o que ele mesmo lançou hoje; gerente da piscicultura e master apagam qualquer um.
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

-- m = master, g = tratador, h = outro tratador, e = gerente da piscicultura, v = só visualiza, o = master de outra empresa
insert into auth.users (id, email, email_confirmed_at) values
  ('9aa00000-0000-0000-0000-0000000000a1', 'master@apagar.com', now()),
  ('9aa00000-0000-0000-0000-0000000000a2', 'viveiro@apagar.com', now()),
  ('9aa00000-0000-0000-0000-0000000000a3', 'viveiro2@apagar.com', now()),
  ('9aa00000-0000-0000-0000-0000000000a4', 'gerente@apagar.com', now()),
  ('9aa00000-0000-0000-0000-0000000000a5', 'ver@apagar.com', now()),
  ('9aa00000-0000-0000-0000-0000000000a6', 'outro@apagar.com', now());

set role authenticated;
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a6';
select set_config('t.outra', criar_empresa('11222333000181', 'Outra Piscicultura Ltda')::text, false);
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('44555666000172', 'Piscicultura Apaga Ltda')::text, false);
select set_config('t.hoje', app.hoje(current_setting('t.emp')::uuid)::text, false);

insert into setores (id, empresa_id, nome) values ('9aa00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9aa00000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, '9aa00000-0000-0000-0000-0000000000b1', 'G1', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'A1', (select id from especies where nome = 'Tambaqui'),
  current_setting('t.hoje')::date - 60, '9aa00000-0000-0000-0000-0000000000b2', 10000, 5)::text, false);

insert into depositos (id, empresa_id, nome, tipo) values
  ('9aa00000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'Fábrica', 'racao');
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('9aa00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'racao', 'Engorda 1', 'kg'),
  ('9aa00000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, 'medicamento', 'Enrofloxacina 10%', 'L');
select registrar_entrada('9aa00000-0000-0000-0000-0000000000c1', '9aa00000-0000-0000-0000-0000000000d1', current_setting('t.hoje')::date - 5, 5000, 200);
select movimentar_estoque('9aa00000-0000-0000-0000-0000000000c2', 'entrada', 2, null, current_setting('t.hoje')::date - 5, 40000);
insert into medicamentos (id, empresa_id, nome, tipo, dose_por_unidade, unidade_dose, carencia_dias, produto_id)
values ('9aa00000-0000-0000-0000-0000000000c3', current_setting('t.emp')::uuid, 'Enro 10', 'medicamento', 0.5, 'ml', 0,
        '9aa00000-0000-0000-0000-0000000000c2');

reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values
  (current_setting('t.emp')::uuid, '9aa00000-0000-0000-0000-0000000000a2', 'tratador'),
  (current_setting('t.emp')::uuid, '9aa00000-0000-0000-0000-0000000000a3', 'tratador'),
  (current_setting('t.emp')::uuid, '9aa00000-0000-0000-0000-0000000000a4', 'gerente_piscicultura'),
  (current_setting('t.emp')::uuid, '9aa00000-0000-0000-0000-0000000000a5', 'visualizacao');
set role authenticated;

-- Lançamento completo do master: mortes com causa, ração por tipo, checklist e medicação
select set_config('t.l1', registrar_apontamento(current_setting('t.emp')::uuid, null, '9aa00000-0000-0000-0000-0000000000b2',
  current_setting('t.hoje')::date, 'manha', 4, 1, 1200, null, 'manejo normal')::text, false);
update apontamento_lancamentos set causas_morte = '{"temperatura": 3, "outra": 2}' where id = current_setting('t.l1')::uuid;
select completar_lancamento(current_setting('t.l1')::uuid,
  '[{"produto_id":"9aa00000-0000-0000-0000-0000000000c1","kg":1200}]',
  jsonb_build_array(jsonb_build_object('item_id', (select id from checklist_itens where empresa_id = current_setting('t.emp')::uuid and nome = 'Aeradores funcionando'), 'ok', false)));
select registrar_medicacao(current_setting('t.emp')::uuid, null, null, '9aa00000-0000-0000-0000-0000000000c3', 2, null, 1000, null, null,
  current_setting('t.l1')::uuid);
select pg_temp.ok((select saldo = 3800 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c1'), 'ração saiu do estoque');
select pg_temp.ok((select saldo = 1.5 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c2'), 'medicamento saiu do estoque');

-- Tratador lança o dele
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a2';
select set_config('t.l2', registrar_apontamento(current_setting('t.emp')::uuid, null, '9aa00000-0000-0000-0000-0000000000b2',
  current_setting('t.hoje')::date, 'tarde', 1, 0, 300)::text, false);
select set_config('t.l3', registrar_apontamento(current_setting('t.emp')::uuid, null, '9aa00000-0000-0000-0000-0000000000b2',
  current_setting('t.hoje')::date - 1, 'tarde', 0, 0, 280)::text, false);
select pg_temp.ok((select mortes = 5 and descartes = 1 and racao_kg = 1500 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid
  and data = current_setting('t.hoje')::date), 'dia soma os dois lançamentos');

-- Tratador: não apaga o do master, nem o de outro dia de lançamento, nem o dia inteiro direto
select pg_temp.espera_erro(format($$select excluir_lancamento(%L)$$, current_setting('t.l1')), 'só pode excluir os lançamentos que fez hoje');
delete from apontamento_lancamentos where id = current_setting('t.l1')::uuid;
delete from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid;
reset role;
select pg_temp.ok((select count(*) = 3 from apontamento_lancamentos where empresa_id = current_setting('t.emp')::uuid),
  'apagar direto pela API não passa do RLS para o tratador');
update apontamento_lancamentos set created_at = now() - interval '2 days' where id = current_setting('t.l3')::uuid;
set role authenticated;
select pg_temp.espera_erro(format($$select excluir_lancamento(%L)$$, current_setting('t.l3')), 'só pode excluir os lançamentos que fez hoje');

-- Outro tratador não apaga o do colega
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a3';
select pg_temp.espera_erro(format($$select excluir_lancamento(%L)$$, current_setting('t.l2')), 'só pode excluir os lançamentos que fez hoje');

-- Quem só visualiza e quem é de outra empresa não apagam
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a5';
select pg_temp.espera_erro(format($$select excluir_lancamento(%L)$$, current_setting('t.l2')), 'não tem permissão para excluir apontamentos');
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a6';
select pg_temp.espera_erro(format($$select excluir_lancamento(%L)$$, current_setting('t.l2')), 'não tem permissão para excluir apontamentos');

-- Tratador apaga o que ele lançou hoje: vai para a lixeira e o dia volta a ter só o do master
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a2';
select set_config('t.x2', excluir_lancamento(current_setting('t.l2')::uuid, 'contei errado')::text, false);
select pg_temp.ok(not exists (select 1 from apontamento_lancamentos where id = current_setting('t.l2')::uuid), 'lançamento do tratador saiu');
select pg_temp.ok((select mortes = 4 and racao_kg = 1200 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid
  and data = current_setting('t.hoje')::date), 'total do dia recalculado');
select pg_temp.ok((select mortes = 1 and racao_kg = 300 and turno = 'tarde' and motivo = 'contei errado' and excluido_por = '9aa00000-0000-0000-0000-0000000000a2'
  and restaurado_em is null from apontamentos_lixeira where id = current_setting('t.x2')::uuid), 'lixeira guarda o lançamento, o motivo e quem apagou');

-- Gerente apaga o do master: tudo volta
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a4';
select set_config('t.x1', excluir_lancamento(current_setting('t.l1')::uuid, '  ')::text, false);
select pg_temp.ok(not exists (select 1 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid
  and data = current_setting('t.hoje')::date), 'dia sem lançamentos some');
select pg_temp.ok((select peixes_inicio_dia = 10000 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid
  and data = current_setting('t.hoje')::date - 1), 'o dia de ontem continua com os peixes de antes');
select pg_temp.ok((select saldo = 5000 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c1'), 'ração volta ao estoque');
select pg_temp.ok((select saldo = 2 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c2'), 'medicamento volta ao estoque');
select pg_temp.ok(not exists (select 1 from eventos_sanitarios where lancamento_id = current_setting('t.l1')::uuid), 'medicação sai da sanidade');
select pg_temp.ok((select motivo is null and mortes = 4 and descartes = 1 and racao_kg = 1200
  and jsonb_array_length(dados->'racoes') = 1 and jsonb_array_length(dados->'checklist') = 1 and jsonb_array_length(dados->'medicacoes') = 1
  and dados->'lancamento'->'causas_morte' = '{"temperatura": 3, "outra": 2}'
  from apontamentos_lixeira where id = current_setting('t.x1')::uuid), 'lixeira guarda ração, checklist, medicação e causas');
reset role;
select pg_temp.ok(exists (select 1 from audit_log where tabela = 'apontamento_lancamentos' and acao = 'delete'
  and registro_id = current_setting('t.l1') and user_id = '9aa00000-0000-0000-0000-0000000000a4'), 'histórico registra quem apagou');
set role authenticated;

-- Restaurar: tratador não restaura o que não apagou; gerente restaura e tudo volta a sair do estoque
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format($$select restaurar_lancamento(%L)$$, current_setting('t.x1')), 'só pode restaurar');
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a4';
select set_config('t.r1', restaurar_lancamento(current_setting('t.x1')::uuid)::text, false);
select pg_temp.ok((select l.mortes = 4 and l.descartes = 1 and l.racao_kg = 1200 and l.turno = 'manha'
  and l.observacoes = 'manejo normal' and l.causas_morte = '{"temperatura": 3, "outra": 2}' and d.data = current_setting('t.hoje')::date
  from apontamento_lancamentos l join apontamentos_diarios d on d.id = l.apontamento_id where l.id = current_setting('t.r1')::uuid),
  'lançamento volta igual');
select pg_temp.ok((select saldo = 3800 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c1'), 'ração sai de novo');
select pg_temp.ok((select saldo = 1.5 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c2'), 'medicamento sai de novo');
select pg_temp.ok((select count(*) = 1 from apontamento_checklist where lancamento_id = current_setting('t.r1')::uuid), 'checklist volta');
select pg_temp.ok((select restaurado_em is not null and restaurado_por = '9aa00000-0000-0000-0000-0000000000a4'
  and restaurado_lancamento_id = current_setting('t.r1')::uuid from apontamentos_lixeira where id = current_setting('t.x1')::uuid),
  'lixeira marca a restauração');
select pg_temp.espera_erro(format($$select restaurar_lancamento(%L)$$, current_setting('t.x1')), 'já foi restaurado');

-- Tratador desfaz a própria exclusão
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a2';
select pg_temp.ok(restaurar_lancamento(current_setting('t.x2')::uuid) is not null, 'tratador restaura o que ele mesmo apagou hoje');

set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select count(*) = 2 from apontamentos_lixeira where empresa_id = current_setting('t.emp')::uuid),
  'lixeira guarda as duas exclusões');

-- Lixeira: só leitura pela API, e cada empresa vê só a sua
update apontamentos_lixeira set motivo = 'mexido' where empresa_id = current_setting('t.emp')::uuid;
delete from apontamentos_lixeira where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select count(*) = 2 and bool_and(motivo is distinct from 'mexido') from apontamentos_lixeira
  where empresa_id = current_setting('t.emp')::uuid), 'ninguém altera nem apaga a lixeira direto');
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a6';
select pg_temp.ok((select count(*) = 0 from apontamentos_lixeira), 'outra empresa não vê a lixeira');

-- ===========================================================================
-- EDITAR LANÇAMENTO
-- ===========================================================================

-- Tratador (a2) não edita o lançamento do master (r1, restaurado pelo gerente)
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format($$select editar_lancamento(%L, 'manha', 2, 0, 1000)$$, current_setting('t.r1')),
  'só pode editar os lançamentos que fez hoje');

-- Quem só visualiza não edita
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a5';
select pg_temp.espera_erro(format($$select editar_lancamento(%L, 'manha', 2, 0, 1000)$$, current_setting('t.r1')),
  'não tem permissão para editar apontamentos');

-- Master edita: muda mortes, ração e a água
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a1';
select editar_lancamento(current_setting('t.r1')::uuid, 'manha', 2, 0, 1000, '{"oxigenio_mg_l": 5.5}', 'editado',
  '{"temperatura": 1, "outra": 1}',
  '[{"produto_id":"9aa00000-0000-0000-0000-0000000000c1","kg":1000}]',
  '[]');
select pg_temp.ok((select l.oxigenio_mg_l = 5.5 and l.mortes = 2 and l.descartes = 0 and l.racao_kg = 1000
  and l.observacoes = 'editado' and l.causas_morte = '{"temperatura": 1, "outra": 1}'
  from apontamento_lancamentos l where l.id = current_setting('t.r1')::uuid),
  'lançamento atualizado com os novos valores');
select pg_temp.ok((select mortes = 2 + 1 and racao_kg = 1000 + 300 and oxigenio_min_mg_l = 5.5 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid
  and data = current_setting('t.hoje')::date), 'total do dia recalculado após edição');
select pg_temp.ok((select saldo = 4000 from saldos_produtos where produto_id = '9aa00000-0000-0000-0000-0000000000c1'),
  'ração no estoque atualizada (5000 - 1000 = 4000)');

-- O tratador restaurou l2, que agora existe de novo. Tratador pode editar o seu de hoje.
-- Primeiro, achar o id do l2 restaurado:
select set_config('t.l2r', (select restaurado_lancamento_id::text from apontamentos_lixeira where id = current_setting('t.x2')::uuid), false);
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a2';
select editar_lancamento(current_setting('t.l2r')::uuid, 'tarde', 2, 0, 310, null, 'corrigi');
select pg_temp.ok((select l.mortes = 2 and l.racao_kg = 310 and l.observacoes = 'corrigi'
  from apontamento_lancamentos l where l.id = current_setting('t.l2r')::uuid),
  'tratador edita o que ele lançou hoje');

-- Mortes que não cabem nos peixes do viveiro: barra
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro(format($$select editar_lancamento(%L, 'manha', 20000, 0, 0)$$, current_setting('t.r1')),
  'baixas_cabem');

reset role;
select pg_temp.ok(exists (select 1 from audit_log where tabela = 'apontamento_lancamentos' and acao = 'update'
  and registro_id = current_setting('t.r1')), 'histórico registra quem editou');
set role authenticated;

-- ---------------------------------------------------------------------------
-- Turno único: não pode ter dois lançamentos no mesmo turno/viveiro/dia.
-- ---------------------------------------------------------------------------
-- r1 já é um lançamento da manhã. Tentar outro na manhã deve falhar.
set request.jwt.claim.sub = '9aa00000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro(
  format($$select registrar_apontamento(%L, null, '9aa00000-0000-0000-0000-0000000000b2', %L, 'manha', 0, 0, 0)$$,
    current_setting('t.emp'), current_setting('t.hoje')),
  'lancamento_turno_unico');

-- Mas na tarde deve funcionar (l2 restaurado é tarde, porém se não existe outro slot, validamos que manhã bloqueia):
reset role;
select pg_temp.ok(
  (select count(*) = 1 from apontamento_lancamentos where apontamento_id = (
    select id from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid and data = current_setting('t.hoje')::date
  ) and turno = 'manha'),
  'turno único: só um lançamento por turno no viveiro/dia');

reset role;

\echo TESTES DE APAGAR E EDITAR APONTAMENTOS PASSARAM
