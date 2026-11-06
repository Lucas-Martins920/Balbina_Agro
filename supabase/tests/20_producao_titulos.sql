-- Marco 1: povoamento, apontamento e títulos com rateio/parcelas.
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
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select set_config('t.emp', criar_empresa('99888777000166', 'Piscicultura C Ltda')::text, false);

-- Setor e viveiro ganham centro de custo automaticamente
insert into setores (id, empresa_id, nome) values ('c0000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('c0000000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, 'c0000000-0000-0000-0000-000000000001', 'G1', 'engorda', 10000);
select pg_temp.ok((select cc.nome from viveiros g join centros_custo cc on cc.id = g.centro_custo_id where g.id = 'c0000000-0000-0000-0000-000000000002') = 'Viveiro Sede / G1', 'viveiro ganha centro de custo com o nome do setor');
select pg_temp.ok((select cc.parent_id from viveiros g join centros_custo cc on cc.id = g.centro_custo_id where g.id = 'c0000000-0000-0000-0000-000000000002')
  = (select centro_custo_id from setores where id = 'c0000000-0000-0000-0000-000000000001'), 'centro de custo do viveiro fica debaixo do setor');

select pg_temp.ok((select count(*) from especies where empresa_id is null) >= 10, 'catálogo global de espécies visível');
select set_config('t.lin', (select id::text from especies where nome = 'Tambaqui'), false);

-- Povoar lote
select pg_temp.espera_erro(format($$select povoar_lote(%L, 'L9', %L, '2026-05-01', 'c0000000-0000-0000-0000-000000000002', 20000, 5)$$,
  current_setting('t.emp'), current_setting('t.lin')), 'comporta');
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'L1', current_setting('t.lin')::uuid, '2026-05-01',
  'c0000000-0000-0000-0000-000000000002', 9000, 5, 4500000)::text, false);
select pg_temp.ok((select fase = 'engorda' and peso_inicial_g = 5 from lotes where id = current_setting('t.lote')::uuid),
  'lote povoado em viveiro de engorda entra na fase engorda, com o peso dos alevinos');
select pg_temp.ok((select count(*) from lote_alocacoes where lote_id = current_setting('t.lote')::uuid) = 1, 'alocação criada junto com o lote');
select pg_temp.ok((select cc.tipo from lotes l join centros_custo cc on cc.id = l.centro_custo_id where l.id = current_setting('t.lote')::uuid) = 'lote', 'lote ganha centro de custo');

-- Apontamentos por turno: peixes calculados no servidor, vários lançamentos no mesmo dia, qualidade da água por turno
select registrar_apontamento(current_setting('t.emp')::uuid, current_setting('t.lote')::uuid, 'c0000000-0000-0000-0000-000000000002', '2026-10-01',
  'manha', 10, 0, 30, '{"temperatura_c": 28.4, "oxigenio_mg_l": 5.2, "ph": 6.9}');
select registrar_apontamento(current_setting('t.emp')::uuid, current_setting('t.lote')::uuid, 'c0000000-0000-0000-0000-000000000002', '2026-10-01',
  'tarde', 0, 0, 28, '{"temperatura_c": "30,2", "oxigenio_mg_l": 3.8}', 'tarde');
select pg_temp.ok((select racao_kg = 58 and mortes = 10 from apontamentos_diarios where data = '2026-10-01' and lote_id = current_setting('t.lote')::uuid),
  'o dia soma a ração e as mortes da manhã e da tarde');
select pg_temp.ok((select temp_min_c = 28.4 and temp_max_c = 30.2 and oxigenio_min_mg_l = 3.8 and ph_min = 6.9 and ph_max = 6.9
                   from apontamentos_diarios where data = '2026-10-01' and lote_id = current_setting('t.lote')::uuid),
  'o dia guarda a menor e a maior temperatura, o menor oxigênio e a faixa de pH (vírgula decimal aceita)');
select pg_temp.espera_erro(format($$select registrar_apontamento(%L, %L, 'c0000000-0000-0000-0000-000000000002', '2026-10-01', 'manha', 0, 0, 0, '{"ph": "seis"}')$$,
  current_setting('t.emp'), current_setting('t.lote')), 'Valor inválido para ph da água');
select registrar_apontamento(current_setting('t.emp')::uuid, current_setting('t.lote')::uuid, 'c0000000-0000-0000-0000-000000000002', '2026-10-02',
  'manha', 5, 2, 57, null, null, 'c0000000-0000-0000-0000-0000000000aa');
select pg_temp.ok((select peixes_inicio_dia from apontamentos_diarios where data = '2026-10-02' and lote_id = current_setting('t.lote')::uuid) = 8990, 'peixes do dia = povoados - baixas anteriores');

-- Reenvio offline com o mesmo client_id não duplica nem altera
select registrar_apontamento(current_setting('t.emp')::uuid, current_setting('t.lote')::uuid, 'c0000000-0000-0000-0000-000000000002', '2026-10-02',
  'tarde', 0, 0, 0, null, null, 'c0000000-0000-0000-0000-0000000000aa');
select pg_temp.ok((select racao_kg from apontamentos_diarios where data = '2026-10-02' and lote_id = current_setting('t.lote')::uuid) = 57, 'reenvio com mesmo client_id é ignorado');

-- Editar mortes no turno da tarde recalcula os peixes dos dias seguintes (turno único: só 1 por turno)
select set_config('t.lanc_tarde', (select l.id::text from apontamento_lancamentos l join apontamentos_diarios a on a.id = l.apontamento_id
  where a.data = '2026-10-01' and l.turno = 'tarde' and a.lote_id = current_setting('t.lote')::uuid), false);
select editar_lancamento(current_setting('t.lanc_tarde')::uuid, 'tarde', 20, 0, 28, '{"temperatura_c": 31, "oxigenio_mg_l": 4.5}');
select pg_temp.ok((select peixes_inicio_dia from apontamentos_diarios where data = '2026-10-02' and lote_id = current_setting('t.lote')::uuid) = 8970, 'editar mortes num dia recalcula os dias seguintes');
select pg_temp.ok((select temp_max_c = 31 and oxigenio_min_mg_l = 4.5 from apontamentos_diarios where data = '2026-10-01' and lote_id = current_setting('t.lote')::uuid),
  'editar a água do turno refaz os extremos do dia');
select pg_temp.ok((select count(*) from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid) = 2, 'lançamentos do mesmo dia caem no mesmo dia, sem duplicar');
select pg_temp.ok((select count(*) from apontamento_lancamentos l join apontamentos_diarios a on a.id = l.apontamento_id where a.data = '2026-10-01') = 2, 'turno único: só um lançamento por turno no dia');
-- Reverter as mortes para manter o estado anterior
select editar_lancamento(current_setting('t.lanc_tarde')::uuid, 'tarde', 0, 0, 28);
select pg_temp.ok((select peixes_inicio_dia from apontamentos_diarios where data = '2026-10-02' and lote_id = current_setting('t.lote')::uuid) = 8990, 'reverter mortes refaz o dia e os seguintes');
-- Re-editar com mortes para manter o estado esperado nos testes seguintes
select editar_lancamento(current_setting('t.lanc_tarde')::uuid, 'tarde', 20, 0, 28);

select pg_temp.espera_erro(format($$select registrar_apontamento(%L, %L, 'c0000000-0000-0000-0000-000000000002', '2026-04-01', 'manha')$$,
  current_setting('t.emp'), current_setting('t.lote')), 'não estava neste viveiro');
select pg_temp.espera_erro(format($$select registrar_apontamento(%L, %L, 'c0000000-0000-0000-0000-000000000002', current_date + 1, 'manha')$$,
  current_setting('t.emp'), current_setting('t.lote')), 'data futura');
select pg_temp.espera_erro(format($$select registrar_apontamento(%L, %L, 'c0000000-0000-0000-0000-000000000002', '2026-10-03', 'noite')$$,
  current_setting('t.emp'), current_setting('t.lote')), 'turno');
select pg_temp.espera_erro(format($$select registrar_apontamento(%L, %L, 'c0000000-0000-0000-0000-000000000002', '2026-10-03', 'manha', -1)$$,
  current_setting('t.emp'), current_setting('t.lote')), 'não podem ser negativos');

-- Sem informar o lote: vale o lote que estava no viveiro no dia
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'c0000000-0000-0000-0000-000000000002', '2026-10-03',
  'manha', 0, 0, 56);
select pg_temp.ok((select lote_id from apontamentos_diarios where data = '2026-10-03' and viveiro_id = 'c0000000-0000-0000-0000-000000000002') = current_setting('t.lote')::uuid, 'apontamento só pelo viveiro encontra o lote do dia');
select pg_temp.espera_erro($$select registrar_apontamento(current_setting('t.emp')::uuid, null, 'c0000000-0000-0000-0000-000000000002', '2026-04-01', 'manha')$$, 'Nenhum lote estava');

-- Semana de cultivo conta do povoamento (01/05): 01/10 cai na semana 22
select pg_temp.ok((select consumo_g_peixe_dia is not null and peso_medio_g > 5 from indicadores_lote_semana
                   where lote_id = current_setting('t.lote')::uuid and semana = 22), 'indicadores semanais calculados, com o peso pela curva');
select pg_temp.ok((select mortalidade_acum_pct from indicadores_lote_semana where lote_id = current_setting('t.lote')::uuid order by semana desc limit 1) = round(100.0 * 37 / 9000, 2), 'mortalidade acumulada sobre peixes povoados');

select pg_temp.ok((select peixes_atuais from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid) = 9000 - 37, 'peixes atuais no viveiro descontam as baixas');
select pg_temp.ok((select dias_cultivo = current_date - date '2026-05-01' and peso_medio_g > 5 and biomassa_kg = round(peixes_atuais * peso_medio_g / 1000.0, 1)
                   from alocacoes_atuais where lote_id = current_setting('t.lote')::uuid), 'viveiro mostra dias de cultivo, peso estimado e biomassa');

-- Títulos com rateio e parcelas
select set_config('t.milho', (select id::text from categorias where nome = 'Milho' and empresa_id = current_setting('t.emp')::uuid), false);
select set_config('t.energia', (select id::text from categorias where nome = 'Energia elétrica' and empresa_id = current_setting('t.emp')::uuid), false);
select set_config('t.venda', (select id::text from categorias where nome = 'Venda de peixes' and empresa_id = current_setting('t.emp')::uuid), false);
select set_config('t.cc', (select centro_custo_id::text from lotes where id = current_setting('t.lote')::uuid), false);

select set_config('t.grupo', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Compra de milho', '2026-11-10', '2026-10-15', 100001,
  jsonb_build_array(
    jsonb_build_object('categoria_id', current_setting('t.milho'), 'centro_custo_id', current_setting('t.cc'), 'valor_cents', 70000),
    jsonb_build_object('categoria_id', current_setting('t.energia'), 'centro_custo_id', null, 'valor_cents', 30001)),
  null, 'NF 123', 3)::text, false);
select pg_temp.ok((select count(*) from agendamentos where grupo_parcelamento_id = current_setting('t.grupo')::uuid) = 3, '3 parcelas criadas');
select pg_temp.ok((select sum(valor_cents) from agendamentos where grupo_parcelamento_id = current_setting('t.grupo')::uuid) = 100001, 'parcelas somam o total, sem perder centavo');
select pg_temp.ok((select array_agg(vencimento order by parcela_numero) from agendamentos where grupo_parcelamento_id = current_setting('t.grupo')::uuid)
  = array['2026-11-10','2026-12-10','2027-01-10']::date[], 'vencimentos mês a mês');
select pg_temp.ok((select bool_and(competencia = '2026-10-01') from agendamentos where grupo_parcelamento_id = current_setting('t.grupo')::uuid), 'competência da compra em todas as parcelas');
select pg_temp.ok((select sum(r.valor_cents) from agendamento_rateios r join agendamentos a on a.id = r.agendamento_id
  where a.grupo_parcelamento_id = current_setting('t.grupo')::uuid and r.categoria_id = current_setting('t.milho')::uuid) between 69999 and 70001, 'rateio proporcional mantido nas parcelas');

select pg_temp.espera_erro(format($$select agendar_titulo(%L, 'pagar', 'x', '2026-11-10', '2026-11-01', 1000, jsonb_build_array(jsonb_build_object('categoria_id', %L, 'valor_cents', 900)))$$,
  current_setting('t.emp'), current_setting('t.milho')), 'rateio soma');
select pg_temp.espera_erro(format($$select agendar_titulo(%L, 'pagar', 'x', '2026-11-10', '2026-11-01', 1000, jsonb_build_array(jsonb_build_object('categoria_id', %L, 'valor_cents', 1000)))$$,
  current_setting('t.emp'), current_setting('t.venda')), 'Categoria ou centro de custo inválido');

-- Baixa não passa do saldo
select set_config('t.parc1', (select id::text from agendamentos where grupo_parcelamento_id = current_setting('t.grupo')::uuid and parcela_numero = 1), false);
select set_config('t.conta', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid limit 1), false);
select pg_temp.espera_erro(format($$insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents) values (%L, %L, %L, '2026-11-10', 999999)$$,
  current_setting('t.emp'), current_setting('t.parc1'), current_setting('t.conta')), 'passa do saldo');
insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents)
select current_setting('t.emp')::uuid, id, current_setting('t.conta')::uuid, '2026-11-10', valor_cents from agendamentos where id = current_setting('t.parc1')::uuid;
select pg_temp.ok((select situacao from titulos where id = current_setting('t.parc1')::uuid) = 'quitado', 'view titulos mostra quitado');
select pg_temp.ok((select saldo_cents from titulos where id = current_setting('t.parc1')::uuid) = 0, 'saldo zerado após baixa total');
select pg_temp.ok((select categorias from titulos where id = current_setting('t.parc1')::uuid) like '%Milho%', 'view titulos lista as categorias');

-- Outra empresa não enxerga nada disso
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select pg_temp.ok((select count(*) from titulos where empresa_id = current_setting('t.emp')::uuid) = 0, 'títulos isolados por empresa');
select pg_temp.ok((select count(*) from indicadores_lote_semana where empresa_id = current_setting('t.emp')::uuid) = 0, 'indicadores semanais isolados por empresa');
select pg_temp.espera_erro(format($$select povoar_lote(%L, 'X', %L, '2026-05-01', 'c0000000-0000-0000-0000-000000000002', 10, 5)$$,
  current_setting('t.emp'), current_setting('t.lin')), 'Viveiro não encontrado');

reset role;
\o
\echo 'TESTES DO MARCO 1 PASSARAM'
