-- Automações do financeiro: lançar pelo histórico (C1), regras sugeridas (C2) e recorrências sugeridas (C6).
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('a0f00000-0000-0000-0000-000000000001', 'dono@autofin.com', now()),
  ('a0f00000-0000-0000-0000-000000000002', 'estranho@autofin.com', now());

set role authenticated;
set request.jwt.claim.sub = 'a0f00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('80808080000145', 'Piscicultura Autofin Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('a0f00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, current_date - 400);
select set_config('t.energia', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Energia elétrica'), false);
select set_config('t.milho', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);

-- extrato: energia 3 vezes, milho/energia misturados no "PIX ZE", um Pix único
select importar_extrato('a0f00000-0000-0000-0000-0000000000b1', 'ofx', jsonb_build_array(
  jsonb_build_object('id_externo', 'E1', 'data', current_date - 60, 'descricao', 'DEB AUT ENERGIA 0823', 'valor_cents', -30000),
  jsonb_build_object('id_externo', 'E2', 'data', current_date - 30, 'descricao', 'DEB AUT ENERGIA 0923', 'valor_cents', -31000),
  jsonb_build_object('id_externo', 'E3', 'data', current_date - 1, 'descricao', 'DEB AUT ENERGIA 1023', 'valor_cents', -32000),
  jsonb_build_object('id_externo', 'Z1', 'data', current_date - 20, 'descricao', 'PIX ZE', 'valor_cents', -5000),
  jsonb_build_object('id_externo', 'Z2', 'data', current_date - 10, 'descricao', 'PIX ZE', 'valor_cents', -6000),
  jsonb_build_object('id_externo', 'Z3', 'data', current_date - 2, 'descricao', 'PIX ZE', 'valor_cents', -7000),
  jsonb_build_object('id_externo', 'U1', 'data', current_date - 9, 'descricao', 'PIX UNICO', 'valor_cents', -1000),
  jsonb_build_object('id_externo', 'U2', 'data', current_date - 1, 'descricao', 'PIX UNICO', 'valor_cents', -1100)
));
select set_config('t.' || lower(id_externo), id::text, false) from movimentos_bancarios where conta_id = 'a0f00000-0000-0000-0000-0000000000b1';

select conciliar_criando_titulo(current_setting('t.e1')::uuid, current_setting('t.energia')::uuid);
select conciliar_criando_titulo(current_setting('t.e2')::uuid, current_setting('t.energia')::uuid);
select conciliar_criando_titulo(current_setting('t.z1')::uuid, current_setting('t.milho')::uuid);
select conciliar_criando_titulo(current_setting('t.z2')::uuid, current_setting('t.energia')::uuid);
select conciliar_criando_titulo(current_setting('t.u1')::uuid, current_setting('t.milho')::uuid);

-- C1
create temp table pf as select * from palpites_firmes('a0f00000-0000-0000-0000-0000000000b1');
select pg_temp.ok((select count(*) = 1 from pf), 'só um palpite firme');
select pg_temp.ok((select movimento_id = current_setting('t.e3')::uuid and categoria_id = current_setting('t.energia')::uuid and vezes = 2 from pf),
  'energia: duas vezes na mesma categoria, mesmo com números diferentes na descrição');
select pg_temp.ok(not exists (select 1 from pf where movimento_id = current_setting('t.z3')::uuid), 'histórico dividido entre categorias não é firme');
select pg_temp.ok(not exists (select 1 from pf where movimento_id = current_setting('t.u2')::uuid), 'uma vez só não é firme');

-- com título aberto que serve, vai pela sugestão e não vira título novo
select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Energia outubro', current_date - 1, current_date,
  32000, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.energia'), 'valor_cents', 32000)));
select pg_temp.ok(not exists (select 1 from palpites_firmes('a0f00000-0000-0000-0000-0000000000b1')), 'título aberto do mesmo valor tira o palpite firme');
update agendamentos set status = 'cancelado' where descricao = 'Energia outubro';

select pg_temp.ok(lancar_pelo_historico('a0f00000-0000-0000-0000-0000000000b1') = 1, 'lança em lote os palpites firmes');
select pg_temp.ok((select m.status = 'conciliado' and c.modo = 'lote' from movimentos_bancarios m join conciliacoes c on c.movimento_id = m.id
  where m.id = current_setting('t.e3')::uuid), 'energia conciliada em lote');
select pg_temp.ok((select r.categoria_id = current_setting('t.energia')::uuid from conciliacoes c join baixas b on b.id = c.baixa_id
  join agendamento_rateios r on r.agendamento_id = b.agendamento_id where c.movimento_id = current_setting('t.e3')::uuid), 'na categoria do histórico');

-- C2
create temp table rs as select * from regras_sugeridas(current_setting('t.emp')::uuid);
select pg_temp.ok((select count(*) = 1 from rs), 'uma regra sugerida');
select pg_temp.ok((select tipo = 'pagamento' and categoria_id = current_setting('t.energia')::uuid and vezes = 3 and descricao = 'DEB AUT ENERGIA 1023' from rs),
  'energia, 3 vezes, com a descrição mais recente');
insert into sugestoes_dispensadas (empresa_id, tipo, chave) select current_setting('t.emp')::uuid, 'regra', chave from rs;
select pg_temp.ok(not exists (select 1 from regras_sugeridas(current_setting('t.emp')::uuid)), 'dispensada não volta');
delete from sugestoes_dispensadas;
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Energia', '[{"campo":"descricao","operador":"comeca_com","valor":"DEB AUT ENERGIA"}]'::jsonb,
  p_categoria => current_setting('t.energia')::uuid);
select pg_temp.ok(not exists (select 1 from regras_sugeridas(current_setting('t.emp')::uuid)), 'com a regra criada a sugestão some');

-- C6: internet todo mês (valor parecido); ração 2 vezes por mês não é recorrência
insert into contatos (id, empresa_id, nome, tipos) values
  ('a0f00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Provedor Net', '{fornecedor}'),
  ('a0f00000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, 'Cerealista', '{fornecedor}');
select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Internet', (date_trunc('month', current_date) - make_interval(months => i) + interval '9 days')::date,
  (date_trunc('month', current_date) - make_interval(months => i))::date, 19900 + i * 100,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.energia'), 'valor_cents', 19900 + i * 100)), 'a0f00000-0000-0000-0000-0000000000c1')
from generate_series(0, 3) i;
select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho', (date_trunc('month', current_date) - make_interval(months => i / 2) + make_interval(days => (i % 2) * 14))::date,
  (date_trunc('month', current_date) - make_interval(months => i / 2))::date, 500000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.milho'), 'valor_cents', 500000)), 'a0f00000-0000-0000-0000-0000000000c2')
from generate_series(0, 7) i;

create temp table rec as select * from recorrencias_sugeridas(current_setting('t.emp')::uuid);
select pg_temp.ok((select count(*) = 1 from rec where contato_id is not null), 'só a internet vira sugestão (compra de milho 2x por mês não)');
select pg_temp.ok((select tipo = 'pagar' and meses = 4 and dia = 10 and valor_cents between 19900 and 20200 and contato_nome = 'Provedor Net'
  and proximo = (date_trunc('month', current_date) + interval '1 month' + interval '9 days')::date
  from rec where contato_id = 'a0f00000-0000-0000-0000-0000000000c1'), 'internet: 4 meses, dia 10, valor do meio');
select criar_recorrencia(current_setting('t.emp')::uuid, 'pagar', 'Internet fibra', 20000, 'mensal', current_date,
  current_setting('t.energia')::uuid, null, 'a0f00000-0000-0000-0000-0000000000c1');
select pg_temp.ok(not exists (select 1 from recorrencias_sugeridas(current_setting('t.emp')::uuid) where contato_id = 'a0f00000-0000-0000-0000-0000000000c1'),
  'com a recorrência criada a sugestão some');

-- isolamento
set request.jwt.claim.sub = 'a0f00000-0000-0000-0000-000000000002';
select pg_temp.ok(not exists (select 1 from regras_sugeridas(current_setting('t.emp')::uuid))
  and not exists (select 1 from recorrencias_sugeridas(current_setting('t.emp')::uuid))
  and not exists (select 1 from palpites_firmes('a0f00000-0000-0000-0000-0000000000b1')), 'quem é de fora não vê nada');
reset role;

\o
\echo 'TESTES DAS AUTOMAÇÕES DO FINANCEIRO PASSARAM'
