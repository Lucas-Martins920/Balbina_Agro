-- Saldos e conciliação do NIBO: só empresa com a integração liberada; o conciliado lá entra conciliado
-- aqui (ligado à baixa ou à transferência), o pendente do banco entra pendente e sai quando deixa de estar.
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
  ('99400000-0000-0000-0000-0000000000a1', 'dono@nibo.com', now());

set role authenticated;
set request.jwt.claim.sub = '99400000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('99444555000166', 'Piscicultura Conciliação Ltda')::text, false);

select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "nibo",
  "contas": [{"chave": "acc1", "nome": "Banco", "tipo": "corrente", "saldo_inicial_cents": 5000, "saldo_inicial_data": "2025-12-31"},
             {"chave": "acc2", "nome": "Caixa", "tipo": "caixinha", "saldo_inicial_cents": 0, "saldo_inicial_data": "2025-12-31"}],
  "titulos": [{"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
               "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000}]}],
  "transferencias": [{"chave": "transferencia:t1:t2", "lancamentos": ["t1", "t2"], "origem_chave": "acc1", "destino_chave": "acc2",
                      "data": "2026-01-11", "valor_cents": 3000}]
}$j$::jsonb);

-- transferência que volta com outro par de lançamentos não duplica
select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo",
  "transferencias": [{"chave": "transferencia:t1:t9", "lancamentos": ["t1", "t9"], "origem_chave": "acc1", "destino_chave": "acc2",
                      "data": "2026-01-11", "valor_cents": 3000}]}$j$::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'transferencias_ja_importadas')::int = 1
  and (select count(*) = 1 from transferencias where empresa_id = current_setting('t.emp')::uuid), 'transferência não duplica com outro par');
select pg_temp.ok((select saldo_cents = 12000 from saldos_contas where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'),
  'saldo = abertura + baixa - transferência');

select set_config('t.conc', $j$[
  {"conta_chave": "acc1",
   "conciliados": [{"id_externo": "nibo:e1", "data": "2026-01-10", "descricao": "Venda", "valor_cents": 10000, "baixa_chave": "lancamento:e1"},
                   {"id_externo": "nibo:t1", "data": "2026-01-11", "descricao": "Transf", "valor_cents": -3000, "lancamento": "t1", "transferencia": true},
                   {"id_externo": "nibo:x", "data": "2026-01-12", "descricao": "Sem par", "valor_cents": 100, "baixa_chave": "lancamento:x"}],
   "pendentes": [{"id_externo": "nibo-banco:b1", "data": "2026-01-15", "descricao": "PIX RECEBIDO", "valor_cents": 2500},
                 {"id_externo": "nibo-banco:b2", "data": "2026-01-16", "descricao": "TARIFA", "valor_cents": -90}]}
]$j$, false);

-- só com a integração liberada
select pg_temp.espera_erro(format($$select importar_conciliacao(%L, 'nibo', %L::jsonb)$$, current_setting('t.emp'), current_setting('t.conc')),
  'não está liberada');
select pg_temp.espera_erro(format($$insert into integracoes_empresa values (%L, 'nibo')$$, current_setting('t.emp')), 'row-level security');
reset role;
insert into integracoes_empresa (empresa_id, sistema) values (current_setting('t.emp')::uuid, 'nibo');
set role authenticated;
set request.jwt.claim.sub = '99400000-0000-0000-0000-0000000000a1';

select set_config('t.res', importar_conciliacao(current_setting('t.emp')::uuid, 'nibo', current_setting('t.conc')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'conciliados')::int = 2, 'baixa e transferência entram conciliadas');
select pg_temp.ok((current_setting('t.res')::jsonb->>'sem_lancamento')::int = 1, 'conciliado sem lançamento importado fica de fora');
select pg_temp.ok((current_setting('t.res')::jsonb->>'pendentes')::int = 2, 'pendentes do banco entram');
select pg_temp.ok((select count(*) = 2 from conciliacoes c join movimentos_bancarios m on m.id = c.movimento_id
                   where m.empresa_id = current_setting('t.emp')::uuid and m.status = 'conciliado'), 'conciliação ligada ao lançamento');
select pg_temp.ok((select count(*) = 2 from movimentos_bancarios where empresa_id = current_setting('t.emp')::uuid and status = 'pendente'),
  'pendentes aparecem na conciliação');

-- reimportar: não duplica; pendente que foi conciliado no NIBO sai daqui
select set_config('t.res', importar_conciliacao(current_setting('t.emp')::uuid, 'nibo', $j$[
  {"conta_chave": "acc1",
   "conciliados": [{"id_externo": "nibo:e1", "data": "2026-01-10", "descricao": "Venda", "valor_cents": 10000, "baixa_chave": "lancamento:e1"}],
   "pendentes": [{"id_externo": "nibo-banco:b2", "data": "2026-01-16", "descricao": "TARIFA", "valor_cents": -90}]}]$j$::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'conciliados')::int = 0 and (current_setting('t.res')::jsonb->>'pendentes')::int = 0
  and (current_setting('t.res')::jsonb->>'pendentes_removidos')::int = 1, 'reimportar não duplica e tira o que deixou de estar pendente');
select pg_temp.ok((select count(*) = 1 from movimentos_bancarios where empresa_id = current_setting('t.emp')::uuid and status = 'pendente'),
  'fica só o pendente que continua pendente');

-- auditoria: o master grava, os membros leem
insert into auditorias_importacao (empresa_id, origem, desde, contas)
values (current_setting('t.emp')::uuid, 'nibo', '2025-12-31', '[{"conta": "Banco", "diferenca_cents": 0}]');
select pg_temp.ok((select count(*) = 1 from auditorias_importacao where empresa_id = current_setting('t.emp')::uuid), 'auditoria gravada');
reset role;

\echo 'TESTES DE SALDOS E CONCILIAÇÃO DO NIBO PASSARAM'
