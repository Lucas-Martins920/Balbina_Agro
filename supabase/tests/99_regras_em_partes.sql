-- Importar OFX grande sem timeout: regras aplicadas em partes (aplicar_regras_lote) e permissão de
-- escrita do extrato avaliada uma vez por comando.
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
  ('1b000000-0000-0000-0000-0000000000a1', 'master@partes.com', now()),
  ('1b000000-0000-0000-0000-0000000000a2', 'olha@partes.com', now());

set role authenticated;
set request.jwt.claim.sub = '1b000000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('61222333000144', 'Piscicultura Partes Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('1b000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 0, '2026-01-01');
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Tarifas',
  '[{"campo":"descricao","operador":"comeca_com","valor":"tarifa"}]', 'todas', current_setting('t.desp')::uuid, null, null, 'Tarifa');
select criar_regra(current_setting('t.emp')::uuid, 'ignorar', 'Rende fácil',
  '[{"campo":"descricao","operador":"contem","valor":"rende facil"}]', 'todas', null, null, null, null);

-- Extrato pequeno: as regras terminam dentro da própria importação
select set_config('t.r', importar_extrato('1b000000-0000-0000-0000-0000000000b1', 'ofx', '[
  {"id_externo":"P1","data":"2026-02-01","descricao":"TARIFA PACOTE","valor_cents":-1000},
  {"id_externo":"P2","data":"2026-02-02","descricao":"PIX RECEBIDO","valor_cents":5000}
]'::jsonb)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb ->> 'regras_fim')::boolean and (current_setting('t.r')::jsonb ->> 'por_regra')::int = 0,
  'extrato pequeno: importação não lança nada e não pede continuação');

-- Extrato maior com tempo zero por parte: cada chamada aplica uma linha e diz onde parou
reset role;
create temp table partes (n int, r jsonb);
grant all on partes to authenticated;
set role authenticated;
select set_config('t.imp', (select id::text from importacoes_extrato order by created_at desc limit 1), false);
select importar_extrato('1b000000-0000-0000-0000-0000000000b1', 'ofx',
  (select jsonb_agg(jsonb_build_object('id_externo', 'Q' || g, 'data', ('2026-03-01'::date + g)::text,
     'descricao', case when g % 3 = 0 then 'TARIFA MANUTENCAO' when g % 5 = 0 then 'BB RENDE FACIL' else 'PIX ' || g end,
     'valor_cents', case when g % 3 = 0 then -500 when g % 5 = 0 then -100 else 700 end))
   from generate_series(1, 30) g));
select set_config('t.imp', (select id::text from importacoes_extrato order by created_at desc limit 1), false);
-- desfaz o que a importação já aplicou para medir só as partes
reset role;
-- (a baixa e o título que a regra criou saem junto; sobrando, seriam "já lançado" e a regra não lançaria de novo)
delete from baixas where id in (select c.baixa_id from conciliacoes c join movimentos_bancarios m on m.id = c.movimento_id
                                where m.importacao_id = current_setting('t.imp')::uuid);
delete from agendamentos where origem = 'conciliacao'
  and origem_id in (select id from movimentos_bancarios where importacao_id = current_setting('t.imp')::uuid);
delete from conciliacoes where movimento_id in (select id from movimentos_bancarios where importacao_id = current_setting('t.imp')::uuid);
update movimentos_bancarios set status = 'pendente', regra_aplicada_id = null where importacao_id = current_setting('t.imp')::uuid;
set role authenticated;
do $$
declare
  v jsonb := jsonb_build_object('fim', false);
  i int := 0;
begin
  while not (v ->> 'fim')::boolean loop
    i := i + 1;
    if i > 100 then raise exception 'FALHOU: aplicar_regras_lote não termina'; end if;
    v := aplicar_regras_lote('1b000000-0000-0000-0000-0000000000b1', current_setting('t.imp')::uuid,
                             (v ->> 'apos_data')::date, (v ->> 'apos_id')::uuid, 0);
    insert into partes values (i, v);
  end loop;
end $$;
select pg_temp.ok((select count(*) from partes) = 31, 'tempo zero: uma linha por chamada e uma chamada final');
select pg_temp.ok((select sum((r ->> 'aplicadas')::int) from partes) = 14, 'soma das partes = 10 tarifas + 4 ignorados');
select pg_temp.ok((select count(*) from movimentos_bancarios where importacao_id = current_setting('t.imp')::uuid and status = 'conciliado') = 10
  and (select count(*) from movimentos_bancarios where importacao_id = current_setting('t.imp')::uuid and status = 'ignorado') = 4,
  'cada lançamento passou pelas regras uma vez só');
select pg_temp.ok((select count(*) from conciliacoes c join movimentos_bancarios m on m.id = c.movimento_id
                   where m.importacao_id = current_setting('t.imp')::uuid) = 10, 'sem conciliação duplicada');
select pg_temp.ok(aplicar_regras('1b000000-0000-0000-0000-0000000000b1') = 1, 'aplicar_regras de antes continua: só falta a tarifa do extrato pequeno');
select pg_temp.ok(aplicar_regras('1b000000-0000-0000-0000-0000000000b1') = 0, 'depois, nada mais a aplicar');

-- Permissão de escrita no extrato continua valendo (agora avaliada uma vez por comando)
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes)
values (current_setting('t.emp')::uuid, '1b000000-0000-0000-0000-0000000000a2', 'visualizacao', '{}');
set role authenticated;
set request.jwt.claim.sub = '1b000000-0000-0000-0000-0000000000a2';
select pg_temp.espera_erro($$select importar_extrato('1b000000-0000-0000-0000-0000000000b1', 'ofx', '[
  {"id_externo":"Z1","data":"2026-04-01","descricao":"PIX","valor_cents":100}]'::jsonb)$$, 'row-level security');
select pg_temp.ok((select count(*) from movimentos_bancarios where id_externo = 'Q1') = 1, 'quem só visualiza vê o extrato');
update movimentos_bancarios set descricao = 'mexido' where conta_id = '1b000000-0000-0000-0000-0000000000b1' and id_externo = 'Q1';
reset role;
select pg_temp.ok((select descricao from movimentos_bancarios where conta_id = '1b000000-0000-0000-0000-0000000000b1' and id_externo = 'Q1') <> 'mexido', 'quem só visualiza não altera o extrato');
reset role;
