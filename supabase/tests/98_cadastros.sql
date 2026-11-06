-- Cadastros: permissões novas, categoria do sistema, produto com movimento, lote editável e exclusões.
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
set request.jwt.claim.sub = '98989898-9898-9898-9898-989898989898';
select set_config('t.emp', criar_empresa('98111222000155', 'Piscicultura Cadastros Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('98000000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('98000000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, '98000000-0000-0000-0000-000000000001', 'G1', 'engorda', 20000);

-- Categoria do sistema
select pg_temp.ok((select sistema from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes'),
  '"Venda de peixes" vem marcada como categoria do sistema');
select pg_temp.espera_erro(format($$update categorias set nome = 'Peixes' where empresa_id = %L and nome = 'Venda de peixes'$$,
  current_setting('t.emp')), 'só o código pode mudar');
select pg_temp.espera_erro(format($$delete from categorias where empresa_id = %L and nome = 'Venda de peixes'$$,
  current_setting('t.emp')), 'não pode ser excluída');
update categorias set codigo = '3.1' where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes';
select pg_temp.ok((select codigo = '3.1' from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes'),
  'código da categoria do sistema pode mudar');

-- Subcategoria movida para outro pai acompanha grupo e sentido
insert into categorias (id, empresa_id, grupo, sentido, nome) values
  ('98000000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Frota'),
  ('98000000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'investimento', 'saida', 'Obras');
insert into categorias (id, empresa_id, grupo, sentido, nome, parent_id) values
  ('98000000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Combustível', '98000000-0000-0000-0000-0000000000a1');
update categorias set parent_id = '98000000-0000-0000-0000-0000000000a2' where id = '98000000-0000-0000-0000-0000000000a3';
select pg_temp.ok((select grupo = 'investimento' from categorias where id = '98000000-0000-0000-0000-0000000000a3'),
  'subcategoria movida assume o grupo do novo pai');
select pg_temp.espera_erro($$update categorias set parent_id = '98000000-0000-0000-0000-0000000000a1' where id = '98000000-0000-0000-0000-0000000000a2'$$,
  'tem subcategorias');
delete from categorias where id = '98000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(not exists (select 1 from categorias where id = '98000000-0000-0000-0000-0000000000a1'), 'categoria sem uso pode ser excluída');

-- Produto: com movimento não muda unidade; base de estoque não sai
insert into depositos (id, empresa_id, nome, tipo) values ('98000000-0000-0000-0000-0000000000d1', current_setting('t.emp')::uuid, 'Silo', 'insumos');
insert into produtos (id, empresa_id, tipo, nome, unidade, estoque_minimo) values
  ('98000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'insumo_racao', 'Milho', 'kg', 5000),
  ('98000000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'embalagem', 'Bandeja', 'un', null);
update produtos set unidade = 't', nome = 'Milho grão' where id = '98000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select unidade = 't' from produtos where id = '98000000-0000-0000-0000-0000000000b1'), 'produto sem movimento muda a unidade');
insert into movimentos_estoque (empresa_id, produto_id, deposito_id, data, tipo, quantidade, custo_unit_cents)
values (current_setting('t.emp')::uuid, '98000000-0000-0000-0000-0000000000b1', '98000000-0000-0000-0000-0000000000d1', current_date, 'entrada_compra', 10, 100000);
select pg_temp.espera_erro($$update produtos set unidade = 'kg' where id = '98000000-0000-0000-0000-0000000000b1'$$, 'já tem movimento');
update produtos set nome = 'Milho', estoque_minimo = 8 where id = '98000000-0000-0000-0000-0000000000b1';
select pg_temp.ok((select nome = 'Milho' from produtos where id = '98000000-0000-0000-0000-0000000000b1'), 'produto com movimento ainda muda nome e estoque mínimo');
select pg_temp.espera_erro($$delete from produtos where id = '98000000-0000-0000-0000-0000000000b1'$$, 'foreign key');
select pg_temp.espera_erro(format($$delete from produtos where id = (select id from produtos where empresa_id = %L and base_estoque limit 1)$$,
  current_setting('t.emp')), 'não pode ser excluído');
delete from produtos where id = '98000000-0000-0000-0000-0000000000b2';
select pg_temp.ok(not exists (select 1 from produtos where id = '98000000-0000-0000-0000-0000000000b2'), 'produto sem uso pode ser excluído');

-- Lote: editar, centro de custo acompanha o código, histórico impede exclusão
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'L1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '98000000-0000-0000-0000-000000000002', 10000, 5)::text, false);
select editar_lote(current_setting('t.lote')::uuid, 'L1-A', (select id from especies where nome = 'Tambatinga'),
  current_date - 59, 9800, 5, 1500000, 'engorda', null, current_date + 300, null, 'corrigido');
select pg_temp.ok((select codigo = 'L1-A' and qtd_povoada = 9800 and data_povoamento = current_date - 59 and custo_aquisicao_cents = 1500000
                   from lotes where id = current_setting('t.lote')::uuid), 'lote editado');
select pg_temp.ok((select qtd_peixes = 9800 and lower(periodo) = current_date - 59 from lote_alocacoes where lote_id = current_setting('t.lote')::uuid),
  'alocação acompanha quantidade e data');
select pg_temp.ok((select c.nome = 'Lote L1-A' from lotes l join centros_custo c on c.id = l.centro_custo_id where l.id = current_setting('t.lote')::uuid),
  'centro de custo do lote acompanha o código');
select pg_temp.espera_erro(format($$select editar_lote(%L, 'L1-A', (select id from especies where nome = 'Tambatinga'),
  current_date - 59, 30000, 5, 0, 'engorda')$$, current_setting('t.lote')), 'comporta');

select registrar_apontamento(current_setting('t.emp')::uuid, null, '98000000-0000-0000-0000-000000000002', current_date - 1,
  'manha', 3, 0, 1100);
select pg_temp.espera_erro(format($$select editar_lote(%L, 'L1-A', (select id from especies where nome = 'Tambatinga'),
  current_date - 0, 9800, 5, 0, 'engorda')$$, current_setting('t.lote')), 'antes da nova data');
select pg_temp.espera_erro(format($$delete from lotes where id = %L$$, current_setting('t.lote')), 'não pode ser excluído');

-- Setor e viveiro: renomear leva o centro de custo junto; com viveiro o setor não sai
update setores set nome = 'Matriz' where id = '98000000-0000-0000-0000-000000000001';
select pg_temp.ok((select c.nome = 'Viveiro Matriz / G1' from viveiros g join centros_custo c on c.id = g.centro_custo_id
                   where g.id = '98000000-0000-0000-0000-000000000002'), 'renomear o setor renomeia o centro de custo dos viveiros');
select pg_temp.espera_erro($$delete from setores where id = '98000000-0000-0000-0000-000000000001'$$, 'foreign key');
insert into setores (id, empresa_id, nome) values ('98000000-0000-0000-0000-000000000003', current_setting('t.emp')::uuid, 'Provisório');
delete from setores where id = '98000000-0000-0000-0000-000000000003';
select pg_temp.ok(not exists (select 1 from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Setor Provisório'),
  'setor excluído leva o centro de custo dele');

-- Permissões: quem só visualiza não cadastra; perfil cadastros cadastra produto, categoria, centro de custo e contato
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes) values
  (current_setting('t.emp')::uuid, '98000000-0000-0000-0000-0000000000f1', 'visualizacao', '{}'),
  (current_setting('t.emp')::uuid, '98000000-0000-0000-0000-0000000000f2', 'cadastros', '{}'),
  (current_setting('t.emp')::uuid, '98000000-0000-0000-0000-0000000000f3', 'personalizado', '{contatos.editar}');
set role authenticated;
set request.jwt.claim.sub = '98000000-0000-0000-0000-0000000000f1';
select pg_temp.espera_erro(format($$insert into produtos (empresa_id, tipo, nome, unidade) values (%L, 'outro', 'X', 'un')$$,
  current_setting('t.emp')), 'row-level security');
select pg_temp.espera_erro(format($$insert into contatos (empresa_id, tipos, nome) values (%L, '{cliente}', 'X')$$,
  current_setting('t.emp')), 'row-level security');
set request.jwt.claim.sub = '98000000-0000-0000-0000-0000000000f2';
insert into produtos (empresa_id, tipo, nome, unidade) values (current_setting('t.emp')::uuid, 'vacina', 'Newcastle', 'dose');
insert into categorias (empresa_id, grupo, sentido, nome) values (current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Marketing');
insert into centros_custo (empresa_id, nome) values (current_setting('t.emp')::uuid, 'Entregas');
insert into contatos (empresa_id, tipos, nome, cpf_cnpj, inscricao_estadual, produtor_rural)
values (current_setting('t.emp')::uuid, '{fornecedor}', 'João Produtor', '12345678909', '123456789', true);
select pg_temp.ok(true, 'perfil cadastros cadastra produto, categoria, centro de custo e contato');
set request.jwt.claim.sub = '98000000-0000-0000-0000-0000000000f3';
insert into contatos (empresa_id, tipos, nome) values (current_setting('t.emp')::uuid, '{cliente}', 'Mercado Novo');
select pg_temp.ok(true, 'permissão contatos.editar cadastra cliente');
select pg_temp.espera_erro(format($$insert into produtos (empresa_id, tipo, nome, unidade) values (%L, 'outro', 'Y', 'un')$$,
  current_setting('t.emp')), 'row-level security');

reset role;
\o
\echo 'TESTES DE CADASTROS PASSARAM'
