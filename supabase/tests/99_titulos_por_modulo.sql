-- Títulos por módulo: cargos de campo (fábrica de ração, gerente da piscicultura) e o caixa do PDV não mexem nas
-- contas a pagar/receber do financeiro pela API; só no que eles mesmos lançaram ou no que nasceu do módulo.
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

-- quantas linhas o comando alterou (o RLS de update/delete esconde a linha em vez de dar erro)
create or replace function pg_temp.linhas(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- m = master, r = fábrica de ração, g = gerente da piscicultura, c = caixa, f = financeiro, p = tratador
insert into auth.users (id, email, email_confirmed_at) values
  ('9cc00000-0000-0000-0000-0000000000a1', 'm@titulos.com', now()),
  ('9cc00000-0000-0000-0000-0000000000a2', 'r@titulos.com', now()),
  ('9cc00000-0000-0000-0000-0000000000a3', 'g@titulos.com', now()),
  ('9cc00000-0000-0000-0000-0000000000a4', 'c@titulos.com', now()),
  ('9cc00000-0000-0000-0000-0000000000a5', 'f@titulos.com', now()),
  ('9cc00000-0000-0000-0000-0000000000a6', 'p@titulos.com', now());

set role authenticated;
set request.jwt.claim.sub = '9cc00000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('98200000000130', 'Piscicultura Títulos Ltda')::text, false);
select convidar_usuario(current_setting('t.emp')::uuid, 'r@titulos.com', 'fabrica_racao');
select convidar_usuario(current_setting('t.emp')::uuid, 'g@titulos.com', 'gerente_piscicultura');
select convidar_usuario(current_setting('t.emp')::uuid, 'c@titulos.com', 'caixa');
select convidar_usuario(current_setting('t.emp')::uuid, 'f@titulos.com', 'financeiro');
select convidar_usuario(current_setting('t.emp')::uuid, 'p@titulos.com', 'tratador');

select set_config('t.saida', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid
  and sentido = 'saida' and not exists (select 1 from categorias f where f.parent_id = categorias.id) order by nome limit 1), false);
select set_config('t.entrada', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid
  and sentido = 'entrada' and not exists (select 1 from categorias f where f.parent_id = categorias.id) order by nome limit 1), false);
select set_config('t.conta', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid limit 1), false);

-- O master lança uma conta de energia e um recebimento avulso
select set_config('t.energia', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Energia', current_date, current_date, 50000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.saida'), 'valor_cents', 50000)))::text, false);
select set_config('t.aluguel', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Aluguel do pasto', current_date, current_date, 30000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.entrada'), 'valor_cents', 30000)))::text, false);

-- Fábrica de ração
set request.jwt.claim.sub = '9cc00000-0000-0000-0000-0000000000a2';
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'contas-a-pagar.editar'), 'fábrica de ração não tem contas a pagar');
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set descricao = 'mexido' where id = %L$$, current_setting('t.energia'))) = 0,
  'fábrica de ração não altera a conta de energia pela API');
select pg_temp.ok(pg_temp.linhas(format($$delete from agendamentos where id = %L$$, current_setting('t.energia'))) = 0,
  'fábrica de ração não apaga a conta de energia');
select pg_temp.espera_erro(format($$insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents) values (%L, %L, %L, current_date, 50000)$$,
  current_setting('t.emp'), current_setting('t.energia'), current_setting('t.conta')), 'row-level security');
select pg_temp.espera_erro(format($$select reprogramar_titulos(array[%L]::uuid[], current_date + 30)$$, current_setting('t.energia')), 'permiss');
-- a compra que ela mesma lança continua funcionando
select set_config('t.milho', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho', current_date, current_date, 80000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.saida'), 'valor_cents', 80000)))::text, false);
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set descricao = 'Milho 30 t' where id = %L$$, current_setting('t.milho'))) = 1,
  'fábrica de ração corrige a compra que ela mesma lançou');
select pg_temp.espera_erro(format($$update agendamentos set created_by = '9cc00000-0000-0000-0000-0000000000a1' where id = %L$$,
  current_setting('t.milho')), 'Só o financeiro muda quem lançou');

-- Gerente da piscicultura
set request.jwt.claim.sub = '9cc00000-0000-0000-0000-0000000000a3';
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set valor_cents = 1 where id = %L$$, current_setting('t.energia'))) = 0,
  'gerente da piscicultura não altera a conta de energia');
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set descricao = 'mexido' where id = %L$$, current_setting('t.milho'))) = 0,
  'gerente da piscicultura não altera a compra lançada por outra pessoa');

-- Caixa do PDV
set request.jwt.claim.sub = '9cc00000-0000-0000-0000-0000000000a4';
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set valor_cents = 1 where id = %L$$, current_setting('t.aluguel'))) = 0,
  'caixa não altera o recebimento avulso');
select pg_temp.espera_erro(format($$insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents) values (%L, %L, %L, current_date, 30000)$$,
  current_setting('t.emp'), current_setting('t.aluguel'), current_setting('t.conta')), 'row-level security');

-- O financeiro continua mexendo em tudo
set request.jwt.claim.sub = '9cc00000-0000-0000-0000-0000000000a5';
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set descricao = 'Energia outubro' where id = %L$$, current_setting('t.energia'))) = 1,
  'financeiro altera a conta de energia');
select pg_temp.ok(pg_temp.linhas(format($$update agendamentos set descricao = 'Milho conferido' where id = %L$$, current_setting('t.milho'))) = 1,
  'financeiro altera a compra da fábrica de ração');

reset role;
\echo TESTES DE TITULOS POR MODULO PASSARAM
