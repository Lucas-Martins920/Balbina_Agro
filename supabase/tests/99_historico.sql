-- Histórico de alterações: inclusão, edição e exclusão gravam quem fez e o que mudou; só lê quem tem historico.ver.
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

-- Toda tabela da empresa tem o trigger (tabela nova ganha pelo app.travar_referencias)
select pg_temp.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname <> all (app.tabelas_sem_historico())
    and exists (select 1 from pg_attribute x where x.attrelid = c.oid and x.attname = 'empresa_id' and not x.attisdropped)
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'historico')), 'toda tabela com empresa_id tem histórico');
select pg_temp.ok(exists (select 1 from pg_trigger where tgrelid = 'pedido_itens'::regclass and tgname = 'historico'
  and encode(tgargs, 'escape') like '%pedido_id%pedidos_venda%'), 'itens do pedido entram pela empresa do pedido');
select pg_temp.ok(app.sem_campos_ocultos('{"nome": "a", "payload": {}, "token_hash": "x", "chave_cifrada": "y"}') = '{"nome": "a"}',
  'segredos e payload ficam de fora');

insert into auth.users (id, email, email_confirmed_at) values
  ('99b10000-0000-0000-0000-0000000000a1', 'dono@historico.com', now()),
  ('99b10000-0000-0000-0000-0000000000a2', 'apontador@historico.com', now()),
  ('99b10000-0000-0000-0000-0000000000a3', 'outro@historico.com', now());

set role authenticated;
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('97555666000148', 'Piscicultura Histórico Ltda')::text, false);
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a3';
select set_config('t.outra', criar_empresa('97555777000154', 'Outra Piscicultura Ltda')::text, false);
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, email)
values (current_setting('t.emp')::uuid, '99b10000-0000-0000-0000-0000000000a2', 'apontador', 'apontador@historico.com');

set role authenticated;
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a1';
insert into contatos (id, empresa_id, tipos, nome, telefone)
values ('99b10000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Bom Preço', '92 3000-0000');
update contatos set telefone = '92 99999-0000' where id = '99b10000-0000-0000-0000-0000000000c1';
update contatos set telefone = '92 99999-0000' where id = '99b10000-0000-0000-0000-0000000000c1';
delete from contatos where id = '99b10000-0000-0000-0000-0000000000c1';

select pg_temp.ok((select count(*) = 3 from audit_log where registro_id = '99b10000-0000-0000-0000-0000000000c1'),
  'inclusão, edição e exclusão viram três linhas (edição sem mudança não conta)');
select pg_temp.ok((select user_id = '99b10000-0000-0000-0000-0000000000a1' and usuario = 'dono@historico.com' and resumo = 'Mercado Bom Preço'
  and depois->>'nome' = 'Mercado Bom Preço' and antes is null
  from audit_log where registro_id = '99b10000-0000-0000-0000-0000000000c1' and acao = 'insert'), 'inclusão guarda quem fez e a linha nova');
select pg_temp.ok((select campos = '{telefone}' and antes = '{"telefone": "92 3000-0000"}' and depois = '{"telefone": "92 99999-0000"}'
  from audit_log where registro_id = '99b10000-0000-0000-0000-0000000000c1' and acao = 'update'), 'edição guarda só o campo que mudou, antes e depois');
select pg_temp.ok((select antes->>'telefone' = '92 99999-0000' and depois is null
  from audit_log where registro_id = '99b10000-0000-0000-0000-0000000000c1' and acao = 'delete'), 'exclusão guarda a linha apagada');

-- Mudança de permissão também fica registrada
select atualizar_usuario(current_setting('t.emp')::uuid, '99b10000-0000-0000-0000-0000000000a2', 'personalizado', '{historico.ver}', false, true);
select pg_temp.ok(exists (select 1 from audit_log where tabela = 'usuarios_empresa' and acao = 'update' and 'perfil' = any(campos)
  and registro_id = current_setting('t.emp') || '/99b10000-0000-0000-0000-0000000000a2'), 'troca de perfil de usuário fica no histórico');

-- Ninguém mexe no histórico
select pg_temp.espera_erro($$insert into audit_log (empresa_id, tabela, acao) values (current_setting('t.emp')::uuid, 'contatos', 'insert')$$, 'permission denied');
select pg_temp.espera_erro($$update audit_log set usuario = 'outro' where empresa_id = current_setting('t.emp')::uuid$$, 'permission denied');
select pg_temp.espera_erro($$delete from audit_log where empresa_id = current_setting('t.emp')::uuid$$, 'permission denied');

-- Quem lê: só com historico.ver e só da própria empresa
select pg_temp.ok((select count(*) > 0 from audit_log where empresa_id = current_setting('t.emp')::uuid), 'master vê o histórico');
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) > 0 from audit_log where empresa_id = current_setting('t.emp')::uuid), 'usuário com historico.ver vê');
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a1';
select atualizar_usuario(current_setting('t.emp')::uuid, '99b10000-0000-0000-0000-0000000000a2', 'apontador', '{}', false, true);
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) = 0 from audit_log), 'apontador sem a permissão não vê nada');
set request.jwt.claim.sub = '99b10000-0000-0000-0000-0000000000a3';
select pg_temp.ok((select count(*) = 0 from audit_log where empresa_id = current_setting('t.emp')::uuid), 'outra empresa não vê');
reset role;

-- Sem usuário (webhook, rotina agendada) fica sem autor: a tela mostra "Sistema"
set request.jwt.claim.sub = '';
insert into contatos (id, empresa_id, tipos, nome)
values ('99b10000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{cliente}', 'Cliente do webhook');
select pg_temp.ok((select user_id is null and usuario is null from audit_log where registro_id = '99b10000-0000-0000-0000-0000000000c2'),
  'alteração sem usuário fica sem autor');

\echo TESTES DO HISTÓRICO DE ALTERAÇÕES PASSARAM
