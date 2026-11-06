-- Assinatura do SaaS: teste grátis, pagamento pelo webhook, carência e bloqueio pelo RLS.
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
  ('99000000-0000-0000-0000-0000000000a1', 'dono@assinatura.com', now());

set role authenticated;
set request.jwt.claim.sub = '99000000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('99111222000144', 'Piscicultura Assinante Ltda')::text, false);

select pg_temp.ok((select status = 'teste' and teste_ate = app.hoje_brasil() + 14 from assinaturas where empresa_id = current_setting('t.emp')::uuid),
  'empresa nova começa com 14 dias de teste');
select pg_temp.ok((minha_assinatura(current_setting('t.emp')::uuid)->>'liberada')::boolean, 'teste vigente libera o acesso');
insert into setores (empresa_id, nome) values (current_setting('t.emp')::uuid, 'Sede A');
select pg_temp.ok((select count(*) from setores where empresa_id = current_setting('t.emp')::uuid) = 1, 'no teste a piscicultura lê e grava');

select pg_temp.espera_erro(format($$update assinaturas set teste_ate = '2099-01-01' where empresa_id = %L$$, current_setting('t.emp')), 'permission denied');
select pg_temp.espera_erro($$select registrar_evento_assinatura('x', 'PAYMENT_CONFIRMED', current_date, null)$$, 'permission denied');
select pg_temp.ok((select count(*) from planos) = 8, 'usuário vê os planos ativos');

-- teste vencido: tudo bloqueia, menos o nome da empresa e a própria assinatura
reset role;
update assinaturas set teste_ate = app.hoje_brasil() - 1 where empresa_id = current_setting('t.emp')::uuid;
set role authenticated;
select pg_temp.ok(not (minha_assinatura(current_setting('t.emp')::uuid)->>'liberada')::boolean, 'teste vencido bloqueia');
select pg_temp.ok((select count(*) from setores where empresa_id = current_setting('t.emp')::uuid) = 0, 'bloqueada não lê os dados');
select pg_temp.espera_erro(format($$insert into setores (empresa_id, nome) values (%L, 'Sede B')$$, current_setting('t.emp')), 'row-level security');
select pg_temp.ok((select count(*) from empresas where id = current_setting('t.emp')::uuid) = 1, 'bloqueada ainda vê a empresa para a tela de pagamento');
select pg_temp.ok((select count(*) from assinaturas where empresa_id = current_setting('t.emp')::uuid) = 1, 'bloqueada vê a assinatura');
select pg_temp.ok(not (minhas_permissoes(current_setting('t.emp')::uuid) is null), 'permissões continuam legíveis');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'lotes.editar'), 'master bloqueado não tem permissão de escrita');
select pg_temp.ok(not app.e_master(current_setting('t.emp')::uuid), 'nem importa nem gerencia usuários');

-- pagamento confirmado pelo webhook (service role)
reset role;
update assinaturas set plano_id = 'mensal', asaas_assinatura_id = 'sub_teste99', status = 'aguardando', fatura_url = 'https://fatura/1'
where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok(registrar_evento_assinatura('sub_teste99', 'PAYMENT_CONFIRMED', app.hoje_brasil(), 'https://fatura/1'), 'evento de pagamento aceito');
select pg_temp.ok((select status = 'ativa' and pago_ate = (app.hoje_brasil() + interval '1 month')::date - 1 and fatura_url is null
  from assinaturas where empresa_id = current_setting('t.emp')::uuid), 'pagamento mensal cobre um mês e limpa a fatura');
set role authenticated;
select pg_temp.ok((select count(*) from setores where empresa_id = current_setting('t.emp')::uuid) = 1, 'depois de pagar os dados voltam');
reset role;
select pg_temp.ok(registrar_evento_assinatura('sub_teste99', 'PAYMENT_RECEIVED', app.hoje_brasil(), null), 'aviso repetido é inofensivo');
select pg_temp.ok((select pago_ate = (app.hoje_brasil() + interval '1 month')::date - 1 from assinaturas where empresa_id = current_setting('t.emp')::uuid),
  'aviso repetido não estende o período');
select pg_temp.ok(not registrar_evento_assinatura('sub_outra', 'PAYMENT_CONFIRMED', app.hoje_brasil(), null), 'assinatura desconhecida é ignorada');

-- atraso e carência de 5 dias
update assinaturas set pago_ate = app.hoje_brasil() - 5 where empresa_id = current_setting('t.emp')::uuid;
select registrar_evento_assinatura('sub_teste99', 'PAYMENT_OVERDUE', app.hoje_brasil() - 4, 'https://fatura/2');
select pg_temp.ok((select status = 'atrasada' and fatura_url = 'https://fatura/2' from assinaturas where empresa_id = current_setting('t.emp')::uuid),
  'cobrança vencida marca atraso e guarda a fatura');
select pg_temp.ok(app.empresa_liberada(current_setting('t.emp')::uuid), 'dentro da carência ainda acessa');
update assinaturas set pago_ate = app.hoje_brasil() - 6 where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok(not app.empresa_liberada(current_setting('t.emp')::uuid), 'passada a carência bloqueia');

-- estorno desfaz o período; cancelamento mantém o que já foi pago
select registrar_evento_assinatura('sub_teste99', 'PAYMENT_CONFIRMED', app.hoje_brasil(), null);
select registrar_evento_assinatura('sub_teste99', 'PAYMENT_REFUNDED', app.hoje_brasil(), null);
select pg_temp.ok((select pago_ate = app.hoje_brasil() - 1 and status = 'atrasada' from assinaturas where empresa_id = current_setting('t.emp')::uuid),
  'estorno tira o período estornado');
select registrar_evento_assinatura('sub_teste99', 'PAYMENT_CONFIRMED', app.hoje_brasil(), null);
select registrar_evento_assinatura('sub_teste99', 'SUBSCRIPTION_DELETED', null, null);
select pg_temp.ok((select status = 'cancelada' from assinaturas where empresa_id = current_setting('t.emp')::uuid)
  and app.empresa_liberada(current_setting('t.emp')::uuid), 'cancelada continua até o fim do período pago');

-- anual cobre um ano; cortesia nunca bloqueia
update assinaturas set plano_id = 'anual', pago_ate = null, status = 'aguardando' where empresa_id = current_setting('t.emp')::uuid;
select registrar_evento_assinatura('sub_teste99', 'PAYMENT_CONFIRMED', app.hoje_brasil(), null);
select pg_temp.ok((select pago_ate = (app.hoje_brasil() + interval '1 year')::date - 1 from assinaturas where empresa_id = current_setting('t.emp')::uuid),
  'plano anual cobre um ano');
update assinaturas set status = 'cortesia', pago_ate = null, teste_ate = null where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok(app.empresa_liberada(current_setting('t.emp')::uuid), 'cortesia libera sem pagamento');

\echo TESTES DE ASSINATURA PASSARAM
