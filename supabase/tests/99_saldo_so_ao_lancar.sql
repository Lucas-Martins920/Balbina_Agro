-- Conciliação não mexe no saldo antes de lançar: importar o extrato (OFX ou Open Finance) só aplica a regra
-- "Ignorar"; as regras que lançam esperam o botão "Aplicar regras". E nada antes da data do saldo inicial
-- entra para conciliar.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

insert into auth.users (id, email, email_confirmed_at) values ('5a1d0000-0000-0000-0000-0000000000a1', 'master@saldo.com', now());

set role authenticated;
set request.jwt.claim.sub = '5a1d0000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('51222333000255', 'Piscicultura Saldo Ltda')::text, false);
insert into contas_financeiras (id, empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
values ('5a1d0000-0000-0000-0000-0000000000b1', current_setting('t.emp')::uuid, 'corrente', 'Banco', 100000, '2026-09-01');
select set_config('t.receita', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid
  and sentido = 'entrada' and not exists (select 1 from categorias f where f.parent_id = categorias.id) order by nome limit 1), false);

select criar_regra(current_setting('t.emp')::uuid, 'recebimento', 'Toda venda', '[{"campo":"descricao","operador":"contem","valor":"venda"}]'::jsonb,
  p_categoria => current_setting('t.receita')::uuid);
select criar_regra(current_setting('t.emp')::uuid, 'ignorar', 'Aplicação', '[{"campo":"descricao","operador":"contem","valor":"aplicacao"}]'::jsonb);

-- importar: a venda fica para conciliar, a aplicação é ignorada, a linha de agosto (antes do saldo inicial) não entra
select set_config('t.r', importar_extrato('5a1d0000-0000-0000-0000-0000000000b1', 'ofx', '[
  {"id_externo":"S0","data":"2026-08-31","descricao":"VENDA AGOSTO","valor_cents":70000},
  {"id_externo":"S1","data":"2026-09-01","descricao":"VENDA DE PEIXE","valor_cents":50000},
  {"id_externo":"S2","data":"2026-09-02","descricao":"APLICACAO AUTOMATICA","valor_cents":-20000}
]'::jsonb)::text, false);

select pg_temp.ok((select saldo_cents = 100000 from saldos_contas where conta_id = '5a1d0000-0000-0000-0000-0000000000b1'),
  'importar o extrato não muda o saldo da conta');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id_externo = 'S1'),
  'regra que lança não roda ao importar: a venda fica para conciliar');
select pg_temp.ok(not exists (select 1 from conciliacoes c join movimentos_bancarios m on m.id = c.movimento_id where m.id_externo = 'S1'),
  'nada conciliado ao importar');
select pg_temp.ok((select status = 'ignorado' from movimentos_bancarios where id_externo = 'S2'), 'regra "Ignorar" continua automática');
select pg_temp.ok(((current_setting('t.r')::jsonb)->>'por_regra')::int = 1, 'resumo conta só o ignorado');
select pg_temp.ok(not exists (select 1 from movimentos_bancarios where id_externo = 'S0'), 'linha antes do saldo inicial não entra');
select pg_temp.ok(((current_setting('t.r')::jsonb)->>'antes_do_saldo')::int = 1, 'resumo diz quantas ficaram antes do saldo inicial');
select pg_temp.ok(((current_setting('t.r')::jsonb)->>'novas')::int = 2, 'novas conta só o que entrou');
select pg_temp.ok((select periodo_inicio = '2026-09-01' from importacoes_extrato where id = ((current_setting('t.r')::jsonb)->>'importacao_id')::uuid),
  'período da importação começa no saldo inicial');

-- Open Finance segue a mesma regra
select set_config('t.of', importar_extrato('5a1d0000-0000-0000-0000-0000000000b1', 'open_finance', '[
  {"id_externo":"F0","data":"2026-08-15","descricao":"PIX ANTIGO","valor_cents":1000},
  {"id_externo":"F1","data":"2026-09-05","descricao":"VENDA PIX","valor_cents":3000}
]'::jsonb)::text, false);
select pg_temp.ok(not exists (select 1 from movimentos_bancarios where id_externo = 'F0'), 'Open Finance também não traz o que é antes do saldo inicial');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id_externo = 'F1'), 'Open Finance não lança sozinho');
select pg_temp.ok((select saldo_cents = 100000 from saldos_contas where conta_id = '5a1d0000-0000-0000-0000-0000000000b1'),
  'saldo continua o inicial');

-- arquivo só com linhas antigas: importa nada, sem erro
select set_config('t.vazio', importar_extrato('5a1d0000-0000-0000-0000-0000000000b1', 'ofx', '[
  {"id_externo":"V0","data":"2026-07-01","descricao":"VELHO","valor_cents":500}]'::jsonb)::text, false);
select pg_temp.ok(((current_setting('t.vazio')::jsonb)->>'novas')::int = 0 and ((current_setting('t.vazio')::jsonb)->>'antes_do_saldo')::int = 1,
  'arquivo todo antes do saldo inicial não importa nada');

-- lançamento antigo que já estava no extrato (de antes desta regra) não aparece para conciliar
reset role;
insert into movimentos_bancarios (empresa_id, conta_id, data, descricao, valor_cents, id_externo)
values (current_setting('t.emp')::uuid, '5a1d0000-0000-0000-0000-0000000000b1', '2026-08-20', 'VENDA VELHA', 9000, 'X0');
set role authenticated;
select pg_temp.ok(not exists (select 1 from painel_conciliacao('5a1d0000-0000-0000-0000-0000000000b1', 100) p
  join movimentos_bancarios m on m.id = p.movimento_id where m.id_externo = 'X0'), 'painel não mostra o que é antes do saldo inicial');

-- só ao lançar o saldo muda: "Aplicar regras" é a pessoa lançando
select pg_temp.ok(aplicar_regras('5a1d0000-0000-0000-0000-0000000000b1') = 2, 'Aplicar regras lança a venda do OFX e a do Open Finance');
select pg_temp.ok((select status = 'pendente' from movimentos_bancarios where id_externo = 'X0'), 'Aplicar regras não lança o que é antes do saldo inicial');
select pg_temp.ok((select saldo_cents = 153000 from saldos_contas where conta_id = '5a1d0000-0000-0000-0000-0000000000b1'),
  'depois de lançar, o saldo soma só o que foi lançado');

reset role;

-- A data padrão do saldo inicial é o dia de Manaus, não o dia UTC do banco.
do $$
begin
  if (select column_default from information_schema.columns
      where table_name = 'contas_financeiras' and column_name = 'saldo_inicial_data') not like '%America/Manaus%' then
    raise exception 'FALHOU: saldo_inicial_data nasce no dia de Manaus';
  end if;
  raise notice 'ok - saldo_inicial_data nasce no dia de Manaus';
end $$;
