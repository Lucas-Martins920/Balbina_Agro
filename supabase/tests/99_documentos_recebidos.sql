-- Documentos lidos por IA (C3), caixa de e-mail (C4) e limite de leituras por IA.
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
  ('a0850000-0000-0000-0000-000000000001', 'dono@documentos.com', now()),
  ('a0850000-0000-0000-0000-000000000002', 'tratador@documentos.com', now()),
  ('a0850000-0000-0000-0000-000000000003', 'outro@documentos.com', now());

set role authenticated;
set request.jwt.claim.sub = 'a0850000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('85858585000138', 'Piscicultura Documentos Ltda')::text, false);
select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Energia elétrica'), false);
insert into contatos (id, empresa_id, nome, tipos, cpf_cnpj) values
  ('a0850000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Energia do Norte', '{fornecedor}', '11222333000181');
insert into automacoes_empresa (empresa_id, ia_limite_mes) values (current_setting('t.emp')::uuid, 2);
select pg_temp.ok((select length(entrada_token) = 20 from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid), 'empresa ganha endereço de entrada');

-- limite de leituras por IA
select pg_temp.ok(registrar_uso_ia(current_setting('t.emp')::uuid, 'documento') = 1, 'primeira leitura, sobra uma');
select registrar_uso_ia(current_setting('t.emp')::uuid, 'mortalidade');
select pg_temp.espera_erro($$select registrar_uso_ia(current_setting('t.emp')::uuid, 'documento')$$, 'leituras por IA deste mês');

-- documento lido: fornecedor pelo CNPJ, linha digitável vira referência e forma boleto
insert into documentos_recebidos (id, empresa_id, origem, nome_arquivo, dados, linha_digitavel) values
  ('a0850000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'upload', 'conta-luz.pdf', '{"tipo":"fatura"}', repeat('8', 48)),
  ('a0850000-0000-0000-0000-0000000000d2', current_setting('t.emp')::uuid, 'upload', 'recibo.jpg', '{"tipo":"recibo"}', null);
select pg_temp.espera_erro($$insert into documentos_recebidos (empresa_id, origem, linha_digitavel) values (current_setting('t.emp')::uuid, 'upload', '123')$$, 'linha_digitavel');
select pg_temp.espera_erro($$select lancar_documento_recebido('a0850000-0000-0000-0000-0000000000d1', 'Luz', 0, current_date, null, current_setting('t.cat')::uuid)$$, 'valor');
select lancar_documento_recebido('a0850000-0000-0000-0000-0000000000d1', 'Energia outubro', 45678, current_date + 5, current_date - 10,
  current_setting('t.cat')::uuid, null, 'Energia do Norte', '11.222.333/0001-81');
select pg_temp.ok((select d.status = 'lancada' and a.contato_id = 'a0850000-0000-0000-0000-0000000000c1' and a.valor_cents = 45678
  and a.forma_pagamento = 'boleto' and a.vencimento = current_date + 5
  from documentos_recebidos d join agendamentos a on a.id = d.agendamento_id where d.id = 'a0850000-0000-0000-0000-0000000000d1'),
  'vira conta a pagar do fornecedor do CNPJ, com valor, vencimento e boleto');
select pg_temp.espera_erro($$select lancar_documento_recebido('a0850000-0000-0000-0000-0000000000d1', 'De novo', 100, current_date, null, current_setting('t.cat')::uuid)$$, 'já foi lançado');
-- fornecedor novo
select lancar_documento_recebido('a0850000-0000-0000-0000-0000000000d2', 'Frete', 15000, current_date, null, current_setting('t.cat')::uuid,
  null, 'José Fretes', '12345678909');
select pg_temp.ok((select c.nome = 'José Fretes' and c.cpf_cnpj = '12345678909' from documentos_recebidos d join contatos c on c.id = d.contato_id
  where d.id = 'a0850000-0000-0000-0000-0000000000d2'), 'cadastra o fornecedor novo');
delete from documentos_recebidos where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select count(*) = 2 from documentos_recebidos where empresa_id = current_setting('t.emp')::uuid), 'documento não se apaga');

-- tratador não grava documento; outra empresa não registra uso
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes)
values (current_setting('t.emp')::uuid, 'a0850000-0000-0000-0000-000000000002', 'apontador', '{}');
set role authenticated;
set request.jwt.claim.sub = 'a0850000-0000-0000-0000-000000000002';
select pg_temp.espera_erro($$insert into documentos_recebidos (empresa_id, origem) values (current_setting('t.emp')::uuid, 'upload')$$, 'row-level security');
set request.jwt.claim.sub = 'a0850000-0000-0000-0000-000000000003';
select pg_temp.espera_erro($$select registrar_uso_ia(current_setting('t.emp')::uuid, 'documento')$$, 'não encontrada');
select pg_temp.espera_erro($$select empresa_da_entrada('x')$$, 'permission denied');
reset role;

-- servidor acha a empresa pelo token do e-mail
select pg_temp.ok(empresa_da_entrada((select entrada_token from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid)) = current_setting('t.emp')::uuid,
  'token do e-mail leva à empresa');
select pg_temp.ok(empresa_da_entrada('curto') is null, 'token curto não vale');

\o
\echo 'TESTES DOS DOCUMENTOS RECEBIDOS PASSARAM'
