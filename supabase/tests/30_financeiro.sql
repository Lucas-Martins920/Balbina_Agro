-- Marco 2a: recorrências, transferências e saldos de contas.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select set_config('t.emp', criar_empresa('11222333000144', 'Piscicultura D Ltda')::text, false);
select set_config('t.caixa', (select id::text from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa da piscicultura'), false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('d0000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'corrente', 'Banco', 100000, current_date - 10);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null limit 1), false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);

-- Recorrência mensal desde dois meses atrás: gera até hoje + 12 meses
select set_config('t.r', criar_recorrencia(current_setting('t.emp')::uuid, 'pagar', 'Energia', 50000, 'mensal',
  (date_trunc('month', current_date) - interval '2 months')::date, current_setting('t.desp')::uuid)::text, false);
select pg_temp.ok((select count(*) from agendamentos where recorrencia_id = current_setting('t.r')::uuid) = 15, 'recorrência mensal gera 15 títulos (2 passados + atual + 12)');
select pg_temp.ok(gerar_recorrencias(current_setting('t.emp')::uuid) = 0, 'gerar de novo não duplica');
select pg_temp.ok((select bool_and(s.valor_cents = 50000) from agendamentos a
  join (select agendamento_id, sum(valor_cents) valor_cents from agendamento_rateios group by 1) s on s.agendamento_id = a.id
  where a.recorrencia_id = current_setting('t.r')::uuid), 'cada título da recorrência tem rateio completo');
select pg_temp.ok((select bool_and(competencia = date_trunc('month', vencimento)::date) from agendamentos where recorrencia_id = current_setting('t.r')::uuid), 'competência = mês do vencimento');

-- Fim de mês: 31/jan + 1 mês cai em 28/fev
select set_config('t.r2', criar_recorrencia(current_setting('t.emp')::uuid, 'receber', 'Aluguel do pasto', 30000, 'mensal',
  '2027-01-31', current_setting('t.rec')::uuid, null, null, '2027-03-31')::text, false);
select pg_temp.ok((select array_agg(vencimento order by vencimento) from agendamentos where recorrencia_id = current_setting('t.r2')::uuid)
  = array['2027-01-31','2027-02-28','2027-03-31']::date[], 'vencimento de fim de mês respeita meses curtos e o término');

-- Encerrar cancela só os futuros em aberto
select pg_temp.ok(encerrar_recorrencia(current_setting('t.r')::uuid, (date_trunc('month', current_date) + interval '1 month')::date) = 12, 'encerrar cancela os 12 títulos futuros');
select pg_temp.ok((select count(*) from agendamentos where recorrencia_id = current_setting('t.r')::uuid and status = 'aberto') = 3, 'títulos até o mês atual continuam abertos');
select pg_temp.ok(gerar_recorrencias(current_setting('t.emp')::uuid) = 0, 'recorrência encerrada não gera mais');

-- Saldos: baixa de pagamento, recebimento e transferência
insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, juros_cents)
select current_setting('t.emp')::uuid, id, 'd0000000-0000-0000-0000-000000000001', current_date, 50000, 1000
from agendamentos where recorrencia_id = current_setting('t.r')::uuid order by vencimento limit 1;
insert into transferencias (empresa_id, conta_origem_id, conta_destino_id, data, valor_cents)
values (current_setting('t.emp')::uuid, 'd0000000-0000-0000-0000-000000000001', current_setting('t.caixa')::uuid, current_date, 20000);
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = 'd0000000-0000-0000-0000-000000000001') = 100000 - 51000 - 20000, 'saldo do banco desconta pagamento com juros e transferência');
select pg_temp.ok((select saldo_cents from saldos_contas where conta_id = current_setting('t.caixa')::uuid) = 20000, 'saldo do caixa recebe a transferência');
select pg_temp.ok((select count(*) from movimentos_caixa where empresa_id = current_setting('t.emp')::uuid) = 3, 'movimentos de caixa: uma baixa e duas pernas da transferência');

-- Desconto maior que o pago faria a baixa sair do caixa no sentido contrário
do $$ begin
  insert into baixas (empresa_id, agendamento_id, conta_id, data, valor_cents, desconto_cents)
  select current_setting('t.emp')::uuid, id, 'd0000000-0000-0000-0000-000000000001', current_date, 1000, 5000
  from agendamentos where recorrencia_id = current_setting('t.r')::uuid and status = 'aberto' order by vencimento limit 1;
  raise exception 'FALHOU: aceitou desconto maior que o valor';
exception when check_violation then raise notice 'ok - desconto maior que o valor da baixa é recusado';
end $$;

-- Isolamento
set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from saldos_contas where empresa_id = current_setting('t.emp')::uuid) = 0, 'saldos isolados por empresa');
select pg_temp.ok((select count(*) from movimentos_caixa where empresa_id = current_setting('t.emp')::uuid) = 0, 'movimentos isolados por empresa');

reset role;
\o
\echo 'TESTES DO MARCO 2a PASSARAM'
