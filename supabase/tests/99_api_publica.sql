-- API pública: só o master cria chave e webhook, a chave autentica no servidor com os módulos do
-- plano, o que a API grava aparece com o nome da chave no histórico e os webhooks recebem os eventos.
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
  ('99e00000-0000-0000-0000-0000000000a1', 'dono@api.com', now()),
  ('99e00000-0000-0000-0000-0000000000a2', 'vendedor@api.com', now()),
  ('99e00000-0000-0000-0000-0000000000a3', 'outro@api.com', now());

set role authenticated;
set request.jwt.claims = '{"aal": "aal2"}';
set request.jwt.claim.sub = '99e00000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('96777888000155', 'Piscicultura API Ltda')::text, false);
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin) values (current_setting('t.emp')::uuid, '99e00000-0000-0000-0000-0000000000a2', 'vendedor', false);

-- master cria a chave; ninguém mais
set role authenticated;
select set_config('t.chave', criar_chave_api(current_setting('t.emp')::uuid, 'ERP do contador', array['contas-a-pagar.ver', 'contatos.editar', 'contatos.ver'],
  repeat('a', 64), 'balbina_abc')::text, false);
select pg_temp.ok((select escopos = array['contas-a-pagar.ver', 'contatos.editar', 'contatos.ver'] from api_chaves where id = current_setting('t.chave')::uuid),
  'master cria a chave e vê os escopos');
select pg_temp.ok((select expira_em = criada_em + interval '7 days' from api_chaves where id = current_setting('t.chave')::uuid), 'chave vale 7 dias');
select pg_temp.espera_erro($$select hash_sha256 from api_chaves$$, 'permission denied');
select pg_temp.espera_erro(format($$select criar_chave_api(%L, 'X', array['vendas.lançar'], %L, 'x')$$, current_setting('t.emp'), repeat('b', 64)), 'check constraint');
select pg_temp.espera_erro(format($$insert into api_chaves (empresa_id, nome, prefixo, hash_sha256, escopos) values (%L, 'X', 'x', %L, '{vendas.ver}')$$,
  current_setting('t.emp'), repeat('c', 64)), 'permission denied');

set request.jwt.claim.sub = '99e00000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format($$select criar_chave_api(%L, 'X', array['vendas.ver'], %L, 'x')$$, current_setting('t.emp'), repeat('d', 64)), 'Só o usuário master');
select pg_temp.ok((select count(*) from api_chaves) = 0, 'quem não é master não vê as chaves');
set request.jwt.claim.sub = '99e00000-0000-0000-0000-0000000000a3';
select pg_temp.espera_erro(format($$select revogar_chave_api(%L)$$, current_setting('t.chave')), 'Só o usuário master');
reset role;

-- o servidor autentica pelo hash
select pg_temp.espera_erro(format($$set role authenticated; select api_autenticar(%L)$$, repeat('a', 64)), 'permission denied');
reset role;
select pg_temp.ok((select api_autenticar(repeat('a', 64))->>'empresa_id') = current_setting('t.emp'), 'chave leva à empresa certa');
select pg_temp.ok((select api_autenticar(repeat('a', 64))->'modulos') = 'null'::jsonb, 'no teste grátis o plano libera tudo');
select pg_temp.ok(api_autenticar(repeat('e', 64)) is null, 'hash desconhecido não autentica');
select pg_temp.ok(exists (select 1 from api_chaves_uso where chave_id = current_setting('t.chave')::uuid), 'último uso registrado');
select pg_temp.espera_erro(format($$update api_chaves set expira_em = criada_em + interval '8 days' where id = %L$$, current_setting('t.chave')), 'api_chaves_validade_7_dias');
select pg_temp.espera_erro(format($$update api_chaves set expira_em = null where id = %L$$, current_setting('t.chave')), 'api_chaves_validade_7_dias');
update api_chaves set criada_em = now() - interval '8 days', expira_em = now() - interval '1 day' where id = current_setting('t.chave')::uuid;
select pg_temp.ok(api_autenticar(repeat('a', 64)) is null, 'chave com mais de 7 dias não autentica');
update api_chaves set criada_em = now(), expira_em = now() + interval '7 days' where id = current_setting('t.chave')::uuid;

update assinaturas set plano_id = 'basic-mensal', status = 'ativa', teste_ate = app.hoje_brasil() - 1, pago_ate = app.hoje_brasil() + 20
where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok(not ((api_autenticar(repeat('a', 64))->'modulos') ? 'contas-a-pagar'), 'no Basic o financeiro sai dos módulos da chave');
update assinaturas set plano_id = 'gestao-mensal' where empresa_id = current_setting('t.emp')::uuid;

-- gravação pela API aparece com o nome da chave no histórico
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role": "service_role"}', false);
select set_config('request.headers', format('{"x-balbina-chave": "%s"}', current_setting('t.chave')), false);
insert into contatos (id, empresa_id, tipos, nome) values ('99e00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Cliente da API');
select pg_temp.ok((select usuario from audit_log where tabela = 'contatos' and registro_id = '99e00000-0000-0000-0000-0000000000c1' and acao = 'insert')
  = 'API: ERP do contador', 'histórico mostra a chave que gravou');
select set_config('request.jwt.claims', '{"role": "authenticated"}', false);
update contatos set nome = 'Cliente renomeado' where id = '99e00000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select usuario from audit_log where tabela = 'contatos' and registro_id = '99e00000-0000-0000-0000-0000000000c1' and acao = 'update') is null,
  'sem a chave de serviço o cabeçalho não vale');
select set_config('request.headers', '', false);
select set_config('request.jwt.claims', '{"aal": "aal2"}', false);

-- webhooks
set role authenticated;
set request.jwt.claim.sub = '99e00000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro(format($$select criar_webhook_api(%L, 'http://inseguro.com/x', array['contato.criado'], 'v1:x')$$, current_setting('t.emp')), 'check constraint');
select pg_temp.espera_erro(format($$select criar_webhook_api(%L, 'https://ok.com/x', array['conta.apagada'], 'v1:x')$$, current_setting('t.emp')), 'check constraint');
select set_config('t.wh', criar_webhook_api(current_setting('t.emp')::uuid, 'https://erp.exemplo.com/balbina', array['contato.criado', 'lancamento.criado', 'lancamento.alterado'], 'v1:a:b:c')::text, false);
select pg_temp.espera_erro($$select segredo_cifrado from api_webhooks$$, 'permission denied');
insert into contatos (id, empresa_id, tipos, nome) values ('99e00000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{fornecedor}', 'Fornecedor novo');
update contatos set nome = 'Fornecedor renomeado' where id = '99e00000-0000-0000-0000-0000000000c2';
select pg_temp.espera_erro($$select dados from api_webhook_entregas$$, 'permission denied');
select pg_temp.ok((select count(*) from api_webhook_entregas) = 1, 'master vê a fila de entregas');
reset role;
select pg_temp.ok((select count(*) from api_webhook_entregas where evento = 'contato.criado' and dados->>'id' = '99e00000-0000-0000-0000-0000000000c2') = 1,
  'inclusão de contato vira evento');
select pg_temp.ok(not exists (select 1 from api_webhook_entregas where evento = 'contato.alterado'), 'evento não assinado não entra na fila');

select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida'
  and id not in (select parent_id from categorias where parent_id is not null) limit 1), false);
select set_config('t.tit', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Ração', '2026-11-10', '2026-11-01', 10000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 10000)))::text, false);
select pg_temp.ok((select count(*) from api_webhook_entregas where evento = 'lancamento.criado' and dados->>'id' = current_setting('t.tit')) = 1,
  'título novo vira evento');
select pg_temp.ok(not exists (select 1 from api_webhook_entregas where dados ? 'segredo_cifrado' or dados ? 'hash_sha256'), 'evento sem segredo');

-- Basic sem financeiro: título não gera evento
update assinaturas set plano_id = 'basic-mensal' where empresa_id = current_setting('t.emp')::uuid;
update agendamentos set descricao = 'Ração engorda' where id = current_setting('t.tit')::uuid;
select pg_temp.ok(not exists (select 1 from api_webhook_entregas where evento = 'lancamento.alterado'), 'módulo fora do plano não manda evento');
update assinaturas set plano_id = 'gestao-mensal' where empresa_id = current_setting('t.emp')::uuid;
update agendamentos set descricao = 'Ração engorda 2' where id = current_setting('t.tit')::uuid;
select pg_temp.ok(exists (select 1 from api_webhook_entregas where evento = 'lancamento.alterado'), 'com o módulo no plano a edição vira evento');

-- entrega: reserva, falha com espera crescente e sucesso
select pg_temp.ok((select count(*) from api_reservar_entregas(10)) = 3, 'servidor reserva as entregas pendentes');
select pg_temp.ok((select count(*) from api_reservar_entregas(10)) = 0, 'entrega reservada não sai duas vezes');
select api_registrar_entrega(id, 500, 'erro do destino') from api_webhook_entregas where evento = 'contato.criado';
select pg_temp.ok((select tentativas = 1 and entregue_em is null and proxima_em > now() from api_webhook_entregas where evento = 'contato.criado'),
  'falha agenda nova tentativa');
select api_registrar_entrega(id, 200, null) from api_webhook_entregas where evento = 'lancamento.criado';
select pg_temp.ok((select entregue_em is not null from api_webhook_entregas where evento = 'lancamento.criado'), 'sucesso marca entregue');

-- revogar
set role authenticated;
select revogar_chave_api(current_setting('t.chave')::uuid);
select alterar_webhook_api(current_setting('t.wh')::uuid, false);
reset role;
select pg_temp.ok(api_autenticar(repeat('a', 64)) is null, 'chave revogada não autentica');
insert into contatos (empresa_id, tipos, nome) values (current_setting('t.emp')::uuid, '{cliente}', 'Depois de desligar');
select pg_temp.ok((select count(*) from api_webhook_entregas where evento = 'contato.criado') = 1, 'webhook desligado não recebe eventos');

-- quem deixa de ser master perde as chaves que criou
set role authenticated;
set request.jwt.claim.sub = '99e00000-0000-0000-0000-0000000000a1';
select set_config('t.chave2', criar_chave_api(current_setting('t.emp')::uuid, 'Loja', array['vendas.ver'], repeat('f', 64), 'balbina_loj')::text, false);
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('99e00000-0000-0000-0000-0000000000a4', 'segundo@api.com', now());
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin) values (current_setting('t.emp')::uuid, '99e00000-0000-0000-0000-0000000000a4', 'sem_restricao', true);
update usuarios_empresa set is_admin = false where empresa_id = current_setting('t.emp')::uuid and user_id = '99e00000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select revogada_em is not null from api_chaves where id = current_setting('t.chave2')::uuid), 'ex-master tem as chaves revogadas');
select pg_temp.ok(api_autenticar(repeat('f', 64)) is null, 'chave do ex-master para de autenticar');

\echo TESTES DA API PÚBLICA PASSARAM
