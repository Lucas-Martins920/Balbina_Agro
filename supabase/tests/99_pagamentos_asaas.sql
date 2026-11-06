-- Pagamentos pelo sistema (C7): desligado por padrão, proposta por quem lança, aprovação só do master,
-- quem propõe não aprova, limite do dia, sem enviar duas vezes, baixa só quando o Asaas confirma.
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
  ('a0900000-0000-0000-0000-000000000001', 'master@pagar.com', now()),
  ('a0900000-0000-0000-0000-000000000002', 'financeiro@pagar.com', now());
set role authenticated;
set request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('90909090000120', 'Piscicultura Pagar')::text, false);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null limit 1), false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_data) values
  ('a0900000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'corrente', 'Asaas', '2026-01-01');
insert into perfis_cobranca (id, empresa_id, nome, provedor, conta_repasse_id) values
  ('a0900000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'Asaas', 'asaas', 'a0900000-0000-0000-0000-0000000000a1');
select set_config('t.t1', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Energia', app.hoje(current_setting('t.emp')::uuid) + 2, app.hoje(current_setting('t.emp')::uuid), 30000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 30000)), null, repeat('8', 48))::text, false);
select set_config('t.t2', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho', app.hoje(current_setting('t.emp')::uuid), app.hoje(current_setting('t.emp')::uuid), 900000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 900000)), null, repeat('2', 47))::text, false);
select set_config('t.t3', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Sem boleto', app.hoje(current_setting('t.emp')::uuid), app.hoje(current_setting('t.emp')::uuid), 1000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 1000)))::text, false);
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, 'a0900000-0000-0000-0000-000000000002', 'financeiro');
set role authenticated;

-- desligado: ninguém propõe
select pg_temp.espera_erro($$select propor_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.t1')::uuid])$$, 'não está ligado');
-- só o master liga
set request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$insert into automacoes_empresa (empresa_id, pagamentos_ligado) values (current_setting('t.emp')::uuid, true)$$, 'Só o usuário master');
set request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000001';
insert into automacoes_empresa (empresa_id, pagamentos_ligado, pagamento_limite_dia_cents) values (current_setting('t.emp')::uuid, true, 500000);
set request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000002';
update automacoes_empresa set pagamento_limite_dia_cents = 99999999;
reset role;
-- mesmo com permissão de configurações, quem não é master não mexe nos pagamentos
update usuarios_empresa set permissoes = '{configuracoes.editar,contas-a-pagar.editar}', perfil = 'personalizado'
where user_id = 'a0900000-0000-0000-0000-000000000002';
set role authenticated;
select pg_temp.espera_erro($$update automacoes_empresa set pagamento_limite_dia_cents = 99999999$$, 'Só o usuário master');
update automacoes_empresa set lembrete_apontamento = true;
select pg_temp.ok((select pagamento_limite_dia_cents = 500000 and lembrete_apontamento from automacoes_empresa), 'o resto das automações segue livre');

-- o financeiro propõe; só boleto entra; não duplica
select pg_temp.ok(propor_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.t1'), current_setting('t.t2'), current_setting('t.t3')]::uuid[]) = 2, 'propõe só as contas com boleto');
select pg_temp.ok(propor_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.t1')]::uuid[]) = 0, 'não propõe duas vezes');
update pagamentos_saida set status = 'pago';
select pg_temp.ok((select bool_and(status = 'proposto') and count(*) = 2 from pagamentos_saida), 'ninguém muda o pagamento pela tabela');
select set_config('t.p1', (select id::text from pagamentos_saida where agendamento_id = current_setting('t.t1')::uuid), false);
select set_config('t.p2', (select id::text from pagamentos_saida where agendamento_id = current_setting('t.t2')::uuid), false);
select pg_temp.ok((select linha = repeat('8', 48) and valor_cents = 30000 and data_pagamento = app.hoje(current_setting('t.emp')::uuid) + 2
                   from pagamentos_saida where id = current_setting('t.p1')::uuid), 'linha, valor e data da conta');
select pg_temp.espera_erro($$select * from aprovar_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.p1')]::uuid[])$$, 'Só o usuário master');

-- master aprova; acima do limite do dia não passa
set request.jwt.claim.sub = 'a0900000-0000-0000-0000-000000000001';
select pg_temp.espera_erro($$select * from aprovar_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.p1'), current_setting('t.p2')]::uuid[])$$, 'limite');
create temp table env as select * from aprovar_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.p1')]::uuid[]);
select pg_temp.ok((select count(*) = 1 and bool_and(descricao = 'Energia' and valor_cents = 30000) from env), 'aprovado vai para o Asaas');
select pg_temp.espera_erro($$select * from aprovar_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.p1')]::uuid[])$$, 'já foi aprovado');
select pg_temp.espera_erro($$select cancelar_pagamento(current_setting('t.p1')::uuid)$$, 'ainda não foi aprovado');
select registrar_envio_pagamento(current_setting('t.p1')::uuid, 'bill_123', null);
select pg_temp.espera_erro($$select registrar_envio_pagamento(current_setting('t.p1')::uuid, 'outro', null)$$, 'não encontrado');

-- quem propôs não aprova (salvo aprovação por uma pessoa só)
select set_config('t.t4', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Vacina', app.hoje(current_setting('t.emp')::uuid), app.hoje(current_setting('t.emp')::uuid), 5000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 5000)), null, repeat('3', 47))::text, false);
select propor_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.t4')]::uuid[]);
select set_config('t.p4', (select id::text from pagamentos_saida where agendamento_id = current_setting('t.t4')::uuid), false);
select pg_temp.espera_erro($$select * from aprovar_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.p4')]::uuid[])$$, 'Quem propôs');
update automacoes_empresa set pagamento_aprovacao_unica = true;
create temp table env4 as select * from aprovar_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.p4')]::uuid[]);
select registrar_envio_pagamento(current_setting('t.p4')::uuid, null, 'Saldo insuficiente');
select pg_temp.ok((select status = 'falhou' and erro = 'Saldo insuficiente' from pagamentos_saida where id = current_setting('t.p4')::uuid), 'recusa do Asaas fecha como falhou');
select pg_temp.ok(propor_pagamentos(current_setting('t.emp')::uuid, array[current_setting('t.t4')]::uuid[]) = 1, 'falhou pode ser proposto de novo');
select cancelar_pagamento((select id from pagamentos_saida where agendamento_id = current_setting('t.t4')::uuid and status = 'proposto'));
select pg_temp.espera_erro($$select * from pagamentos_para_conferir()$$, 'permission denied');
reset role;

-- rotina: confere no Asaas; pago vira baixa na conta do Asaas, uma vez só
select pg_temp.ok((select count(*) = 1 from pagamentos_para_conferir() where id = current_setting('t.p1')::uuid), 'enviado para conferir');
select pg_temp.ok(atualizar_pagamento_saida(current_setting('t.p1')::uuid, 'BANK_PROCESSING', null) = 'aguardando', 'em processamento espera');
select pg_temp.ok(atualizar_pagamento_saida(current_setting('t.p1')::uuid, 'PAID', app.hoje(current_setting('t.emp')::uuid)) = 'pago', 'pago');
select pg_temp.ok((select count(*) = 1 and sum(valor_cents) = 30000 and bool_and(conta_id = 'a0900000-0000-0000-0000-0000000000a1')
                   from baixas where agendamento_id = current_setting('t.t1')::uuid), 'baixa na conta do Asaas');
select pg_temp.ok(atualizar_pagamento_saida(current_setting('t.p1')::uuid, 'PAID', null) = 'ignorado', 'não baixa duas vezes');
select pg_temp.ok((select status = 'quitado' from titulos where id = current_setting('t.t1')::uuid), 'conta quitada');
