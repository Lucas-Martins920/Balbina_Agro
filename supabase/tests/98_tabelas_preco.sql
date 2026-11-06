-- Tabelas de preço: padrão por empresa, tabela do cliente, ajuste em %, preço especial e permissões.
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
set role authenticated;
set request.jwt.claim.sub = '98a98a98-98a9-8a98-a98a-98a98a98a98a';
select set_config('t.emp', criar_empresa('98222333000166', 'Piscicultura Preços Ltda')::text, false);
select set_config('t.kg', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Peixe extra (kg)'), false);
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
select set_config('t.padrao', (select id::text from listas_preco where empresa_id = current_setting('t.emp')::uuid and padrao), false);
select pg_temp.ok(current_setting('t.padrao') <> '', 'empresa nasce com a tabela padrão');
insert into contatos (id, empresa_id, tipos, nome) values
  ('98a00000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado'),
  ('98a00000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, '{cliente}', 'Padaria');

-- Preço sem tabela vai para a padrão e vale para todos
select definir_preco(current_setting('t.kg')::uuid, 1000);
select definir_preco(current_setting('t.cx')::uuid, 30000);
select pg_temp.ok((select lista_id::text from tabelas_preco where produto_id = current_setting('t.kg')::uuid) = current_setting('t.padrao'),
  'preço sem tabela cai na padrão');
select pg_temp.ok(preco_vigente(current_setting('t.kg')::uuid, '98a00000-0000-0000-0000-0000000000c1') = 1000, 'cliente sem tabela usa a padrão');

-- Atacado: 10% abaixo da padrão, com preço próprio para a caixa
select set_config('t.atacado', salvar_tabela_preco(current_setting('t.emp')::uuid, null, 'Atacado', false, true, -10, null,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'preco_cents', 25000)))::text, false);
update contatos set lista_preco_id = current_setting('t.atacado')::uuid where id = '98a00000-0000-0000-0000-0000000000c1';
select pg_temp.ok(preco_vigente(current_setting('t.cx')::uuid, '98a00000-0000-0000-0000-0000000000c1') = 25000, 'tabela do cliente usa o preço próprio');
select pg_temp.ok(preco_vigente(current_setting('t.kg')::uuid, '98a00000-0000-0000-0000-0000000000c1') = 900, 'sem preço próprio, padrão com o ajuste da tabela');
select pg_temp.ok(preco_vigente(current_setting('t.kg')::uuid, null, current_date, current_setting('t.atacado')::uuid) = 900, 'tabela escolhida na venda vale sem cliente');
select pg_temp.ok(preco_vigente(current_setting('t.cx')::uuid, '98a00000-0000-0000-0000-0000000000c2') = 30000, 'outro cliente continua na padrão');

-- Preço especial do cliente vence a tabela dele
select definir_preco(current_setting('t.cx')::uuid, 24000, '98a00000-0000-0000-0000-0000000000c1');
select pg_temp.ok(preco_vigente(current_setting('t.cx')::uuid, '98a00000-0000-0000-0000-0000000000c1') = 24000, 'preço especial do cliente vence a tabela');
select pg_temp.espera_erro(format($$select definir_preco(%L, 1, '98a00000-0000-0000-0000-0000000000c1', current_date, %L)$$,
  current_setting('t.cx'), current_setting('t.atacado')), 'fica na tabela padrão');

-- O pedido usa a tabela do cliente
select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, '98a00000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.kg'), 'quantidade', 2)))::text, false);
select pg_temp.ok((select preco_unit_cents from pedido_itens where pedido_id = current_setting('t.ped')::uuid) = 900,
  'pedido sem preço informado usa a tabela do cliente');

-- Salvar de novo sem mudança não cria histórico; null tira o produto da tabela
select salvar_tabela_preco(current_setting('t.emp')::uuid, current_setting('t.atacado')::uuid, 'Atacado', false, true, -10, null,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'preco_cents', 25000)));
select pg_temp.ok((select count(*) from tabelas_preco where lista_id = current_setting('t.atacado')::uuid) = 1, 'salvar sem mudança não mexe no histórico');
select salvar_tabela_preco(current_setting('t.emp')::uuid, current_setting('t.atacado')::uuid, 'Atacado', false, true, -10, null,
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'preco_cents', null)));
select pg_temp.ok(preco_vigente(current_setting('t.cx')::uuid, '98a00000-0000-0000-0000-0000000000c2', current_date, current_setting('t.atacado')::uuid) = 27000,
  'produto tirado da tabela volta para a padrão com o ajuste');

-- Tabela inativa não vale
update listas_preco set ativa = false where id = current_setting('t.atacado')::uuid;
select pg_temp.ok(preco_vigente(current_setting('t.kg')::uuid, null, current_date, current_setting('t.atacado')::uuid) = 1000, 'tabela inativa é ignorada');
update listas_preco set ativa = true where id = current_setting('t.atacado')::uuid;

-- Sempre uma padrão
select pg_temp.espera_erro(format($$update listas_preco set padrao = false where id = %L$$, current_setting('t.padrao')), 'Sempre há uma tabela padrão');
select pg_temp.espera_erro(format($$delete from listas_preco where id = %L$$, current_setting('t.padrao')), 'não pode ser excluída');
update listas_preco set padrao = true where id = current_setting('t.atacado')::uuid;
select pg_temp.ok((select count(*) = 1 and bool_and(id::text = current_setting('t.atacado') and ajuste_pct = 0)
  from listas_preco where empresa_id = current_setting('t.emp')::uuid and padrao), 'marcar outra como padrão tira a marca da anterior e zera o ajuste');
delete from listas_preco where id = current_setting('t.padrao')::uuid;
select pg_temp.ok(not exists (select 1 from listas_preco where id = current_setting('t.padrao')::uuid), 'tabela que deixou de ser padrão pode ser excluída');

-- Outra empresa não usa tabela alheia; quem não tem "Alterar preços" não mexe
select set_config('t.emp2', criar_empresa('98333444000177', 'Piscicultura Vizinha Ltda')::text, false);
select pg_temp.espera_erro(format($$update contatos set lista_preco_id = %L where id = '98a00000-0000-0000-0000-0000000000c2'$$,
  (select id from listas_preco where empresa_id = current_setting('t.emp2')::uuid)), 'Tabela de preço não encontrada');
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil) values (current_setting('t.emp')::uuid, '98a00000-0000-0000-0000-0000000000f1', 'vendedor');
set role authenticated;
set request.jwt.claim.sub = '98a00000-0000-0000-0000-0000000000f1';
select pg_temp.ok(exists (select 1 from listas_preco where empresa_id = current_setting('t.emp')::uuid), 'vendedor vê as tabelas');
select pg_temp.espera_erro(format($$insert into listas_preco (empresa_id, nome) values (%L, 'Varejo')$$, current_setting('t.emp')), 'row-level security');
select pg_temp.espera_erro(format($$select definir_preco(%L, 1)$$, current_setting('t.kg')), 'row-level security');
reset role;

\echo TESTES DE TABELAS DE PREÇO PASSARAM
