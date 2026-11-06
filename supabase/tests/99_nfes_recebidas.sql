-- NF-e de compra pela SEFAZ (B1): gravação do lote da Focus, fornecedor reconhecido pelo CNPJ,
-- lançar como conta a pagar e as travas de quem grava.
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
  ('a0830000-0000-0000-0000-000000000001', 'dono@mde.com', now()),
  ('a0830000-0000-0000-0000-000000000002', 'tratador@mde.com', now());

set role authenticated;
set request.jwt.claim.sub = 'a0830000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('83838383000107', 'Piscicultura MDe Ltda')::text, false);
select set_config('t.racao', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
insert into contatos (id, empresa_id, nome, tipos, cpf_cnpj) values
  ('a0830000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Cerealista Norte', '{fornecedor}', '11222333000181');
-- histórico: a última compra da cerealista foi em Milho
select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho setembro', current_date - 30, current_date - 30, 100000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.racao'), 'valor_cents', 100000)), 'a0830000-0000-0000-0000-0000000000c1');
insert into automacoes_empresa (empresa_id, mde_ligado) values (current_setting('t.emp')::uuid, true);

-- ninguém do app grava nota recebida
select pg_temp.espera_erro(format($$insert into nfes_recebidas (empresa_id, chave, emitente_nome) values (%L, %L, 'X')$$,
  current_setting('t.emp'), repeat('1', 44)), 'row-level security');
select pg_temp.espera_erro($$select public.mde_empresas_ligadas()$$, 'permission denied');
reset role;

select pg_temp.ok((select count(*) = 1 from public.mde_empresas_ligadas() where empresa_id = current_setting('t.emp')::uuid and cnpj = '83838383000107' and versao = 0),
  'empresa com a busca ligada aparece para a rotina');

select pg_temp.ok(public.registrar_nfes_recebidas(current_setting('t.emp')::uuid, jsonb_build_array(
  jsonb_build_object('chave_nfe', '132610' || repeat('0', 14) || '55001' || '000001234' || repeat('5', 10), 'nome_emitente', 'Cerealista Norte',
    'documento_emitente', '11.222.333/0001-81', 'valor_total', '24560.00', 'data_emissao', now() - interval '1 day',
    'situacao', 'autorizada', 'manifestacao_destinatario', 'nulo', 'nfe_completa', false, 'tipo_nfe', '1', 'versao', 10),
  jsonb_build_object('chave_nfe', repeat('2', 44), 'nome_emitente', 'Embalagens Sul', 'documento_emitente', '99888777000166',
    'valor_total', '800.50', 'data_emissao', now(), 'situacao', 'autorizada', 'tipo_nfe', '1', 'versao', 11),
  jsonb_build_object('chave_nfe', repeat('3', 44), 'nome_emitente', 'Devolução', 'tipo_nfe', '0', 'versao', 12),
  jsonb_build_object('chave_nfe', 'invalida', 'nome_emitente', 'Lixo', 'versao', 13)
), 13) = 2, 'grava só as notas de entrada com chave válida');
select pg_temp.ok((select mde_versao = 13 from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid), 'guarda a última versão lida');
select pg_temp.ok((select contato_id = 'a0830000-0000-0000-0000-0000000000c1' and valor_cents = 2456000 from nfes_recebidas where emitente_nome = 'Cerealista Norte'),
  'reconhece o fornecedor pelo CNPJ e converte o valor para centavos');

-- de novo, com a nota cancelada: atualiza, não duplica
select pg_temp.ok(public.registrar_nfes_recebidas(current_setting('t.emp')::uuid, jsonb_build_array(
  jsonb_build_object('chave_nfe', repeat('2', 44), 'nome_emitente', 'Embalagens Sul', 'situacao', 'cancelada', 'versao', 14)), 14) = 0,
  'nota repetida não conta como nova');
select pg_temp.ok((select count(*) = 2 from nfes_recebidas where empresa_id = current_setting('t.emp')::uuid)
  and (select situacao = 'cancelada' from nfes_recebidas where chave = repeat('2', 44)), 'atualiza a situação');

set role authenticated;
set request.jwt.claim.sub = 'a0830000-0000-0000-0000-000000000001';
select pg_temp.ok((select categoria_id = current_setting('t.racao')::uuid from custeio_habitual('a0830000-0000-0000-0000-0000000000c1')),
  'categoria de costume do fornecedor');
select set_config('t.nf1', (select id::text from nfes_recebidas where emitente_nome = 'Cerealista Norte'), false);
select set_config('t.nf2', (select id::text from nfes_recebidas where emitente_nome = 'Embalagens Sul'), false);
select pg_temp.espera_erro(format($$select lancar_nfe_recebida(%L, current_date + 10, %L)$$, current_setting('t.nf2'), current_setting('t.racao')), 'cancelada');

-- tratador não lança
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes)
values (current_setting('t.emp')::uuid, 'a0830000-0000-0000-0000-000000000002', 'apontador', '{}');
set role authenticated;
set request.jwt.claim.sub = 'a0830000-0000-0000-0000-000000000002';
select pg_temp.espera_erro(format($$select lancar_nfe_recebida(%L, current_date + 10, %L)$$, current_setting('t.nf1'), current_setting('t.racao')), 'não');

set request.jwt.claim.sub = 'a0830000-0000-0000-0000-000000000001';
select lancar_nfe_recebida(current_setting('t.nf1')::uuid, current_date + 10, current_setting('t.racao')::uuid);
select pg_temp.ok((select n.status = 'lancada' and a.valor_cents = 2456000 and a.contato_id = 'a0830000-0000-0000-0000-0000000000c1'
  and a.vencimento = current_date + 10 and a.descricao = 'NF-e 1234 · Cerealista Norte'
  from nfes_recebidas n join agendamentos a on a.id = n.agendamento_id where n.id = current_setting('t.nf1')::uuid),
  'vira conta a pagar do fornecedor, com número da nota, valor e vencimento');
select pg_temp.espera_erro(format($$select lancar_nfe_recebida(%L, current_date + 10, %L)$$, current_setting('t.nf1'), current_setting('t.racao')), 'já foi lançada');

-- fornecedor novo é cadastrado ao lançar
reset role;
select public.registrar_nfes_recebidas(current_setting('t.emp')::uuid, jsonb_build_array(
  jsonb_build_object('chave_nfe', repeat('4', 44), 'nome_emitente', 'Vacinas Brasil', 'documento_emitente', '55666777000150',
    'valor_total', '300', 'data_emissao', now(), 'tipo_nfe', '1', 'versao', 15)), 15);
set role authenticated;
select lancar_nfe_recebida((select id from nfes_recebidas where chave = repeat('4', 44)), current_date + 5, current_setting('t.racao')::uuid);
select pg_temp.ok((select c.nome = 'Vacinas Brasil' and c.cpf_cnpj = '55666777000150' and 'fornecedor' = any(c.tipos)
  from nfes_recebidas n join contatos c on c.id = n.contato_id where n.chave = repeat('4', 44)), 'cadastra o fornecedor da nota');

update nfes_recebidas set status = 'ignorada' where id = current_setting('t.nf2')::uuid;
select pg_temp.ok((select status = 'ignorada' from nfes_recebidas where id = current_setting('t.nf2')::uuid), 'quem lança contas pode ignorar');
delete from nfes_recebidas where id = current_setting('t.nf2')::uuid;
select pg_temp.ok(exists (select 1 from nfes_recebidas where id = current_setting('t.nf2')::uuid), 'nota recebida não se apaga');
reset role;

\o
\echo 'TESTES DAS NF-E RECEBIDAS PASSARAM'
