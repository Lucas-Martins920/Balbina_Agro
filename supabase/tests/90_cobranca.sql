-- Marco 5c: cobrança pelo Asaas e baixa pelo webhook.
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
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select set_config('t.emp', criar_empresa('88999000000122', 'Piscicultura T Ltda')::text, false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null limit 1), false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_data) values
  ('a9000000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'corrente', 'Asaas', '2026-01-01');
insert into perfis_cobranca (id, empresa_id, nome, provedor, conta_repasse_id) values
  ('a9000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'Asaas', 'asaas', 'a9000000-0000-0000-0000-0000000000a1');
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj) values
  ('a9000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado T', '12312312000199'),
  ('a9000000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{cliente}', 'Feirante sem documento', null);

select set_config('t.tit', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 7', current_date - 3, date_trunc('month', current_date)::date, 54000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 54000)), 'a9000000-0000-0000-0000-0000000000c1')::text, false);
select set_config('t.cob', preparar_cobranca(current_setting('t.tit')::uuid, 'a9000000-0000-0000-0000-0000000000b1')::text, false);
select pg_temp.ok((select vencimento = current_date and valor_cents = 54000 and status = 'processando' from cobrancas where id = current_setting('t.cob')::uuid),
  'título vencido é cobrado com vencimento hoje e o saldo em aberto');
select pg_temp.espera_erro(format($$select preparar_cobranca(%L, 'a9000000-0000-0000-0000-0000000000b1')$$, current_setting('t.tit')), 'já tem uma cobrança');

select set_config('t.sem', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe feira', current_date, date_trunc('month', current_date)::date, 1000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 1000)), 'a9000000-0000-0000-0000-0000000000c2')::text, false);
select pg_temp.espera_erro(format($$select preparar_cobranca(%L, 'a9000000-0000-0000-0000-0000000000b1')$$, current_setting('t.sem')), 'CPF ou CNPJ');
select set_config('t.pag', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho', current_date, date_trunc('month', current_date)::date, 1000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 1000)))::text, false);
select pg_temp.espera_erro(format($$select preparar_cobranca(%L, 'a9000000-0000-0000-0000-0000000000b1')$$, current_setting('t.pag')), 'Só contas a receber');

-- o app grava o retorno do Asaas
update cobrancas set status = 'emitida', id_externo = 'pay_123', url_pdf = 'https://exemplo' where id = current_setting('t.cob')::uuid;
select pg_temp.espera_erro($$select baixar_cobranca('a9000000-0000-0000-0000-0000000000b1', 'pay_123', 54000, current_date)$$, 'permission denied');

-- webhook (service role)
reset role;
select pg_temp.ok(baixar_cobranca('a9000000-0000-0000-0000-0000000000b1', 'pay_123', 54500, current_date) = 'baixada', 'pagamento do webhook baixa o título');
select pg_temp.ok((select status from agendamentos where id = current_setting('t.tit')::uuid) = 'quitado', 'título quitado');
select pg_temp.ok((select juros_cents = 500 and conta_id = 'a9000000-0000-0000-0000-0000000000a1' from baixas where agendamento_id = current_setting('t.tit')::uuid),
  'valor a maior vira juros, na conta de repasse');
select pg_temp.ok(baixar_cobranca('a9000000-0000-0000-0000-0000000000b1', 'pay_123', 54500, current_date) = 'ja_paga', 'webhook repetido não baixa de novo');
select pg_temp.ok((select count(*) from baixas where agendamento_id = current_setting('t.tit')::uuid) = 1, 'uma baixa só');
select pg_temp.ok(baixar_cobranca('a9000000-0000-0000-0000-0000000000b1', 'pay_999', 100, current_date) = 'desconhecida', 'cobrança de fora do sistema é ignorada');

set role authenticated;
update contatos set cpf_cnpj = '12345678901' where id = 'a9000000-0000-0000-0000-0000000000c2';
select pg_temp.ok(preparar_cobranca(current_setting('t.sem')::uuid, 'a9000000-0000-0000-0000-0000000000b1') is not null, 'cliente com CPF pode ser cobrado');

-- desconto de 2% até o vencimento: o cliente paga menos e o título quita
reset role;
update perfis_cobranca set desconto_ate_vencimento_percentual = 2 where id = 'a9000000-0000-0000-0000-0000000000b1';
set role authenticated;
select set_config('t.desc', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe pedido 8', current_date + 5, date_trunc('month', current_date)::date, 54000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 54000)), 'a9000000-0000-0000-0000-0000000000c1')::text, false);
select set_config('t.cobd', preparar_cobranca(current_setting('t.desc')::uuid, 'a9000000-0000-0000-0000-0000000000b1')::text, false);
update cobrancas set status = 'emitida', id_externo = 'pay_456' where id = current_setting('t.cobd')::uuid;
reset role;
select pg_temp.ok(baixar_cobranca('a9000000-0000-0000-0000-0000000000b1', 'pay_456', 52920, current_date) = 'baixada', 'pagamento com desconto é baixado');
select pg_temp.ok((select status from agendamentos where id = current_setting('t.desc')::uuid) = 'quitado', 'pagamento com o desconto do prazo quita o título');
select pg_temp.ok((select valor_cents = 54000 and desconto_cents = 1080 from baixas where agendamento_id = current_setting('t.desc')::uuid),
  'a diferença entra como desconto da baixa');
set role authenticated;

set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from cobrancas where empresa_id = current_setting('t.emp')::uuid) = 0, 'cobranças isoladas por empresa');
select pg_temp.espera_erro(format($$select preparar_cobranca(%L, 'a9000000-0000-0000-0000-0000000000b1')$$, current_setting('t.tit')), 'não encontrado');

reset role;
\o
\echo 'TESTES DO MARCO 5c PASSARAM'
