-- Rate limit da API pública no banco: incrementa chamadas por chave/minuto e trava acima do limite.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Cria empresa e chave mínimas para o teste.
insert into auth.users (id, email, email_confirmed_at) values
  ('99f00000-0000-0000-0000-000000000001', 'rl@api.com', now());

set role authenticated;
set request.jwt.claims = '{"aal": "aal2"}';
set request.jwt.claim.sub = '99f00000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('99887766000155', 'Piscicultura Rate Limit')::text, false);
select set_config('t.chave', criar_chave_api(current_setting('t.emp')::uuid, 'RL', array['vendas.ver'], md5('rate-limit') || md5('rate-limit-2'), 'balbina_rl')::text, false);
reset role;

-- Primeira chamada: dentro do limite.
select pg_temp.ok(
  public.api_dentro_do_limite(current_setting('t.chave')::uuid, 300),
  'primeira chamada dentro do limite');

-- Simula estourar o limite: insere 299 chamadas no minuto atual (já tem 1 da linha acima).
update app.api_rate_limit
   set chamadas = 300
 where chave_id = current_setting('t.chave')::uuid;

-- A próxima chamada (chamada 301) deve estourar.
select pg_temp.ok(
  not public.api_dentro_do_limite(current_setting('t.chave')::uuid, 300),
  'chamada acima do limite bloqueada');

-- Limpar linhas antigas funciona.
delete from app.api_rate_limit where chave_id = current_setting('t.chave')::uuid;
insert into app.api_rate_limit (chave_id, minuto, chamadas)
values (current_setting('t.chave')::uuid, 0, 5);
select app.api_rate_limit_limpar();
select pg_temp.ok(
  not exists (select 1 from app.api_rate_limit where minuto = 0),
  'limpeza remove linhas antigas');

-- RLS: anon e authenticated não acessam a tabela nem a função.
set role authenticated;
set request.jwt.claims = '{"aal": "aal2"}';
set request.jwt.claim.sub = '99f00000-0000-0000-0000-000000000001';

do $$
begin
  perform public.api_dentro_do_limite('99f00000-0000-0000-0000-000000000001'::uuid, 300);
  raise exception 'FALHOU: authenticated não deveria chamar api_dentro_do_limite';
exception when insufficient_privilege then null;
end $$;

do $$
begin
  perform * from app.api_rate_limit;
  raise exception 'FALHOU: authenticated não deveria acessar app.api_rate_limit';
exception when insufficient_privilege then null;
end $$;

reset role;

do $$ begin raise notice 'ok - rate limit no banco funciona'; end $$;
