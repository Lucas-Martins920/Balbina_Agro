-- Chat do app de campo (/api/chat/manejo): cada pergunta conta no uso de IA da empresa, com limite próprio,
-- separado do limite das leituras (boleto, nota e mortes por foto).
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
  ('c4a70000-0000-0000-0000-000000000001', 'dono@chatcampo.com', now()),
  ('c4a70000-0000-0000-0000-000000000002', 'outro@chatcampo.com', now());

set role authenticated;
set request.jwt.claim.sub = 'c4a70000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('61427385000190', 'Piscicultura Chat do Campo Ltda')::text, false);

select pg_temp.ok((select ia_chat_limite_mes = 300 from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid)
                  or not exists (select 1 from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid),
  'limite padrão do chat é 300 perguntas por mês');
insert into automacoes_empresa (empresa_id, ia_limite_mes, ia_chat_limite_mes) values (current_setting('t.emp')::uuid, 1, 2)
on conflict (empresa_id) do update set ia_limite_mes = 1, ia_chat_limite_mes = 2;

-- o chat tem o limite dele
select pg_temp.ok(registrar_uso_ia(current_setting('t.emp')::uuid, 'chat') = 1, 'primeira pergunta ao chat, sobra uma');
select pg_temp.ok(registrar_uso_ia(current_setting('t.emp')::uuid, 'chat') = 0, 'segunda pergunta, acabou');
select pg_temp.espera_erro($$select registrar_uso_ia(current_setting('t.emp')::uuid, 'chat')$$, 'perguntas ao chat do campo deste mês');

-- e não come o limite das leituras, nem as leituras comem o dele
select pg_temp.ok(registrar_uso_ia(current_setting('t.emp')::uuid, 'documento') = 0, 'leitura de documento ainda cabe');
select pg_temp.espera_erro($$select registrar_uso_ia(current_setting('t.emp')::uuid, 'mortalidade')$$, 'leituras por IA deste mês');
select pg_temp.ok((select count(*) = 3 from ia_uso where empresa_id = current_setting('t.emp')::uuid), 'três usos anotados');
select pg_temp.ok((select count(*) = 2 from ia_uso where empresa_id = current_setting('t.emp')::uuid and tipo = 'chat'), 'dois do chat');

-- zero desliga o chat com IA
update automacoes_empresa set ia_chat_limite_mes = 0 where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.espera_erro($$select registrar_uso_ia(current_setting('t.emp')::uuid, 'chat')$$, 'chat do campo');
select pg_temp.espera_erro($$update automacoes_empresa set ia_chat_limite_mes = 6000 where empresa_id = current_setting('t.emp')::uuid$$, 'ia_chat_limite_mes');

-- outra pessoa não anota uso na empresa dos outros
set request.jwt.claim.sub = 'c4a70000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$select registrar_uso_ia(current_setting('t.emp')::uuid, 'chat')$$, 'não encontrada');

reset role;
\o
\echo 'TESTES DO CHAT DO CAMPO (USO DE IA) PASSARAM'
