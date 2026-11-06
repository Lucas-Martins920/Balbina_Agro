-- Recorrências renovadas por rotina diária no banco (pg_cron), não mais a cada abertura de tela.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('7ecc0000-0000-0000-0000-0000000000a1', 'a@reccron.com', now()),
  ('7ecc0000-0000-0000-0000-0000000000a2', 'b@reccron.com', now());

set role authenticated;
set request.jwt.claim.sub = '7ecc0000-0000-0000-0000-0000000000a1';
select set_config('t.ea', criar_empresa('98300000000110', 'Piscicultura Recorrência A Ltda')::text, false);
select set_config('t.ra', criar_recorrencia(current_setting('t.ea')::uuid, 'pagar', 'Energia', 50000, 'mensal',
  date_trunc('month', current_date)::date,
  (select id from categorias where empresa_id = current_setting('t.ea')::uuid and sentido = 'saida' and parent_id is null limit 1))::text, false);
set request.jwt.claim.sub = '7ecc0000-0000-0000-0000-0000000000a2';
select set_config('t.eb', criar_empresa('98300000000220', 'Piscicultura Recorrência B Ltda')::text, false);
select set_config('t.rb', criar_recorrencia(current_setting('t.eb')::uuid, 'receber', 'Contrato de peixe', 90000, 'mensal',
  date_trunc('month', current_date)::date,
  (select id from categorias where empresa_id = current_setting('t.eb')::uuid and sentido = 'entrada' and parent_id is null limit 1))::text, false);

-- usuário comum não roda a rotina de todas as empresas
do $$ begin
  perform app.gerar_recorrencias_todas();
  raise exception 'FALHOU: authenticated rodou a rotina de todas as empresas';
exception when insufficient_privilege then raise notice 'ok - rotina de todas as empresas fechada para usuário';
end $$;
reset role;

-- o tempo passa: some o último título do horizonte de cada empresa
delete from agendamentos where id in (
  select distinct on (recorrencia_id) id from agendamentos
  where recorrencia_id in (current_setting('t.ra')::uuid, current_setting('t.rb')::uuid)
  order by recorrencia_id, vencimento desc);
select pg_temp.ok((select count(*) from agendamentos where recorrencia_id = current_setting('t.ra')::uuid) = 12, 'horizonte da empresa A ficou com um título a menos');

select pg_temp.ok(app.gerar_recorrencias_todas() = 2, 'rotina diária repõe um título em cada empresa');
select pg_temp.ok((select count(*) from agendamentos where recorrencia_id = current_setting('t.ra')::uuid) = 13, 'empresa A de volta a 13 títulos');
select pg_temp.ok((select count(*) from agendamentos where recorrencia_id = current_setting('t.rb')::uuid) = 13, 'empresa B de volta a 13 títulos');
select pg_temp.ok(app.gerar_recorrencias_todas() = 0, 'rodar de novo não duplica');

\o
\echo 'TESTES DAS RECORRÊNCIAS NO CRON PASSARAM'
