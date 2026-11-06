-- Conciliação múltipla: um movimento do extrato casa com vários títulos.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if; raise notice 'ok - %', p_msg; end $$;

-- Empresa, conta, usuário.
insert into auth.users (id, email, email_confirmed_at) values
  ('99d00000-0000-0000-0000-000000000001', 'multi@api.com', now());

set role authenticated;
set request.jwt.claims = '{"aal": "aal2"}';
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('73829100000164', 'Piscicultura Multi')::text, false);
reset role;

-- Conta bancária.
insert into contas_financeiras (id, empresa_id, nome, tipo, saldo_inicial_cents, saldo_inicial_data)
values ('99d00000-0000-0000-0000-000000000010', current_setting('t.emp')::uuid, 'Banco A', 'corrente', 0, '2026-01-01');

-- Categoria de saída.
insert into categorias (id, empresa_id, nome, sentido, grupo, ativa)
values ('99d00000-0000-0000-0000-000000000020', current_setting('t.emp')::uuid, 'Insumos', 'saida', 'custo_operacional', true);

-- Dois títulos a pagar.
set role authenticated;
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000001';

select set_config('t.tit1', agendar_titulo(
  current_setting('t.emp')::uuid, 'pagar', 'Fornecedor A', '2026-06-01', '2026-06-01', 5000,
  jsonb_build_array(jsonb_build_object('categoria_id', '99d00000-0000-0000-0000-000000000020', 'valor_cents', 5000)), null)::text, false);
select set_config('t.tit2', agendar_titulo(
  current_setting('t.emp')::uuid, 'pagar', 'Fornecedor B', '2026-06-03', '2026-06-01', 3000,
  jsonb_build_array(jsonb_build_object('categoria_id', '99d00000-0000-0000-0000-000000000020', 'valor_cents', 3000)), null)::text, false);

reset role;

-- Movimento do extrato (pagamento de R$ 80,00 = 5000 + 3000).
insert into movimentos_bancarios (id, empresa_id, conta_id, data, descricao, valor_cents, status, id_externo)
values ('99d00000-0000-0000-0000-000000000030', current_setting('t.emp')::uuid,
        '99d00000-0000-0000-0000-000000000010', '2026-06-02', 'PIX fornecedores', -8000, 'pendente', 'MULTI-1');

-- Concilia com os dois de uma vez.
set role authenticated;
set request.jwt.claim.sub = '99d00000-0000-0000-0000-000000000001';

select pg_temp.ok(
  (select array_length(conciliar_multiplos(
    '99d00000-0000-0000-0000-000000000030',
    array[current_setting('t.tit1')::uuid, current_setting('t.tit2')::uuid],
    'multipla'), 1)) = 2,
  'conciliou com 2 títulos');

select pg_temp.ok(
  (select status from movimentos_bancarios where id = '99d00000-0000-0000-0000-000000000030') = 'conciliado',
  'movimento ficou conciliado');

select pg_temp.ok(
  (select count(*) from conciliacoes where movimento_id = '99d00000-0000-0000-0000-000000000030') = 2,
  'duas conciliações criadas');

-- Desconciliar volta tudo.
select desconciliar('99d00000-0000-0000-0000-000000000030', 'teste');

select pg_temp.ok(
  (select status from movimentos_bancarios where id = '99d00000-0000-0000-0000-000000000030') = 'pendente',
  'desconciliar voltou a pendente');

select pg_temp.ok(
  (select count(*) from conciliacoes where movimento_id = '99d00000-0000-0000-0000-000000000030') = 0,
  'conciliações apagadas');

-- Conciliação parcial: concilia só um título pela múltipla, fica 'parcial'.
-- (conciliar_com_titulo segue 1:1: a diferença vira juros e o movimento fica conciliado.)
select conciliar_multiplos('99d00000-0000-0000-0000-000000000030', array[current_setting('t.tit1')::uuid], 'multipla');

select pg_temp.ok(
  (select status from movimentos_bancarios where id = '99d00000-0000-0000-0000-000000000030') = 'parcial',
  'conciliar um título de dois deixa parcial');

-- Concilia o segundo no movimento parcial, fica 'conciliado'.
select conciliar_multiplos('99d00000-0000-0000-0000-000000000030', array[current_setting('t.tit2')::uuid], 'multipla');

select pg_temp.ok(
  (select status from movimentos_bancarios where id = '99d00000-0000-0000-0000-000000000030') = 'conciliado',
  'segundo título completa a conciliação');

reset role;

do $$ begin raise notice 'ok - conciliação múltipla funciona'; end $$;
