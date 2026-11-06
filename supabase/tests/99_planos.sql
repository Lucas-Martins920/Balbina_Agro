-- Planos do Balbina: cada nível só libera os módulos dele, inclusive para o master.
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

-- muda o plano como o webhook faria: teste acabou, mensalidade paga
create or replace function pg_temp.plano(p_plano text) returns void language sql as $$
  update assinaturas set plano_id = p_plano, status = 'ativa', teste_ate = app.hoje_brasil() - 1, pago_ate = app.hoje_brasil() + 20
  where empresa_id = current_setting('t.emp')::uuid
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('99000000-0000-0000-0000-0000000000b1', 'dono@planos.com', now());

set role authenticated;
set request.jwt.claim.sub = '99000000-0000-0000-0000-0000000000b1';
select set_config('t.emp', criar_empresa('99111222000225', 'Piscicultura Planos Ltda')::text, false);
insert into contatos (id, empresa_id, tipos, nome) values
  ('99000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado P');

select pg_temp.ok((select count(*) from niveis_plano) = 4, 'quatro níveis de plano');
select pg_temp.ok((select count(distinct nivel) from planos) = 4 and (select count(*) from planos) = 8, 'vitrine com mensal e anual de cada nível');

-- teste grátis: tudo liberado
select pg_temp.ok(app.nivel_empresa(current_setting('t.emp')::uuid) = 'gestao', 'teste grátis usa o Gestão');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'conciliacao.editar'), 'no teste a conciliação está liberada');
select pg_temp.ok(minhas_permissoes(current_setting('t.emp')::uuid)->'modulos' = 'null'::jsonb, 'Gestão manda todos os módulos ao app');

-- Basic: produção, estoque, ração, cadastros e configurações
reset role;
select pg_temp.plano('basic-mensal');
set role authenticated;
select pg_temp.ok(minha_assinatura(current_setting('t.emp')::uuid)->>'nivel' = 'basic', 'assinatura informa o nível');
select pg_temp.ok(minhas_permissoes(current_setting('t.emp')::uuid)->>'nivel' = 'basic'
  and minhas_permissoes(current_setting('t.emp')::uuid)->'modulos' ? 'estoque', 'permissões trazem os módulos do plano');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'piscicultura.editar') and app.pode(current_setting('t.emp')::uuid, 'racao.editar')
  and app.pode(current_setting('t.emp')::uuid, 'contatos.editar') and app.pode(current_setting('t.emp')::uuid, 'configuracoes.editar'),
  'Basic libera produção, ração, fornecedores e configurações');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'contas.editar') and not app.pode(current_setting('t.emp')::uuid, 'vendas.lancar')
  and not app.pode(current_setting('t.emp')::uuid, 'pdv.operar') and not app.pode(current_setting('t.emp')::uuid, 'relatorios.ver'),
  'Basic não tem financeiro nem comercial, nem para o master');
insert into setores (empresa_id, nome) values (current_setting('t.emp')::uuid, 'Sede');
select pg_temp.ok((select count(*) from setores where empresa_id = current_setting('t.emp')::uuid) = 1, 'Basic grava na piscicultura');
select pg_temp.espera_erro(format($$insert into contas_financeiras (empresa_id, tipo, nome) values (%L, 'caixinha', 'Caixa')$$,
  current_setting('t.emp')), 'row-level security');

-- Vendas: + financeiro e comercial; sem cobrança e sem nota
reset role;
select pg_temp.plano('vendas-anual');
set role authenticated;
insert into contas_financeiras (empresa_id, tipo, nome) values (current_setting('t.emp')::uuid, 'caixinha', 'Caixa');
select pg_temp.ok((select count(*) from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa') = 1,
  'Vendas grava no financeiro');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'vendas.lancar') and app.pode(current_setting('t.emp')::uuid, 'pdv.operar')
  and app.pode(current_setting('t.emp')::uuid, 'financeiro.fechar'), 'Vendas libera pedidos, PDV e fechamento');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'cobrancas.emitir') and not app.pode(current_setting('t.emp')::uuid, 'notas.ver'),
  'Vendas não libera cobrança nem nota');
select pg_temp.espera_erro(format($$insert into notas_fiscais (empresa_id, destinatario_id, valor_total_cents) values (%L, '99000000-0000-0000-0000-0000000000c1', 100)$$,
  current_setting('t.emp')), 'row-level security');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'conciliacao.editar') and not app.pode(current_setting('t.emp')::uuid, 'planejamento.ver')
  and not app.pode(current_setting('t.emp')::uuid, 'custo-do-kg.ver'), 'conciliação, planejamento e custo do kg ficam no Gestão');

-- Fiscal: + cobrança e nota
reset role;
select pg_temp.plano('fiscal-mensal');
set role authenticated;
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'cobrancas.emitir') and app.pode(current_setting('t.emp')::uuid, 'notas.ver'),
  'Fiscal libera cobrança e nota');
insert into notas_fiscais (empresa_id, destinatario_id, valor_total_cents) values (current_setting('t.emp')::uuid, '99000000-0000-0000-0000-0000000000c1', 100);
select pg_temp.ok((select count(*) from notas_fiscais where empresa_id = current_setting('t.emp')::uuid) = 1, 'Fiscal grava a nota');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'conciliacao.editar'), 'Fiscal ainda não tem conciliação');

-- Gestão: tudo
reset role;
select pg_temp.plano('gestao-mensal');
set role authenticated;
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'conciliacao.editar') and app.pode(current_setting('t.emp')::uuid, 'planejamento.editar')
  and app.pode(current_setting('t.emp')::uuid, 'custo-do-kg.editar'), 'Gestão libera tudo');

-- o plano não dá a quem não tem permissão: apontador no Gestão continua só apontando
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('99000000-0000-0000-0000-0000000000b2', 'apontador@planos.com', now());
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin) values (current_setting('t.emp')::uuid, '99000000-0000-0000-0000-0000000000b2', 'apontador', false);
set role authenticated;
set request.jwt.claim.sub = '99000000-0000-0000-0000-0000000000b2';
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'apontamentos.editar') and not app.pode(current_setting('t.emp')::uuid, 'contas.editar'),
  'plano soma com a permissão do usuário, não a substitui');

-- ninguém de fora troca o que o plano libera
select pg_temp.espera_erro($$update niveis_plano set modulos = '{*}' where id = 'basic'$$, 'permission denied');

\echo TESTES DE PLANOS PASSARAM
