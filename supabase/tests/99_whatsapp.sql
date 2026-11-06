-- WhatsApp do Balbina (H2): vínculo do celular por código, remetente, destinos dos avisos e régua automática.
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

select pg_temp.ok(app.chave_celular('5592991234567') = app.chave_celular('559291234567'), 'celular com e sem o 9 é o mesmo');
select pg_temp.ok(app.chave_celular('12345') is null, 'número inválido não tem chave');

insert into auth.users (id, email, email_confirmed_at) values
  ('a0870000-0000-0000-0000-000000000001', 'dono@zap.com', now()),
  ('a0870000-0000-0000-0000-000000000002', 'outro@zap.com', now());
set role authenticated;
set request.jwt.claim.sub = 'a0870000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('87878787000177', 'Piscicultura Zap')::text, false);
select pg_temp.espera_erro($$select whatsapp_pedir_codigo(current_setting('t.emp')::uuid, '123')$$, 'Celular inválido');
select set_config('t.cod', whatsapp_pedir_codigo(current_setting('t.emp')::uuid, '(92) 99123-4567'), false);
select pg_temp.ok(current_setting('t.cod') ~ '^\d{6}$', 'código de 6 dígitos');
select pg_temp.ok((select telefone = '5592991234567' and confirmado_em is null from whatsapp_vinculos), 'celular gravado no formato internacional, ainda sem confirmar');
update whatsapp_vinculos set confirmado_em = now();
select pg_temp.ok((select confirmado_em is null from whatsapp_vinculos), 'ninguém confirma pela tabela');
select pg_temp.espera_erro($$insert into whatsapp_vinculos (empresa_id, telefone, confirmado_em) values (current_setting('t.emp')::uuid, '5592911112222', now())$$, 'row-level security');
select pg_temp.espera_erro($$select whatsapp_confirmar('5592991234567', '000000')$$, 'permission denied');
select pg_temp.espera_erro($$select * from cobrancas_whatsapp_devidas()$$, 'permission denied');

-- outro usuário não vê o vínculo de ninguém
set request.jwt.claim.sub = 'a0870000-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) = 0 from whatsapp_vinculos), 'de fora não vê o celular');
select pg_temp.espera_erro($$select whatsapp_pedir_codigo(current_setting('t.emp')::uuid, '92991234567')$$, 'Empresa não encontrada');
set request.jwt.claim.sub = 'a0870000-0000-0000-0000-000000000001';

-- cliente com conta vencendo hoje e celular
insert into contatos (id, empresa_id, tipos, nome, telefone) values
  ('a0870000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado Zap', '(92) 98888-7777'),
  ('a0870000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{cliente}', 'Sem Fone', null);
select set_config('t.rec', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and grupo = 'receita_operacional' and sentido = 'entrada' order by nome limit 1), false);
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe', app.hoje(current_setting('t.emp')::uuid), app.hoje(current_setting('t.emp')::uuid), 12000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 12000)), 'a0870000-0000-0000-0000-0000000000c1');
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe sem fone', app.hoje(current_setting('t.emp')::uuid), app.hoje(current_setting('t.emp')::uuid), 5000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 5000)), 'a0870000-0000-0000-0000-0000000000c2');
select agendar_titulo(current_setting('t.emp')::uuid, 'receber', 'Peixe longe', app.hoje(current_setting('t.emp')::uuid) + 20, app.hoje(current_setting('t.emp')::uuid), 5000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.rec'), 'valor_cents', 5000)), 'a0870000-0000-0000-0000-0000000000c1');
insert into automacoes_empresa (empresa_id, whatsapp_cobranca, whatsapp_cobranca_hora) values (current_setting('t.emp')::uuid, false, '00:00');
reset role;

-- servidor: confirma só com o código certo e do mesmo celular (o da Meta pode vir sem o 9)
select pg_temp.ok(whatsapp_confirmar('5592991234567', lpad(((current_setting('t.cod')::int + 1) % 1000000)::text, 6, '0')) is null, 'código errado não liga');
select pg_temp.ok(whatsapp_confirmar('5511991234567', current_setting('t.cod')) is null, 'código de outro celular não liga');
select pg_temp.ok((whatsapp_confirmar('559291234567', current_setting('t.cod')) ->> 'empresa') = 'Piscicultura Zap', 'confirma vindo sem o 9');
select pg_temp.ok((select confirmado_em is not null and codigo is null from whatsapp_vinculos), 'confirmado e código apagado');
select pg_temp.ok(whatsapp_confirmar('5592991234567', current_setting('t.cod')) is null, 'código não vale duas vezes');
select pg_temp.ok((select pode_documentos and empresa = 'Piscicultura Zap' from whatsapp_remetente('5592991234567')), 'remetente reconhecido com permissão');
select pg_temp.ok((select count(*) = 1 from whatsapp_destinos(current_setting('t.emp')::uuid, 'relatorios.ver')), 'recebe avisos de relatórios');
select pg_temp.ok(whatsapp_avisos_por_numero('5592991234567', false), 'SAIR desliga');
select pg_temp.ok((select count(*) = 0 from whatsapp_destinos(current_setting('t.emp')::uuid)), 'sem avisos depois de SAIR');
select pg_temp.ok((select count(*) = 1 from whatsapp_remetente('5592991234567')), 'mas ainda pode mandar documentos');
select pg_temp.ok(not whatsapp_avisos_por_numero('5500000000000', false), 'número desconhecido não muda nada');

-- régua automática: desligada não manda nada; ligada, só a conta de hoje do cliente com celular, uma vez
select pg_temp.ok((select count(*) = 0 from cobrancas_whatsapp_devidas() where empresa_id = current_setting('t.emp')::uuid), 'régua desligada');
update automacoes_empresa set whatsapp_cobranca = true where empresa_id = current_setting('t.emp')::uuid;
create temp table dev as select * from cobrancas_whatsapp_devidas() where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select count(*) = 1 from dev), 'uma cobrança devida');
select pg_temp.ok((select faixa = 'hoje' and cliente = 'Mercado Zap' and saldo_cents = 12000 and empresa = 'Piscicultura Zap' from dev), 'conta de hoje com saldo e nome');
select pg_temp.ok(marcar_cobranca_whatsapp((select agendamento_id from dev), 'hoje', '5592988887777'), 'marca enviada');
select pg_temp.ok(not marcar_cobranca_whatsapp((select agendamento_id from dev), 'hoje', '5592988887777'), 'não marca duas vezes');
select pg_temp.ok((select count(*) = 0 from cobrancas_whatsapp_devidas() where empresa_id = current_setting('t.emp')::uuid), 'não repete a fase');

-- documentos podem chegar pelo WhatsApp
insert into documentos_recebidos (empresa_id, origem, nome_arquivo) values (current_setting('t.emp')::uuid, 'whatsapp', 'boleto.jpg');

-- pedir código de novo para o mesmo celular mantém confirmado; para outro, desconfirma
set role authenticated;
set request.jwt.claim.sub = 'a0870000-0000-0000-0000-000000000001';
select whatsapp_pedir_codigo(current_setting('t.emp')::uuid, '92991234567');
select pg_temp.ok((select confirmado_em is not null from whatsapp_vinculos), 'mesmo celular segue confirmado');
select whatsapp_pedir_codigo(current_setting('t.emp')::uuid, '92977776666');
select pg_temp.ok((select confirmado_em is null from whatsapp_vinculos), 'celular novo precisa confirmar');
delete from whatsapp_vinculos;
select pg_temp.ok((select count(*) = 0 from whatsapp_vinculos), 'apaga o próprio celular');
reset role;
