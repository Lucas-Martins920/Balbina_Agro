-- Assistente de início: passos que se dão por feitos sozinhos, pular, esconder e retomar, sumir quando
-- a empresa está configurada, passos fora do plano e acesso só do master.
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

create or replace function pg_temp.a() returns jsonb language sql as $$
  select assistente_inicio(current_setting('t.emp')::uuid)
$$;
create or replace function pg_temp.passo(p_id text) returns jsonb language sql as $$
  select e from jsonb_array_elements(pg_temp.a()->'passos') e where e->>'id' = p_id
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('9c110000-0000-0000-0000-0000000000a1', 'dono@assistente.com', now()),
  ('9c110000-0000-0000-0000-0000000000a2', 'apontador@assistente.com', now());

set role authenticated;
set request.jwt.claim.sub = '9c110000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('96555444000133', 'Piscicultura Assistente Ltda')::text, false);

-- empresa nova: seis passos, nenhum feito
select pg_temp.ok(jsonb_array_length(pg_temp.a()->'passos') = 6 and (pg_temp.a()->>'faltam')::int = 6
  and not (pg_temp.a()->>'concluido')::boolean and not (pg_temp.a()->>'escondido')::boolean,
  'empresa nova começa com os seis passos por fazer');
select pg_temp.ok(not (pg_temp.passo('contas')->>'feito')::boolean, 'o Caixa da piscicultura zerado não conta como conta configurada');

-- viveiro, lote e estoque inicial pela planilha modelo marcam três passos de uma vez
select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "planilha", "produtos": [{"nome": "Ração engorda", "tipo": "racao", "unidade": "kg"}]}');
select importar_piscicultura(current_setting('t.emp')::uuid, $j${
  "viveiros": [{"setor": "Setor 1", "nome": "Viveiro 1", "finalidade": "engorda", "capacidade": 10000, "area_m2": 5000}],
  "lotes": [{"codigo": "L01", "especie": "Tambaqui", "povoamento": "2026-03-01", "peso_inicial_g": 5,
             "viveiro": "Viveiro 1", "qtd": 9500}],
  "estoque": [{"produto": "Ração engorda", "quantidade": 1500, "data": "2026-03-01"}]
}$j$);
select pg_temp.ok((pg_temp.passo('piscicultura')->>'feito')::boolean and (pg_temp.passo('lotes')->>'feito')::boolean
  and (pg_temp.passo('estoque')->>'feito')::boolean and (pg_temp.a()->>'faltam')::int = 3,
  'planilha modelo conclui viveiros, lotes e estoque inicial');

-- saldo inicial na conta conclui o passo das contas
update contas_financeiras set saldo_inicial_cents = 150000 where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((pg_temp.passo('contas')->>'feito')::boolean, 'saldo inicial na conta conclui o passo');

-- pular e desfazer o pulo
select assistente_pular(current_setting('t.emp')::uuid, 'equipe');
select pg_temp.ok((pg_temp.passo('equipe')->>'pulado')::boolean and (pg_temp.a()->>'faltam')::int = 1, 'passo pulado não falta mais');
select assistente_pular(current_setting('t.emp')::uuid, 'equipe', false);
select pg_temp.ok(not (pg_temp.passo('equipe')->>'pulado')::boolean and (pg_temp.a()->>'faltam')::int = 2, 'desfazer o pulo volta a pedir o passo');
select pg_temp.espera_erro($$select assistente_pular(current_setting('t.emp')::uuid, 'inventado')$$, 'Passo desconhecido');

-- esconder e retomar
select assistente_esconder(current_setting('t.emp')::uuid);
select pg_temp.ok((pg_temp.a()->>'escondido')::boolean and (pg_temp.a()->>'faltam')::int = 2, 'esconder guarda o progresso');
select assistente_esconder(current_setting('t.emp')::uuid, false);
select pg_temp.ok(not (pg_temp.a()->>'escondido')::boolean, 'retomar mostra o assistente de novo');

-- os outros usuários não veem nem mexem
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'apontador@assistente.com', 'apontador') = 'adicionado'
  and (pg_temp.passo('equipe')->>'feito')::boolean, 'convidar alguém conclui o passo da equipe');
set request.jwt.claim.sub = '9c110000-0000-0000-0000-0000000000a2';
select pg_temp.ok(pg_temp.a() is null, 'quem não é master não recebe o assistente');
select pg_temp.espera_erro($$select assistente_pular(current_setting('t.emp')::uuid, 'equipe')$$, 'Só o usuário master');
select pg_temp.espera_erro($$insert into assistente_inicio (empresa_id) values (current_setting('t.emp')::uuid)
  on conflict (empresa_id) do update set concluido_em = now()$$, 'permission denied');

-- último passo feito: o assistente conclui e não volta mesmo se o apontamento for apagado
set request.jwt.claim.sub = '9c110000-0000-0000-0000-0000000000a1';
select assistente_pular(current_setting('t.emp')::uuid, 'apontamento');
select pg_temp.ok((pg_temp.a()->>'faltam')::int = 0 and (pg_temp.a()->>'concluido')::boolean, 'sem passo faltando o assistente conclui');
select assistente_pular(current_setting('t.emp')::uuid, 'apontamento', false);
select pg_temp.ok((pg_temp.a()->>'concluido')::boolean, 'concluído continua concluído');
-- retomar pelo menu de configurações reabre e limpa os pulos
select assistente_esconder(current_setting('t.emp')::uuid, false);
select pg_temp.ok(not (pg_temp.a()->>'concluido')::boolean and (pg_temp.a()->>'faltam')::int = 1, 'retomar reabre o assistente concluído');

-- plano Basic não tem financeiro: o passo das contas some
reset role;
update assinaturas set plano_id = 'basic-mensal', status = 'ativa', teste_ate = app.hoje_brasil() - 1, pago_ate = app.hoje_brasil() + 20
where empresa_id = current_setting('t.emp')::uuid;
set role authenticated;
set request.jwt.claim.sub = '9c110000-0000-0000-0000-0000000000a1';
select pg_temp.ok(pg_temp.passo('contas') is null and jsonb_array_length(pg_temp.a()->'passos') = 5, 'passo fora do plano não aparece');

reset role;

\echo TESTES DO ASSISTENTE DE INÍCIO PASSARAM
