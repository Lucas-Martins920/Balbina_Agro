-- Zerar o financeiro: só o master, com o código do autenticador digitado agora (amr totp recente)
-- e o nome da empresa. Apaga lançamentos e conciliação, zera os saldos e mantém cadastros e vendas.
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
  ('9ae00000-0000-0000-0000-0000000000a1', 'master@zerar.com', now()),
  ('9ae00000-0000-0000-0000-0000000000a2', 'operador@zerar.com', now()),
  ('9ae00000-0000-0000-0000-0000000000a3', 'outra@zerar.com', now());
insert into auth.mfa_factors (user_id, status) values ('9ae00000-0000-0000-0000-0000000000a1', 'verified');

-- O master entra com o autenticador; o código foi digitado há uma hora.
set role authenticated;
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, false);
select set_config('t.emp', criar_empresa('99666777000188', 'Piscicultura Zerar Ltda')::text, false);

select importar_pacote(current_setting('t.emp')::uuid, $j${
  "origem": "nibo",
  "contas": [{"chave": "acc1", "nome": "Banco", "tipo": "corrente", "saldo_inicial_cents": 5000, "saldo_inicial_data": "2025-12-31"},
             {"chave": "acc2", "nome": "Caixa", "tipo": "caixinha", "saldo_inicial_cents": 700, "saldo_inicial_data": "2025-12-31"}],
  "titulos": [{"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
               "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000}]},
              {"chave": "agendamento:s2", "tipo": "pagar", "descricao": "Ração", "vencimento": "2026-02-10", "valor_cents": 4000}],
  "transferencias": [{"chave": "transferencia:t1:t2", "lancamentos": ["t1", "t2"], "origem_chave": "acc1", "destino_chave": "acc2",
                      "data": "2026-01-11", "valor_cents": 3000}]
}$j$::jsonb);

reset role;
insert into integracoes_empresa (empresa_id, sistema) values (current_setting('t.emp')::uuid, 'nibo');
insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin, ativo)
  values (current_setting('t.emp')::uuid, '9ae00000-0000-0000-0000-0000000000a2', 'sem_restricao', false, true);
set role authenticated;
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a1';

select importar_conciliacao(current_setting('t.emp')::uuid, 'nibo', $j$[
  {"conta_chave": "acc1",
   "conciliados": [{"id_externo": "nibo:e1", "data": "2026-01-10", "descricao": "Venda", "valor_cents": 10000, "baixa_chave": "lancamento:e1"}],
   "pendentes": [{"id_externo": "nibo-banco:b1", "data": "2026-02-15", "descricao": "PIX RECEBIDO", "valor_cents": 2500}]}
]$j$::jsonb);
select fechar_mes(current_setting('t.emp')::uuid, '2026-01-01');

-- Cadastros, regra de conciliação e uma recorrência que devem sobrar / sumir
insert into regras_conciliacao (empresa_id, tipo, nome, ordem, condicoes, acao_descricao)
  values (current_setting('t.emp')::uuid, 'pagamento', 'Tarifa', 1, '[{"campo": "descricao", "operador": "contem", "valor": "TARIFA"}]', 'Tarifa');
insert into recorrencias (empresa_id, tipo, descricao, valor_cents, inicio, frequencia, dia_vencimento)
  values (current_setting('t.emp')::uuid, 'pagar', 'Aluguel', 1000, '2026-01-01', 'mensal', 5);

select pg_temp.ok((select count(*) = 2 from agendamentos where empresa_id = current_setting('t.emp')::uuid), 'preparo: dois títulos');
select pg_temp.ok((select count(*) = 2 from movimentos_bancarios where empresa_id = current_setting('t.emp')::uuid), 'preparo: extrato');
select pg_temp.ok((select sum(saldo_cents) <> 0 from saldos_contas where empresa_id = current_setting('t.emp')::uuid), 'preparo: saldo nas contas');

-- Outra empresa, com lançamento, não pode ser tocada
reset role;
set role authenticated;
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"aal": "aal1"}';
select set_config('t.outra', criar_empresa('99666777000269', 'Piscicultura Vizinha Ltda')::text, false);
select importar_pacote(current_setting('t.outra')::uuid, $j${"origem": "nibo",
  "contas": [{"chave": "c", "nome": "Banco", "tipo": "corrente", "saldo_inicial_cents": 900, "saldo_inicial_data": "2025-12-31"}],
  "titulos": [{"chave": "agendamento:o1", "tipo": "pagar", "descricao": "Luz", "vencimento": "2026-01-10", "valor_cents": 500,
               "baixas": [{"chave": "lancamento:o1", "conta_chave": "c", "data": "2026-01-10", "valor_cents": 500}]}]}$j$::jsonb);

-- Quem não é master não zera, nem com o código em dia
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a2';
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_financeiro(%L, 'Piscicultura Zerar Ltda')$$, current_setting('t.emp')), 'Só o master');
-- Master de outra empresa também não
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a3';
select pg_temp.espera_erro(format($$select zerar_financeiro(%L, 'Piscicultura Zerar Ltda')$$, current_setting('t.emp')), 'Só o master');

-- O master precisa digitar o código agora: o da entrada (há uma hora) não vale
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_financeiro(%L, 'Piscicultura Zerar Ltda')$$, current_setting('t.emp')), 'código do autenticador');
-- Senha recente sem o código também não
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr', jsonb_build_array(
  jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint),
  jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_financeiro(%L, 'Piscicultura Zerar Ltda')$$, current_setting('t.emp')), 'código do autenticador');

-- Código digitado agora: falta só o nome certo da empresa
select set_config('request.jwt.claims', jsonb_build_object('aal', 'aal2', 'amr',
  jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, false);
select pg_temp.espera_erro(format($$select zerar_financeiro(%L, 'Piscicultura Errada')$$, current_setting('t.emp')), 'nome da empresa');
select pg_temp.espera_erro(format($$select zerar_financeiro(%L, null)$$, current_setting('t.emp')), 'nome da empresa');
select pg_temp.ok((select count(*) = 2 from agendamentos where empresa_id = current_setting('t.emp')::uuid), 'recusas não apagam nada');

-- Zera (maiúsculas e espaços não importam)
select set_config('t.res', zerar_financeiro(current_setting('t.emp')::uuid, '  piscicultura   ZERAR ltda ')::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'titulos')::int = 2 and (current_setting('t.res')::jsonb->>'baixas')::int = 1
  and (current_setting('t.res')::jsonb->>'transferencias')::int = 1 and (current_setting('t.res')::jsonb->>'movimentos_extrato')::int = 2,
  'devolve o que apagou');

reset role;
select pg_temp.ok((select count(*) = 0 from agendamentos where empresa_id = current_setting('t.emp')::uuid), 'títulos apagados');
select pg_temp.ok((select count(*) = 0 from baixas where empresa_id = current_setting('t.emp')::uuid), 'baixas apagadas');
select pg_temp.ok((select count(*) = 0 from transferencias where empresa_id = current_setting('t.emp')::uuid), 'transferências apagadas');
select pg_temp.ok((select count(*) = 0 from movimentos_bancarios where empresa_id = current_setting('t.emp')::uuid), 'extrato apagado');
select pg_temp.ok((select count(*) = 0 from importacoes_extrato where empresa_id = current_setting('t.emp')::uuid), 'importações de extrato apagadas');
select pg_temp.ok((select count(*) = 0 from conciliacoes where empresa_id = current_setting('t.emp')::uuid), 'conciliação apagada');
select pg_temp.ok((select count(*) = 0 from recorrencias where empresa_id = current_setting('t.emp')::uuid), 'recorrências apagadas');
select pg_temp.ok((select count(*) = 0 from periodos_fechados where empresa_id = current_setting('t.emp')::uuid), 'meses reabertos');
select pg_temp.ok((select bool_and(saldo_cents = 0) and count(*) >= 2 from saldos_contas where empresa_id = current_setting('t.emp')::uuid),
  'contas continuam, com saldo zero');
select pg_temp.ok((select count(*) = 1 from regras_conciliacao where empresa_id = current_setting('t.emp')::uuid), 'regras de conciliação ficam');
select pg_temp.ok((select count(*) = 0 from importacao_vinculos where empresa_id = current_setting('t.emp')::uuid
                   and entidade in ('titulo', 'baixa', 'transferencia')), 'vínculos de lançamentos importados saem (reimportar entra limpo)');
select pg_temp.ok((select count(*) = 2 from importacao_vinculos where empresa_id = current_setting('t.emp')::uuid and entidade = 'conta'),
  'vínculos de cadastros ficam');
select pg_temp.ok((select count(*) = 1 from audit_log where empresa_id = current_setting('t.emp')::uuid and tabela = 'financeiro'
                   and acao = 'delete' and user_id = '9ae00000-0000-0000-0000-0000000000a1' and resumo like 'Zerou o financeiro%'),
  'fica registrado no histórico, com quem fez');
select pg_temp.ok((select count(*) = 1 from agendamentos where empresa_id = current_setting('t.outra')::uuid)
  and (select saldo_cents = 400 from saldos_contas where empresa_id = current_setting('t.outra')::uuid and nome = 'Banco'), 'outra empresa intacta');

-- Reimportar depois de zerar traz os lançamentos de novo
set role authenticated;
set request.jwt.claim.sub = '9ae00000-0000-0000-0000-0000000000a1';
select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo",
  "titulos": [{"chave": "agendamento:s1", "tipo": "receber", "descricao": "Venda", "vencimento": "2026-01-10", "valor_cents": 10000,
               "baixas": [{"chave": "lancamento:e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 10000}]}]}$j$::jsonb)::text, false);
select pg_temp.ok((select count(*) = 1 from agendamentos where empresa_id = current_setting('t.emp')::uuid)
  and (select saldo_cents = 10000 from saldos_contas where empresa_id = current_setting('t.emp')::uuid and nome = 'Banco'),
  'reimportação entra limpa');
reset role;
\echo TESTES DE ZERAR FINANCEIRO PASSARAM
