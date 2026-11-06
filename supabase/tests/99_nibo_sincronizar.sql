-- Reimportar do NIBO sincroniza: o que mudou ou sumiu lá sai daqui e entra de novo certo; depois, o
-- saldo de abertura fecha o saldo de hoje com o NIBO.
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
  ('99500000-0000-0000-0000-0000000000a1', 'dono@sinc.com', now());

set role authenticated;
set request.jwt.claim.sub = '99500000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('99555666000177', 'Piscicultura Sincroniza Ltda')::text, false);

-- primeira importação, com o que entrou errado: tarifa lida do extrato como entrada, transferência com
-- o par errado e baixa na conta errada
select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "nibo",
  "contas": [{"chave": "acc1", "nome": "Banco", "tipo": "corrente", "saldo_inicial_cents": 0, "saldo_inicial_data": "2025-12-31"},
             {"chave": "acc2", "nome": "Caixa", "tipo": "caixinha", "saldo_inicial_cents": 0, "saldo_inicial_data": "2025-12-31"}],
  "titulos": [
    {"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
     "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc2", "data": "2026-01-10", "valor_cents": 10000}]},
    {"chave": "lancamento:tarifa", "tipo": "receber", "descricao": "Tarifa", "vencimento": "2026-01-08", "valor_cents": 990,
     "baixas": [{"chave": "lancamento:tarifa", "conta_chave": "acc1", "data": "2026-01-08", "valor_cents": 990}]},
    {"chave": "lancamento:antigo", "tipo": "pagar", "descricao": "Antes da data", "vencimento": "2025-11-08", "valor_cents": 700,
     "baixas": [{"chave": "lancamento:antigo", "conta_chave": "acc1", "data": "2025-11-08", "valor_cents": 700}]}],
  "transferencias": [{"chave": "transferencia:t1:t9", "lancamentos": ["t1", "t9"], "origem_chave": "acc2", "destino_chave": "acc1",
                      "data": "2026-01-11", "valor_cents": 3000}]
}$j$::jsonb);

-- lançamento que não veio do NIBO (aqui, de uma planilha) não é mexido
select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "planilha",
  "titulos": [{"chave": "p1", "tipo": "pagar", "descricao": "Feito no Balbina", "vencimento": "2026-01-12", "valor_cents": 500,
               "baixas": [{"conta": "Banco", "data": "2026-01-12", "valor_cents": 500}]}]
}$j$::jsonb);

-- o NIBO de hoje: baixa na conta Banco, sem a tarifa, transferência com o par certo
select set_config('t.pacote', $j${
  "origem": "nibo",
  "titulos": [
    {"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
     "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000}]}],
  "transferencias": [{"chave": "transferencia:t1:t2", "lancamentos": ["t1", "t2"], "origem_chave": "acc1", "destino_chave": "acc2",
                      "data": "2026-01-11", "valor_cents": 3000}]
}$j$, false);
select set_config('t.sinc', $j${"desde": "2025-12-31",
  "titulos": ["agendamento:s1"],
  "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000}],
  "transferencias": [{"chave": "transferencia:t1:t2", "origem_chave": "acc1", "destino_chave": "acc2", "data": "2026-01-11", "valor_cents": 3000}]
}$j$, false);

-- só com a integração liberada
select pg_temp.espera_erro(format($$select sincronizar_importacao(%L, 'nibo', %L::jsonb)$$, current_setting('t.emp'), current_setting('t.sinc')),
  'não está liberada');
select pg_temp.espera_erro(format($$select fixar_saldos_importacao(%L, 'nibo', '2025-12-31', '[]')$$, current_setting('t.emp')),
  'não está liberada');
reset role;
insert into integracoes_empresa (empresa_id, sistema) values (current_setting('t.emp')::uuid, 'nibo');
set role authenticated;
set request.jwt.claim.sub = '99500000-0000-0000-0000-0000000000a1';

select set_config('t.res', sincronizar_importacao(current_setting('t.emp')::uuid, 'nibo', current_setting('t.sinc')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'baixas')::int = 2, 'baixa na conta errada e baixa da tarifa saem');
select pg_temp.ok((current_setting('t.res')::jsonb->>'transferencias')::int = 1, 'transferência com o par errado sai');
select pg_temp.ok((current_setting('t.res')::jsonb->>'titulos')::int = 1, 'título que sumiu do NIBO sai');
select pg_temp.ok((select count(*) = 1 from agendamentos where empresa_id = current_setting('t.emp')::uuid and descricao = 'Antes da data'),
  'o que é de antes da data inicial fica');
select pg_temp.ok((select count(*) = 1 from baixas b join agendamentos a on a.id = b.agendamento_id
                   where a.empresa_id = current_setting('t.emp')::uuid and a.descricao = 'Feito no Balbina'), 'lançamento feito só no Balbina fica');

select importar_pacote(current_setting('t.emp')::uuid, current_setting('t.pacote')::jsonb);
select pg_temp.ok((select count(*) = 1 from baixas b join contas_financeiras c on c.id = b.conta_id
                   where b.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Banco' and b.valor_cents = 10000),
  'baixa entra de novo na conta certa');
select pg_temp.ok((select count(*) = 1 from transferencias t join contas_financeiras c on c.id = t.conta_origem_id
                   where t.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Banco'), 'transferência entra com o sentido certo');

-- sincronizar de novo com tudo certo não apaga nada
select set_config('t.res', sincronizar_importacao(current_setting('t.emp')::uuid, 'nibo', current_setting('t.sinc')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'baixas')::int = 0 and (current_setting('t.res')::jsonb->>'transferencias')::int = 0
  and (current_setting('t.res')::jsonb->>'titulos')::int = 0, 'nada muda quando já está igual ao NIBO');

-- saldo de abertura: saldo de hoje no NIBO menos o que o Balbina movimentou desde a data inicial
-- Banco: +100 da venda, -30 da transferência, -5 do lançamento feito só no Balbina = +65 → hoje 1.000 → abertura 935
select pg_temp.ok(fixar_saldos_importacao(current_setting('t.emp')::uuid, 'nibo', '2025-12-31',
  '[{"conta_chave": "acc1", "saldo_cents": 100000}, {"conta_chave": "acc2", "saldo_cents": 3000}]') = 2, 'abertura das duas contas');
select pg_temp.ok((select saldo_cents = 100000 from saldos_contas where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'),
  'saldo do Banco bate com o NIBO');
select pg_temp.ok((select saldo_inicial_cents = 93500 and saldo_inicial_data = '2025-12-31' from contas_financeiras
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'), 'abertura do Banco na data inicial');
select pg_temp.ok((select saldo_cents = 3000 from saldos_contas where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa'),
  'saldo do Caixa bate com o NIBO');

-- recebido a mais do que o título: o excedente entra como lançamento próprio, já quitado
select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo",
  "titulos": [{"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
               "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000},
                          {"chave": "lancamento:e2", "conta_chave": "acc1", "data": "2026-01-14", "valor_cents": 6000}]}]}$j$::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'baixas')::int = 1, 'baixa a mais entra');
select pg_temp.ok((select a.status = 'quitado' and a.tipo = 'receber' and a.valor_cents = 6000 and b.data = '2026-01-14'
                     and exists (select 1 from agendamento_rateios r where r.agendamento_id = a.id)
                   from agendamentos a join baixas b on b.agendamento_id = a.id
                   where a.empresa_id = current_setting('t.emp')::uuid and a.descricao = 'Venda (valor a mais)'),
  'excedente vira título quitado na data, com categoria');
select pg_temp.ok((select saldo_cents = 106000 from saldos_contas where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'),
  'o dinheiro a mais aparece na conta');
-- se o NIBO deixar de ter esse lançamento, a sincronização tira a baixa e o título do excedente
select sincronizar_importacao(current_setting('t.emp')::uuid, 'nibo', current_setting('t.sinc')::jsonb);
select pg_temp.ok((select count(*) = 0 from agendamentos where empresa_id = current_setting('t.emp')::uuid and descricao = 'Venda (valor a mais)'),
  'sincronização tira o excedente que sumiu do NIBO');
reset role;
