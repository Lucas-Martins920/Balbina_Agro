-- Rateio em várias categorias: conciliar um lançamento do extrato dividindo o valor entre categorias e
-- centros de custo, trocar o rateio de um título existente, reflexo no DRE e desfazer.
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
  ('7a700000-0000-0000-0000-0000000000a1', 'dono@rateio.com', now()),
  ('7a700000-0000-0000-0000-0000000000a2', 'leitor@rateio.com', now()),
  ('7a700000-0000-0000-0000-0000000000a3', 'fora@rateio.com', now());

set role authenticated;
set request.jwt.claim.sub = '7a700000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('51666777000188', 'Piscicultura Rateio Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('7a700000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2026-08-01');
select set_config('t.milho', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select set_config('t.desp2', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida'
  and id not in (select parent_id from categorias where parent_id is not null) and nome <> 'Milho' order by nome limit 1), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada'
  and id not in (select parent_id from categorias where parent_id is not null) limit 1), false);
insert into centros_custo (empresa_id, nome) values (current_setting('t.emp')::uuid, 'Viveiro 1'), (current_setting('t.emp')::uuid, 'Viveiro 2');
select set_config('t.cc1', (select id::text from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Viveiro 1'), false);
select set_config('t.cc2', (select id::text from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Viveiro 2'), false);

select importar_extrato('7a700000-0000-0000-0000-0000000000b1', 'ofx', '[
  {"id_externo":"R1","data":"2026-09-10","descricao":"COMPRA AGROPECUARIA","valor_cents":-100000},
  {"id_externo":"R2","data":"2026-09-11","descricao":"COMPRA ERRADA","valor_cents":-5000},
  {"id_externo":"R3","data":"2026-09-12","descricao":"PIX RECEBIDO","valor_cents":30000},
  {"id_externo":"R4","data":"2026-09-13","descricao":"TARIFA","valor_cents":-700}
]'::jsonb);
select set_config('t.m' || substr(id_externo, 2), id::text, false) from movimentos_bancarios where id_externo like 'R%';

-- ---------------------------------------------------------------------------
-- Conciliar rateando
-- ---------------------------------------------------------------------------
select set_config('t.ag', conciliar_rateando(current_setting('t.m1')::uuid, jsonb_build_array(
  jsonb_build_object('categoria_id', current_setting('t.milho'), 'centro_custo_id', current_setting('t.cc1'), 'valor_cents', 60000, 'descricao', 'Milho 1 t'),
  jsonb_build_object('categoria_id', current_setting('t.desp2'), 'centro_custo_id', current_setting('t.cc2'), 'valor_cents', 30000),
  jsonb_build_object('categoria_id', current_setting('t.milho'), 'centro_custo_id', '', 'valor_cents', 10000)
), null, 'Compra agropecuária')::text, false);

select pg_temp.ok((select status = 'conciliado' from movimentos_bancarios where id = current_setting('t.m1')::uuid), 'lançamento do extrato fica conciliado');
select pg_temp.ok((select valor_cents = 100000 and status = 'quitado' and origem = 'conciliacao' and descricao = 'Compra agropecuária'
  from agendamentos where id = current_setting('t.ag')::uuid), 'um título só, com o valor do extrato, pago e marcado como criado na conciliação');
select pg_temp.ok((select count(*) = 3 and sum(valor_cents) = 100000 from agendamento_rateios where agendamento_id = current_setting('t.ag')::uuid),
  'três linhas de rateio somando o total');
select pg_temp.ok((select count(*) = 1 from agendamento_rateios where agendamento_id = current_setting('t.ag')::uuid
  and descricao = 'Milho 1 t' and centro_custo_id = current_setting('t.cc1')::uuid and valor_cents = 60000), 'linha guarda descrição e centro de custo');
select pg_temp.ok((select count(*) = 1 from baixas where agendamento_id = current_setting('t.ag')::uuid), 'uma baixa só no caixa');

-- DRE: competência e caixa por categoria/centro
select pg_temp.ok((select sum(valor_cents) = 70000 from resultado_competencia where empresa_id = current_setting('t.emp')::uuid
  and mes = '2026-09-01' and categoria_id = current_setting('t.milho')::uuid), 'DRE por competência leva cada categoria com sua parte');
select pg_temp.ok((select sum(valor_cents) = 30000 from resultado_caixa where empresa_id = current_setting('t.emp')::uuid
  and mes = '2026-09-01' and categoria_id = current_setting('t.desp2')::uuid and centro_custo_id = current_setting('t.cc2')::uuid),
  'DRE de caixa distribui o pagamento pelo rateio');

-- Validações
select pg_temp.espera_erro(format($$select conciliar_rateando(%L, %L::jsonb)$$, current_setting('t.m2'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 3000),
                    jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 1000))), 'O rateio soma 4000 e o título vale 5000');
select pg_temp.espera_erro(format($$select conciliar_rateando(%L, %L::jsonb)$$, current_setting('t.m2'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 5000),
                    jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 0))), 'valor maior que zero');
select pg_temp.espera_erro(format($$select conciliar_rateando(%L, %L::jsonb)$$, current_setting('t.m2'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 5000))), 'Categoria ou centro de custo inválido');
select pg_temp.espera_erro(format($$select conciliar_rateando(%L, '[]'::jsonb)$$, current_setting('t.m2')), 'ao menos uma categoria');
select pg_temp.espera_erro(format($$select conciliar_rateando(%L, %L::jsonb)$$, current_setting('t.m1'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 100000))), 'já está conciliado');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id = current_setting('t.m2')::uuid), 'tentativa recusada não concilia');

-- Entrada também rateia; a versão de uma categoria continua funcionando
select set_config('t.ag3', conciliar_rateando(current_setting('t.m3')::uuid, jsonb_build_array(
  jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 20000),
  jsonb_build_object('categoria_id', current_setting('t.rec'), 'centro_custo_id', current_setting('t.cc1'), 'valor_cents', 10000)))::text, false);
select pg_temp.ok((select tipo = 'receber' and valor_cents = 30000 from agendamentos where id = current_setting('t.ag3')::uuid), 'entrada vira título a receber rateado');
select set_config('t.ag4', conciliar_criando_titulo(current_setting('t.m4')::uuid, current_setting('t.desp2')::uuid, null, null, 'Tarifa')::text, false);
select pg_temp.ok((select count(*) = 1 and sum(valor_cents) = 700 from agendamento_rateios where agendamento_id = current_setting('t.ag4')::uuid),
  'conciliar com uma categoria segue igual (uma linha com o total)');

-- ---------------------------------------------------------------------------
-- Trocar o rateio de um título já pago
-- ---------------------------------------------------------------------------
select ratear_titulo(current_setting('t.ag4')::uuid, jsonb_build_array(
  jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 500),
  jsonb_build_object('categoria_id', current_setting('t.milho'), 'centro_custo_id', current_setting('t.cc2'), 'valor_cents', 200)));
select pg_temp.ok((select count(*) = 2 and sum(valor_cents) = 700 from agendamento_rateios where agendamento_id = current_setting('t.ag4')::uuid),
  'rateio de título pago é trocado sem mexer no valor');
select pg_temp.ok((select pago_cents = 700 and status = 'quitado' from agendamentos where id = current_setting('t.ag4')::uuid), 'pagamento continua intacto');
select pg_temp.ok((select sum(valor_cents) = 200 from resultado_caixa where empresa_id = current_setting('t.emp')::uuid
  and categoria_id = current_setting('t.milho')::uuid and centro_custo_id = current_setting('t.cc2')::uuid), 'DRE de caixa acompanha o novo rateio');
reset role;  -- ler o histórico pede MFA quando 99_mfa liga a exigência; aqui só importa que gravou
select pg_temp.ok((select count(*) >= 1 from audit_log where tabela = 'agendamento_rateios' and empresa_id = current_setting('t.emp')::uuid
  and acao = 'delete' and antes->>'agendamento_id' = current_setting('t.ag4')), 'troca do rateio fica no Histórico');
set role authenticated;
set request.jwt.claim.sub = '7a700000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag4'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 600))), 'O rateio soma 600 e o título vale 700');
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag4'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp2'), 'centro_custo_id', gen_random_uuid(), 'valor_cents', 700))),
  'Categoria ou centro de custo inválido');

-- ---------------------------------------------------------------------------
-- Permissões e outra empresa
-- ---------------------------------------------------------------------------
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '7a700000-0000-0000-0000-0000000000a2', 'visualizacao');
set role authenticated;
set request.jwt.claim.sub = '7a700000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag4'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 700))), 'não tem permissão');
select pg_temp.espera_erro(format($$select conciliar_rateando(%L, %L::jsonb)$$, current_setting('t.m2'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 5000))), 'não encontrado');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id = current_setting('t.m2')::uuid), 'só leitura não concilia');

set request.jwt.claim.sub = '7a700000-0000-0000-0000-0000000000a3';
select set_config('t.emp2', criar_empresa('51666777000269', 'Outra Piscicultura Ltda')::text, false);
select set_config('t.cat2', (select id::text from categorias where empresa_id = current_setting('t.emp2')::uuid and nome = 'Milho'), false);
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag4'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat2'), 'valor_cents', 700))), 'não tem permissão');
set request.jwt.claim.sub = '7a700000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag4'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat2'), 'valor_cents', 700))), 'Categoria ou centro de custo inválido');

-- ---------------------------------------------------------------------------
-- Desfazer e mês fechado
-- ---------------------------------------------------------------------------
select desconciliar(current_setting('t.m1')::uuid, 'Rateio errado');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id = current_setting('t.m1')::uuid), 'desconciliar volta o lançamento rateado para conciliar');
select pg_temp.ok((select status = 'cancelado' from agendamentos where id = current_setting('t.ag')::uuid), 'título rateado criado na conciliação é cancelado');
select pg_temp.ok((select coalesce(sum(valor_cents), 0) = 0 from resultado_competencia where empresa_id = current_setting('t.emp')::uuid
  and mes = '2026-09-01' and categoria_id = current_setting('t.milho')::uuid and centro_custo_id = current_setting('t.cc1')::uuid),
  'cancelado sai do DRE');
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 100000))), 'Restaure');

-- concilia de novo e fecha o mês: o rateio fica travado
select set_config('t.ag', conciliar_rateando(current_setting('t.m1')::uuid, jsonb_build_array(
  jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 50000),
  jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 50000)))::text, false);
select conciliar_rateando(current_setting('t.m2')::uuid, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 5000)));
select fechar_mes(current_setting('t.emp')::uuid, '2026-09-01');
select pg_temp.espera_erro(format($$select ratear_titulo(%L, %L::jsonb)$$, current_setting('t.ag'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 100000))), 'está fechado');
select pg_temp.ok((select count(*) = 2 from agendamento_rateios where agendamento_id = current_setting('t.ag')::uuid), 'mês fechado mantém o rateio');

reset role;
\echo TESTES DE RATEIO NA CONCILIAÇÃO PASSARAM
