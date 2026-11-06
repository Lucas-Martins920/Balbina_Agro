-- Usuário master, convites, perfis e permissões por módulo.
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

-- m = master, a = apontador (já tem conta), v = vendedor (cria a conta depois), l = só leitura, f = financeiro
insert into auth.users (id, email, email_confirmed_at) values
  ('95000000-0000-0000-0000-0000000000a1', 'Master@Piscicultura.com', now()),
  ('95000000-0000-0000-0000-0000000000a2', 'apontador@piscicultura.com', now()),
  ('95000000-0000-0000-0000-0000000000a4', 'leitor@piscicultura.com', now()),
  ('95000000-0000-0000-0000-0000000000a5', 'fin@piscicultura.com', now());

set role authenticated;
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('95111222000133', 'Piscicultura P Ltda')::text, false);
select pg_temp.ok((select is_admin and email = 'master@piscicultura.com' from usuarios_empresa where user_id = '95000000-0000-0000-0000-0000000000a1'),
  'quem cria a empresa vira master com o e-mail registrado');
select pg_temp.ok((minhas_permissoes(current_setting('t.emp')::uuid)->>'master')::boolean, 'minhas_permissoes diz que é master');

select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, ' Apontador@Piscicultura.com ', 'apontador') = 'adicionado', 'usuário com conta entra na hora');
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'vendedor@piscicultura.com', 'vendedor') = 'convidado', 'usuário sem conta fica convidado');
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'leitor@piscicultura.com', 'visualizacao') = 'adicionado', 'leitor adicionado');
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'fin@piscicultura.com', 'financeiro') = 'adicionado', 'financeiro adicionado');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'apontador@piscicultura.com', 'apontador')$$, current_setting('t.emp')), 'já tem acesso');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'x@piscicultura.com', 'dono')$$, current_setting('t.emp')), 'Perfil inválido');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'sem-arroba', 'caixa')$$, current_setting('t.emp')), 'E-mail inválido');
select pg_temp.ok((select count(*) from convites where empresa_id = current_setting('t.emp')::uuid) = 1, 'master vê o convite pendente');

-- base para os testes de módulo
select set_config('t.extra', (select id::text from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), false);
insert into setores (id, empresa_id, nome) values ('95000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('95000000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, '95000000-0000-0000-0000-000000000001', 'G1', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'P1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '95000000-0000-0000-0000-000000000002', 10000, 5)::text, false);
insert into contatos (id, empresa_id, tipos, nome) values ('95000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado P');
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
select definir_preco(current_setting('t.cx')::uuid, 18000, null, current_date - 30);
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and sentido = 'saida' and parent_id is null limit 1), false);

-- Apontador: lança o apontamento e a despesca (o estoque anda junto), mas não mexe em lote nem no financeiro
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a2';
select pg_temp.ok(not (minhas_permissoes(current_setting('t.emp')::uuid)->>'master')::boolean, 'apontador não é master');
select registrar_apontamento(current_setting('t.emp')::uuid, null, '95000000-0000-0000-0000-000000000002', current_date - 1,
  'manha', 3, 0, 1100);
select pg_temp.ok((select mortes = 3 from apontamentos_diarios where lote_id = current_setting('t.lote')::uuid and data = current_date - 1), 'apontador lança o apontamento');
select registrar_despesca(current_setting('t.emp')::uuid, '95000000-0000-0000-0000-000000000002', current_date, 'parcial', 500, 400,
  jsonb_build_object(current_setting('t.extra'), 500));
select pg_temp.ok((select saldo from estoque_peixe where classe_id = current_setting('t.extra')::uuid) = 500, 'apontador lança a despesca e o peixe entra no estoque');
select pg_temp.espera_erro(format($$insert into setores (empresa_id, nome) values (%L, 'Outro')$$, current_setting('t.emp')), 'row-level security');
select pg_temp.espera_erro(format($$select agendar_titulo(%L, 'pagar', 'Milho', current_date, current_date, 1000, jsonb_build_array(jsonb_build_object('categoria_id', %L, 'valor_cents', 1000)))$$,
  current_setting('t.emp'), current_setting('t.desp')), 'row-level security');
update lotes set codigo = 'Hackeado' where id = current_setting('t.lote')::uuid;
select pg_temp.ok((select codigo from lotes where id = current_setting('t.lote')::uuid) = 'P1', 'apontador não altera lote');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'lotes.ver') and not app.pode(current_setting('t.emp')::uuid, 'vendas.ver'), 'apontador vê lotes e não vê vendas');

-- Ninguém sem ser master mexe em usuários nem na empresa
update usuarios_empresa set is_admin = true, perfil = 'sem_restricao' where user_id = auth.uid();
select pg_temp.ok((select not is_admin and perfil = 'apontador' from usuarios_empresa where user_id = '95000000-0000-0000-0000-0000000000a2'), 'membro não se promove a master');
select pg_temp.espera_erro(format($$insert into usuarios_empresa (empresa_id, user_id, perfil) values (%L, gen_random_uuid(), 'sem_restricao')$$, current_setting('t.emp')), 'row-level security');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'amigo@piscicultura.com', 'sem_restricao', '{}', true)$$, current_setting('t.emp')), 'Só o usuário master');
select pg_temp.espera_erro(format($$select atualizar_usuario(%L, auth.uid(), 'sem_restricao', '{}', true, true)$$, current_setting('t.emp')), 'Só o usuário master');
delete from empresas where id = current_setting('t.emp')::uuid;
update empresas set razao_social = 'X' where id = current_setting('t.emp')::uuid;
select pg_temp.ok((select razao_social from empresas where id = current_setting('t.emp')::uuid) = 'Piscicultura P Ltda', 'membro comum não apaga nem altera a empresa');
select pg_temp.ok((select count(*) from convites) = 0, 'convites só aparecem para o master');

-- Vendedor cria a conta depois do convite e entra no login
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('95000000-0000-0000-0000-0000000000a3', 'vendedor@piscicultura.com', null);
set role authenticated;
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a3';
select pg_temp.ok(aceitar_convites() = 0, 'e-mail não confirmado não aceita convite');
reset role;
update auth.users set email_confirmed_at = now() where id = '95000000-0000-0000-0000-0000000000a3';
set role authenticated;
select pg_temp.ok(aceitar_convites() = 1, 'e-mail confirmado aceita o convite');
select pg_temp.ok((select perfil = 'vendedor' from usuarios_empresa where user_id = auth.uid()), 'vendedor entrou com o perfil do convite');

select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, '95000000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 2)), current_date, null, '[{"dias":0,"pct":100}]')::text, false);
select pg_temp.ok(faturar_pedido(current_setting('t.ped')::uuid) = 1, 'vendedor fatura: baixa o estoque e gera conta a receber');
select pg_temp.ok((select count(*) from agendamentos where origem = 'pedido_venda' and origem_id = current_setting('t.ped')::uuid) = 1, 'conta a receber criada pelo vendedor');
select pg_temp.espera_erro(format($$select cancelar_pedido(%L)$$, current_setting('t.ped')), 'row-level security');
select pg_temp.espera_erro(format($$select definir_preco(%L, 1, null, current_date)$$, current_setting('t.cx')), 'row-level security');
select pg_temp.espera_erro(format($$select agendar_titulo(%L, 'pagar', 'Milho', current_date, current_date, 1000, jsonb_build_array(jsonb_build_object('categoria_id', %L, 'valor_cents', 1000)))$$,
  current_setting('t.emp'), current_setting('t.desp')), 'row-level security');

-- Leitor: vê tudo, não grava nada, mas abrir contas a pagar gera as recorrências
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a4';
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'vendas.ver') and not app.pode(current_setting('t.emp')::uuid, 'vendas.lancar'), 'leitor vê e não lança');
select pg_temp.espera_erro(format($$insert into contatos (empresa_id, tipos, nome) values (%L, '{cliente}', 'X')$$, current_setting('t.emp')), 'row-level security');
select pg_temp.ok((select count(*) from pedidos_venda) = 1, 'leitor enxerga os pedidos');
select pg_temp.ok(gerar_recorrencias(current_setting('t.emp')::uuid) = 0, 'leitor pode abrir as telas que geram recorrências');

-- Financeiro: lança contas, fecha o mês, não mexe em produção
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a5';
select pg_temp.ok(agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Milho', current_date, date_trunc('month', current_date)::date, 1000,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.desp'), 'valor_cents', 1000))) is not null, 'financeiro lança conta a pagar');
select pg_temp.espera_erro(format($$select registrar_apontamento(%L, null, '95000000-0000-0000-0000-000000000002', current_date, 'manha', 1, 0, 1)$$, current_setting('t.emp')), 'row-level security');

-- Master ajusta acesso, bloqueia e não fica sem master
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a1';
select cancelar_pedido(current_setting('t.ped')::uuid);
select pg_temp.ok((select status from pedidos_venda where id = current_setting('t.ped')::uuid) = 'cancelado', 'master cancela pedido');
select atualizar_usuario(current_setting('t.emp')::uuid, '95000000-0000-0000-0000-0000000000a3', 'vendedor', '{vendas.cancelar}', false, true);
select atualizar_usuario(current_setting('t.emp')::uuid, '95000000-0000-0000-0000-0000000000a4', 'visualizacao', '{}', false, false);
select pg_temp.espera_erro(format($$select atualizar_usuario(%L, auth.uid(), 'sem_restricao', '{}', false, true)$$, current_setting('t.emp')), 'pelo menos um usuário master');
select pg_temp.espera_erro(format($$select remover_usuario(%L, auth.uid())$$, current_setting('t.emp')), 'pelo menos um usuário master');
select pg_temp.espera_erro(format($$select atualizar_usuario(%L, '95000000-0000-0000-0000-0000000000a3', 'vendedor', '{"drop table"}', false, true)$$, current_setting('t.emp')), 'formato inválido');

set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a3';
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'vendas.cancelar'), 'permissão avulsa soma ao perfil');
set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a4';
select pg_temp.ok((select count(*) from empresas) = 0 and (select count(*) from pedidos_venda) = 0, 'usuário bloqueado não enxerga a empresa');
select pg_temp.ok(minhas_permissoes(current_setting('t.emp')::uuid) is null, 'usuário bloqueado fica sem permissões');

set request.jwt.claim.sub = '95000000-0000-0000-0000-0000000000a1';
select convidar_usuario(current_setting('t.emp')::uuid, 'novo@piscicultura.com', 'caixa');
select cancelar_convite((select id from convites where email = 'novo@piscicultura.com'));
select remover_usuario(current_setting('t.emp')::uuid, '95000000-0000-0000-0000-0000000000a4');
select pg_temp.ok((select count(*) from usuarios_empresa where empresa_id = current_setting('t.emp')::uuid) = 4 and (select count(*) from convites) = 0,
  'master cancela convite e remove usuário');
select pg_temp.ok((permissoes_dos_perfis()->'caixa') ? 'pdv.operar', 'perfis prontos expostos para a tela');

reset role;
\o
\echo 'TESTES DE USUÁRIOS E PERMISSÕES PASSARAM'
