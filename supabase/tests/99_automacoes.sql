-- Automações: configuração por empresa, inscrições de aviso no celular (cada um só as suas) e o
-- lembrete de apontamento (viveiros sem lançamento no turno, uma vez por turno e dia).
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
  ('a0700000-0000-0000-0000-000000000001', 'dono@auto.com', now()),
  ('a0700000-0000-0000-0000-000000000002', 'tratador@auto.com', now()),
  ('a0700000-0000-0000-0000-000000000003', 'estranho@auto.com', now());

set role authenticated;
set request.jwt.claim.sub = 'a0700000-0000-0000-0000-000000000001';
select set_config('t.emp', criar_empresa('70707070000160', 'Piscicultura Auto Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('a0700000-0000-0000-0000-0000000000a1', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes) values
  ('a0700000-0000-0000-0000-0000000000a2', current_setting('t.emp')::uuid, 'a0700000-0000-0000-0000-0000000000a1', 'G1', 'engorda', 20000),
  ('a0700000-0000-0000-0000-0000000000a3', current_setting('t.emp')::uuid, 'a0700000-0000-0000-0000-0000000000a1', 'G2', 'engorda', 20000);
select povoar_lote(current_setting('t.emp')::uuid, 'A1', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, 'a0700000-0000-0000-0000-0000000000a2', 10000, 5);
select povoar_lote(current_setting('t.emp')::uuid, 'A2', (select id from especies where nome = 'Tambaqui'),
  current_date - 60, 'a0700000-0000-0000-0000-0000000000a3', 10000, 5);

-- dono liga o lembrete; manhã à meia-noite para já estar vencido no teste
insert into automacoes_empresa (empresa_id, lembrete_apontamento, lembrete_manha, lembrete_tarde)
values (current_setting('t.emp')::uuid, true, '00:00', '23:59:59');
select pg_temp.ok((select lembrete_apontamento from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid), 'master liga o lembrete');

-- tratador (sem configurações.editar) não muda a configuração, mas se inscreve para receber
reset role;
insert into usuarios_empresa (empresa_id, user_id, perfil, permissoes)
values (current_setting('t.emp')::uuid, 'a0700000-0000-0000-0000-000000000002', 'apontador', '{}');
set role authenticated;
set request.jwt.claim.sub = 'a0700000-0000-0000-0000-000000000002';
update automacoes_empresa set lembrete_apontamento = false where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select lembrete_apontamento from automacoes_empresa where empresa_id = current_setting('t.emp')::uuid), 'quem não pode configurar não desliga');
insert into push_inscricoes (empresa_id, endpoint, p256dh, auth)
values (current_setting('t.emp')::uuid, 'https://push.exemplo/tratador', 'chave', 'segredo');
select pg_temp.ok((select user_id = 'a0700000-0000-0000-0000-000000000002' from push_inscricoes where endpoint = 'https://push.exemplo/tratador'), 'inscrição fica no nome de quem se inscreveu');
select pg_temp.espera_erro($$insert into push_inscricoes (empresa_id, user_id, endpoint, p256dh, auth)
  values (current_setting('t.emp')::uuid, 'a0700000-0000-0000-0000-000000000001', 'https://push.exemplo/falso', 'c', 's')$$, 'row-level security');
select pg_temp.espera_erro($$insert into push_inscricoes (empresa_id, endpoint, p256dh, auth)
  values (current_setting('t.emp')::uuid, 'http://inseguro', 'c', 's')$$, 'endpoint');

set request.jwt.claim.sub = 'a0700000-0000-0000-0000-000000000001';
insert into push_inscricoes (empresa_id, endpoint, p256dh, auth)
values (current_setting('t.emp')::uuid, 'https://push.exemplo/dono', 'chave', 'segredo');
select pg_temp.ok((select count(*) = 1 from push_inscricoes), 'cada um vê só as próprias inscrições');

set request.jwt.claim.sub = 'a0700000-0000-0000-0000-000000000003';
select pg_temp.ok((select count(*) = 0 from automacoes_empresa), 'quem não é da empresa não vê a configuração');
select pg_temp.espera_erro($$select public.lembretes_apontamento_devidos()$$, 'permission denied');

-- G1 lançou a manhã; G2 não
set request.jwt.claim.sub = 'a0700000-0000-0000-0000-000000000001';
select registrar_apontamento(current_setting('t.emp')::uuid, null, 'a0700000-0000-0000-0000-0000000000a2',
  (now() at time zone 'America/Manaus')::date, 'manha', 0, 0);
reset role;

create temp table r1 as select * from public.lembretes_apontamento_devidos();
select pg_temp.ok((select count(*) = 1 from r1), 'um lembrete: só o turno da manhã já passou da hora');
select pg_temp.ok((select turno = 'manha' and viveiros = '[{"viveiro": "Sede / G2", "lote": "A2"}]'::jsonb from r1), 'lembrete cita só o viveiro que falta');
select pg_temp.ok((select count(*) = 0 from public.lembretes_apontamento_devidos()), 'não repete o lembrete no mesmo turno e dia');

update automacoes_empresa set lembrete_tarde = '00:00' where empresa_id = current_setting('t.emp')::uuid;
select pg_temp.ok((select count(*) = 1 and min(jsonb_array_length(viveiros)) = 2 from public.lembretes_apontamento_devidos()),
  'tarde vencida: os dois viveiros faltam');

\o
\echo 'TESTES DAS AUTOMAÇÕES PASSARAM'
