-- Zerar todo o sistema: só o master, com o código do autenticador digitado agora, o nome da empresa e a
-- frase ZERAR TUDO. Apaga os movimentos da empresa e mantém cadastros, usuários e configurações.
-- Nenhuma outra empresa é tocada.
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

-- O que o zerar apaga e o que mantém. Toda tabela com empresa_id precisa estar numa das duas listas:
-- tabela nova entra em public.zerar_sistema (e no backup da tela) ou em "mantidas".
create temp table apagadas (tabela text primary key);
insert into apagadas values
  ('agendamentos'), ('agendamento_rateios'), ('baixas'), ('transferencias'), ('recorrencias'), ('recorrencia_reajustes'),
  ('cobrancas'), ('remessas_cnab'), ('pagamentos_saida'), ('whatsapp_cobrancas'), ('importacoes_extrato'),
  ('movimentos_bancarios'), ('conciliacoes'), ('periodos_fechados'), ('movimentos_apagados'),
  ('notas_fiscais'), ('inutilizacoes_nfe'), ('nfes_recebidas'), ('pedidos_venda'), ('pedidos_fixos_gerados'),
  ('compras_grupo'), ('transferencias_peixe'), ('transferencia_peixe_itens'),
  ('movimentos_estoque'), ('ordens_producao_racao'),
  ('lotes'), ('lote_alocacoes'), ('lote_transferencias'), ('custos_lote_mensal'), ('apontamentos_diarios'),
  ('apontamento_lancamentos'), ('apontamento_racoes'), ('apontamento_checklist'), ('apontamentos_lixeira'),
  ('eventos_sanitarios'), ('despescas'), ('biometrias'), ('leituras_sonda'), ('racao_entradas'), ('racao_estornos'), ('racao_ajustes'),
  ('documentos'), ('documentos_recebidos'), ('lembretes_enviados'), ('sugestoes_dispensadas'),
  ('api_webhook_entregas'), ('auditorias_importacao');
create temp table mantidas (tabela text primary key);
insert into mantidas values
  -- acesso, plataforma e histórico
  ('usuarios_empresa'), ('convites'), ('cargos'), ('logins_locais'), ('assinaturas'), ('audit_log'), ('ia_uso'),
  ('api_chaves'), ('api_webhooks'), ('push_inscricoes'), ('whatsapp_vinculos'), ('assistente_inicio'),
  -- configurações e integrações
  ('automacoes_empresa'), ('integracoes_empresa'), ('contas_asaas'), ('focus_emitentes'), ('lcdpr_config'),
  ('conexoes_bancarias'), ('perfis_cobranca'),
  -- cadastros
  ('contatos'), ('produtos'), ('produto_embalagens'), ('classes_peixe'), ('depositos'), ('setores'), ('viveiros'),
  ('especies'), ('categorias'), ('centros_custo'), ('contas_financeiras'), ('formulas_racao'), ('medicamentos'),
  ('listas_preco'), ('tabelas_preco'), ('pontos_venda'), ('regras_conciliacao'), ('regras_fiscais'),
  ('pedidos_fixos'), ('checklist_itens'), ('importacao_vinculos'), ('sondas'),
  -- planejamento e orçamento
  ('lotes_planejados'), ('planejamento_parametros'), ('planejamento_custos'), ('orcamentos');

select pg_temp.ok(not exists (select 1 from apagadas join mantidas using (tabela)), 'nenhuma tabela nas duas listas');
create temp table com_empresa as
  select c.relname::text as tabela from pg_class c join pg_namespace s on s.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped
  where s.nspname = 'public' and c.relkind in ('r', 'p');
select pg_temp.ok(not exists (select 1 from com_empresa where tabela not in (select tabela from apagadas union all select tabela from mantidas)),
  'toda tabela com empresa_id está classificada: ' || coalesce((select string_agg(tabela, ', ') from com_empresa
    where tabela not in (select tabela from apagadas union all select tabela from mantidas)), 'ok'));
select pg_temp.ok(not exists (select 1 from (select tabela from apagadas union all select tabela from mantidas) t
                              where tabela not in (select tabela from com_empresa)), 'as listas só citam tabelas que existem');

-- Contagem por empresa de toda tabela com empresa_id
create or replace function pg_temp.contar(p_empresa uuid) returns table (tabela text, n bigint) language plpgsql as $$
declare t text;
begin
  for t in select c.tabela from com_empresa c order by 1 loop
    tabela := t;
    execute format('select count(*) from %I where empresa_id = $1', t) into n using p_empresa;
    return next;
  end loop;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('9af00000-0000-0000-0000-0000000000a1', 'master@zerartudo.com', now()),
  ('9af00000-0000-0000-0000-0000000000a2', 'gerente@zerartudo.com', now()),
  ('9af00000-0000-0000-0000-0000000000a3', 'vizinha@zerartudo.com', now());
insert into auth.mfa_factors (user_id, status) values ('9af00000-0000-0000-0000-0000000000a1', 'verified');

-- Monta uma piscicultura com um pouco de tudo, e uma vizinha também com dados.
set role authenticated;
set request.jwt.claim.sub = '9af00000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"aal": "aal1"}';
select set_config('t.outra', criar_empresa('77666555000144', 'Piscicultura Vizinha Tudo Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('9af00000-0000-0000-0000-0000000000f1', current_setting('t.outra')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9af00000-0000-0000-0000-0000000000f2', current_setting('t.outra')::uuid, '9af00000-0000-0000-0000-0000000000f1', 'G1', 'engorda', 20000);
select povoar_lote(current_setting('t.outra')::uuid, 'V1', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, '9af00000-0000-0000-0000-0000000000f2', 5000, 5);
select registrar_apontamento(current_setting('t.outra')::uuid, null, '9af00000-0000-0000-0000-0000000000f2', current_date - 1, 'manha');
select importar_pacote(current_setting('t.outra')::uuid, $j${"origem": "nibo",
  "contas": [{"chave": "c", "nome": "Banco", "tipo": "corrente", "saldo_inicial_cents": 900, "saldo_inicial_data": "2025-12-31"}],
  "titulos": [{"chave": "agendamento:o1", "tipo": "pagar", "descricao": "Luz", "vencimento": "2026-01-10", "valor_cents": 500,
               "baixas": [{"chave": "lancamento:o1", "conta_chave": "c", "data": "2026-01-10", "valor_cents": 500}]}]}$j$::jsonb);

set request.jwt.claim.sub = '9af00000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, false);
select set_config('t.emp', criar_empresa('77666555000225', 'Piscicultura Zerar Tudo Ltda', 'Zera Tudo')::text, false);
select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null limit 1), false);

-- produção: lote, apontamento com ração e checklist, biometria e despesca
insert into setores (id, empresa_id, nome) values ('9af00000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9af00000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000b1', 'G1', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'A1', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, '9af00000-0000-0000-0000-0000000000b2', 10000, 5)::text, false);
insert into depositos (id, empresa_id, nome, tipo) values
  ('9af00000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'Fábrica', 'racao');
insert into produtos (id, empresa_id, tipo, nome, unidade) values
  ('9af00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'racao', 'Engorda 1', 'kg');
select registrar_entrada('9af00000-0000-0000-0000-0000000000c1', '9af00000-0000-0000-0000-0000000000d1', current_date - 5, 5000, 200);
select set_config('t.l1', registrar_apontamento(current_setting('t.emp')::uuid, null, '9af00000-0000-0000-0000-0000000000b2',
  current_date - 1, 'manha', 4, 1, 1200)::text, false);
select completar_lancamento(current_setting('t.l1')::uuid,
  '[{"produto_id":"9af00000-0000-0000-0000-0000000000c1","kg":1200}]',
  (select jsonb_agg(jsonb_build_object('item_id', id, 'ok', true, 'valor', 25)) from checklist_itens where empresa_id = current_setting('t.emp')::uuid));
select registrar_biometria(current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000b2', current_date - 1, 50, null, 350);
-- sonda (cadastro, fica) com leituras (movimento, sai no zerar)
insert into sondas (empresa_id, viveiro_id, nome) values (current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000b2', 'Sonda 1');
insert into leituras_sonda (sonda_id, empresa_id, oxigenio_mg_l, temperatura_c, ph)
  select id, empresa_id, 5.2, 28.1, 7.0 from sondas where empresa_id = current_setting('t.emp')::uuid;
select registrar_despesca(current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000b2', current_date, 'parcial', 3600, 1200,
  jsonb_build_object((select id from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), 3600));

-- comercial: cliente, pedido faturado (título + estoque) e nota
insert into contatos (id, empresa_id, tipos, nome) values ('9af00000-0000-0000-0000-0000000000e1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado');
select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000e1',
  jsonb_build_array(jsonb_build_object('produto_id',
    (select id from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'),
    'quantidade', 1, 'preco_unit_cents', 20000)))::text, false);
select faturar_pedido(current_setting('t.ped')::uuid);
insert into notas_fiscais (empresa_id, destinatario_id, valor_total_cents, pedido_venda_id)
values (current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000e1', 20000, current_setting('t.ped')::uuid);

-- financeiro: conta com saldo, título com boleto pago pelo Asaas, extrato, mês fechado
select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "nibo",
  "contas": [{"chave": "acc1", "nome": "Banco", "tipo": "corrente", "saldo_inicial_cents": 5000, "saldo_inicial_data": "2025-12-31"}],
  "titulos": [{"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
               "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000}]}]
}$j$::jsonb);
select fechar_mes(current_setting('t.emp')::uuid, '2026-01-01');
insert into perfis_cobranca (id, empresa_id, nome, provedor, conta_repasse_id) values
  ('9af00000-0000-0000-0000-0000000000a9', current_setting('t.emp')::uuid, 'Asaas', 'asaas',
   (select id from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'));
select set_config('t.tit', agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Energia', current_date + 2, current_date, 30000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 30000)), null, repeat('8', 48))::text, false);
insert into orcamentos (empresa_id, categoria_id, ano, mes, valor_cents)
values (current_setting('t.emp')::uuid, current_setting('t.cat')::uuid, 2026, 1, 100000);

reset role;
-- o que a tela/servidor grava direto: pagamento pelo Asaas, documento
insert into pagamentos_saida (empresa_id, agendamento_id, perfil_cobranca_id, linha, valor_cents, data_pagamento)
values (current_setting('t.emp')::uuid, current_setting('t.tit')::uuid, '9af00000-0000-0000-0000-0000000000a9', repeat('8', 48), 30000, current_date + 2);
insert into documentos (empresa_id, origem, arquivo_path, nome_arquivo)
values (current_setting('t.emp')::uuid, 'anexo', 'x/boleto.pdf', 'boleto.pdf');
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin, ativo)
  values (current_setting('t.emp')::uuid, '9af00000-0000-0000-0000-0000000000a2', 'sem_restricao', false, true);

select set_config('t.cc_lote', (select centro_custo_id::text from lotes where id = current_setting('t.lote')::uuid), false);
select pg_temp.ok(exists (select 1 from centros_custo where id = current_setting('t.cc_lote')::uuid and tipo = 'lote'), 'preparo: lote tem centro de custo');
create temp table antes as select * from pg_temp.contar(current_setting('t.emp')::uuid);
create temp table antes_outra as select * from pg_temp.contar(current_setting('t.outra')::uuid);
select pg_temp.ok((select bool_and(n > 0) from antes where tabela in ('lotes', 'apontamentos_diarios', 'apontamento_racoes',
  'apontamento_checklist', 'biometrias', 'despescas', 'movimentos_estoque', 'pedidos_venda', 'notas_fiscais', 'agendamentos', 'baixas',
  'periodos_fechados', 'pagamentos_saida', 'documentos', 'lote_alocacoes')),
  'preparo: a piscicultura tem produção, estoque, vendas, financeiro e documentos: ' ||
  coalesce((select string_agg(tabela, ', ') from antes where n = 0 and tabela in ('lotes', 'apontamentos_diarios', 'apontamento_racoes',
  'apontamento_checklist', 'biometrias', 'despescas', 'movimentos_estoque', 'pedidos_venda', 'notas_fiscais', 'agendamentos', 'baixas',
  'periodos_fechados', 'pagamentos_saida', 'documentos', 'lote_alocacoes')), ''));
select pg_temp.ok((select n > 0 from antes_outra where tabela = 'lotes') and (select n > 0 from antes_outra where tabela = 'baixas'),
  'preparo: a vizinha também tem dados');

set role authenticated;
-- Quem não é master não zera, nem com o código em dia
set request.jwt.claim.sub = '9af00000-0000-0000-0000-0000000000a2';
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Zerar Tudo Ltda', 'ZERAR TUDO')$$, current_setting('t.emp')), 'Só o master');
-- Master de outra empresa também não
set request.jwt.claim.sub = '9af00000-0000-0000-0000-0000000000a3';
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Zerar Tudo Ltda', 'ZERAR TUDO')$$, current_setting('t.emp')), 'Só o master');

-- O master precisa digitar o código agora: o da entrada (há uma hora) não vale, nem sessão sem 2º fator
set request.jwt.claim.sub = '9af00000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Zerar Tudo Ltda', 'ZERAR TUDO')$$, current_setting('t.emp')), 'código do autenticador');
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal1', 'amr', jsonb_build_array(
  jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text, false);
-- (sem o 2º fator a sessão do master com autenticador nem vale como master)
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Zerar Tudo Ltda', 'ZERAR TUDO')$$, current_setting('t.emp')), 'Só o master');

-- Código digitado agora: faltam o nome da empresa e a frase
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Errada', 'ZERAR TUDO')$$, current_setting('t.emp')), 'nome da empresa');
select pg_temp.espera_erro(format($$select zerar_sistema(%L, null, 'ZERAR TUDO')$$, current_setting('t.emp')), 'nome da empresa');
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Zerar Tudo Ltda', 'zerar')$$, current_setting('t.emp')), 'ZERAR TUDO');
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Zerar Tudo Ltda', null)$$, current_setting('t.emp')), 'ZERAR TUDO');
-- O master não zera a vizinha pelo id dela
select pg_temp.espera_erro(format($$select zerar_sistema(%L, 'Piscicultura Vizinha Tudo Ltda', 'ZERAR TUDO')$$, current_setting('t.outra')), 'Só o master');
reset role;
select pg_temp.ok(not exists (select 1 from pg_temp.contar(current_setting('t.emp')::uuid) d join antes a using (tabela) where d.n <> a.n),
  'recusas não apagam nada');
set role authenticated;

-- Zera (nome fantasia vale; maiúsculas e espaços não importam)
select set_config('t.res', zerar_sistema(current_setting('t.emp')::uuid, '  zera   TUDO ', ' zerar   tudo ')::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'lotes')::int = 1 and (current_setting('t.res')::jsonb->>'apontamentos')::int = 1
  and (current_setting('t.res')::jsonb->>'pedidos')::int = 1 and (current_setting('t.res')::jsonb->>'notas_fiscais')::int = 1
  and (current_setting('t.res')::jsonb->>'titulos')::int = 3 and not (current_setting('t.res')::jsonb ? 'batidas_ponto'),
  'devolve o que apagou: ' || current_setting('t.res'));
reset role;

create temp table depois as select * from pg_temp.contar(current_setting('t.emp')::uuid);
select pg_temp.ok(not exists (select 1 from depois join apagadas using (tabela) where n > 0),
  'movimentos apagados: ' || coalesce((select string_agg(tabela || '=' || n, ', ') from depois join apagadas using (tabela) where n > 0), ''));
select pg_temp.ok(not exists (select 1 from depois d join antes a using (tabela) join mantidas using (tabela)
                              where d.n <> a.n and tabela not in ('audit_log', 'centros_custo', 'importacao_vinculos')),
  'cadastros, usuários e configurações ficam: ' || coalesce((select string_agg(tabela || ' ' || a.n || '→' || d.n, ', ')
    from depois d join antes a using (tabela) join mantidas using (tabela)
    where d.n <> a.n and tabela not in ('audit_log', 'centros_custo', 'importacao_vinculos')), ''));
select pg_temp.ok(not exists (select 1 from centros_custo where id = current_setting('t.cc_lote')::uuid)
  and (select n from depois where tabela = 'centros_custo') = (select n - 1 from antes where tabela = 'centros_custo'),
  'o centro de custo automático do lote sai com ele');
select pg_temp.ok((select count(*) = 1 from importacao_vinculos where empresa_id = current_setting('t.emp')::uuid)
  and exists (select 1 from importacao_vinculos where empresa_id = current_setting('t.emp')::uuid and entidade = 'conta'),
  'vínculo da conta importada fica; os de movimentos saem');
select pg_temp.ok((select bool_and(saldo_cents = 0) from saldos_contas where empresa_id = current_setting('t.emp')::uuid),
  'contas continuam, com saldo zero');
select pg_temp.ok((select coalesce(sum(saldo), 0) = 0 from saldos_produtos p join produtos x on x.id = p.produto_id
                   where x.empresa_id = current_setting('t.emp')::uuid), 'estoque zerado');
select pg_temp.ok((select count(*) = 1 from audit_log where empresa_id = current_setting('t.emp')::uuid and tabela = 'sistema'
                   and acao = 'delete' and user_id = '9af00000-0000-0000-0000-0000000000a1' and resumo like 'Zerou todo o sistema%'),
  'fica registrado no histórico, com quem fez');
select pg_temp.ok((select count(*) > 0 from audit_log where empresa_id = current_setting('t.emp')::uuid and tabela = 'lotes' and acao = 'delete'),
  'cada linha apagada fica no histórico');
select pg_temp.ok(not exists (select 1 from pg_temp.contar(current_setting('t.outra')::uuid) d join antes_outra a using (tabela) where d.n <> a.n),
  'a vizinha fica intacta');
select pg_temp.ok(current_setting('app.zerando_sistema', true) is distinct from current_setting('t.emp'),
  'a trava de batidas volta ao normal');

-- A piscicultura continua usável: povoa lote e aponta de novo
set role authenticated;
set request.jwt.claim.sub = '9af00000-0000-0000-0000-0000000000a1';
select povoar_lote(current_setting('t.emp')::uuid, 'A2', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, '9af00000-0000-0000-0000-0000000000b2', 8000, 5);
select registrar_apontamento(current_setting('t.emp')::uuid, null, '9af00000-0000-0000-0000-0000000000b2', current_date - 1, 'manha');
select pg_temp.ok((select count(*) = 1 from apontamentos_diarios where empresa_id = current_setting('t.emp')::uuid), 'dá para recomeçar a produção');
-- Zerar de novo não quebra (nada para apagar)
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, false);
select zerar_sistema(current_setting('t.emp')::uuid, 'Piscicultura Zerar Tudo Ltda', 'ZERAR TUDO');
select zerar_sistema(current_setting('t.emp')::uuid, 'Piscicultura Zerar Tudo Ltda', 'ZERAR TUDO');
select pg_temp.ok((select count(*) = 0 from lotes where empresa_id = current_setting('t.emp')::uuid), 'zerar duas vezes seguidas funciona');
reset role;
\echo TESTES DE ZERAR TODO O SISTEMA PASSARAM
