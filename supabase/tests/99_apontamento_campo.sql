-- App de campo: o lançamento que chega do celular (às vezes horas depois, às vezes repetido) grava
-- ração por tipo, mortes, qualidade da água, checklist e medicação de uma vez, sem duplicar e avisando conflito de turno.
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
set request.jwt.claim.sub = 'ca000000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('11444777000161', 'Piscicultura Campo Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('ca000000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('ca000000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a1', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'C1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), 'ca000000-0000-0000-0000-0000000000a2', 10000, 5);

insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('ca000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'racao', 'Engorda fase 1', 'kg'),
  ('ca000000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'medicamento', 'Enrofloxacina 10%', 'L');
select movimentar_estoque('ca000000-0000-0000-0000-0000000000b1', 'entrada', 5000, null, current_date - 2, 150);
select movimentar_estoque('ca000000-0000-0000-0000-0000000000b2', 'entrada', 2, null, current_date - 2, 40000);
insert into medicamentos (id, empresa_id, nome, tipo, dose_por_unidade, unidade_dose, carencia_dias, produto_id)
values ('ca000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Enro 10', 'medicamento', 0.5, 'ml', 7,
        'ca000000-0000-0000-0000-0000000000b2');
select set_config('t.ck_agua', (select id::text from checklist_itens where empresa_id = current_setting('t.emp')::uuid and nome = 'Aeradores funcionando'), false);
select set_config('t.ck_nitrito', (select id::text from checklist_itens where empresa_id = current_setting('t.emp')::uuid and nome = 'Nitrito'), false);

-- Lançamento completo vindo do celular
select set_config('t.r1', registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date - 1, 'manha', 3, 1, 1100, 'tudo certo', 'ca000000-0000-0000-0000-00000000c001',
  jsonb_build_array(jsonb_build_object('produto_id', 'ca000000-0000-0000-0000-0000000000b1', 'kg', 1100)),
  jsonb_build_array(jsonb_build_object('item_id', current_setting('t.ck_agua'), 'ok', true),
                    jsonb_build_object('item_id', current_setting('t.ck_nitrito'), 'valor', 0.25)),
  jsonb_build_object('medicamento_id', 'ca000000-0000-0000-0000-0000000000c1', 'dias', 3, 'base_dose', 100),
  p_agua => '{"oxigenio_mg_l": 5.8, "temperatura_c": 29.1, "ph": 6.5}')::text, false);
select set_config('t.l1', (current_setting('t.r1')::jsonb->>'id'), false);
select pg_temp.ok(current_setting('t.r1')::jsonb->>'situacao' = 'novo', 'primeiro envio grava');
select pg_temp.ok((select oxigenio_mg_l = 5.8 and temperatura_c = 29.1 and ph = 6.5 and mortes = 3 and descartes = 1 and racao_kg = 1100
  and origem = 'app' and turno = 'manha' from apontamento_lancamentos where id = current_setting('t.l1')::uuid), 'lançamento com baixas, ração e água do turno');
select pg_temp.ok((select kg = 1100 from apontamento_racoes where lancamento_id = current_setting('t.l1')::uuid), 'ração por tipo registrada');
select pg_temp.ok((select saldo = 3900 from saldos_produtos where produto_id = 'ca000000-0000-0000-0000-0000000000b1'), 'ração sai do estoque');
select pg_temp.ok((select count(*) = 2 from apontamento_checklist where lancamento_id = current_setting('t.l1')::uuid), 'checklist gravado');
select pg_temp.ok((select valor = 0.25 from apontamento_checklist where lancamento_id = current_setting('t.l1')::uuid
  and item_id = current_setting('t.ck_nitrito')::uuid), 'item medido guarda o número');
select pg_temp.ok((select quantidade = 50 and base_dose = 100 and carencia_dias = 3 + 7 from eventos_sanitarios where lancamento_id = current_setting('t.l1')::uuid),
  'dose da medicação sobre os kg de ração, com a carência contada do início');
select pg_temp.ok((select count(*) = 1 from eventos_sanitarios where lancamento_id = current_setting('t.l1')::uuid), 'medicação na sanidade');

-- Reenvio (sinal caiu antes da resposta): não duplica nada
select pg_temp.ok((select r->>'situacao' = 'repetido' and r->>'id' = current_setting('t.l1') from (select registrar_lancamento_campo(
  current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2', current_date - 1, 'manha', 3, 1, 1100, 'tudo certo',
  'ca000000-0000-0000-0000-00000000c001',
  jsonb_build_array(jsonb_build_object('produto_id', 'ca000000-0000-0000-0000-0000000000b1', 'kg', 1100)), '[]',
  jsonb_build_object('medicamento_id', 'ca000000-0000-0000-0000-0000000000c1')) as r) x), 'reenvio devolve o mesmo lançamento');
select pg_temp.ok((select count(*) = 1 from apontamento_lancamentos where client_id = 'ca000000-0000-0000-0000-00000000c001'), 'um lançamento só');
select pg_temp.ok((select saldo = 3900 from saldos_produtos where produto_id = 'ca000000-0000-0000-0000-0000000000b1'), 'ração não baixa em dobro');
select pg_temp.ok((select count(*) = 1 from eventos_sanitarios where lancamento_id = current_setting('t.l1')::uuid), 'medicação não duplica');

-- Conflito: mesmo viveiro, dia e turno vindo de outro celular
select set_config('t.r2', registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date - 1, 'manha', 0, 0, 0, null, 'ca000000-0000-0000-0000-00000000c002')::text, false);
select pg_temp.ok(current_setting('t.r2')::jsonb->>'situacao' = 'conflito'
  and (current_setting('t.r2')::jsonb->'existentes'->0->>'mortes')::int = 3
  and (current_setting('t.r2')::jsonb->'existentes'->0->>'oxigenio_mg_l')::numeric = 5.8, 'conflito devolve o lançamento que já existe');
select pg_temp.ok((select count(*) = 0 from apontamento_lancamentos where client_id = 'ca000000-0000-0000-0000-00000000c002'), 'conflito não grava');
-- a tarde do mesmo dia não é conflito
select pg_temp.ok(registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date - 1, 'tarde', 2, 0, 500, null, 'ca000000-0000-0000-0000-00000000c003')->>'situacao' = 'novo', 'outro turno grava direto');
-- quem apontou decide substituir o lançamento existente no turno
select pg_temp.ok(registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date - 1, 'manha', 1, 0, 600, null, 'ca000000-0000-0000-0000-00000000c002', p_forcar => true)->>'situacao' = 'novo',
  'forçar substitui o lançamento existente no turno');
select pg_temp.ok((select mortes = 3 and racao_kg = 1100 and oxigenio_min_mg_l is null from apontamentos_diarios where viveiro_id = 'ca000000-0000-0000-0000-0000000000a2'
  and data = current_date - 1), 'dia soma os dois lançamentos (manhã substituída + tarde)');
select pg_temp.ok((select saldo = 5000 from saldos_produtos where produto_id = 'ca000000-0000-0000-0000-0000000000b1'),
  'substituir devolve ao estoque a ração do lançamento antigo');

-- Tudo ou nada: ração sem saldo desfaz o lançamento inteiro e o celular mantém na fila
select pg_temp.espera_erro(format($$select registrar_lancamento_campo(%L, 'ca000000-0000-0000-0000-0000000000a2', current_date, 'manha',
  0, 0, 9000, null, 'ca000000-0000-0000-0000-00000000c004',
  '[{"produto_id": "ca000000-0000-0000-0000-0000000000b1", "kg": 9000}]')$$, current_setting('t.emp')), 'Saldo insuficiente');
select pg_temp.ok((select count(*) = 0 from apontamento_lancamentos where client_id = 'ca000000-0000-0000-0000-00000000c004'), 'nada fica pela metade');

-- Item do checklist desativado depois que o celular baixou a lista: ignora em vez de travar
update checklist_itens set ativo = false where id = current_setting('t.ck_agua')::uuid;
select set_config('t.r5', registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date, 'manha', 0, 0, 0, null, 'ca000000-0000-0000-0000-00000000c005', '[]',
  jsonb_build_array(jsonb_build_object('item_id', current_setting('t.ck_agua'), 'ok', false),
                    jsonb_build_object('item_id', current_setting('t.ck_nitrito'), 'valor', 0.5)))::text, false);
select pg_temp.ok((select count(*) = 1 from apontamento_checklist where lancamento_id = (current_setting('t.r5')::jsonb->>'id')::uuid),
  'item desativado fica de fora, o resto grava');

select pg_temp.espera_erro(format($$select registrar_lancamento_campo(%L, 'ca000000-0000-0000-0000-0000000000a2', current_date, 'manha')$$,
  current_setting('t.emp')), 'Identificador do envio');

-- Qualidade da água (ligada por padrão): o celular manda as leituras do turno e o dia guarda os extremos
select pg_temp.ok((select apontar_qualidade_agua from empresas where id = current_setting('t.emp')::uuid), 'qualidade da água começa ligada');
select set_config('t.r7', registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date - 3, 'manha', p_client_id => 'ca000000-0000-0000-0000-00000000c007',
  p_agua => '{"oxigenio_mg_l": 3.2, "temperatura_c": 27.8, "ph": 6.1}')::text, false);
select registrar_lancamento_campo(current_setting('t.emp')::uuid, 'ca000000-0000-0000-0000-0000000000a2',
  current_date - 3, 'tarde', p_client_id => 'ca000000-0000-0000-0000-00000000c008',
  p_agua => '{"oxigenio_mg_l": "6,4", "temperatura_c": 31.2, "ph": 7.4, "amonia_mg_l": 0.4, "transparencia_cm": 35}');
select pg_temp.ok((select oxigenio_mg_l = 3.2 and temperatura_c = 27.8 and ph = 6.1 and amonia_mg_l is null
  from apontamento_lancamentos where id = (current_setting('t.r7')::jsonb->>'id')::uuid), 'leituras da água no lançamento do turno');
select pg_temp.ok((select oxigenio_min_mg_l = 3.2 and temp_min_c = 27.8 and temp_max_c = 31.2 and ph_min = 6.1 and ph_max = 7.4
  and amonia_max_mg_l = 0.4 and transparencia_cm = 35 from apontamentos_diarios where viveiro_id = 'ca000000-0000-0000-0000-0000000000a2'
  and data = current_date - 3), 'o dia guarda o menor oxigênio, as faixas de temperatura e pH e a maior amônia');
select pg_temp.espera_erro(format($$select registrar_lancamento_campo(%L, 'ca000000-0000-0000-0000-0000000000a2', current_date - 4, 'manha',
  p_client_id => 'ca000000-0000-0000-0000-00000000c009', p_agua => '{"ph": "ácido"}')$$, current_setting('t.emp')), 'Valor inválido para ph da água');
select pg_temp.espera_erro(format($$select registrar_lancamento_campo(%L, 'ca000000-0000-0000-0000-0000000000a2', current_date - 4, 'manha',
  p_client_id => 'ca000000-0000-0000-0000-00000000c009', p_agua => '[5, 6]')$$, current_setting('t.emp')), 'Formato inválido');

-- Outra empresa não aponta no viveiro desta
set request.jwt.claim.sub = 'ca000000-0000-0000-0000-000000000002';
select criar_empresa('22333444000181', 'Outra Piscicultura Ltda');
select pg_temp.espera_erro(format($$select registrar_lancamento_campo(%L, 'ca000000-0000-0000-0000-0000000000a2', current_date, 'tarde',
  0, 0, 0, null, 'ca000000-0000-0000-0000-00000000c006')$$, current_setting('t.emp')), 'Nenhum lote');
reset role;
