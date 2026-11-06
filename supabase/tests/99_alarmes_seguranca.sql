-- Alarmes de segurança no painel do master: senha errada em sequência, chave da API revogada sendo usada,
-- avisos da API parados e extrato do banco sem atualizar.
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

-- m = master, g = tratador da mesma piscicultura, o = master de outra piscicultura
insert into auth.users (id, email, email_confirmed_at) values
  ('9ad00000-0000-0000-0000-0000000000a1', 'm@alarmes.com', now()),
  ('9ad00000-0000-0000-0000-0000000000a2', 'g@alarmes.com', now()),
  ('9ad00000-0000-0000-0000-0000000000a3', 'o@alarmes.com', now());

set role authenticated;
set request.jwt.claim.sub = '9ad00000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('98200000000210', 'Piscicultura Alarmes Ltda')::text, false);
select convidar_usuario(current_setting('t.emp')::uuid, 'g@alarmes.com', 'tratador');
set request.jwt.claim.sub = '9ad00000-0000-0000-0000-0000000000a3';
select set_config('t.outra', criar_empresa('98200000000220', 'Piscicultura Vizinha Ltda')::text, false);

-- Sem nada acontecendo, nenhum alarme
set request.jwt.claim.sub = '9ad00000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)) = 0, 'piscicultura tranquila não tem alarme');

-- Só a chave de serviço registra falhas; ninguém lê a tabela direto
select pg_temp.espera_erro($$select registrar_falha_login('g@alarmes.com', '1.2.3.4')$$, 'permission denied');
select pg_temp.espera_erro($$select count(*) from eventos_seguranca$$, 'permission denied');
reset role;
set role anon;
select pg_temp.espera_erro($$select registrar_falha_login('g@alarmes.com', '1.2.3.4')$$, 'permission denied');
select pg_temp.espera_erro(format($$select * from alertas_seguranca(%L)$$, current_setting('t.emp')), 'permission denied');
reset role;

-- 4 senhas erradas ainda não alarmam; a 5ª sim. E-mail com maiúscula conta para a mesma pessoa.
set role service_role;
select registrar_falha_login('g@alarmes.com', '1.2.3.4') from generate_series(1, 4);
reset role;
set role authenticated;
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)) = 0, '4 senhas erradas não alarmam');
reset role;
set role service_role;
select registrar_falha_login(' G@Alarmes.com ', '5.6.7.8');
select registrar_falha_login('naoexiste@alarmes.com', '5.6.7.8');
reset role;
set role authenticated;
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)
  where titulo = 'Senha errada em sequência' and nivel = 'atencao' and detalhe like '%g@alarmes.com%5 tentativas%' and link = '/configuracoes/usuarios') = 1,
  '5 senhas erradas do tratador alarmam o master');

-- O tratador não vê os alarmes; o master da outra piscicultura também não vê os desta
set request.jwt.claim.sub = '9ad00000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)) = 0, 'quem não é master não vê alarme');
set request.jwt.claim.sub = '9ad00000-0000-0000-0000-0000000000a3';
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)) = 0, 'master de outra piscicultura não vê alarme desta');
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.outra')::uuid)) = 0, 'falha do tratador não aparece na piscicultura vizinha');

-- Muitas falhas viram crítico; falhas antigas (mais de 1 hora) não contam
reset role;
set role service_role;
select registrar_falha_login('g@alarmes.com', '1.2.3.4') from generate_series(1, 10);
reset role;
set role authenticated;
set request.jwt.claim.sub = '9ad00000-0000-0000-0000-0000000000a1';
select pg_temp.ok((select nivel from alertas_seguranca(current_setting('t.emp')::uuid) where titulo = 'Senha errada em sequência') = 'critico',
  '15 senhas erradas na hora viram crítico');
reset role;
update eventos_seguranca set criado_em = now() - interval '2 hours' where tipo = 'login_falhou';
set role authenticated;
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)) = 0, 'falhas de mais de 1 hora atrás não alarmam');

-- Chave da API revogada sendo usada
select set_config('t.chave', criar_chave_api(current_setting('t.emp')::uuid, 'ERP antigo', array['contatos.ver'],
  repeat('9a', 32), 'balbina_aaaa')::text, false);
select revogar_chave_api(current_setting('t.chave')::uuid);
reset role;
set role service_role;
select pg_temp.ok(api_autenticar(repeat('9a', 32)) is null, 'chave revogada não autentica');
select api_autenticar(repeat('9a', 32));
select pg_temp.ok(api_autenticar(repeat('9b', 32)) is null, 'chave inexistente não autentica');
reset role;
select pg_temp.ok((select count(*) from eventos_seguranca where tipo = 'api_chave_recusada') = 1,
  'chave revogada usada 2 vezes no mesmo minuto vira um registro só; chave inexistente não registra');
set role authenticated;
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)
  where titulo = 'Chave da API revogada ou vencida em uso' and detalhe like '%ERP antigo%' and link = '/configuracoes/api') = 1,
  'uso de chave revogada alarma o master');

-- Aviso da API parado há mais de 30 minutos
reset role;
insert into api_webhooks (id, empresa_id, url, eventos, segredo_cifrado)
values ('9ad00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'https://erp.exemplo.com.br/balbina', array['contato.alterado'], 'v1:x:y:z');
insert into api_webhook_entregas (empresa_id, webhook_id, evento, dados, criado_em, tentativas, erro)
values (current_setting('t.emp')::uuid, '9ad00000-0000-0000-0000-0000000000b1', 'contato.alterado', '{}', now() - interval '2 hours', 3, 'HTTP 500'),
       (current_setting('t.emp')::uuid, '9ad00000-0000-0000-0000-0000000000b1', 'contato.alterado', '{}', now() - interval '5 minutes', 0, null);
set role authenticated;
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)
  where titulo = 'Avisos da API parados' and detalhe like '1 aviso%' and link = '/configuracoes/api') = 1,
  'aviso da API esperando há mais de 30 min alarma (o recente não conta)');

-- Extrato do banco sem ler há mais de 2 dias, e conexão com erro
reset role;
insert into conexoes_bancarias (empresa_id, item_id, instituicao, status, ultima_sincronizacao) values
  (current_setting('t.emp')::uuid, 'item-alarme-1', 'Banco Velho', 'ativa', now() - interval '3 days'),
  (current_setting('t.emp')::uuid, 'item-alarme-2', 'Banco Erro', 'precisa_login', now()),
  (current_setting('t.emp')::uuid, 'item-alarme-3', 'Banco Ok', 'ativa', now()),
  (current_setting('t.emp')::uuid, 'item-alarme-4', 'Banco Desligado', 'desconectada', now() - interval '30 days');
set role authenticated;
select pg_temp.ok((select count(*) from alertas_seguranca(current_setting('t.emp')::uuid)
  where titulo = 'Extrato do banco parado' and link = '/conciliacao') = 2,
  'extrato parado e conexão pedindo login alarmam; a em dia e a desconectada não');

reset role;
-- não deixa entregas na fila global para os próximos testes
delete from api_webhooks where id = '9ad00000-0000-0000-0000-0000000000b1';
\echo TESTES DE ALARMES DE SEGURANCA PASSARAM
