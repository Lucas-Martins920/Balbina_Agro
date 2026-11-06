-- Regra "Ignorar": aplicação/resgate automático (BB Rende Fácil) fica ignorado sozinho, sem título nem baixa,
-- e volta para conciliar sem perder o histórico.
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

insert into auth.users (id, email, email_confirmed_at) values ('1a000000-0000-0000-0000-0000000000a1', 'master@ignora.com', now());

set role authenticated;
set request.jwt.claim.sub = '1a000000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('51222333000144', 'Piscicultura Ignora Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('1a000000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco do Brasil', 0, '2026-08-01'),
       ('1a000000-0000-0000-0000-0000000000b2', current_setting('t.emp')::uuid, 'corrente', 'Outro banco', 0, '2026-08-01');
select set_config('t.desp', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho'), false);

-- regra de ignorar não precisa de ação; as outras continuam exigindo
select set_config('t.regra', criar_regra(current_setting('t.emp')::uuid, 'ignorar', 'BB Rende Fácil',
  '[{"campo":"descricao","operador":"contem","valor":"Rende Fácil"}]'::jsonb,
  p_contas => array['1a000000-0000-0000-0000-0000000000b1']::uuid[])::text, false);
select pg_temp.espera_erro($$select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Sem ação',
  '[{"campo":"descricao","operador":"contem","valor":"x"}]'::jsonb)$$, 'acao_presente');
-- regra de pagamento que também casaria: a de ignorar passa antes
select criar_regra(current_setting('t.emp')::uuid, 'pagamento', 'Tudo do BB', '[{"campo":"descricao","operador":"contem","valor":"bb"}]'::jsonb,
  p_categoria => current_setting('t.desp')::uuid);

select pg_temp.ok((importar_extrato('1a000000-0000-0000-0000-0000000000b1', 'open_finance', '[
  {"id_externo":"R1","data":"2026-09-10","descricao":"BB RENDE FACIL APLICACAO","valor_cents":-50000},
  {"id_externo":"R2","data":"2026-09-11","descricao":"BB RENDE FÁCIL RESGATE","valor_cents":50000},
  {"id_externo":"R3","data":"2026-09-12","descricao":"PIX BB MILHO","valor_cents":-12000}
]'::jsonb)->>'por_regra')::int = 2, 'importação aplica só a regra de ignorar');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id_externo = 'R3'), 'regra de pagamento espera o Aplicar regras');
select aplicar_regras('1a000000-0000-0000-0000-0000000000b1');
select set_config('t.r' || substr(id_externo, 2), id::text, false) from movimentos_bancarios where id_externo like 'R%';

select pg_temp.ok((select count(*) = 2 from movimentos_bancarios where id_externo in ('R1','R2') and status = 'ignorado'
  and regra_aplicada_id = current_setting('t.regra')::uuid), 'aplicação e resgate ficam ignorados pela regra');
select pg_temp.ok(not exists (select 1 from conciliacoes where movimento_id in (current_setting('t.r1')::uuid, current_setting('t.r2')::uuid)),
  'ignorado não cria conciliação');
select pg_temp.ok(not exists (select 1 from agendamentos where origem = 'conciliacao'
  and origem_id in (current_setting('t.r1')::uuid, current_setting('t.r2')::uuid)), 'ignorado não cria título');
select pg_temp.ok((select status = 'conciliado' from movimentos_bancarios where id = current_setting('t.r3')::uuid), 'o resto segue as outras regras');

-- regra presa a uma conta não vale para a outra
select importar_extrato('1a000000-0000-0000-0000-0000000000b2', 'ofx', '[
  {"id_externo":"O1","data":"2026-09-10","descricao":"RENDE FACIL","valor_cents":-100}]'::jsonb);
select pg_temp.ok((select status <> 'ignorado' from movimentos_bancarios where id_externo = 'O1'), 'regra de outra conta não ignora');

-- voltar para conciliar: perde a marca da regra, histórico fica
select desconciliar(current_setting('t.r1')::uuid, 'era aplicação de verdade', false);
select pg_temp.ok((select status = 'pendente' and regra_aplicada_id is null from movimentos_bancarios where id = current_setting('t.r1')::uuid),
  'voltou para conciliar sem a marca da regra');

-- regra pausada não ignora
update regras_conciliacao set ativa = false where id = current_setting('t.regra')::uuid;
select importar_extrato('1a000000-0000-0000-0000-0000000000b1', 'open_finance', '[
  {"id_externo":"R4","data":"2026-09-13","descricao":"BB RENDE FACIL APLICACAO","valor_cents":-700}]'::jsonb);
select pg_temp.ok((select status <> 'ignorado' from movimentos_bancarios where id_externo = 'R4'), 'regra pausada não ignora');

reset role;
