-- Automações de rotina: resumo diário (H3) e aviso do pacote do contador (E1)
-- e a escolha de quem recebe cada aviso pela permissão.
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
  ('a0820000-0000-0000-0000-000000000001', 'dono@resumo.com', now()),
  ('a0820000-0000-0000-0000-000000000002', 'tratador@resumo.com', now());

set role authenticated;
set request.jwt.claim.sub = 'a0820000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('82828282000184', 'Piscicultura Resumo Ltda')::text, false);
select set_config('t.ontem', ((now() at time zone 'America/Manaus')::date - 1)::text, false);
select set_config('t.hoje', ((now() at time zone 'America/Manaus')::date)::text, false);
insert into setores (id, empresa_id, nome) values ('a0820000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('a0820000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'a0820000-0000-0000-0000-0000000000a1', 'G1', 'engorda', 20000),
  ('a0820000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'a0820000-0000-0000-0000-0000000000a1', 'G2', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'R1', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, 'a0820000-0000-0000-0000-0000000000a2', 10000, 5);
select povoar_lote(current_setting('t.emp')::uuid, 'R2', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, 'a0820000-0000-0000-0000-0000000000a3', 10000, 5);
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'a0820000-0000-0000-0000-0000000000a2',
  current_setting('t.ontem')::date, 'manha', 3, 1, 42.5, '{"oxigenio_mg_l": 4.1}');
select set_config('t.cat', (select id::text from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Energia elétrica'), false);
select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Energia', current_setting('t.hoje')::date, current_setting('t.hoje')::date,
  45000, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 45000)));
select agendar_titulo(current_setting('t.emp')::uuid, 'pagar', 'Atrasada', current_setting('t.hoje')::date - 3, current_setting('t.hoje')::date - 3,
  1000, jsonb_build_array(jsonb_build_object('categoria_id', current_setting('t.cat'), 'valor_cents', 1000)));

insert into automacoes_empresa (empresa_id, resumo_diario, resumo_hora, pacote_contador, pacote_contador_dia)
values (current_setting('t.emp')::uuid, true, '00:00', true, 1);
select pg_temp.espera_erro($$update automacoes_empresa set pacote_contador_dia = 31$$, 'pacote_contador_dia');

-- tratador e master com celular inscrito
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes)
values (current_setting('t.emp')::uuid, 'a0820000-0000-0000-0000-000000000002', 'apontador', '{}');
insert into push_inscricoes (empresa_id, user_id, endpoint, p256dh, auth) values
  (current_setting('t.emp')::uuid, 'a0820000-0000-0000-0000-000000000001', 'https://push.exemplo/resumo-dono', 'c', 's'),
  (current_setting('t.emp')::uuid, 'a0820000-0000-0000-0000-000000000002', 'https://push.exemplo/resumo-tratador', 'c', 's');

select pg_temp.ok((select array_agg(endpoint) = '{https://push.exemplo/resumo-dono}' from inscricoes_com_permissao(current_setting('t.emp')::uuid, 'relatorios.ver')),
  'resumo vai só para quem vê relatórios');
select pg_temp.ok((select count(*) = 2 from inscricoes_com_permissao(current_setting('t.emp')::uuid, 'apontamentos.ver')),
  'aviso de apontamento vai para os dois');

-- H3
create temp table r as select * from public.resumos_diarios_devidos();
select pg_temp.ok((select count(*) = 1 from r), 'um resumo para a empresa');
select pg_temp.ok((select dia = current_setting('t.hoje')::date
  and (resumo->>'racao_kg')::numeric = 42.5 and (resumo->>'mortes')::int = 4 and (resumo->>'peixes')::int = 10000
  and (resumo->>'oxigenio_min')::numeric = 4.1 and (resumo->>'sem_lancamento')::int = 1
  and (resumo->'pagar_hoje'->>'n')::int = 1 and (resumo->'pagar_hoje'->>'cents')::bigint = 45000
  and (resumo->>'pagar_vencidas')::int = 1 and (resumo->'receber_hoje'->>'n')::int = 0 from r),
  'resumo: ração, baixas e oxigênio de ontem, viveiro sem lançamento, contas do dia e vencidas');
select pg_temp.ok((select count(*) = 0 from public.resumos_diarios_devidos()), 'resumo sai uma vez por dia');

-- E1: pacote a partir do dia 1 (o aviso de fechamento do ponto saiu com o RH)
create temp table m as select * from public.avisos_mensais_devidos();
select pg_temp.ok((select count(*) = 1 from m where tipo = 'pacote_contador'
  and mes = to_char(date_trunc('month', current_setting('t.hoje')::date) - interval '1 month', 'YYYY-MM')), 'pacote do mês anterior');
select pg_temp.ok((select count(*) = 0 from m where tipo <> 'pacote_contador'), 'só o aviso do pacote (o do ponto saiu com o RH)');
select pg_temp.ok((select count(*) = 0 from public.avisos_mensais_devidos() where tipo = 'pacote_contador'), 'pacote avisa uma vez por mês');

-- só o servidor chama
set role authenticated;
set request.jwt.claim.sub = 'a0820000-0000-0000-0000-000000000001';
select pg_temp.espera_erro($$select public.resumos_diarios_devidos()$$, 'permission denied');
select pg_temp.espera_erro($$select public.avisos_mensais_devidos()$$, 'permission denied');
select pg_temp.espera_erro($$select * from public.inscricoes_com_permissao(current_setting('t.emp')::uuid, 'relatorios.ver')$$, 'permission denied');
reset role;

\o
\echo 'TESTES DAS AUTOMAÇÕES DE ROTINA PASSARAM'
