-- Plano de categorias padrão da piscicultura de engorda (migration 20261102030000).
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

-- O plano em si: nomes únicos (busca por nome não fica ambígua) e componente em toda principal de custo
select pg_temp.ok((select count(*) = count(distinct lower(nome)) from app.plano_categorias()), 'nomes do plano não se repetem');
select pg_temp.ok((select bool_and(componente is not null) from app.plano_categorias() where pai is null and grupo = 'custo_operacional'),
  'toda categoria principal de custo diz em que parte do custo do kg entra');

-- Empresa nova nasce com o plano completo, na ordem do plano
set role authenticated;
set request.jwt.claim.sub = '93939393-9393-9393-9393-939393939393';
select set_config('t.emp', criar_empresa('93717171000155', 'Piscicultura Plano Ltda')::text, false);

select pg_temp.ok((select count(*) from categorias where empresa_id = current_setting('t.emp')::uuid)
                  = (select count(*) from app.plano_categorias()), 'empresa nova recebe todas as categorias do plano');
select pg_temp.ok((select sistema from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes'),
  'Venda de peixes é categoria do sistema');
select pg_temp.ok((select ordem = 1 from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes')
              and (select ordem = 5 from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Deduções da receita'),
  'principais na ordem do plano dentro do grupo');
select pg_temp.ok((select grupo = 'receita_operacional' and sentido = 'saida' from categorias
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Funrural e Senar'),
  'Funrural deduz a receita (subcategoria herda grupo e sentido)');
select pg_temp.ok((select componente = 'sanidade' from categorias_custo c join categorias k on k.id = c.id
                   where k.empresa_id = current_setting('t.emp')::uuid and k.nome = 'Sal, cal e calcário para os viveiros'),
  'calagem e desinfecção dos viveiros entram em sanidade no custo do kg');
select pg_temp.ok((select componente = 'energia' from categorias_custo c join categorias k on k.id = c.id
                   where k.empresa_id = current_setting('t.emp')::uuid and k.nome = 'Diesel de bombas e geradores'),
  'diesel das bombas e do gerador entra em energia');
select pg_temp.ok((select componente = 'alevinos' from categorias_custo c join categorias k on k.id = c.id
                   where k.empresa_id = current_setting('t.emp')::uuid and k.nome = 'Alevinos'),
  'alevinos entram no custo do kg como alevinos');
select pg_temp.ok((select ordem = 2 from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'),
  'subcategorias na ordem do plano');
select pg_temp.ok(exists (select 1 from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Despesca e beneficiamento')
  and not exists (select 1 from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Classificação e expedição'),
  'centro de custo da despesca, sem o da sala de ovos');

-- Aplicar de novo não duplica nada
select pg_temp.ok((select (aplicar_plano_categorias(current_setting('t.emp')::uuid)->>'criadas')::int = 0), 'aplicar de novo não cria nada');

-- Empresa antiga: monta o plano velho à mão, com lançamento numa categoria que muda de lugar
reset role;
insert into empresas (cnpj, razao_social) values ('93727272000155', 'Piscicultura Velha Ltda');
select set_config('t.velha', (select id::text from empresas where cnpj = '93727272000155'), false);
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin)
values (current_setting('t.velha')::uuid, '93939393-9393-9393-9393-939393939393', 'sem_restricao', true);
insert into categorias (empresa_id, grupo, sentido, nome) values
  (current_setting('t.velha')::uuid, 'receita_operacional', 'entrada', 'Venda de peixes'),
  (current_setting('t.velha')::uuid, 'despesa_operacional', 'saida', 'Tarifas bancárias'),
  (current_setting('t.velha')::uuid, 'despesa_operacional', 'saida', 'Impostos sobre vendas'),
  (current_setting('t.velha')::uuid, 'despesa_operacional', 'entrada', 'Rendimentos financeiros'),
  (current_setting('t.velha')::uuid, 'despesa_operacional', 'saida', 'Combustível'),
  (current_setting('t.velha')::uuid, 'despesa_operacional', 'saida', 'Minha despesa'),
  (current_setting('t.velha')::uuid, 'custo_operacional', 'saida', 'Energia elétrica');
-- "Combustível" ganhou filha da piscicultura: não pode virar subcategoria, fica onde está
insert into categorias (empresa_id, grupo, sentido, nome, parent_id)
select current_setting('t.velha')::uuid, 'despesa_operacional', 'saida', 'Gasolina', id
from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Combustível';
select set_config('t.tarifa', (select id::text from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Tarifas bancárias'), false);

-- Outra pessoa, sem acesso à empresa, não aplica
set role authenticated;
set request.jwt.claim.sub = '93949494-9494-9494-9494-949494949494';
select pg_temp.espera_erro($$select aplicar_plano_categorias(current_setting('t.velha')::uuid)$$, 'não pode editar');

set request.jwt.claim.sub = '93939393-9393-9393-9393-939393939393';
select set_config('t.res', aplicar_plano_categorias(current_setting('t.velha')::uuid)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'movidas')::int = 3, 'move tarifas, impostos e rendimentos (combustível tem filha)');

select pg_temp.ok((select p.nome = 'Despesas financeiras' and c.grupo = 'despesa_operacional' from categorias c join categorias p on p.id = c.parent_id
                   where c.id = current_setting('t.tarifa')::uuid), 'Tarifas bancárias foi para Despesas financeiras, mesma categoria');
select pg_temp.ok((select p.nome = 'Deduções da receita' and c.grupo = 'receita_operacional' and c.sentido = 'saida'
                   from categorias c join categorias p on p.id = c.parent_id
                   where c.empresa_id = current_setting('t.velha')::uuid and c.nome = 'Impostos sobre vendas'),
  'Impostos sobre vendas virou dedução da receita');
select pg_temp.ok((select p.nome = 'Receitas financeiras' from categorias c join categorias p on p.id = c.parent_id
                   where c.empresa_id = current_setting('t.velha')::uuid and c.nome = 'Rendimentos de aplicações'),
  'Rendimentos financeiros renomeada para Rendimentos de aplicações');
select pg_temp.ok((select count(*) = 1 from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Tarifas bancárias'),
  'não duplica a subcategoria que foi movida');
select pg_temp.ok((select parent_id is null from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Combustível' and parent_id is null),
  'categoria com filha da piscicultura fica onde está');
select pg_temp.ok((select count(*) = 1 from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Energia elétrica'),
  'categoria que já existia não duplica');
select pg_temp.ok((select componente_custo = 'energia' from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Energia elétrica'),
  'categoria existente ganha o componente do custo do kg');
select pg_temp.ok((select ordem > (select max(ordem) from categorias k join app.plano_categorias() p on p.nome = k.nome and p.pai is null
                                   where k.empresa_id = current_setting('t.velha')::uuid and k.parent_id is null and k.grupo = 'despesa_operacional')
                   from categorias where empresa_id = current_setting('t.velha')::uuid and nome = 'Minha despesa'),
  'categoria da piscicultura fica depois das do plano');
