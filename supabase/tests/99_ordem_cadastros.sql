-- Ordem das categorias e dos centros de custo (arrastar na lista, como no NIBO).
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

create or replace function pg_temp.ordem(p_id text) returns integer language sql as $$
  select ordem from categorias where id = p_id::uuid
$$;
create or replace function pg_temp.ordem_cc(p_id text) returns integer language sql as $$
  select ordem from centros_custo where id = p_id::uuid
$$;

set role authenticated;
set request.jwt.claim.sub = '97979797-9797-9797-9797-979797979797';
select set_config('t.emp', criar_empresa('97111222000155', 'Piscicultura Ordem Ltda')::text, false);

-- Plano padrão da empresa nova já vem numerado, sem repetir posição entre irmãos
select pg_temp.ok(not exists (
  select 1 from categorias where empresa_id = current_setting('t.emp')::uuid
  group by parent_id, case when parent_id is null then grupo end, ordem having count(*) > 1),
  'categorias do plano padrão têm ordem própria entre irmãos');

-- Categoria nova vai para o fim do grupo do DRE; subcategoria para o fim da principal
insert into categorias (id, empresa_id, grupo, sentido, nome) values
  ('97000000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'investimento', 'saida', 'Zebra');
insert into categorias (id, empresa_id, grupo, sentido, nome) values
  ('97000000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'investimento', 'saida', 'Abelha');
select pg_temp.ok(pg_temp.ordem('97000000-0000-0000-0000-0000000000a2') = pg_temp.ordem('97000000-0000-0000-0000-0000000000a1') + 1,
  'categoria nova entra no fim do grupo, não pela ordem alfabética');
insert into categorias (id, empresa_id, grupo, sentido, nome, parent_id) values
  ('97000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'investimento', 'saida', 'Filha 1', '97000000-0000-0000-0000-0000000000a1');
insert into categorias (id, empresa_id, grupo, sentido, nome, parent_id) values
  ('97000000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'investimento', 'saida', 'Filha 2', '97000000-0000-0000-0000-0000000000a1');
select pg_temp.ok(pg_temp.ordem('97000000-0000-0000-0000-0000000000b1') = 1 and pg_temp.ordem('97000000-0000-0000-0000-0000000000b2') = 2,
  'subcategorias contam a ordem dentro da principal');

-- Reordenar irmãos
select pg_temp.ok(reordenar_categorias(array['97000000-0000-0000-0000-0000000000b2', '97000000-0000-0000-0000-0000000000b1']::uuid[]) = 2,
  'reordenar devolve quantas categorias gravou');
select pg_temp.ok(pg_temp.ordem('97000000-0000-0000-0000-0000000000b2') = 1 and pg_temp.ordem('97000000-0000-0000-0000-0000000000b1') = 2,
  'subcategorias trocaram de lugar');
select pg_temp.espera_erro($$select reordenar_categorias(array['97000000-0000-0000-0000-0000000000a1', '97000000-0000-0000-0000-0000000000b1']::uuid[])$$,
  'mesmo nível');

-- Categoria do sistema também se reordena (só o código e a posição mudam)
select reordenar_categorias(array(
  select id from categorias where empresa_id = current_setting('t.emp')::uuid and parent_id is null and grupo = 'receita_operacional'
  order by sistema, ordem));
select pg_temp.ok((select ordem > 1 from categorias where empresa_id = current_setting('t.emp')::uuid and sistema) or
  (select count(*) = 1 from categorias where empresa_id = current_setting('t.emp')::uuid and parent_id is null and grupo = 'receita_operacional'),
  'categoria do sistema muda de posição');

-- Grupo da principal muda: ela vai para o fim do grupo novo e as filhas mantêm a ordem entre si
update categorias set grupo = 'financiamento' where id = '97000000-0000-0000-0000-0000000000a2';
select pg_temp.ok(pg_temp.ordem('97000000-0000-0000-0000-0000000000a2') =
  (select max(ordem) from categorias where empresa_id = current_setting('t.emp')::uuid and parent_id is null and grupo = 'financiamento'),
  'principal que muda de grupo vai para o fim do grupo novo');
update categorias set grupo = 'financiamento' where id = '97000000-0000-0000-0000-0000000000a1';
update categorias set grupo = 'financiamento' where parent_id = '97000000-0000-0000-0000-0000000000a1';
select pg_temp.ok(pg_temp.ordem('97000000-0000-0000-0000-0000000000b2') = 1 and pg_temp.ordem('97000000-0000-0000-0000-0000000000b1') = 2,
  'filhas acompanham o grupo sem perder a ordem');

-- Subcategoria que muda de principal vai para o fim da nova
update categorias set parent_id = '97000000-0000-0000-0000-0000000000a2' where id = '97000000-0000-0000-0000-0000000000b1';
select pg_temp.ok(pg_temp.ordem('97000000-0000-0000-0000-0000000000b1') = 1, 'subcategoria movida entra no fim da nova principal');

-- Centros de custo
insert into centros_custo (id, empresa_id, nome) values ('97000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, 'Zeta');
insert into centros_custo (id, empresa_id, nome) values ('97000000-0000-0000-0000-0000000000c2', current_setting('t.emp')::uuid, 'Alfa');
select pg_temp.ok(pg_temp.ordem_cc('97000000-0000-0000-0000-0000000000c2') = pg_temp.ordem_cc('97000000-0000-0000-0000-0000000000c1') + 1,
  'centro de custo novo entra no fim');
insert into centros_custo (id, empresa_id, nome, parent_id) values
  ('97000000-0000-0000-0000-0000000000c3', current_setting('t.emp')::uuid, 'Dentro', '97000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(pg_temp.ordem_cc('97000000-0000-0000-0000-0000000000c3') = 1, 'centro filho conta a ordem dentro do pai');
select pg_temp.ok(reordenar_centros_custo(array['97000000-0000-0000-0000-0000000000c2', '97000000-0000-0000-0000-0000000000c1']::uuid[]) = 2,
  'reordenar centros devolve quantos gravou');
select pg_temp.ok(pg_temp.ordem_cc('97000000-0000-0000-0000-0000000000c2') = 1 and pg_temp.ordem_cc('97000000-0000-0000-0000-0000000000c1') = 2,
  'centros trocaram de lugar');
select pg_temp.espera_erro($$select reordenar_centros_custo(array['97000000-0000-0000-0000-0000000000c1', '97000000-0000-0000-0000-0000000000c3']::uuid[])$$,
  'mesmo nível');

-- Quem só visualiza não reordena (o RLS barra; a função grava zero)
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes) values
  (current_setting('t.emp')::uuid, '97000000-0000-0000-0000-0000000000f1', 'visualizacao', '{}');
set role authenticated;
set request.jwt.claim.sub = '97000000-0000-0000-0000-0000000000f1';
select pg_temp.ok(reordenar_categorias(array['97000000-0000-0000-0000-0000000000b2']::uuid[]) = 0, 'visualização não reordena categorias');
select pg_temp.ok(reordenar_centros_custo(array['97000000-0000-0000-0000-0000000000c1', '97000000-0000-0000-0000-0000000000c2']::uuid[]) = 0,
  'visualização não reordena centros de custo');

-- Outra empresa não enxerga nem reordena
set request.jwt.claim.sub = '96969696-9696-9696-9696-969696969696';
select criar_empresa('96111222000155', 'Outra Piscicultura Ltda');
select pg_temp.ok(reordenar_centros_custo(array['97000000-0000-0000-0000-0000000000c1', '97000000-0000-0000-0000-0000000000c2']::uuid[]) = 0,
  'outra empresa não reordena');

-- Anônimo não chama
reset role;
select pg_temp.ok(not has_function_privilege('anon', 'public.reordenar_categorias(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.reordenar_centros_custo(uuid[])', 'execute'), 'anon não reordena');

\o
\echo 'TESTES DE ORDEM DOS CADASTROS PASSARAM'
