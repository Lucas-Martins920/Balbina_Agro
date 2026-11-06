-- Conta de teste cheia: uma piscicultura de tambaqui com ~60 dias de dados realistas em todos os módulos:
-- viveiros de engorda e de recria com lotes em fases diferentes, trato diário pela tabela de arraçoamento,
-- qualidade da água, biometrias, despescas parcial e total, um surto na recria, medicação com carência,
-- vendas por classe de peso, peixaria (ponto de venda), contas a pagar e a receber, extrato e custo do kg.
-- Antes desses 60 dias, cada lote tem o trato do dia, as mortes e uma biometria por mês desde o povoamento.
--
-- NUNCA na produção: o script recusa rodar se o 2º fator estiver obrigatório (app.parametros exigir_2fa),
-- o que só acontece na produção. No site de teste ele roda pelo Action "Migrations no Supabase"
-- (opção "conta de teste cheia"); localmente: psql "$URL_DO_BANCO_LOCAL" -f supabase/seed/conta-teste.sql
--
-- Rodar de novo recria a conta do zero, com as datas relativas a hoje. Só toca nesta empresa
-- (CNPJ 45.723.174/0001-10) e nos 4 usuários abaixo; as outras empresas do banco ficam como estão.
--
-- Entrada (a mesma em docs/site-de-teste.md):
--   master       nicolasduarte.s@gmail.com / (senha já existente no banco de teste, ou Balbina@teste1 se criado do zero)
--   usuários     gerente.teste, viveiro.teste, racao.teste / Balbina@teste1 (logins sem e-mail)
--
-- Dados zootécnicos: a curva de crescimento e a tabela de arraçoamento do tambaqui que o próprio banco usa
-- (app.peso_curva, tabela_arracoamento; fontes em docs/piscicultura.md). A ração de cada trato parte da sugerida
-- pelo banco para o peso do lote; o tratador dá de 15% a 50% a mais, até a saciedade, e a conversão alimentar do
-- ciclo fica entre 1,4 e 1,5 (1,7 na barragem, que passou do ponto de abate; ver docs/piscicultura.md).
-- Preços de ração, insumos e peixe são referências de teste para a região de Manaus/AM, não cotação.
--
-- Tudo é lançado pelas funções do banco que o app usa (povoar_lote, registrar_lancamento_campo,
-- registrar_biometria, registrar_despesca, criar_pedido, faturar_pedido, agendar_titulo, importar_extrato...),
-- como o master, então as regras, o estoque, o custo médio e o histórico ficam iguais aos de uso real.
\set ON_ERROR_STOP on
set client_min_messages = warning;

begin;

do $$
begin
  if coalesce((select valor from app.parametros where chave = 'exigir_2fa'), 'sim') <> 'nao' then
    raise exception 'Recusado: este banco exige 2º fator (produção). A conta de teste cheia só vai no banco de teste ou no local.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0. Recomeça: apaga a empresa de teste e os usuários dela, se já existirem
-- ---------------------------------------------------------------------------
create temp table ct_ids (chave text primary key, id uuid not null) on commit drop;
grant all on ct_ids to authenticated;
-- Notas de compra: a mesma lista dá a entrada no estoque (no dia) e a conta a pagar (seção 8)
create temp table ct_compras (dia int not null, chave text not null, qtd numeric not null, preco_cents numeric not null,
                              nf text not null, fornecedor text not null) on commit drop;
grant all on ct_compras to authenticated;

do $$
declare
  v_emp uuid := (select id from empresas where cnpj = '45723174000110');
  t record;
begin
  if v_emp is not null then
    set local session_replication_role = replica;
    for t in
      select c.table_name from information_schema.columns c
      join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'empresa_id' and c.table_name <> 'empresas'
    loop
      execute format('delete from public.%I where empresa_id = $1', t.table_name) using v_emp;
    end loop;
    delete from public.audit_log where empresa_id = v_emp;
    delete from public.empresas where id = v_emp;
    set local session_replication_role = origin;
  end if;
  delete from auth.users where id in ('f1a70000-0000-4000-8000-000000000002',
                                      'f1a70000-0000-4000-8000-000000000003', 'f1a70000-0000-4000-8000-000000000004')
     or lower(email) in ('gerente.teste@usuarios.balbina.test', 'viveiro.teste@usuarios.balbina.test',
                         'racao.teste@usuarios.balbina.test');
end $$;

-- ---------------------------------------------------------------------------
-- 1. Contas de acesso (Supabase Auth)
-- ---------------------------------------------------------------------------
do $$
declare
  v_master_id uuid;
  u record;
  v_meta jsonb := jsonb_build_object('termos_versao', '2026-10-27', 'termos_aceitos_em', now());
  v_cols text;
  v_vals text;
  c text;
begin
  select id into v_master_id from auth.users where lower(email) = 'nicolasduarte.s@gmail.com';
  if v_master_id is null then
    v_master_id := 'f1a70000-0000-4000-8000-000000000001';
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
      v_cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at';
      v_vals := format('%L, %L, %L, %L, %L, extensions.crypt(%L, extensions.gen_salt(%L)), now(), %L, %L, now(), now()',
        '00000000-0000-0000-0000-000000000000', v_master_id, 'authenticated', 'authenticated', 'nicolasduarte.s@gmail.com', 'Balbina@teste1', 'bf',
        '{"provider":"email","providers":["email"]}', v_meta);
      for c in select column_name from information_schema.columns
               where table_schema = 'auth' and table_name = 'users'
                 and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                                     'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
      loop
        v_cols := v_cols || ', ' || c;
        v_vals := v_vals || ', ''''';
      end loop;
      execute format('insert into auth.users (%s) values (%s)', v_cols, v_vals);
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (v_master_id::text, v_master_id, jsonb_build_object('sub', v_master_id::text, 'email', 'nicolasduarte.s@gmail.com', 'email_verified', true), 'email', now(), now(), now());
    else
      insert into auth.users (id, email, email_confirmed_at) values (v_master_id, 'nicolasduarte.s@gmail.com', now());
    end if;
    raise warning 'Master criado do zero (nicolasduarte.s@gmail.com / Balbina@teste1). ID: %', v_master_id;
  else
    raise warning 'Master já existe no banco (nicolasduarte.s@gmail.com). ID: %. Senha mantida.', v_master_id;
  end if;
  insert into ct_ids values ('master_id', v_master_id);

  for u in select * from (values
    ('f1a70000-0000-4000-8000-000000000002'::uuid, 'gerente.teste@usuarios.balbina.test'),
    ('f1a70000-0000-4000-8000-000000000003'::uuid, 'viveiro.teste@usuarios.balbina.test'),
    ('f1a70000-0000-4000-8000-000000000004'::uuid, 'racao.teste@usuarios.balbina.test')) x(id, email)
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
      v_cols := 'instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at';
      v_vals := format('%L, %L, %L, %L, %L, extensions.crypt(%L, extensions.gen_salt(%L)), now(), %L, %L, now(), now()',
        '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, 'Balbina@teste1', 'bf',
        '{"provider":"email","providers":["email"]}', v_meta);
      for c in select column_name from information_schema.columns
               where table_schema = 'auth' and table_name = 'users'
                 and column_name in ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
                                     'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token')
      loop
        v_cols := v_cols || ', ' || c;
        v_vals := v_vals || ', ''''';
      end loop;
      execute format('insert into auth.users (%s) values (%s)', v_cols, v_vals);
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    else
      insert into auth.users (id, email, email_confirmed_at) values (u.id, u.email, now());
    end if;
  end loop;
end $$;

-- A partir daqui tudo roda como o master, numa sessão com senha + app autenticador (como no app).
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from ct_ids where chave = 'master_id'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id::text from ct_ids where chave = 'master_id'), 'role', 'authenticated', 'aal', 'aal2',
  'session_id', gen_random_uuid(),
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint),
                           jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);

-- Atalhos usados no resto do script
create function pg_temp.id(p_chave text) returns uuid language sql stable as $$
  select id from ct_ids where chave = p_chave
$$;
create function pg_temp.cat(p_nome text) returns uuid language sql stable as $$
  select id from categorias where empresa_id = (select id from ct_ids where chave = 'empresa') and nome = p_nome and ativa
  order by parent_id nulls last limit 1
$$;
create function pg_temp.cc(p_nome text) returns uuid language sql stable as $$
  select id from centros_custo where empresa_id = (select id from ct_ids where chave = 'empresa') and nome = p_nome limit 1
$$;
create function pg_temp.classe(p_nome text) returns uuid language sql stable as $$
  select id from classes_peixe where empresa_id = (select id from ct_ids where chave = 'empresa') and nome = p_nome
$$;
-- Produto de venda de uma classe: fator 1 = vendido por kg; fator 20 = caixa de 20 kg
create function pg_temp.produto(p_classe text, p_fator numeric) returns uuid language sql stable as $$
  select pr.id from produtos pr join classes_peixe c on c.id = pr.classe_peixe_id
  where pr.empresa_id = (select id from ct_ids where chave = 'empresa') and pr.para_venda and c.nome = p_classe
    and pr.fator_kg = p_fator
$$;
-- kg de pescado de uma classe no depósito da sede ao fim de um dia (a venda conta na data do pedido)
create function pg_temp.kg_em(p_classe text, p_data date) returns numeric language sql stable as $$
  select coalesce(sum(m.quantidade), 0)
  from movimentos_estoque m
  join produtos p on p.id = m.produto_id and p.base_estoque
  join classes_peixe c on c.id = p.classe_peixe_id
  left join pedidos_venda pv on m.origem_tabela = 'pedidos_venda' and pv.id = m.origem_id
  where m.empresa_id = (select id from ct_ids where chave = 'empresa') and c.nome = p_classe
    and m.deposito_id = (select deposito_id from pontos_venda where empresa_id = m.empresa_id and sede)
    and coalesce(pv.data, m.data) <= p_data
$$;
-- Peixes vivos de um viveiro no fim do dia, pelo apontamento
create function pg_temp.vivos(p_viveiro text, p_data date) returns int language sql stable as $$
  select (la.qtd_peixes - coalesce((select sum(ad.mortes + ad.descartes) from apontamentos_diarios ad
                                   where ad.lote_id = la.lote_id and ad.viveiro_id = la.viveiro_id
                                     and ad.data >= lower(la.periodo) and ad.data <= p_data), 0))::int
  from lote_alocacoes la
  where la.viveiro_id = (select id from ct_ids where chave = p_viveiro) and la.periodo @> p_data
  order by lower(la.periodo) desc limit 1
$$;
-- Título a pagar ou a receber, com rateio numa categoria e num centro de custo (p_venc e p_comp em dias a partir de hoje)
create function pg_temp.titulo(p_tipo text, p_desc text, p_venc int, p_valor bigint, p_cat text, p_cc text, p_contato text,
                               p_parcelas int default 1, p_forma text default 'boleto', p_comp int default null) returns uuid
language sql as $$
  select agendar_titulo(pg_temp.id('empresa'), p_tipo, p_desc, app.hoje(pg_temp.id('empresa')) + p_venc,
    app.hoje(pg_temp.id('empresa')) + coalesce(p_comp, least(p_venc, 0)), p_valor,
    jsonb_build_array(jsonb_build_object('categoria_id', pg_temp.cat(p_cat), 'centro_custo_id', pg_temp.cc(p_cc), 'valor_cents', p_valor)),
    pg_temp.id(p_contato), null, p_parcelas, p_forma)
$$;

-- ---------------------------------------------------------------------------
-- 2. Empresa, viveiros, contatos e lotes
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_id uuid;
  r record;
begin
  v_emp := criar_empresa('45723174000110', 'Piscicultura Boa Engorda Ltda', 'Piscicultura Boa Engorda', '053456789');
  insert into ct_ids values ('empresa', v_emp);
  update empresas set endereco = jsonb_build_object('logradouro', 'Rodovia AM-010, km 32', 'bairro', 'Zona Rural',
      'municipio', 'Rio Preto da Eva', 'uf', 'AM', 'cep', '69117000'),
    apontar_qualidade_agua = true
  where id = v_emp;

  -- Setores e viveiros: escavados com aerador na sede, uma barragem sem aerador e o berçário da recria
  insert into setores (empresa_id, nome) values (v_emp, 'Setor Sede') returning id into v_s1;
  insert into setores (empresa_id, nome) values (v_emp, 'Setor Berçário') returning id into v_s2;
  for r in select * from (values
      ('v1', v_s1, 'Viveiro 01', 'engorda', 'escavado', 10000, true,  10000, 1.6),
      ('v2', v_s1, 'Viveiro 02', 'engorda', 'escavado',  8000, true,   8000, 1.6),
      ('v3', v_s1, 'Viveiro 03', 'engorda', 'barragem',  9000, false, 15000, 2.2),
      ('v5', v_s1, 'Viveiro 05', 'engorda', 'escavado',  8000, true,   8000, 1.5),
      ('v4', v_s2, 'Viveiro 04', 'recria',  'escavado', 15000, true,   3000, 1.2)
    ) x(chave, setor, nome, finalidade, sistema, cap, aeracao, area, prof)
  loop
    insert into viveiros (empresa_id, setor_id, nome, finalidade, sistema, capacidade_peixes, aeracao, area_m2, profundidade_m, volume_m3)
    values (v_emp, r.setor, r.nome, r.finalidade, r.sistema, r.cap, r.aeracao, r.area, r.prof, r.area * r.prof)
    returning id into v_id;
    insert into ct_ids values (r.chave, v_id);
  end loop;

  -- Contatos: clientes e fornecedores da região (nomes e documentos fictícios)
  for r in select * from (values
      ('cli_frigorifico',  array['cliente'], 'Frigorífico de Pescado Amazonas', '12345678000195', 'Manaus', 'compras@frigorifico-teste.com.br', '92988881001'),
      ('cli_supermercado', array['cliente'], 'Supermercado Nova Era', '23456789000150', 'Manaus', 'financeiro@novaera-teste.com.br', '92988881002'),
      ('cli_peixaria',     array['cliente'], 'Peixaria Bom Peixe', '34567890000104', 'Rio Preto da Eva', null, '92988881003'),
      ('cli_feira',        array['cliente'], 'Banca Peixe Fresco (feira)', '45678901000169', 'Manaus', null, '92988881004'),
      ('cli_restaurante',  array['cliente'], 'Restaurante Sabor do Rio', '56789012000113', 'Itacoatiara', null, '92988881005'),
      ('cli_mercadinho',   array['cliente'], 'Mercadinho São José', '67890123000178', 'Presidente Figueiredo', null, '92988881006'),
      ('cli_maria',        array['cliente'], 'Maria do Carmo Souza', '52998224725', 'Rio Preto da Eva', null, '92988881007'),
      ('for_racao',        array['fornecedor'], 'Nutriaqua Rações do Norte', '78901234000132', 'Manaus', 'vendas@nutriaqua-teste.com.br', '92988882001'),
      ('for_alevinos',     array['fornecedor'], 'Estação de Alevinos Boa Esperança', '21234567000144', 'Rio Preto da Eva', null, '92988882002'),
      ('for_agro',         array['fornecedor'], 'Agropecuária Tarumã', '89012345000197', 'Manaus', null, '92988882003'),
      ('for_embalagem',    array['fornecedor'], 'Embalagens Amazônia', '01234567000116', 'Manaus', null, '92988882004'),
      ('for_vet',          array['fornecedor'], 'Vet Campo Produtos Veterinários', '11234567000180', 'Manaus', null, '92988882005'),
      ('for_frete',        array['fornecedor'], 'Transportes Rio Negro', '31234567000109', 'Manaus', null, '92988882006'),
      ('for_gelo',         array['fornecedor'], 'Fábrica de Gelo Polar Norte', '90123456000151', 'Manaus', null, '92988882007'),
      ('for_despesca',     array['fornecedor'], 'Equipe de Despesca Irmãos Lima', '41234567000100', 'Rio Preto da Eva', null, '92988882008'),
      ('for_tecnico',      array['fornecedor'], 'Aquatec Assistência Técnica', '51234567000163', 'Manaus', null, '92988882009'),
      ('for_energia',      array['fornecedor'], 'Amazonas Energia', '02341470000144', 'Manaus', null, null),
      ('func_joao',        array['funcionario'], 'João Batista Lima', '11144477735', 'Rio Preto da Eva', null, '92988883001'),
      ('func_ana',         array['funcionario'], 'Ana Paula Ferreira', '39053344705', 'Rio Preto da Eva', null, '92988883002')
    ) x(chave, tipos, nome, doc, cidade, email, tel)
  loop
    insert into contatos (empresa_id, tipos, nome, cpf_cnpj, cidade, uf, email, telefone)
    values (v_emp, r.tipos, r.nome, r.doc, r.cidade, 'AM', r.email, r.tel)
    returning id into v_id;
    insert into ct_ids values (r.chave, v_id);
  end loop;

  v_id := salvar_cargo(v_emp, null, 'Despescador', 'Acompanha a despesca, pesa o pescado por classe e confere o estoque',
          array['estoque.ver', 'estoque.editar', 'apontamentos.ver']);
  insert into ct_ids values ('cargo_despescador', v_id);
end $$;

-- Usuários sem e-mail
select registrar_login_local(pg_temp.id('empresa'), 'f1a70000-0000-4000-8000-000000000002',
  'gerente.teste', 'Carlos Gerente (teste)', 'gerente_piscicultura');
select registrar_login_local(pg_temp.id('empresa'), 'f1a70000-0000-4000-8000-000000000003',
  'viveiro.teste', 'Zé do Viveiro (teste)', 'tratador', '{}', null, true);
select registrar_login_local(pg_temp.id('empresa'), 'f1a70000-0000-4000-8000-000000000004',
  'racao.teste', 'Rita da Ração (teste)', 'fabrica_racao', '{}', null, true);
reset role;
update logins_locais set trocar_senha = false where empresa_id = (select id from ct_ids where chave = 'empresa');
update usuarios_empresa set nome = 'Nicolas (teste)' where user_id = (select id from ct_ids where chave = 'master_id');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from ct_ids where chave = 'master_id'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id::text from ct_ids where chave = 'master_id'), 'role', 'authenticated', 'aal', 'aal2',
  'session_id', gen_random_uuid(),
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint),
                           jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);

-- Lotes de tambaqui em fases diferentes: a barragem perto do abate, dois viveiros em engorda e o berçário em recria.
-- O Viveiro 05 fica vazio, em preparo para receber os juvenis do berçário.
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  r record;
begin
  for r in select * from (values
      -- chave, código, viveiro, dias desde o povoamento, peixes, peso no povoamento (g), R$ por milheiro (centavos), peso alvo (g)
      ('lote_v3', 'L-2025-07', 'v3', 330,  9000, 20, 55000, 2500),
      ('lote_v1', 'L-2026-01', 'v1', 200, 10000, 30, 70000, 2000),
      ('lote_v2', 'L-2026-03', 'v2', 120,  8000, 50, 90000, 1500),
      ('lote_v4', 'L-2026-04', 'v4',  75, 15000,  2, 25000,  300)
    ) x(chave, codigo, viveiro, dias, peixes, peso, milheiro_cents, alvo)
  loop
    insert into ct_ids values (r.chave, povoar_lote(v_emp, r.codigo,
      (select id from especies where empresa_id is null and nome = 'Tambaqui'),
      v_hoje - r.dias, pg_temp.id(r.viveiro), r.peixes, r.peso,
      (r.peixes::bigint * r.milheiro_cents / 1000), pg_temp.id('for_alevinos'), r.alvo));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Ração, insumos de viveiro, medicamentos e embalagens
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  r record;
  v_id uuid;
begin
  -- Uma ração para cada faixa da tabela de arraçoamento (proteína e grânulo)
  for r in select * from (values
      ('r_55',          'racao',       'Ração alevino 55% PB (pó)',        'kg',   25),
      ('r_40',          'racao',       'Ração extrusada 40% PB 2–4 mm',    'kg',  200),
      ('r_32',          'racao',       'Ração extrusada 32% PB 4–6 mm',    'kg',  300),
      ('r_28_8',        'racao',       'Ração extrusada 28% PB 8 mm',      'kg', 1000),
      ('r_28_10',       'racao',       'Ração extrusada 28% PB 10 mm',     'kg', 2000),
      ('c_calcario',    'corretivo',   'Calcário dolomítico',              'kg', 1000),
      ('c_ureia',       'outro',       'Ureia agrícola',                   'kg',   50),
      ('c_super',       'outro',       'Superfosfato simples',             'kg',   50),
      ('m_florfenicol', 'medicamento', 'Florfenicol premix 50%',           'kg', 0.25),
      ('m_vitc',        'medicamento', 'Vitamina C premix 35%',            'kg', 0.25),
      ('e_caixa',       'embalagem',   'Caixa plástica descartável 20 kg', 'un',  100),
      ('e_gelo',        'embalagem',   'Gelo em escamas',                  'kg',  300)
    ) x(chave, tipo, nome, unidade, minimo)
  loop
    insert into produtos (empresa_id, tipo, nome, unidade, para_venda, estoque_minimo)
    values (v_emp, r.tipo, r.nome, r.unidade, false, r.minimo) returning id into v_id;
    insert into ct_ids values (r.chave, v_id);
  end loop;

  -- Cada caixa de 20 kg vendida gasta a caixa e 8 kg de gelo
  insert into produto_embalagens (empresa_id, produto_id, embalagem_id, quantidade)
  select v_emp, p.id, e.id, case e.chave when 'e_caixa' then 1 else 8 end
  from produtos p cross join (select chave, id from ct_ids where chave in ('e_caixa', 'e_gelo')) e
  where p.empresa_id = v_emp and p.tipo = 'peixe' and p.fator_kg = 20;

  -- Medicação na ração (dose por kg de ração; o estoque está em kg do premix)
  insert into medicamentos (empresa_id, nome, tipo, principio_ativo, dose_por_unidade, unidade_dose, via, carencia_dias,
                            produto_id, dose_por_unidade_estoque, observacoes)
  values (v_emp, 'Florfenicol premix 50%', 'medicamento', 'Florfenicol', 2, 'g', 'racao', 15, pg_temp.id('m_florfenicol'), 1000,
          'Dose e carência de teste. Na piscicultura real, siga a receita do técnico responsável.'),
         (v_emp, 'Vitamina C premix 35%', 'vitamina', 'Ácido ascórbico', 1, 'g', 'racao', 0, pg_temp.id('m_vitc'), 1000, null);
  insert into ct_ids select 'med_florfenicol', id from medicamentos where empresa_id = v_emp and nome = 'Florfenicol premix 50%';
  insert into ct_ids select 'med_vitc', id from medicamentos where empresa_id = v_emp and nome = 'Vitamina C premix 35%';
end $$;

-- Notas de compra dos 60 dias (o estoque entra no dia da nota, dentro do laço da seção 5)
insert into ct_compras values
  -- dias antes de hoje, produto, quantidade, R$ por unidade (centavos), NF, fornecedor
  (62, 'r_55',            75,  1150, '30211', 'for_racao'),
  (62, 'r_40',           500,   690, '30211', 'for_racao'),
  (62, 'r_28_8',        2400,   410, '30211', 'for_racao'),
  (62, 'r_28_10',       5500,   405, '30212', 'for_racao'),
  (45, 'r_40',           600,   695, '30388', 'for_racao'),
  (45, 'r_28_10',       4000,   409, '30388', 'for_racao'),
  (40, 'r_28_8',        2000,   414, '30402', 'for_racao'),
  (28, 'r_28_10',       3000,   412, '30517', 'for_racao'),
  (20, 'r_28_8',        2000,   418, '30580', 'for_racao'),
  (10, 'r_32',           600,   485, '30633', 'for_racao'),
  ( 9, 'r_28_10',       1200,   415, '30702', 'for_racao'),
  ( 4, 'r_28_8',        1000,   420, '30760', 'for_racao'),
  (61, 'c_calcario',    6000,    32, '1203',  'for_agro'),
  (61, 'c_ureia',        200,   380, '1203',  'for_agro'),
  (61, 'c_super',        150,   290, '1203',  'for_agro'),
  (58, 'm_vitc',           1,  6900, '77',    'for_vet'),
  (16, 'm_florfenicol',    2, 48000, '91',    'for_vet'),
  (61, 'e_caixa',        300,   380, '9001',  'for_embalagem'),
  (31, 'e_caixa',        200,   390, '9050',  'for_embalagem'),
  (61, 'e_gelo',        1200,    45, '5501',  'for_gelo'),
  (31, 'e_gelo',        1200,    45, '5560',  'for_gelo');

-- ---------------------------------------------------------------------------
-- 4. Do povoamento até 60 dias atrás: o trato do dia num lançamento só, as mortes e a biometria do mês
-- ---------------------------------------------------------------------------
-- Assim a conversão alimentar, a sobrevivência e o custo do ciclo dos lotes antigos contam o ciclo inteiro.
-- A ração desse período entra no estoque quando acaba, sem conta a pagar: o financeiro começa nos 60 dias,
-- então o custo do kg desses meses só tem ração e alevinos.
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  v_rac uuid := (select id from depositos where empresa_id = v_emp and tipo = 'racao');
  d int;
  v_data date;
  v record;
  s record;
  v_idade int;
  v_kg numeric;
  v_racao text;
  v_saldo numeric;
  v_compra numeric;
  v_mortes int;
  v_peso numeric;
  v_nf int := 29400;
begin
  for d in reverse 330..61 loop
    v_data := v_hoje - d;
    for v in
      select x.*
      from (values ('v3', 'lote_v3', 330,  9000, false, 1.3), ('v1', 'lote_v1', 200, 10000, false, 1.4),
                   ('v2', 'lote_v2', 120,  8000, false, 1.5), ('v4', 'lote_v4',  75, 15000, true, 1.15))
           x(viveiro, lote, dias, peixes, recria, saciedade)
    loop
      v_idade := v.dias - d;   -- dias desde o povoamento; o trato começa no dia seguinte
      continue when v_idade < 1;

      select * into s from racao_sugerida(pg_temp.id(v.viveiro), v_data) limit 1;
      v_kg := round((coalesce(s.racao_kg, 0) * v.saciedade * (0.94 + random() * 0.1))::numeric, 1);
      v_racao := case when s.proteina_pct >= 50 then 'r_55' when s.proteina_pct >= 40 then 'r_40'
                      when s.proteina_pct >= 32 then 'r_32' when s.granulo like '10%' then 'r_28_10' else 'r_28_8' end;

      -- Acabou a ração: chega mais um lote no mesmo dia (preço subindo devagar ao longo do ano)
      select coalesce(sum(quantidade), 0) into v_saldo from movimentos_estoque
      where produto_id = pg_temp.id(v_racao) and deposito_id = v_rac;
      if v_kg > 0 and v_saldo < v_kg then
        v_compra := case v_racao when 'r_55' then 50 when 'r_40' then 500 when 'r_32' then 500 else 2000 end;
        v_nf := v_nf + 1;
        perform registrar_entrada(pg_temp.id(v_racao), v_rac, v_data, v_compra,
          round(v_compra * case v_racao when 'r_55' then 1100 when 'r_40' then 660 when 'r_32' then 460
                                         when 'r_28_8' then 392 else 387 end * (1 + (330 - d) * 0.00015))::bigint,
          'NF ' || v_nf);
      end if;

      -- Mortes: mais nas duas semanas depois do povoamento (adaptação), depois poucas
      v_mortes := case
        when v_idade <= 14 then floor(v.peixes * case when v.recria then 0.004 else 0.0015 end * (0.5 + random()))::int
        when v.recria then floor(random() * 6)::int
        when random() < 0.45 then 1 + floor(random() * 2)::int else 0 end;

      perform registrar_lancamento_campo(v_emp, pg_temp.id(v.viveiro), v_data, 'manha', v_mortes, 0, v_kg, null,
        gen_random_uuid(),
        case when v_kg > 0 then jsonb_build_array(jsonb_build_object('produto_id', pg_temp.id(v_racao), 'kg', v_kg, 'deposito_id', v_rac))
             else '[]'::jsonb end,
        '[]', null, false, null);

      -- Biometria a cada 30 dias do povoamento, até duas semanas antes das biometrias dos 60 dias
      if v_idade % 30 = 0 and d > 72 then
        v_peso := app.peso_estimado(pg_temp.id(v.lote), v_data) * (0.99 + random() * 0.02);
        perform registrar_biometria(v_emp, pg_temp.id(v.viveiro), v_data, case when v.recria then 100 else 60 end,
          null, round(v_peso, 1), round(power(v_peso / 0.025, 1 / 2.97)::numeric, 1), round((76 + random() * 12)::numeric, 1),
          null, gen_random_uuid(), null, 'app');
      end if;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Últimos sessenta dias de viveiro: compras, trato, água, biometria, despesca e manejo
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  v_rac uuid := (select id from depositos where empresa_id = v_emp and tipo = 'racao');
  v_ins uuid := (select id from depositos where empresa_id = v_emp and tipo = 'insumos');
  v_alm uuid := (select id from depositos where empresa_id = v_emp and tipo = 'almoxarifado');
  d int;
  v_data date;
  c record;
  v record;
  s record;
  t text;
  v_kg_dia numeric;
  v_kg numeric;
  v_racao text;
  v_mortes int;
  v_agua jsonb;
  v_check jsonb;
  v_med jsonb;
  v_obs text;
  v_peso numeric;
  v_qtd int;
  v_total numeric;
  v_a numeric;
  v_b numeric;
  v_c numeric;
begin
  for d in reverse 62..0 loop
    v_data := v_hoje - d;

    for c in select * from ct_compras where dia = d loop
      perform registrar_entrada(pg_temp.id(c.chave),
        case when c.chave like 'r\_%' then v_rac when c.chave like 'c\_%' then v_ins else v_alm end,
        v_data, c.qtd, round(c.qtd * c.preco_cents)::bigint, 'NF ' || c.nf);
    end loop;
    continue when d > 60;

    for v in
      select x.viveiro, x.lote, x.recria, x.aerado, x.saciedade
      from (values ('v1', 'lote_v1', false, true, 1.4), ('v2', 'lote_v2', false, true, 1.5),
                   ('v3', 'lote_v3', false, false, 0.8), ('v4', 'lote_v4', true, true, 1.15)) x(viveiro, lote, recria, aerado, saciedade)
    loop
      continue when v.viveiro = 'v3' and d < 30;   -- a barragem foi despescada há 30 dias e está em preparo

      -- Ração do dia: a sugerida pelo banco (peso da última biometria + curva), dada até a saciedade
      select * into s from racao_sugerida(pg_temp.id(v.viveiro), v_data) limit 1;
      v_kg_dia := coalesce(s.racao_kg, 0) * v.saciedade * (0.94 + random() * 0.1);
      if v.viveiro = 'v4' and d between 30 and 36 then v_kg_dia := v_kg_dia * 0.6; end if;   -- surto: comem menos
      v_racao := case when s.proteina_pct >= 50 then 'r_55' when s.proteina_pct >= 40 then 'r_40'
                      when s.proteina_pct >= 32 then 'r_32' when s.granulo like '10%' then 'r_28_10' else 'r_28_8' end;

      -- Mortes contadas de manhã: poucas na engorda, mais na recria; o surto e a falta de oxigênio somam
      v_mortes := case when v.recria then floor(random() * 6)::int
                       when random() < 0.45 then 1 + floor(random() * 2)::int else 0 end;
      if v.viveiro = 'v4' and d between 30 and 36 then v_mortes := v_mortes + 18 + floor(random() * 25)::int; end if;
      if v.viveiro = 'v3' and d = 41 then v_mortes := v_mortes + 35; end if;

      -- Hoje também leva o trato da tarde: a conta fica parada até o script rodar de novo, e um dia só com o trato
      -- da manhã viraria, a partir de amanhã, uma falsa queda da ração aceita no painel (ontem já conta como fechado).
      foreach t in array array['manha', 'tarde'] loop
        v_kg := round(v_kg_dia * 0.5, 1);
        if v.viveiro = 'v3' and d = 41 and t = 'manha' then v_kg := 0; end if;   -- oxigênio baixo: ração da manhã suspensa

        -- Água: o oxigênio cai de madrugada; a barragem sem aerador fica perto do limite
        v_agua := jsonb_strip_nulls(case t
          when 'manha' then jsonb_build_object(
            'oxigenio_mg_l', case when v.viveiro = 'v3' and d = 41 then 2.6
                                  else round((case when v.aerado then 4.6 else 3.7 end + random() * 1.4)::numeric, 1) end,
            'temperatura_c', round((27.8 + random() * 1.2)::numeric, 1),
            'ph', round((6.6 + random() * 0.6)::numeric, 1),
            'transparencia_cm', 30 + floor(random() * 15)::int,
            'amonia_mg_l', case when d % 7 = 0 then round((0.1 + random() * 0.4)::numeric, 2) end)
          else jsonb_build_object(
            'oxigenio_mg_l', round((6.2 + random() * 2.5)::numeric, 1),
            'temperatura_c', round((30.2 + random() * 1.6)::numeric, 1)) end);

        -- Checklist da manhã ("Sim" = tudo certo)
        v_check := '[]';
        if t = 'manha' then
          select coalesce(jsonb_agg(case when ci.tipo = 'numero'
                   then jsonb_build_object('item_id', ci.id, 'valor', round((0.05 + random() * 0.2)::numeric, 2))
                   else jsonb_build_object('item_id', ci.id, 'ok', not (
                          (ci.nome = 'Aeradores funcionando' and v.viveiro = 'v1' and d = 20)
                       or (ci.nome = 'Sem peixes boquejando na superfície' and v.viveiro = 'v3' and d = 41)
                       or (ci.nome in ('Peixes comendo bem', 'Ração consumida sem sobra') and v.viveiro = 'v4' and d between 32 and 36)))
                   end), '[]')
            into v_check
          from checklist_itens ci
          where ci.empresa_id = v_emp and ci.ativo
            and not (ci.nome = 'Aeradores funcionando' and not v.aerado)
            and (ci.aplica_em = 'todos' or (ci.aplica_em = 'engorda' and not v.recria)
                 or (ci.aplica_em = 'alevinagem_recria' and v.recria));
        end if;

        -- Medicação na ração: florfenicol no Viveiro 02 (com carência) e vitamina C no berçário
        v_med := case
          when v.viveiro = 'v2' and d = 14 and t = 'manha' then
            jsonb_build_object('medicamento_id', pg_temp.id('med_florfenicol'), 'dias', 7, 'base_dose', round(v_kg_dia * 7))
          when v.viveiro = 'v4' and d = 33 and t = 'manha' then
            jsonb_build_object('medicamento_id', pg_temp.id('med_vitc'), 'dias', 5, 'base_dose', round(v_kg_dia * 5))
        end;

        v_obs := case
          when t <> 'manha' then null
          when v.viveiro = 'v3' and d = 41 then 'Peixes boquejando ao amanhecer, oxigênio em 2,6 mg/L. Ração da manhã suspensa e renovação de água ligada.'
          when v.viveiro = 'v1' and d = 20 then 'Aerador 2 parado (motor queimado). Levado para o conserto; os outros ficaram ligados a noite toda.'
          when v.viveiro = 'v2' and d = 14 then 'Peixes com lesões na pele: início do florfenicol na ração por 7 dias, com carência.'
          when v.viveiro = 'v4' and d = 36 then 'Juvenis com manchas vermelhas e nadando devagar; mortes acima do normal. Técnico chamado.'
          when v.viveiro = 'v4' and d = 33 then 'Técnico coletou amostras. Ração reduzida, mais renovação de água e vitamina C por 5 dias.'
        end;

        perform registrar_lancamento_campo(v_emp, pg_temp.id(v.viveiro), v_data, t,
          case when t = 'manha' then v_mortes else 0 end, 0, v_kg, v_obs, gen_random_uuid(),
          case when v_kg > 0 then jsonb_build_array(jsonb_build_object('produto_id', pg_temp.id(v_racao), 'kg', v_kg, 'deposito_id', v_rac))
               else '[]'::jsonb end,
          v_check, v_med, false, v_agua);
      end loop;

      -- Biometria a cada ~2 semanas: amostra de 60 peixes (100 no berçário), perto da curva
      if (v.viveiro = 'v1' and d in (58, 44, 30, 16, 3)) or (v.viveiro = 'v2' and d in (57, 43, 29, 15, 2))
         or (v.viveiro = 'v3' and d in (59, 45, 32)) or (v.viveiro = 'v4' and d in (56, 42, 28, 14, 1)) then
        v_peso := app.peso_estimado(pg_temp.id(v.lote), v_data)
                  * case when v.viveiro = 'v4' and d = 28 then 0.92 else 0.99 + random() * 0.02 end;
        perform registrar_biometria(v_emp, pg_temp.id(v.viveiro), v_data, case when v.recria then 100 else 60 end,
          null, round(v_peso, 1), round(power(v_peso / 0.025, 1 / 2.97)::numeric, 1), round((76 + random() * 12)::numeric, 1),
          case when v.viveiro = 'v4' and d = 28 then 'Crescimento abaixo da curva depois do surto.' end,
          gen_random_uuid(), null, 'app');
      end if;
    end loop;

    -- Despescas, depois do trato do dia: parcial e total da barragem, parcial do Viveiro 01
    if d = 58 then
      perform registrar_despesca(v_emp, pg_temp.id('v3'), v_data, 'parcial', 6600, 3000,
        jsonb_build_object(pg_temp.classe('Médio'), 2000, pg_temp.classe('Grande'), 4000, pg_temp.classe('Extra'), 400,
                           pg_temp.classe('Descarte'), 200),
        'Despesca parcial com rede de arrasto: saíram os maiores para o frigorífico.', gen_random_uuid());
    elsif d = 30 then
      v_qtd := pg_temp.vivos('v3', v_data) - 22;
      v_total := round(v_qtd * app.peso_estimado(pg_temp.id('lote_v3'), v_data) / 1000 * 1.01, 1);
      v_a := round(v_total * 0.61, 1);
      v_b := round(v_total * 0.22, 1);
      v_c := round(v_total * 0.14, 1);
      perform registrar_despesca(v_emp, pg_temp.id('v3'), v_data, 'total', v_total, v_qtd,
        jsonb_build_object(pg_temp.classe('Grande'), v_a, pg_temp.classe('Médio'), v_b, pg_temp.classe('Extra'), v_c,
                           pg_temp.classe('Descarte'), v_total - v_a - v_b - v_c),
        'Despesca total da barragem; 22 peixes não apareceram no esvaziamento.', gen_random_uuid());
    elsif d = 12 then
      v_total := round(3000 * app.peso_estimado(pg_temp.id('lote_v1'), v_data) / 1000 * 1.03, 1);
      v_a := round(v_total * 0.70, 1);
      v_b := round(v_total * 0.20, 1);
      v_c := round(v_total * 0.07, 1);
      perform registrar_despesca(v_emp, pg_temp.id('v1'), v_data, 'parcial', v_total, 3000,
        jsonb_build_object(pg_temp.classe('Médio'), v_a, pg_temp.classe('Grande'), v_b, pg_temp.classe('Pequeno'), v_c,
                           pg_temp.classe('Descarte'), v_total - v_a - v_b - v_c),
        'Despesca parcial para o pedido do frigorífico; o lote segue até 2 kg.', gen_random_uuid());
    end if;

    -- O descarte da despesca (peixes machucados ou fora de padrão) sai do estoque no dia seguinte
    if d in (57, 29, 11) and pg_temp.kg_em('Descarte', v_data) > 0 then
      perform movimentar_estoque(
        (select pr.id from produtos pr join classes_peixe cl on cl.id = pr.classe_peixe_id
         where pr.empresa_id = v_emp and pr.base_estoque and cl.nome = 'Descarte'),
        'saida', pg_temp.kg_em('Descarte', v_data), null, v_data, null, 'perda', null,
        'Peixes de descarte da despesca (machucados ou fora de padrão) levados para a compostagem.');
    end if;

    -- Manejo dos viveiros vazios: calagem e adubação antes de povoar de novo
    if d = 40 then
      perform registrar_insumo_viveiro(v_emp, pg_temp.id('v5'), v_data, 'calagem', pg_temp.id('c_calcario'), 1600, null, 1,
        null, null, 'Fundo seco: 2 t/ha de calcário antes de encher.', gen_random_uuid());
    elsif d = 25 then
      perform registrar_insumo_viveiro(v_emp, pg_temp.id('v3'), v_data, 'calagem', pg_temp.id('c_calcario'), 3000, null, 1,
        null, null, 'Calagem depois da despesca total: 2 t/ha no fundo exposto.', gen_random_uuid());
    elsif d = 10 then
      perform registrar_insumo_viveiro(v_emp, pg_temp.id('v3'), v_data, 'adubacao', pg_temp.id('c_ureia'), 75, null, 1,
        null, null, 'Adubação de enchimento: ureia, 50 kg/ha.', gen_random_uuid());
      perform registrar_insumo_viveiro(v_emp, pg_temp.id('v3'), v_data, 'adubacao', pg_temp.id('c_super'), 45, null, 1,
        null, null, 'Adubação de enchimento: superfosfato simples, 30 kg/ha.', gen_random_uuid());
    end if;
  end loop;
end $$;

-- Causas das mortes, como o tratador marca no app
update apontamento_lancamentos al set causas_morte = jsonb_build_object('doenca', al.mortes)
from apontamentos_diarios ad
where al.apontamento_id = ad.id and al.empresa_id = pg_temp.id('empresa') and al.mortes > 0
  and ad.viveiro_id = pg_temp.id('v4') and ad.data between app.hoje(pg_temp.id('empresa')) - 36 and app.hoje(pg_temp.id('empresa')) - 30;
update apontamento_lancamentos al set causas_morte = jsonb_build_object('oxigenio', al.mortes)
from apontamentos_diarios ad
where al.apontamento_id = ad.id and al.empresa_id = pg_temp.id('empresa') and al.mortes > 0
  and ad.viveiro_id = pg_temp.id('v3') and ad.data = app.hoje(pg_temp.id('empresa')) - 41;
update apontamento_lancamentos al set causas_morte = jsonb_build_object('predador', 1)
from apontamentos_diarios ad
where al.apontamento_id = ad.id and al.empresa_id = pg_temp.id('empresa') and al.mortes > 0 and al.causas_morte = '{}'::jsonb
  and ad.viveiro_id = pg_temp.id('v4') and extract(dow from ad.data) = 1;

-- Exames e próximos manejos (planejados aparecem na agenda da sanidade)
insert into eventos_sanitarios (empresa_id, lote_id, viveiro_id, data, tipo, status, responsavel, observacoes)
select pg_temp.id('empresa'), pg_temp.id(x.lote), pg_temp.id(x.viveiro), app.hoje(pg_temp.id('empresa')) + x.dias, x.tipo, x.status,
       'Eng. de pesca Marcos (Aquatec)', x.obs
from (values
  ('lote_v4', 'v4', -34, 'exame',    'realizado', 'Coleta de juvenis doentes para análise (suspeita de Aeromonas).'),
  ('lote_v4', 'v4', -30, 'exame',    'realizado', 'Laudo: infecção bacteriana por Aeromonas. Manejo: ração reduzida, renovação de água e vitamina C.'),
  ('lote_v1', 'v1',   7, 'exame',    'planejado', 'Análise completa da água: amônia, nitrito, alcalinidade e dureza.'),
  ('lote_v2', 'v2',   9, 'exame',    'planejado', 'Avaliar as lesões de pele depois do fim da carência.'),
  (null,      'v5',   3, 'adubacao', 'planejado', 'Encher e adubar o Viveiro 05 para receber os juvenis do berçário.')
) x(lote, viveiro, dias, tipo, status, obs);

-- ---------------------------------------------------------------------------
-- 6. Contas financeiras
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  v_id uuid;
begin
  insert into contas_financeiras (empresa_id, tipo, nome, banco_codigo, agencia, conta, conta_dv, saldo_inicial_cents, saldo_inicial_data)
  values (v_emp, 'corrente', 'Banco do Brasil', '001', '3355', '12345', '6', 18500000, v_hoje - 70) returning id into v_id;
  insert into ct_ids values ('banco_bb', v_id);
  insert into contas_financeiras (empresa_id, tipo, nome, banco_codigo, agencia, conta, conta_dv, saldo_inicial_cents, saldo_inicial_data)
  values (v_emp, 'corrente', 'Sicredi', '748', '0812', '98765', '0', 4200000, v_hoje - 70) returning id into v_id;
  insert into ct_ids values ('banco_sicredi', v_id);
  insert into contas_financeiras (empresa_id, tipo, nome, saldo_inicial_cents, saldo_inicial_data)
  values (v_emp, 'aplicacao', 'Aplicação CDB Sicredi', 30000000, v_hoje - 70) returning id into v_id;
  insert into ct_ids values ('aplicacao', v_id);
  insert into contas_financeiras (empresa_id, tipo, nome, dia_fechamento, dia_vencimento, limite_cents, conta_pagadora_id)
  values (v_emp, 'cartao_credito', 'Cartão Sicredi Empresarial', 25, 5, 3000000, pg_temp.id('banco_sicredi'))
  returning id into v_id;
  insert into ct_ids values ('cartao', v_id);
  insert into ct_ids select 'caixa', id from contas_financeiras where empresa_id = v_emp and tipo = 'caixinha';
  update contas_financeiras set saldo_inicial_cents = 150000, saldo_inicial_data = v_hoje - 70 where id = pg_temp.id('caixa');
end $$;

-- ---------------------------------------------------------------------------
-- 7. Comercial: preços por kg, pedidos de 60 dias e a peixaria
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  p record;
  v_lista uuid;
begin
  -- R$/kg por classe (referência de teste, Manaus/AM); a caixa de 20 kg sai com 3% de desconto
  for p in select pr.id, pr.fator_kg, c.nome from produtos pr join classes_peixe c on c.id = pr.classe_peixe_id
           where pr.empresa_id = v_emp and pr.tipo = 'peixe' and pr.para_venda loop
    perform definir_preco(p.id, round(
      case p.nome when 'Pequeno' then 1050 when 'Médio' then 1290 when 'Grande' then 1450 when 'Extra' then 1590 else 1200 end
      * p.fator_kg * case when p.fator_kg = 20 then 0.97 else 1 end)::bigint, null, v_hoje - 90);
  end loop;
  v_lista := salvar_tabela_preco(v_emp, null, 'Atacado', false, true, -5, 'Frigoríficos e quem compra mais de 1 tonelada por pedido');
  update contatos set lista_preco_id = v_lista where id = pg_temp.id('cli_frigorifico');
end $$;

-- Pedidos: cargas do frigorífico logo depois das despescas e o dia a dia de peixarias, feira, mercados e restaurantes.
-- Cada pedido respeita o pescado que havia em estoque no dia.
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  d int;
  k int;
  v_data date;
  c record;
  v_cli text;
  v_ped uuid;
  v_itens jsonb;
  v_t uuid;
  v_kg numeric;
  v_cx int;
begin
  for d in reverse 57..0 loop
    v_data := v_hoje - d;

    if d in (57, 29, 11) then
      v_itens := '[]';
      for c in select * from (values (57, 'Grande', 2800), (57, 'Médio', 1200), (29, 'Grande', 6500), (29, 'Médio', 2200),
                                     (29, 'Extra', 1200), (11, 'Médio', 1800)) x(dia, classe, kg) where x.dia = d loop
        v_kg := least(c.kg, floor(pg_temp.kg_em(c.classe, v_data) - 300));
        if v_kg > 0 then
          v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto(c.classe, 1), 'quantidade', v_kg));
        end if;
      end loop;
      if jsonb_array_length(v_itens) > 0 then
        v_ped := criar_pedido(v_emp, pg_temp.id('cli_frigorifico'), v_itens, v_data, v_data + 1,
          '[{"dias":14,"pct":50},{"dias":28,"pct":50}]', 'boleto', 'Carga para o frigorífico (caminhão do cliente)', gen_random_uuid());
        perform faturar_pedido(v_ped);
        perform entregar_pedido(v_ped);
        perform baixar_titulos(array[a.id], pg_temp.id('banco_bb'), a.vencimento) from agendamentos a
        where a.origem = 'pedido_venda' and a.origem_id = v_ped and a.vencimento <= v_hoje - 1;
      end if;
    end if;

    for k in 1..case when d >= 31 then 1 else 2 end loop
      v_cli := (array['cli_supermercado', 'cli_peixaria', 'cli_feira', 'cli_restaurante', 'cli_mercadinho'])[1 + (d * 2 + k) % 5];
      v_itens := '[]';
      v_kg := least(15 + floor(random() * 21), floor(pg_temp.kg_em('Médio', v_data) - 50));
      if v_kg >= 5 then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto('Médio', 1), 'quantidade', v_kg));
      end if;
      v_cx := least(1 + floor(random() * 2)::int, floor((pg_temp.kg_em('Grande', v_data) - 50) / 20)::int);
      if v_cx >= 1 then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto('Grande', 20), 'quantidade', v_cx));
      end if;
      if (d + k) % 3 = 0 then
        v_kg := least(10 + floor(random() * 11), floor(pg_temp.kg_em('Extra', v_data) - 20));
        if v_kg >= 5 then
          v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto('Extra', 1), 'quantidade', v_kg));
        end if;
      end if;
      continue when jsonb_array_length(v_itens) = 0;

      v_ped := criar_pedido(v_emp, pg_temp.id(v_cli), v_itens, v_data, v_data + 1,
        case when v_cli = 'cli_supermercado' then '[{"dias":14,"pct":50},{"dias":28,"pct":50}]'::jsonb
             else '[{"dias":7,"pct":100}]'::jsonb end,
        case when v_cli in ('cli_feira', 'cli_restaurante') then 'pix' else 'boleto' end, null, gen_random_uuid());
      continue when d = 0;   -- os de hoje ficam para faturar
      perform faturar_pedido(v_ped);
      continue when d = 1;   -- os de ontem estão faturados, saindo para a entrega
      perform entregar_pedido(v_ped);
      for v_t in select id from agendamentos where origem = 'pedido_venda' and origem_id = v_ped
                   and vencimento <= v_hoje - 3 and (d + k) % 7 <> 0 loop
        perform baixar_titulos(array[v_t], pg_temp.id(case when (d + k) % 2 = 0 then 'banco_bb' else 'banco_sicredi' end),
          (select vencimento from agendamentos where id = v_t));
      end loop;
    end loop;
  end loop;
end $$;

-- O faturamento grava a saída do estoque com a data de hoje; como estes pedidos são de dias passados,
-- a saída fica no dia do pedido (como se cada um tivesse sido faturado no próprio dia).
reset role;
set local session_replication_role = replica;
update movimentos_estoque m set data = p.data
from pedidos_venda p
where m.origem_tabela = 'pedidos_venda' and m.origem_id = p.id
  and m.empresa_id = (select id from ct_ids where chave = 'empresa') and m.data <> p.data;
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from ct_ids where chave = 'master_id'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', (select id::text from ct_ids where chave = 'master_id'), 'role', 'authenticated', 'aal', 'aal2',
  'session_id', gen_random_uuid(),
  'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint),
                           jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);

-- Pedido fixo e receita extra
insert into pedidos_fixos (empresa_id, cliente_id, dias_semana, itens, parcelas, forma_pagamento, observacoes)
values (pg_temp.id('empresa'), pg_temp.id('cli_restaurante'), array[2, 5],
        jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto('Grande', 1), 'quantidade', 25)),
        '[{"dias":7,"pct":100}]', 'pix', 'Entrega terça e sexta cedo, peixe inteiro no gelo');
select pg_temp.titulo('receber', 'Venda de juvenis de tambaqui · 2.000 un', 12, 140000, 'Venda de alevinos e juvenis', 'Recria',
  'cli_maria', 1, 'pix');

-- Peixaria na cidade: abastecida pela sede, vende no balcão por kg
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  v_ponto uuid;
  v_sede uuid;
begin
  v_ponto := criar_ponto_venda(v_emp, 'Peixaria Rio Preto da Eva', 'loja', 'Rio Preto da Eva', 'AM', 'Av. Getúlio Vargas, 900');
  insert into ct_ids values ('ponto_loja', v_ponto);
  select id into v_sede from pontos_venda where empresa_id = v_emp and sede;
  perform transferir_peixe(v_emp, v_sede, v_ponto, v_hoje - 2,
    jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto('Médio', 1), 'quantidade', 150),
                      jsonb_build_object('produto_id', pg_temp.produto('Grande', 1), 'quantidade', 120)),
    18000, true, pg_temp.id('for_frete'), v_hoje + 10, true, 'Abastecimento da peixaria (caixas com gelo)');
end $$;

-- Vendas de balcão na peixaria, com o peso da balança
select venda_balcao(pg_temp.id('empresa'),
  jsonb_build_array(jsonb_build_object('produto_id', pg_temp.produto(x.classe, 1), 'quantidade', x.kg)),
  jsonb_build_array(jsonb_build_object('forma', x.forma,
    'valor_cents', case when x.forma = 'dinheiro'
                        then ceil(x.kg * preco_vigente(pg_temp.produto(x.classe, 1), null, app.hoje(pg_temp.id('empresa'))) / 100) * 100
                        else round(x.kg * preco_vigente(pg_temp.produto(x.classe, 1), null, app.hoje(pg_temp.id('empresa')))) end,
    'conta_id', case when x.forma = 'dinheiro' then null else pg_temp.id('banco_bb') end)),
  null, gen_random_uuid(), null, pg_temp.id('ponto_loja'))
from (values ('Médio', 2.35, 'dinheiro'), ('Grande', 3.10, 'pix'), ('Médio', 1.80, 'pix'),
             ('Grande', 4.25, 'dinheiro'), ('Médio', 2.90, 'cartao')) x(classe, kg, forma);

-- ---------------------------------------------------------------------------
-- 8. Contas a pagar, recorrências, cartão e orçamento
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  c record;
  v_t uuid;
  v_pagar uuid[] := '{}';
begin
  -- Notas de compra (as mesmas que deram entrada no estoque), boleto em 28 dias
  for c in
    select x.nf, x.fornecedor, max(x.dia) as dia, sum(round(x.qtd * x.preco_cents))::bigint as valor,
           string_agg(distinct p.nome, ', ') as produtos, min(x.chave) as chave
    from ct_compras x join ct_ids i on i.chave = x.chave join produtos p on p.id = i.id
    group by x.nf, x.fornecedor
  loop
    v_t := pg_temp.titulo('pagar', c.produtos || ' · NF ' || c.nf, 28 - c.dia, c.valor,
      case when c.chave like 'r\_%' then 'Ração extrusada comprada'
           when c.chave like 'm\_%' then 'Medicamentos'
           when c.chave = 'e_gelo' then 'Gelo'
           when c.chave like 'e\_%' then 'Caixas térmicas e basquetas'
           else 'Sal, cal e calcário para os viveiros' end,
      case when c.chave like 'r\_%' then 'Engorda (comum aos viveiros)'
           when c.chave like 'e\_%' then 'Despesca e beneficiamento'
           else 'Sanidade e qualidade da água' end,
      c.fornecedor, 1, 'boleto', -c.dia);
    if c.dia > 28 then v_pagar := v_pagar || v_t; end if;
  end loop;

  -- Juvenis e alevinos
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Alevinos de tambaqui · L-2026-04 · 15 mil', -45, 375000, 'Alevinos', 'Recria',
    'for_alevinos', 1, 'pix', -75);
  -- Energia (aeradores e bombas): duas contas pagas e uma a vencer
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Energia elétrica · ' || to_char(v_hoje - 60, 'MM/YYYY'), -42, 781200,
    'Energia elétrica', 'Engorda (comum aos viveiros)', 'for_energia', 1, 'boleto', -60);
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Energia elétrica · ' || to_char(v_hoje - 30, 'MM/YYYY'), -12, 815400,
    'Energia elétrica', 'Engorda (comum aos viveiros)', 'for_energia', 1, 'boleto', -30);
  perform pg_temp.titulo('pagar', 'Energia elétrica · ' || to_char(v_hoje, 'MM/YYYY'), 18, 840000,
    'Energia elétrica', 'Engorda (comum aos viveiros)', 'for_energia', 1, 'boleto', 0);
  -- Salários (dois meses pagos e um a vencer)
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Salários da produção · mês 1', -57, 760000, 'Salários da produção',
    'Engorda (comum aos viveiros)', 'func_joao', 1, 'ted');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Salários administrativos · mês 1', -57, 320000, 'Salários administrativos',
    'Administrativo', 'func_ana', 1, 'ted');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Salários da produção · mês 2', -27, 760000, 'Salários da produção',
    'Engorda (comum aos viveiros)', 'func_joao', 1, 'ted');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Salários administrativos · mês 2', -27, 320000, 'Salários administrativos',
    'Administrativo', 'func_ana', 1, 'ted');
  perform pg_temp.titulo('pagar', 'Salários da produção · mês 3', 3, 760000, 'Salários da produção',
    'Engorda (comum aos viveiros)', 'func_joao', 1, 'ted');
  perform pg_temp.titulo('pagar', 'Salários administrativos · mês 3', 3, 320000, 'Salários administrativos',
    'Administrativo', 'func_ana', 1, 'ted');
  -- Equipe de despesca (diaristas), paga no dia seguinte
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Equipe de despesca · Viveiro 03 (parcial)', -57, 180000, 'Equipe de despesca',
    'Despesca e beneficiamento', 'for_despesca', 1, 'pix', -58);
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Equipe de despesca · Viveiro 03 (total)', -29, 320000, 'Equipe de despesca',
    'Despesca e beneficiamento', 'for_despesca', 1, 'pix', -30);
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Equipe de despesca · Viveiro 01 (parcial)', -11, 180000, 'Equipe de despesca',
    'Despesca e beneficiamento', 'for_despesca', 1, 'pix', -12);
  -- Técnico, laboratório, diesel e fretes
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Assistência técnica · mês 1', -50, 150000, 'Assistência técnica (engenharia de pesca)',
    'Engorda (comum aos viveiros)', 'for_tecnico', 1, 'pix');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Assistência técnica · mês 2', -20, 150000, 'Assistência técnica (engenharia de pesca)',
    'Engorda (comum aos viveiros)', 'for_tecnico', 1, 'pix');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Análise de peixes doentes · Viveiro 04', -28, 68000, 'Análises de água e de peixe',
    'Sanidade e qualidade da água', 'for_tecnico', 1, 'pix', -34);
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Diesel do gerador e das bombas · mês 1', -40, 132000, 'Diesel de bombas e geradores',
    'Engorda (comum aos viveiros)', null, 1, 'pix');
  perform pg_temp.titulo('pagar', 'Diesel do gerador e das bombas · mês 2', -3, 138000, 'Diesel de bombas e geradores',
    'Engorda (comum aos viveiros)', null, 1, 'pix');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Frete de ração · CT-e 5521', -48, 350000, 'Frete de ração e insumos',
    'Engorda (comum aos viveiros)', 'for_frete', 1, 'pix');
  v_pagar := v_pagar || pg_temp.titulo('pagar', 'Frete de entregas aos clientes · CT-e 5610', -20, 240000, 'Frete de entrega aos clientes',
    'Logística e entregas', 'for_frete', 1, 'pix');
  -- A vencer: sinal dos juvenis do próximo lote (L-2026-05, 9 mil)
  perform pg_temp.titulo('pagar', 'Juvenis de tambaqui · L-2026-05 · 9 mil', 12, 630000, 'Juvenis para engorda',
    'Engorda (comum aos viveiros)', 'for_alevinos', 2, 'pix');

  perform baixar_titulos(array[x], pg_temp.id('banco_bb'), least(v_hoje, (select vencimento from agendamentos where id = x)))
  from unnest(v_pagar) x;
end $$;

-- Recorrências mensais
select criar_recorrencia(pg_temp.id('empresa'), 'pagar', 'Internet via satélite da piscicultura', 39990, 'mensal',
  app.hoje(pg_temp.id('empresa')) + 8, pg_temp.cat('Telefone e internet'), pg_temp.cc('Administrativo'), null, null, 'boleto');
select criar_recorrencia(pg_temp.id('empresa'), 'pagar', 'Contador', 180000, 'mensal',
  app.hoje(pg_temp.id('empresa')) + 10, pg_temp.cat('Contabilidade'), pg_temp.cc('Administrativo'), null, null, 'pix');
select criar_recorrencia(pg_temp.id('empresa'), 'pagar', 'Assistência técnica (engenheiro de pesca)', 150000, 'mensal',
  app.hoje(pg_temp.id('empresa')) + 10, pg_temp.cat('Assistência técnica (engenharia de pesca)'),
  pg_temp.cc('Engorda (comum aos viveiros)'), pg_temp.id('for_tecnico'), null, 'pix');

-- Compras no cartão de crédito
select compra_cartao(pg_temp.id('cartao'), app.hoje(pg_temp.id('empresa')) - 38, 'Redes e puçás para despesca', 284000,
  pg_temp.cat('Redes, puçás e tarrafas'), 2, pg_temp.cc('Despesca e beneficiamento'));
select compra_cartao(pg_temp.id('cartao'), app.hoje(pg_temp.id('empresa')) - 19, 'Conserto do aerador 2 (rebobinar o motor)', 124000,
  pg_temp.cat('Conserto de aeradores'), 1, pg_temp.cc('Manutenção de viveiros e barragens'));
select compra_cartao(pg_temp.id('cartao'), app.hoje(pg_temp.id('empresa')) - 9, 'Material de escritório', 18500,
  pg_temp.cat('Material de escritório e copa'), 1, pg_temp.cc('Administrativo'));

-- Orçamento do ano
do $$
declare r record; v_arr jsonb;
begin
  for r in select * from (values ('Ração extrusada comprada', 4500000::bigint), ('Energia elétrica', 800000),
               ('Salários da produção', 760000), ('Salários administrativos', 320000), ('Venda de peixes', 15000000)) x(cat, valor) loop
    select jsonb_agg(r.valor) into v_arr from generate_series(1, 12);
    perform salvar_orcamento(pg_temp.id('empresa'), extract(year from app.hoje(pg_temp.id('empresa')))::int, pg_temp.cat(r.cat), v_arr);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Conciliação: extrato BB com ~2 meses de linhas
-- ---------------------------------------------------------------------------
do $$
declare
  v_emp uuid := pg_temp.id('empresa');
  v_hoje date := app.hoje(v_emp);
  v_linhas jsonb;
begin
  select jsonb_agg(jsonb_build_object('id_externo', 'BB' || to_char(q.data, 'YYYYMMDD') || lpad(q.rn::text, 4, '0'),
                                      'data', q.data, 'valor_cents', q.valor_cents, 'descricao', q.descricao))
    into v_linhas
  from (select b.data, case a.tipo when 'pagar' then -b.valor_cents else b.valor_cents end as valor_cents,
               case a.tipo when 'pagar' then 'PAGTO ' else 'PIX RECEBIDO ' end || upper(coalesce(ct.nome, a.descricao)) as descricao,
               row_number() over (order by b.data, b.id) as rn
        from baixas b join agendamentos a on a.id = b.agendamento_id left join contatos ct on ct.id = a.contato_id
        where b.empresa_id = v_emp and b.conta_id = pg_temp.id('banco_bb')) q;
  -- Linhas avulsas: tarifas, rendimentos, PIX sem cadastro
  v_linhas := v_linhas || jsonb_build_array(
    jsonb_build_object('id_externo', 'BBTAR1', 'data', v_hoje - 50, 'valor_cents', -8990, 'descricao', 'TARIFA PACOTE DE SERVICOS'),
    jsonb_build_object('id_externo', 'BBTAR2', 'data', v_hoje - 20, 'valor_cents', -8990, 'descricao', 'TARIFA PACOTE DE SERVICOS'),
    jsonb_build_object('id_externo', 'BBTAR3', 'data', v_hoje - 5, 'valor_cents', -1250, 'descricao', 'TARIFA TED ENVIADA'),
    jsonb_build_object('id_externo', 'BBREN1', 'data', v_hoje - 30, 'valor_cents', 38420, 'descricao', 'RENDIMENTO APLIC AUTOMATICA'),
    jsonb_build_object('id_externo', 'BBREN2', 'data', v_hoje - 2, 'valor_cents', 42315, 'descricao', 'RENDIMENTO APLIC AUTOMATICA'),
    jsonb_build_object('id_externo', 'BBIOF1', 'data', v_hoje - 45, 'valor_cents', -3280, 'descricao', 'IOF S/ OPERACOES FINANCEIRAS'),
    jsonb_build_object('id_externo', 'BBPIX1', 'data', v_hoje - 3, 'valor_cents', -35000, 'descricao', 'PIX ENVIADO MECANICA SAO JORGE'),
    jsonb_build_object('id_externo', 'BBPIX2', 'data', v_hoje - 1, 'valor_cents', 72000, 'descricao', 'PIX RECEBIDO DONA LUCIA PEIXARIA'),
    jsonb_build_object('id_externo', 'BBPIX3', 'data', v_hoje - 15, 'valor_cents', -28000, 'descricao', 'PIX ENVIADO MERCADO LIVRE'));
  perform importar_extrato(pg_temp.id('banco_bb'), 'ofx', v_linhas, 'extrato-bb-teste.ofx');
end $$;

-- Regra de conciliação
select criar_regra(pg_temp.id('empresa'), 'pagamento', 'Tarifas do banco',
  '[{"campo":"descricao","operador":"contem","valor":"TARIFA"}]'::jsonb, 'todas', pg_temp.cat('Tarifas bancárias'),
  pg_temp.cc('Administrativo'));

-- ---------------------------------------------------------------------------
-- 10. Planejamento, custo do kg e assinatura de teste
-- ---------------------------------------------------------------------------
insert into lotes_planejados (empresa_id, codigo, data_povoamento, qtd_peixes, especie_id, viveiro_recria_id, viveiro_engorda_id,
                              situacao, observacoes)
values (pg_temp.id('empresa'), 'L-2026-05', app.hoje(pg_temp.id('empresa')) + 12, 9000,
        (select id from especies where empresa_id is null and nome = 'Tambaqui'), null, pg_temp.id('v3'), 'confirmado',
        'Juvenis de 30 g para repovoar a barragem depois da calagem e da adubação. Sinal em 2 parcelas.'),
       (pg_temp.id('empresa'), 'L-2026-06', app.hoje(pg_temp.id('empresa')) + 45, 15000,
        (select id from especies where empresa_id is null and nome = 'Tambaqui'), pg_temp.id('v4'), null, 'planejado',
        'Alevinos novos para o berçário quando os juvenis do L-2026-04 passarem para o Viveiro 05 com ~300 g.');

-- Custo do kg de cada mês, desde o povoamento do lote mais antigo (antes dos 60 dias, só ração e alevinos)
do $$
declare m date;
begin
  for m in select generate_series(date_trunc('month', app.hoje(pg_temp.id('empresa')) - 330),
                                  date_trunc('month', app.hoje(pg_temp.id('empresa'))), interval '1 month')::date loop
    perform calcular_custos_mes(pg_temp.id('empresa'), m);
  end loop;
end $$;

reset role;
update assinaturas set teste_ate = current_date + 365 where empresa_id = (select id from ct_ids where chave = 'empresa');

do $$
declare v_emp uuid := (select id from ct_ids where chave = 'empresa');
begin
  raise warning 'Conta de teste pronta: % viveiros, % lançamentos de trato, % biometrias, % despescas, % pedidos, % títulos, % linhas de extrato. Tambaqui pela tabela de arraçoamento do banco. Entrar com nicolasduarte.s@gmail.com (senha já existente ou Balbina@teste1).',
    (select count(*) from viveiros where empresa_id = v_emp), (select count(*) from apontamento_lancamentos where empresa_id = v_emp),
    (select count(*) from biometrias where empresa_id = v_emp), (select count(*) from despescas where empresa_id = v_emp),
    (select count(*) from pedidos_venda where empresa_id = v_emp), (select count(*) from agendamentos where empresa_id = v_emp),
    (select count(*) from movimentos_bancarios where empresa_id = v_emp);
end $$;

commit;
