-- Conta Asaas por piscicultura: a chave fica longe do usuário e a credencial do servidor não pode ser escolhida.
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
  ('99100000-0000-0000-0000-0000000000a1', 'dono@contaasaas.com', now()),
  ('99100000-0000-0000-0000-0000000000a2', 'outro@contaasaas.com', now());

set role authenticated;
set request.jwt.claim.sub = '99100000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('99222333000155', 'Piscicultura Conta Asaas Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome) values
  ('99100000-0000-0000-0000-0000000000f1', current_setting('t.emp')::uuid, 'corrente', 'Asaas');

select pg_temp.espera_erro(format($$insert into perfis_cobranca (empresa_id, nome, provedor, conta_repasse_id, credenciais_ref)
  values (%L, 'Asaas', 'asaas', '99100000-0000-0000-0000-0000000000f1', 'ASAAS_API_KEY')$$, current_setting('t.emp')), 'definida pelo servidor');
insert into perfis_cobranca (id, empresa_id, nome, provedor, conta_repasse_id)
values ('99100000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'Asaas', 'asaas', '99100000-0000-0000-0000-0000000000f1');
select pg_temp.ok(true, 'piscicultura cria o perfil sem credencial');
select pg_temp.espera_erro($$update perfis_cobranca set credenciais_ref = 'ASAAS_API_KEY' where id = '99100000-0000-0000-0000-0000000000b1'$$, 'definida pelo servidor');
update perfis_cobranca set multa_percentual = 3 where id = '99100000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select multa_percentual = 3 from perfis_cobranca where id = '99100000-0000-0000-0000-0000000000b1'), 'o resto do perfil continua editável');

select pg_temp.espera_erro(format($$insert into contas_asaas (perfil_cobranca_id, empresa_id, modo, ambiente)
  values ('99100000-0000-0000-0000-0000000000b1', %L, 'propria', 'sandbox')$$, current_setting('t.emp')), 'permission denied');

-- o servidor grava a conta e o segredo
reset role;
insert into contas_asaas (perfil_cobranca_id, empresa_id, modo, ambiente, conta_id, situacao)
values ('99100000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'subconta', 'sandbox', 'acc_1', 'AWAITING_APPROVAL');
insert into contas_asaas_segredos values ('99100000-0000-0000-0000-0000000000b1', 'v1:cifrado', 'hash');
update perfis_cobranca set credenciais_ref = null where id = '99100000-0000-0000-0000-0000000000b1';
select pg_temp.ok(true, 'service role grava a conta e a credencial');

set role authenticated;
select pg_temp.ok((select situacao = 'AWAITING_APPROVAL' from contas_asaas where perfil_cobranca_id = '99100000-0000-0000-0000-0000000000b1'), 'membro vê a situação da conta');
select pg_temp.espera_erro($$select chave_cifrada from contas_asaas_segredos$$, 'permission denied');
select pg_temp.espera_erro($$update contas_asaas set situacao = 'APPROVED'$$, 'permission denied');

set request.jwt.claim.sub = '99100000-0000-0000-0000-0000000000a2';
select pg_temp.ok((select count(*) from contas_asaas where perfil_cobranca_id = '99100000-0000-0000-0000-0000000000b1') = 0, 'outra pessoa não vê a conta da piscicultura');
reset role;

\echo 'TESTES DA CONTA ASAAS POR PISCICULTURA PASSARAM'
