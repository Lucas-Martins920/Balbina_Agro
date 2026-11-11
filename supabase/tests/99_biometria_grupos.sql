-- Biometria em grupos: média ponderada (peso total ÷ peixes), correção de grupos, reenvio offline sem duplicar,
-- dados da água e jejum, parâmetros da ração por empresa, permissão e isolamento.
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
set request.jwt.claim.sub = '99e00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('99333222000144', 'Piscicultura Grupos Ltda')::text, false);
select set_config('t.hoje', app.hoje(current_setting('t.emp')::uuid)::text, false);
insert into setores (id, empresa_id, nome) values ('99e00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('99e00000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, '99e00000-0000-0000-0000-000000000001', 'V1', 'engorda', 10000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'G-01',
  (select id from especies where empresa_id is null and nome = 'Tambaqui'), current_setting('t.hoje')::date - 40,
  '99e00000-0000-0000-0000-0000000000a1', 2500, 30)::text, false);
select registrar_apontamento(current_setting('t.emp')::uuid, null, '99e00000-0000-0000-0000-0000000000a1',
  current_setting('t.hoje')::date - 2, 'manha', 20, 0, 0);

-- Grupos desiguais: 10 peixes em 1,5 kg (150 g) e 40 peixes em 8 kg (200 g).
-- Média ponderada = 9.500 g ÷ 50 = 190 g; a média simples dos grupos daria 175 g.
select set_config('t.bio', registrar_biometria_grupos(current_setting('t.emp')::uuid, '99e00000-0000-0000-0000-0000000000a1',
  current_setting('t.hoje')::date - 1,
  '[{"peixes":10,"peso_kg":1.5,"ponto_captura":"cocho"},{"peixes":40,"peso_kg":8,"ponto_captura":"monge","observacao":"agitados"}]',
  '99e00000-0000-0000-0000-0000000000c1', null, 'app', 'Amostra de rotina', 12, 29.5, 5.2)::text, false);
select pg_temp.ok((select peixes_amostrados = 50 and peso_total_g = 9500 and peso_medio_g = 190 from biometrias where id = current_setting('t.bio')::uuid),
  'peso médio = peso total ÷ peixes (190 g), não a média dos grupos (175 g)');
select pg_temp.ok((select array_agg(ordem::text || ':' || peso_medio_g::text order by ordem) from biometria_grupos where biometria_id = current_setting('t.bio')::uuid)
  = '{1:150.00,2:200.00}', 'cada grupo guarda o peso médio dele, na ordem lançada');
select pg_temp.ok((select ponto_captura = 'monge' and observacao = 'agitados' from biometria_grupos where biometria_id = current_setting('t.bio')::uuid and ordem = 2),
  'ponto de captura e observação do grupo');
select pg_temp.ok((select jejum_horas = 12 and temperatura_c = 29.5 and oxigenio_mg_l = 5.2 and populacao_viva = 2480 and origem = 'app'
                          and created_by = '99e00000-0000-0000-0000-000000000001' and observacoes = 'Amostra de rotina'
                   from biometrias where id = current_setting('t.bio')::uuid),
  'jejum, água, população viva (2.500 − 20), origem, responsável e observação');

-- Reenvio do celular (mesmo client_id): mesma biometria, sem grupo duplicado
select pg_temp.ok(registrar_biometria_grupos(current_setting('t.emp')::uuid, '99e00000-0000-0000-0000-0000000000a1',
  current_setting('t.hoje')::date - 1, '[{"peixes":10,"peso_kg":1.5},{"peixes":40,"peso_kg":8}]',
  '99e00000-0000-0000-0000-0000000000c1', null, 'app') = current_setting('t.bio')::uuid, 'reenvio devolve a mesma biometria');
select pg_temp.ok((select count(*) = 2 from biometria_grupos where biometria_id = current_setting('t.bio')::uuid), 'reenvio não duplica os grupos');
select pg_temp.ok((select count(*) = 1 from biometrias where lote_id = current_setting('t.lote')::uuid), 'nem a biometria');

-- Validações
select pg_temp.espera_erro(format($$select registrar_biometria_grupos(%L, '99e00000-0000-0000-0000-0000000000a1', %L::date, '[]')$$,
  current_setting('t.emp'), current_setting('t.hoje')), 'pelo menos um grupo');
select pg_temp.espera_erro(format($$select registrar_biometria_grupos(%L, '99e00000-0000-0000-0000-0000000000a1', %L::date, '[{"peixes":0,"peso_kg":1}]')$$,
  current_setting('t.emp'), current_setting('t.hoje')), 'Grupo 1: informe quantos peixes');
select pg_temp.espera_erro(format($$select registrar_biometria_grupos(%L, '99e00000-0000-0000-0000-0000000000a1', %L::date, '[{"peixes":5,"peso_kg":1},{"peixes":5,"peso_kg":0}]')$$,
  current_setting('t.emp'), current_setting('t.hoje')), 'Grupo 2: o peso');
select pg_temp.espera_erro(format($$select registrar_biometria_grupos(%L, '99e00000-0000-0000-0000-0000000000a1', %L::date + 1, '[{"peixes":5,"peso_kg":1}]')$$,
  current_setting('t.emp'), current_setting('t.hoje')), 'data futura');
select pg_temp.espera_erro(format($$select registrar_biometria_grupos(%L, '99e00000-0000-0000-0000-0000000000a1', %L::date - 1, '[{"peixes":5,"peso_kg":1}]')$$,
  current_setting('t.emp'), current_setting('t.hoje')), 'Já existe uma biometria');
select pg_temp.espera_erro(format($$insert into biometria_grupos (empresa_id, biometria_id, ordem, peixes, peso_kg) values (%L, %L, 9, 1, 1)$$,
  current_setting('t.emp'), current_setting('t.bio')), 'row-level security');

-- Corrigir: somar um grupo e corrigir outro recalcula a biometria
select pg_temp.ok(corrigir_grupos_biometria(current_setting('t.bio')::uuid,
  '[{"peixes":10,"peso_kg":1.6},{"peixes":40,"peso_kg":8},{"peixes":10,"peso_kg":2.4}]') = 200,
  'corrigir os grupos recalcula a média ponderada (12.000 g ÷ 60 = 200 g)');
select pg_temp.ok((select peixes_amostrados = 60 and peso_total_g = 12000 from biometrias where id = current_setting('t.bio')::uuid)
              and (select count(*) = 3 from biometria_grupos where biometria_id = current_setting('t.bio')::uuid), 'totais e grupos trocados');
-- tirar um grupo
select pg_temp.ok(corrigir_grupos_biometria(current_setting('t.bio')::uuid, '[{"peixes":40,"peso_kg":8}]') = 200, 'tirar um grupo também recalcula');
select pg_temp.ok(app.peso_estimado(current_setting('t.lote')::uuid, current_setting('t.hoje')::date - 1) = 200, 'peso do lote segue a biometria corrigida');

-- Parâmetros da ração: sem linha vale o padrão; a empresa ajusta
select pg_temp.ok(not exists (select 1 from racao_parametros where empresa_id = current_setting('t.emp')::uuid), 'empresa nova usa o padrão (sem linha)');
insert into racao_parametros (empresa_id, reserva_sacos, prazo_entrega_dias, amostra_pct) values (current_setting('t.emp')::uuid, 12, 5, 3);
select pg_temp.ok((select reserva_sacos = 12 and amostra_min = 30 from racao_parametros where empresa_id = current_setting('t.emp')::uuid), 'reserva configurável por empresa');
select pg_temp.espera_erro(format($$update racao_parametros set amostra_max = 10 where empresa_id = %L$$, current_setting('t.emp')), 'check');

-- Sem permissão de biometria nem de ração
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '99e00000-0000-0000-0000-000000000002', 'financeiro');
set role authenticated;
set request.jwt.claim.sub = '99e00000-0000-0000-0000-000000000002';
select pg_temp.espera_erro(format($$select corrigir_grupos_biometria(%L, '[{"peixes":1,"peso_kg":1}]')$$, current_setting('t.bio')), 'não tem permissão');
select pg_temp.espera_erro(format($$select registrar_biometria_grupos(%L, '99e00000-0000-0000-0000-0000000000a1', %L::date, '[{"peixes":5,"peso_kg":1}]')$$,
  current_setting('t.emp'), current_setting('t.hoje')), 'não tem permissão');
update racao_parametros set reserva_sacos = 99 where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select reserva_sacos = 12 from racao_parametros where empresa_id = current_setting('t.emp')::uuid), 'quem só vê não muda a reserva');

-- Outra empresa
set request.jwt.claim.sub = '99e00000-0000-0000-0000-000000000003';
select criar_empresa('99333222000225', 'Outra Grupos Ltda');
select pg_temp.ok((select count(*) = 0 from biometria_grupos where empresa_id = current_setting('t.emp')::uuid), 'outra empresa não vê os grupos');
select pg_temp.ok((select count(*) = 0 from racao_parametros where empresa_id = current_setting('t.emp')::uuid), 'nem os parâmetros da ração');
select pg_temp.espera_erro(format($$select corrigir_grupos_biometria(%L, '[{"peixes":1,"peso_kg":1}]')$$, current_setting('t.bio')), 'não encontrada');

reset role;
\o
\echo 'TESTES DA BIOMETRIA EM GRUPOS PASSARAM'
