-- Cargos: perfis prontos da piscicultura (tratador, gerente, fábrica de ração...) e cargos criados pelo master.
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

-- m = master, g = tratador, r = fábrica de ração, c = cargo da empresa, o = master de outra empresa
insert into auth.users (id, email, email_confirmed_at) values
  ('9ca00000-0000-0000-0000-0000000000a1', 'master@cargos.com', now()),
  ('9ca00000-0000-0000-0000-0000000000a2', 'viveiro@cargos.com', now()),
  ('9ca00000-0000-0000-0000-0000000000a3', 'racao@cargos.com', now()),
  ('9ca00000-0000-0000-0000-0000000000a4', 'vet@cargos.com', now()),
  ('9ca00000-0000-0000-0000-0000000000a5', 'outro@cargos.com', now());

set role authenticated;
set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a5';
select set_config('t.outra', criar_empresa('97123456000171', 'Outra Piscicultura Ltda')::text, false);
select set_config('t.cargo_outra', salvar_cargo(current_setting('t.outra')::uuid, null, 'Motorista', null, '{vendas.ver}')::text, false);

set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('97123456000252', 'Piscicultura Cargos Ltda')::text, false);
insert into setores (id, empresa_id, nome) values ('9ca00000-0000-0000-0000-000000000001', current_setting('t.emp')::uuid, 'Sede');
insert into viveiros (id, empresa_id, setor_id, nome, finalidade, capacidade_peixes)
values ('9ca00000-0000-0000-0000-000000000002', current_setting('t.emp')::uuid, '9ca00000-0000-0000-0000-000000000001', 'G1', 'engorda', 20000);
select set_config('t.lote', povoar_lote(current_setting('t.emp')::uuid, 'C1', (select id from especies where nome = 'Tambaqui'),
  (current_date - 60), '9ca00000-0000-0000-0000-000000000002', 10000, 5)::text, false);

-- Perfis prontos novos
select pg_temp.ok(permissoes_dos_perfis() ?& array['administrativo', 'gerente_piscicultura', 'tratador', 'fabrica_racao', 'manutencao', 'financeiro'],
  'cargos prontos da piscicultura aparecem para a tela');
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'viveiro@cargos.com', 'tratador', '{}', false, ' Zé do Viveiro ') = 'adicionado',
  'master cadastra o tratador com nome');
select pg_temp.ok((select nome = 'Zé do Viveiro' and perfil = 'tratador' from usuarios_empresa where user_id = '9ca00000-0000-0000-0000-0000000000a2'),
  'nome e perfil gravados');
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'racao@cargos.com', 'fabrica_racao') = 'adicionado', 'fabricante de ração cadastrado');

-- Cargo da empresa
select pg_temp.espera_erro(format($$select salvar_cargo(%L, null, '  ', null, '{sanidade.editar}')$$, current_setting('t.emp')), 'nome ao cargo');
select pg_temp.espera_erro(format($$select salvar_cargo(%L, null, 'Vazio', null, '{}')$$, current_setting('t.emp')), 'pelo menos uma permissão');
select pg_temp.espera_erro(format($$select salvar_cargo(%L, null, 'Ruim', null, '{"drop table"}')$$, current_setting('t.emp')), 'formato inválido');
select set_config('t.cargo', salvar_cargo(current_setting('t.emp')::uuid, null, ' Veterinário ', 'Cuida da sanidade',
  '{sanidade.editar,lotes.ver,sanidade.editar}')::text, false);
select pg_temp.ok((select nome = 'Veterinário' and permissoes = '{lotes.ver,sanidade.editar}' from cargos where id = current_setting('t.cargo')::uuid),
  'cargo salvo com nome limpo e permissões sem repetição');
select pg_temp.espera_erro(format($$select salvar_cargo(%L, null, 'veterinário', null, '{lotes.ver}')$$, current_setting('t.emp')), 'Já existe um cargo');
select pg_temp.espera_erro(format($$select convidar_usuario(%L, 'vet@cargos.com', 'personalizado', '{}', false, null, %L)$$,
  current_setting('t.emp'), current_setting('t.cargo_outra')), 'Cargo não encontrado');
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'vet@cargos.com', 'visualizacao', '{}', false, 'Dra. Ana',
  current_setting('t.cargo')::uuid) = 'adicionado', 'master dá o cargo da empresa');
select pg_temp.ok((select perfil = 'personalizado' and cargo_id = current_setting('t.cargo')::uuid from usuarios_empresa
  where user_id = '9ca00000-0000-0000-0000-0000000000a4'), 'com cargo, o perfil fica personalizado');

-- Tratador: lança o apontamento e o checklist, não mexe em lote, ração nem financeiro
set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a2';
select registrar_apontamento(current_setting('t.emp')::uuid, null, '9ca00000-0000-0000-0000-000000000002', current_date - 1,
  'manha', 3, 0, 1100);
select pg_temp.ok((select mortes = 3 and racao_kg = 1100 from apontamentos_diarios
  where lote_id = current_setting('t.lote')::uuid and data = current_date - 1), 'tratador lança o apontamento');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'lotes.ver'), 'tratador vê lotes');
select pg_temp.ok(not app.pode(current_setting('t.emp')::uuid, 'lotes.editar') and not app.pode(current_setting('t.emp')::uuid, 'racao.editar')
  and not app.pode(current_setting('t.emp')::uuid, 'contas-a-pagar.ver'), 'tratador não edita lote, ração nem vê o financeiro');
select pg_temp.espera_erro(format($$select salvar_cargo(%L, null, 'Chefe', null, '{lotes.editar}')$$, current_setting('t.emp')), 'Só o usuário master');
select pg_temp.espera_erro(format($$insert into cargos (empresa_id, nome, permissoes) values (%L, 'Chefe', '{lotes.editar}')$$, current_setting('t.emp')),
  'row-level security');
select pg_temp.espera_erro(format($$select apagar_cargo(%L)$$, current_setting('t.cargo')), 'Só o usuário master');
select pg_temp.ok((select count(*) from cargos) = 1, 'membro vê os cargos da própria empresa e não os da outra');
select pg_temp.espera_erro(format($$select app.chaves_membro('personalizado', %L, '{}')$$, current_setting('t.cargo_outra')), 'permission denied');

-- Fábrica de ração
set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a3';
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'racao.editar') and app.pode(current_setting('t.emp')::uuid, 'estoque.ver')
  and not app.pode(current_setting('t.emp')::uuid, 'apontamentos.editar'), 'fabricante de ração produz ração e não lança apontamento');

-- Cargo da empresa: permissões vêm do cargo e mudam junto com ele
set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a4';
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'sanidade.editar') and not app.pode(current_setting('t.emp')::uuid, 'apontamentos.editar'),
  'cargo dá as permissões dele');
select pg_temp.ok(minhas_permissoes(current_setting('t.emp')::uuid)->>'cargo' = 'Veterinário'
  and (minhas_permissoes(current_setting('t.emp')::uuid)->'chaves') ? 'sanidade.editar', 'minhas_permissoes traz o cargo e as chaves dele');

set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a1';
select salvar_cargo(current_setting('t.emp')::uuid, current_setting('t.cargo')::uuid, 'Veterinário', null, '{sanidade.ver,apontamentos.editar}');
select pg_temp.espera_erro(format($$select salvar_cargo(%L, %L, 'Roubado', null, '{lotes.ver}')$$, current_setting('t.emp'), current_setting('t.cargo_outra')),
  'Cargo não encontrado');
select pg_temp.espera_erro(format($$select apagar_cargo(%L)$$, current_setting('t.cargo_outra')), 'Só o usuário master');

set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a4';
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'apontamentos.editar') and not app.pode(current_setting('t.emp')::uuid, 'sanidade.editar'),
  'mudar o cargo muda o acesso de quem o tem');

-- Apagar cargo em uso não pode; trocar o cargo do usuário libera
set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a1';
select pg_temp.espera_erro(format($$select apagar_cargo(%L)$$, current_setting('t.cargo')), 'Troque o cargo');
select atualizar_usuario(current_setting('t.emp')::uuid, '9ca00000-0000-0000-0000-0000000000a4', 'fabrica_racao', '{}', false, true, 'Dra. Ana', null);
select pg_temp.ok((select perfil = 'fabrica_racao' and cargo_id is null and nome = 'Dra. Ana' from usuarios_empresa
  where user_id = '9ca00000-0000-0000-0000-0000000000a4'), 'master troca o cargo por um pronto');
select apagar_cargo(current_setting('t.cargo')::uuid);
select pg_temp.ok((select count(*) from cargos where empresa_id = current_setting('t.emp')::uuid) = 0, 'cargo sem ninguém é apagado');

-- Convite com cargo: o cargo vai junto quando a pessoa aceita
select set_config('t.cargo2', salvar_cargo(current_setting('t.emp')::uuid, null, 'Motorista', null, '{vendas.ver,estoque.ver}')::text, false);
select pg_temp.ok(convidar_usuario(current_setting('t.emp')::uuid, 'novo@cargos.com', 'personalizado', '{}', false, 'Seu João',
  current_setting('t.cargo2')::uuid) = 'convidado', 'convite com cargo');
select pg_temp.espera_erro(format($$select apagar_cargo(%L)$$, current_setting('t.cargo2')), 'convite');
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('9ca00000-0000-0000-0000-0000000000a6', 'novo@cargos.com', now());
set role authenticated;
set request.jwt.claim.sub = '9ca00000-0000-0000-0000-0000000000a6';
select pg_temp.ok(aceitar_convites() = 1, 'convite aceito');
select pg_temp.ok((select nome = 'Seu João' and cargo_id = current_setting('t.cargo2')::uuid from usuarios_empresa where user_id = auth.uid()),
  'entrou com nome e cargo do convite');
select pg_temp.ok(app.pode(current_setting('t.emp')::uuid, 'estoque.ver') and not app.pode(current_setting('t.emp')::uuid, 'estoque.editar'),
  'permissões do cargo valem depois do convite');

reset role;
\o
\echo 'TESTES DE CARGOS PASSARAM'
