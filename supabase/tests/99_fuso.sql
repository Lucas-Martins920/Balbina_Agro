-- "Hoje" no fuso de cada empresa (padrão America/Manaus), nunca no UTC do servidor.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('99f00000-0000-0000-0000-0000000000f1', 'dono@fuso.com', now());

set role authenticated;
set request.jwt.claim.sub = '99f00000-0000-0000-0000-0000000000f1';
set request.jwt.claims = '{"aal": "aal2"}';
select set_config('t.emp', criar_empresa('96444555000166', 'Piscicultura Fuso Ltda')::text, false);
select pg_temp.ok((select fuso = 'America/Manaus' from empresas where id = current_setting('t.emp')::uuid), 'empresa nova usa o fuso de Manaus');
select pg_temp.ok(app.hoje(current_setting('t.emp')::uuid) = (now() at time zone 'America/Manaus')::date, 'hoje é a data de Manaus');

-- Kiritimati (UTC+14) e Pago Pago (UTC-11) estão sempre em dias diferentes
select set_config('t.ontem', ((now() at time zone 'Pacific/Pago_Pago')::date)::text, false);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'entrada' and parent_id is null limit 1), false);
select set_config('t.tit', agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe', current_setting('t.ontem')::date,
  date_trunc('month', current_setting('t.ontem')::date)::date, 1000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 1000)))::text, false);

reset role;
update empresas set fuso = 'Pacific/Pago_Pago' where id = current_setting('t.emp')::uuid;
set role authenticated;
select pg_temp.ok((select situacao = 'aberto' from titulos where id = current_setting('t.tit')::uuid), 'vence hoje no fuso da empresa: ainda em aberto');

reset role;
update empresas set fuso = 'Pacific/Kiritimati' where id = current_setting('t.emp')::uuid;
set role authenticated;
select pg_temp.ok((select situacao = 'vencido' from titulos where id = current_setting('t.tit')::uuid), 'onde já é amanhã, o mesmo título está vencido');
select pg_temp.ok(app.hoje(current_setting('t.emp')::uuid) = (now() at time zone 'Pacific/Kiritimati')::date, 'hoje segue o fuso trocado');

reset role;
do $$ begin
  update empresas set fuso = 'Amazonia/Inexistente' where id = current_setting('t.emp')::uuid;
  raise exception 'FALHOU: aceitou fuso inválido';
exception when invalid_parameter_value then raise notice 'ok - fuso inválido é recusado';
end $$;
reset request.jwt.claims;

\echo TESTES DE FUSO PASSARAM
