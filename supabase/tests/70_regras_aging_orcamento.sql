-- Marco 5a: regras de conciliação, aging e orçamento.
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
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';
select set_config('t.emp', criar_empresa('66777888000199', 'Piscicultura R Ltda')::text, false);
select set_config('t.caixa', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa da piscicultura'), false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('70000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2025-01-01');
update contas_financeiras set saldo_inicial_data = '2025-01-01' where id = current_setting('t.caixa')::uuid;
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null and nome = 'Ração e insumos'), false);
select set_config('t.milho', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj) values
  ('70000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Bom Preço', '55666777000188'),
  ('70000000-0000-0000-0000-0000000000f1', current_setting('t.emp')::uuid, '{fornecedor}', 'Energia SA', '11222333000144');

-- Condições
select pg_temp.ok(app.condicao_casa('{"campo":"descricao","operador":"contem","valor":"tarifa"}', row(null,null,null,null,'2026-01-01','TARIFA PACOTE',-100,null,null,'x','pendente',null,null,now())::movimentos_bancarios), 'contém ignora maiúsculas');
select pg_temp.ok(app.condicao_casa('{"campo":"valor","operador":"maior","valor":"0,50"}', row(null,null,null,null,'2026-01-01','X',-100,null,null,'x','pendente',null,null,now())::movimentos_bancarios), 'valor compara em reais pelo módulo');
select pg_temp.ok(not app.condicao_casa('{"campo":"valor","operador":"igual","valor":"abc"}', row(null,null,null,null,'2026-01-01','X',-100,null,null,'x','pendente',null,null,now())::movimentos_bancarios), 'valor inválido não casa e não quebra a importação');

-- Regras
select set_config('t.r_tarifa', criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Tarifas',
  '[{"campo":"descricao","operador":"comeca_com","valor":"tarifa"}]', 'todas', current_setting('t.desp')::uuid, null, null, 'Tarifa bancária')::text, false);
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Energia',
  '[{"campo":"cpf_cnpj","operador":"igual","valor":"11.222.333/0001-44"}]', 'todas', null, null, '70000000-0000-0000-0000-0000000000f1');
select criar_regra(current_setting('t.emp')::uuid, 'transferencia', 'Sangria para o caixa',
  '[{"campo":"descricao","operador":"contem","valor":"saque"}]', 'todas', null, null, null, null, current_setting('t.caixa')::uuid);
select pg_temp.ok((select ordem from regras_conciliacao where nome = 'Energia') = 2, 'regra nova vai para o fim da fila do tipo');
select pg_temp.espera_erro(format($$select criar_regra(%L, 'recebimento', 'Errada', '[{"campo":"descricao","operador":"contem","valor":"x"}]', 'todas', %L)$$,
  current_setting('t.emp'), current_setting('t.milho')), 'não combina');

select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Conta de luz setembro', '2026-09-10', '2026-09-01', 87000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 87000)), '70000000-0000-0000-0000-0000000000f1');

select pg_temp.ok((importar_extrato('70000000-0000-0000-0000-000000000001', 'ofx', '[
  {"id_externo":"R1","data":"2026-09-15","descricao":"TARIFA PACOTE SERVICOS","valor_cents":-4590},
  {"id_externo":"R2","data":"2026-09-10","descricao":"PAG CONTA ENERGIA","valor_cents":-87000,"cpf_cnpj":"11222333000144"},
  {"id_externo":"R3","data":"2026-09-11","descricao":"SAQUE ATM","valor_cents":-20000},
  {"id_externo":"R4","data":"2026-09-12","descricao":"PAG CONTA ENERGIA","valor_cents":-1000,"cpf_cnpj":"11222333000144"},
  {"id_externo":"R5","data":"2026-09-13","descricao":"TARIFA ESTORNO","valor_cents":4590}
]'::jsonb)->>'por_regra')::int = 0, 'importação não lança nada sozinha (saldo só muda ao lançar)');
select pg_temp.ok(aplicar_regras('70000000-0000-0000-0000-000000000001') = 3, 'Aplicar regras lança tarifa, energia e saque');

select pg_temp.ok((select a.status = 'quitado' and a.descricao = 'Tarifa bancária' from movimentos_bancarios m
  join conciliacoes c on c.movimento_id = m.id join baixas b on b.id = c.baixa_id join agendamentos a on a.id = b.agendamento_id
  where m.id_externo = 'R1'), 'regra com categoria cria o título já pago');
select pg_temp.ok((select c.modo = 'regra' and m.regra_aplicada_id = current_setting('t.r_tarifa')::uuid
  from movimentos_bancarios m join conciliacoes c on c.movimento_id = m.id where m.id_externo = 'R1'), 'conciliação marca a regra aplicada');
select pg_temp.ok((select status from titulos where descricao = 'Conta de luz setembro') = 'quitado', 'regra só com contato baixa o título dele de mesmo valor');
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = current_setting('t.caixa')::uuid) = 20000, 'regra de transferência leva o saque ao caixa');
select pg_temp.ok((select status from movimentos_bancarios where id_externo = 'R4') = 'pendente', 'sem título de mesmo valor, o lançamento fica para conciliar à mão');
select pg_temp.ok((select status from movimentos_bancarios where id_externo = 'R5') = 'pendente', 'regra de pagamento não pega entrada');

update regras_conciliacao set ativa = false where nome = 'Tarifas';
select pg_temp.ok((importar_extrato('70000000-0000-0000-0000-000000000001', 'ofx',
  '[{"id_externo":"R6","data":"2026-09-16","descricao":"TARIFA PACOTE","valor_cents":-4590}]'::jsonb)->>'por_regra')::int = 0, 'importação não aplica regra');
select pg_temp.ok((select status from movimentos_bancarios where id_externo = 'R6') = 'pendente'
  and aplicar_regras('70000000-0000-0000-0000-000000000001') = 0, 'regra desativada não se aplica');

-- Ordem
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Tarifa DOC', '[{"campo":"descricao","operador":"contem","valor":"doc"}]', 'todas', current_setting('t.milho')::uuid);
select mover_regra((select id from regras_conciliacao where nome = 'Tarifa DOC'), true);
select pg_temp.ok((select array_agg(nome order by ordem) from regras_conciliacao where tipo = 'pagamento') = '{Tarifas,Tarifa DOC,Energia}', 'mover para cima troca com a vizinha');

-- Aging
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe antigo', current_date - 75, date_trunc('month', current_date - 75)::date, 50000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 50000)), '70000000-0000-0000-0000-0000000000c1');
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe recente', current_date - 5, date_trunc('month', current_date)::date, 30000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 30000)), '70000000-0000-0000-0000-0000000000c1');
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe futuro', current_date + 10, date_trunc('month', current_date)::date, 20000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 20000)));
select pg_temp.ok((select faixa = 'ate_90' and dias_atraso = 75 from aging_titulos where descricao = 'Peixe antigo'), '75 dias de atraso cai na faixa 61 a 90');
select pg_temp.ok((select faixa from aging_titulos where descricao = 'Peixe recente') = 'ate_30', '5 dias de atraso cai na faixa até 30');
select pg_temp.ok((select faixa = 'a_vencer' and contato_nome = 'Sem contato' from aging_titulos where descricao = 'Peixe futuro'), 'a vencer e sem contato');
select pg_temp.ok(not exists (select 1 from aging_titulos where descricao = 'Conta de luz setembro'), 'título quitado fica fora do aging');

-- Orçamento
select salvar_orcamento(current_setting('t.emp')::uuid, 2026, current_setting('t.milho')::uuid, '[100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000,100000]');
select salvar_orcamento(current_setting('t.emp')::uuid, 2026, current_setting('t.milho')::uuid, '[100000,100000,100000,100000,100000,100000,100000,100000,90000,100000,100000,0]');
select pg_temp.ok((select count(*) = 11 and sum(valor_cents) = 1090000 from orcamentos where ano = 2026 and categoria_id = current_setting('t.milho')::uuid), 'salvar de novo atualiza e zero apaga o mês');
select pg_temp.espera_erro(format($$select salvar_orcamento(%L, 2026, %L, '[1,2]')$$, current_setting('t.emp'), current_setting('t.milho')), '12 meses');

select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho setembro', '2026-09-20', '2026-09-01', 95000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 95000)));
select pg_temp.ok((select orcado_cents = 90000 and realizado_cents = 95000 from orcado_realizado
  where categoria_id = current_setting('t.milho')::uuid and mes = '2026-09-01'), 'orçado × realizado no mês');
select pg_temp.ok((select orcado_cents = 0 and realizado_cents > 0 from orcado_realizado
  where categoria_id = current_setting('t.desp')::uuid and mes = '2026-09-01'), 'realizado sem orçamento também aparece');

select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho 2025', '2025-03-20', '2025-03-01', 80000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 80000)));
select pg_temp.ok(orcamento_do_realizado(current_setting('t.emp')::uuid, 2026, 10) = 1, 'orçamento parte do realizado do ano anterior');
select pg_temp.ok((select valor_cents from orcamentos where ano = 2026 and mes = 3 and categoria_id = current_setting('t.desp')::uuid) = 88000, 'com o reajuste aplicado');
select pg_temp.ok(orcamento_do_realizado(current_setting('t.emp')::uuid, 2026, 10) = 0, 'não sobrescreve o que já foi orçado');

-- Isolamento
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from regras_conciliacao where empresa_id = current_setting('t.emp')::uuid) = 0, 'regras isoladas por empresa');
select pg_temp.ok((select count(*) from aging_titulos where empresa_id = current_setting('t.emp')::uuid) = 0, 'aging isolado por empresa');
select pg_temp.ok((select count(*) from orcado_realizado where empresa_id = current_setting('t.emp')::uuid) = 0, 'orçamento isolado por empresa');

reset role;
\o
\echo 'TESTES DO MARCO 5a PASSARAM'
