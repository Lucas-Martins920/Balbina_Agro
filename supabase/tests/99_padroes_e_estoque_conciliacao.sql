-- Categorias e centros de custo padrão que apagam o resto, e entrada no estoque pela conciliação
-- (migration 20261103010000).
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
  ('7b100000-0000-0000-0000-0000000000a1', 'dono@padroes.com', now()),
  ('7b100000-0000-0000-0000-0000000000a2', 'fora@padroes.com', now());

set role authenticated;
set request.jwt.claim.sub = '7b100000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('51777888000199', 'Piscicultura Padrões Ltda')::text, false);

-- Empresa nova nasce com os centros padrão
select pg_temp.ok((select count(*) from centros_custo c join app.plano_centros_custo() p on p.nome = c.nome
                   where c.empresa_id = current_setting('t.emp')::uuid) = (select count(*) from app.plano_centros_custo()),
  'empresa nova recebe todos os centros de custo padrão');
select pg_temp.ok((select count(*) = count(distinct lower(nome)) from app.plano_centros_custo()), 'nomes dos centros padrão não se repetem');

-- ---------------------------------------------------------------------------
-- Categorias: só as do plano
-- ---------------------------------------------------------------------------
insert into categorias (empresa_id, grupo, sentido, nome) values
  (current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Minha sobra'),
  (current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Usada com lançamento'),
  (current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Mãe da piscicultura');
insert into categorias (empresa_id, grupo, sentido, nome, parent_id)
select current_setting('t.emp')::uuid, 'despesa_operacional', 'saida', 'Filha sem uso', id
from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Mãe da piscicultura';
-- subcategoria da piscicultura dentro de uma principal do plano
insert into categorias (empresa_id, grupo, sentido, nome, parent_id)
select current_setting('t.emp')::uuid, grupo, sentido, 'Sub da piscicultura', id
from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Despesas administrativas' and parent_id is null;
-- categoria do plano desativada pela piscicultura volta
update categorias set ativa = false where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho';

insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('7b100000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2026-08-01');
select importar_extrato('7b100000-0000-0000-0000-0000000000b1', 'ofx', '[
  {"id_externo":"P1","data":"2026-09-10","descricao":"PIX ENVIADO ZE","valor_cents":-1000},
  {"id_externo":"P2","data":"2026-09-11","descricao":"PIX ENVIADO AGROPECUARIA","valor_cents":-250000},
  {"id_externo":"P3","data":"2026-09-12","descricao":"PIX RECEBIDO","valor_cents":5000},
  {"id_externo":"P4","data":"2026-09-13","descricao":"PIX ENVIADO OUTRO","valor_cents":-3000}
]'::jsonb);
select set_config('t.m' || substr(id_externo, 2), id::text, false) from movimentos_bancarios where id_externo like 'P%';
select conciliar_rateando(current_setting('t.m1')::uuid, jsonb_build_array(jsonb_build_object(
  'categoria_id', (select id from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Usada com lançamento'),
  'valor_cents', 1000)));
select set_config('t.usada', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Usada com lançamento'), false);

-- Quem não é da empresa não restaura
set request.jwt.claim.sub = '7b100000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro(format($$select restaurar_plano_categorias(%L)$$, current_setting('t.emp')), 'não pode editar');
select pg_temp.espera_erro(format($$select restaurar_centros_custo(%L)$$, current_setting('t.emp')), 'não pode editar');
set request.jwt.claim.sub = '7b100000-0000-0000-0000-0000000000a1';

select set_config('t.r', restaurar_plano_categorias(current_setting('t.emp')::uuid)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'apagadas')::int = 4, 'apaga as 4 categorias sem uso fora do plano');
select pg_temp.ok((current_setting('t.r')::jsonb->>'desativadas')::int = 1, 'desativa a que tem lançamento');
select pg_temp.ok(not exists (select 1 from categorias where empresa_id = current_setting('t.emp')::uuid
  and nome in ('Minha sobra', 'Mãe da piscicultura', 'Filha sem uso', 'Sub da piscicultura')), 'as sem uso saem, inclusive mãe e filha');
select pg_temp.ok((select not ativa from categorias where id = current_setting('t.usada')::uuid), 'a usada fica, inativa, com o histórico');
select pg_temp.ok((select ativa from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), 'categoria do plano volta a ficar ativa');
select pg_temp.ok((select count(*) from categorias where empresa_id = current_setting('t.emp')::uuid and ativa)
                  = (select count(*) from app.plano_categorias()), 'ativas = exatamente o plano');

-- ---------------------------------------------------------------------------
-- Centros de custo: só os padrão + a estrutura da piscicultura
-- ---------------------------------------------------------------------------
insert into centros_custo (empresa_id, nome, tipo) values
  (current_setting('t.emp')::uuid, 'Centro solto', 'geral'),
  (current_setting('t.emp')::uuid, 'Centro com lançamento', 'geral'),
  (current_setting('t.emp')::uuid, 'Viveiro estrutura', 'viveiro');
update centros_custo set ativo = false where empresa_id = current_setting('t.emp')::uuid and nome = 'Recria';
select conciliar_rateando(current_setting('t.m4')::uuid, jsonb_build_array(jsonb_build_object(
  'categoria_id', (select id from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'),
  'centro_custo_id', (select id from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Centro com lançamento'),
  'valor_cents', 3000)));

select set_config('t.r', restaurar_centros_custo(current_setting('t.emp')::uuid)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'apagados')::int = 1 and (current_setting('t.r')::jsonb->>'desativados')::int = 1,
  'apaga o centro sem uso e desativa o que tem lançamento');
select pg_temp.ok(not exists (select 1 from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Centro solto'), 'centro sem uso sai');
select pg_temp.ok((select not ativo from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Centro com lançamento'), 'centro usado fica inativo');
select pg_temp.ok((select ativo from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Viveiro estrutura'), 'viveiro da piscicultura nunca sai');
select pg_temp.ok((select ativo from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Recria'), 'centro padrão volta a ficar ativo');
select pg_temp.ok((select ordem = 2 from centros_custo where empresa_id = current_setting('t.emp')::uuid and nome = 'Recria'), 'padrões na ordem do plano (Recria depois da Alevinagem)');

-- ---------------------------------------------------------------------------
-- Conciliação com entrada no estoque e memória do fornecedor
-- ---------------------------------------------------------------------------
insert into contatos (empresa_id, nome, tipos) values (current_setting('t.emp')::uuid, 'Agropecuária Boa', array['fornecedor']);
select set_config('t.forn', (select id::text from contatos where empresa_id = current_setting('t.emp')::uuid and nome = 'Agropecuária Boa'), false);
insert into produtos (empresa_id, nome, tipo, unidade) values (current_setting('t.emp')::uuid, 'Milho grão', 'outro', 'kg');
select set_config('t.prod', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho grão'), false);
select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);

-- recebimento não lança estoque
select pg_temp.espera_erro(format($$select conciliar_com_estoque(%L, %L::jsonb, null, null, %L, 10)$$, current_setting('t.m3'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 5000)), current_setting('t.prod')), 'só vale para pagamento');
-- sem quantidade
select pg_temp.espera_erro(format($$select conciliar_com_estoque(%L, %L::jsonb, %L, null, %L, null)$$, current_setting('t.m2'),
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 250000)), current_setting('t.forn'), current_setting('t.prod')), 'quantidade');

select conciliar_com_estoque(current_setting('t.m2')::uuid,
  jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 250000)),
  current_setting('t.forn')::uuid, 'Milho 5 t', current_setting('t.prod')::uuid, 5000, null, true);
select pg_temp.ok((select status = 'conciliado' from movimentos_bancarios where id = current_setting('t.m2')::uuid), 'pagamento conciliado');
select pg_temp.ok((select saldo = 5000 from saldos_produtos where produto_id = current_setting('t.prod')::uuid), 'entrada de 5000 kg no estoque');
select pg_temp.ok((select sum(round(custo_unit_cents * quantidade)) = 250000 from movimentos_estoque where produto_id = current_setting('t.prod')::uuid),
  'entrada com o custo do pagamento');
select pg_temp.ok((select produto_estoque_id = current_setting('t.prod')::uuid from contatos where id = current_setting('t.forn')::uuid),
  'fornecedor lembra do produto');

-- esquecer
select app.lembrar_produto_fornecedor(current_setting('t.forn')::uuid, null);
select pg_temp.ok((select produto_estoque_id is null from contatos where id = current_setting('t.forn')::uuid), 'fornecedor esquece o produto');

-- outra pessoa não grava memória em fornecedor alheio
select app.lembrar_produto_fornecedor(current_setting('t.forn')::uuid, current_setting('t.prod')::uuid);
set request.jwt.claim.sub = '7b100000-0000-0000-0000-0000000000a2';
select app.lembrar_produto_fornecedor(current_setting('t.forn')::uuid, null);
reset role;
select pg_temp.ok((select produto_estoque_id = current_setting('t.prod')::uuid from contatos where id = current_setting('t.forn')::uuid),
  'quem não é da empresa não mexe na memória do fornecedor');
