-- Ações rápidas nas contas (estilo NIBO): editar, duplicar, baixa em lote, reprogramar, lixeira, perda e estorno.
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
  ('99a70000-0000-0000-0000-0000000000a1', 'dono@acoes.com', now()),
  ('99a70000-0000-0000-0000-0000000000a2', 'leitor@acoes.com', now());

set role authenticated;
set request.jwt.claim.sub = '99a70000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('97444555000177', 'Piscicultura Ações Ltda')::text, false);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida'
  and id not in (select parent_id from categorias where parent_id is not null) limit 1), false);
select set_config('t.desp2', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida'
  and id not in (select parent_id from categorias where parent_id is not null) and id <> current_setting('t.desp')::uuid limit 1), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada'
  and id not in (select parent_id from categorias where parent_id is not null) limit 1), false);
insert into contas_financeiras (empresa_id, nome, tipo) values (current_setting('t.emp')::uuid, 'Banco', 'corrente');
select set_config('t.conta', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'), false);

create or replace function pg_temp.titulo(p_tipo text, p_desc text, p_valor bigint, p_rateio jsonb) returns uuid language sql as $$
  select agendar_titulo(current_setting('t.emp')::uuid, p_tipo, p_desc, date '2026-11-10', date '2026-10-01', p_valor, p_rateio)
$$;
select set_config('t.a', pg_temp.titulo('pagar', 'Milho', 1000, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 1000)))::text, false);
select set_config('t.b', pg_temp.titulo('pagar', 'Farelo', 500, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 500)))::text, false);
select set_config('t.r', pg_temp.titulo('pagar', 'Rateado', 900, jsonb_build_array(
  jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 400),
  jsonb_build_object('categoria_id', current_setting('t.desp2'), 'valor_cents', 500)))::text, false);
select set_config('t.c', pg_temp.titulo('receber', 'Peixe', 2000, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 2000)))::text, false);

-- Editar
select editar_titulo(current_setting('t.a')::uuid, 'Milho 30 t', date '2026-11-15', date '2026-11-20', null, 'NF 12', 'pix', 1200);
select pg_temp.ok((select descricao = 'Milho 30 t' and vencimento = '2026-11-15' and competencia = '2026-11-01' and referencia = 'NF 12'
  and forma_pagamento = 'pix' and valor_cents = 1200 from agendamentos where id = current_setting('t.a')::uuid), 'edita descrição, datas, documento, forma e valor');
select pg_temp.ok((select sum(valor_cents) = 1200 from agendamento_rateios where agendamento_id = current_setting('t.a')::uuid), 'rateio de uma linha acompanha o valor');
select pg_temp.espera_erro(format($$select editar_titulo(%L, 'Rateado', null, null, null, null, null, 1000)$$, current_setting('t.r')), 'várias categorias');
select pg_temp.espera_erro(format($$select editar_titulo(%L, '  ', null, null, null, null, null, null)$$, current_setting('t.b')), 'Informe a descrição');

-- Duplicar
select set_config('t.d', duplicar_titulo(current_setting('t.r')::uuid, date '2026-12-10')::text, false);
select pg_temp.ok((select descricao = 'Rateado' and vencimento = '2026-12-10' and competencia = '2026-11-01' and status = 'aberto'
  and origem = 'manual' from agendamentos where id = current_setting('t.d')::uuid), 'cópia nasce em aberto e a competência anda com o vencimento');
select pg_temp.ok((select count(*) = 2 and sum(valor_cents) = 900 from agendamento_rateios where agendamento_id = current_setting('t.d')::uuid), 'cópia leva o rateio');

-- Baixa em lote
select pg_temp.ok(baixar_titulos(array[current_setting('t.a'), current_setting('t.b')]::uuid[], current_setting('t.conta')::uuid, date '2026-10-20') = 2, 'baixa dois títulos de uma vez');
select pg_temp.ok((select bool_and(status = 'quitado') from agendamentos where id in (current_setting('t.a')::uuid, current_setting('t.b')::uuid)), 'os dois ficam quitados');
select pg_temp.ok(baixar_titulos(array[current_setting('t.a')]::uuid[], current_setting('t.conta')::uuid, date '2026-10-20') = 0, 'título já quitado é ignorado');

-- Excluir com baixa exige estorno
select pg_temp.espera_erro(format($$select excluir_titulos(array[%L]::uuid[])$$, current_setting('t.a')), 'estorne a baixa');
select pg_temp.ok(estornar_baixas(current_setting('t.a')::uuid) = 1, 'estorna o pagamento');
select pg_temp.ok((select status = 'aberto' and pago_cents = 0 from agendamentos where id = current_setting('t.a')::uuid), 'título volta a aberto');

-- Reprogramar
select pg_temp.ok(reprogramar_titulos(array[current_setting('t.a'), current_setting('t.b')]::uuid[], date '2026-12-01') = 1, 'só reprograma o que está em aberto');
select pg_temp.ok((select vencimento = '2026-12-01' from agendamentos where id = current_setting('t.a')::uuid), 'novo vencimento gravado');

-- Lixeira
select pg_temp.ok(excluir_titulos(array[current_setting('t.a'), current_setting('t.d')]::uuid[]) = 2, 'exclui dois títulos');
select pg_temp.ok((select bool_and(status = 'cancelado') from agendamentos where id in (current_setting('t.a')::uuid, current_setting('t.d')::uuid)), 'excluídos vão para a lixeira');
select pg_temp.espera_erro(format($$select editar_titulo(%L, 'x', null, null, null, null, null, null)$$, current_setting('t.a')), 'Restaure');
select pg_temp.ok(restaurar_titulos(array[current_setting('t.a')]::uuid[]) = 1, 'restaura da lixeira');
select pg_temp.ok((select status = 'aberto' from agendamentos where id = current_setting('t.a')::uuid), 'restaurado volta a aberto');

-- Perda
select pg_temp.espera_erro(format($$select marcar_perda(array[%L]::uuid[])$$, current_setting('t.a')), 'Só contas a receber');
select pg_temp.ok(marcar_perda(array[current_setting('t.c')]::uuid[]) = 1, 'marca recebimento como perda');
select pg_temp.espera_erro(format($$insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents) values (%L, %L, %L, '2026-10-20', 100)$$,
  current_setting('t.emp'), current_setting('t.c'), current_setting('t.conta')), 'não aceita baixa');
select pg_temp.ok(restaurar_titulos(array[current_setting('t.c')]::uuid[]) = 1, 'perda também se desfaz');

-- Quem só visualiza não mexe
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '99a70000-0000-0000-0000-0000000000a2', 'visualizacao');
set role authenticated;
set request.jwt.claim.sub = '99a70000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format($$select excluir_titulos(array[%L]::uuid[])$$, current_setting('t.a')), 'não tem permissão');
select pg_temp.espera_erro(format($$select reprogramar_titulos(array[%L]::uuid[], '2027-01-01')$$, current_setting('t.a')), 'não tem permissão');
select pg_temp.espera_erro(format($$select editar_titulo(%L, 'x', null, null, null, null, null, null)$$, current_setting('t.a')), 'não tem permissão');
select pg_temp.espera_erro(format($$select estornar_baixas(%L)$$, current_setting('t.b')), 'não tem permissão');
select pg_temp.espera_erro(format($$select duplicar_titulo(%L, '2027-01-10')$$, current_setting('t.a')), 'row-level security');

-- Outra empresa não alcança
set request.jwt.claim.sub = '99a70000-0000-0000-0000-0000000000a1';
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('99a70000-0000-0000-0000-0000000000a3', 'outro@acoes.com', now());
set role authenticated;
set request.jwt.claim.sub = '99a70000-0000-0000-0000-0000000000a3';
select criar_empresa('96555666000188', 'Outra Piscicultura Ltda');
select pg_temp.espera_erro(format($$select excluir_titulos(array[%L]::uuid[])$$, current_setting('t.a')), 'não tem permissão');
select pg_temp.espera_erro(format($$select duplicar_titulo(%L, '2027-01-10')$$, current_setting('t.a')), 'não encontrado');
reset role;
select pg_temp.ok((select status = 'aberto' and vencimento = '2026-12-01' from agendamentos where id = current_setting('t.a')::uuid), 'título intacto');

\echo TESTES DE AÇÕES EM TÍTULOS PASSARAM
