-- RH: funcionários, escalas, atribuições, folgas/férias/atestados, feriados e cartão de ponto.
--
-- Pedido do Nicolas (2026-10-29), depois do estudo docs/estudo-rh-ponto.html: o RH do Balbina fica só com o
-- cadastro dos funcionários, cargos, escalas, atribuições e permissões, mais a leitura do cartão de ponto e a
-- exportação para a contadora. Folha de pagamento e eSocial continuam com a contadora.
--
-- 1. `funcionarios`: quem trabalha na piscicultura, tenha ou não acesso ao sistema. O cargo é o mesmo dos usuários
--    (perfil pronto ou `cargos` da empresa, 20261029213000_cargos.sql). Com usuário ligado, o cargo dos dois
--    anda junto: mudar no funcionário muda o acesso (só o master) e mudar no usuário muda o funcionário.
-- 2. `escalas`: semanal (um horário ou folga por dia da semana: 6x1, 5x2, sábado meio período) ou 12x36.
-- 3. `funcionario_atribuicoes`: do que a pessoa cuida (viveiro, fábrica de ração, classificação, manutenção...).
-- 4. `rh_ocorrencias`: folga avulsa, férias, atestado, afastamento, falta e trabalho fora da escala.
-- 5. `feriados`: os estaduais e municipais (os nacionais o sistema calcula, src/lib/ponto.ts).
-- 6. `ponto_importacoes` e `ponto_marcacoes`: o arquivo do relógio (AFD da Portaria 671 ou 1510, ou planilha)
--    e cada batida, ligada ao funcionário pelo CPF ou PIS. Batida do arquivo não muda nem some sozinha (só
--    apagando a importação inteira); acerto é batida manual com justificativa ou "desconsiderar" com motivo.
-- 7. `rh_parametros`: tolerância, horário noturno (pecuária 20h às 4h) e o código de cada evento na folha da
--    contadora, para a exportação.
--
-- Permissões: "rh.ver", "rh.editar" (cadastros, escalas, feriados e parâmetros) e "rh.ponto" (importar e
-- acertar o ponto, lançar folgas, férias e atestados, exportar). Os dados de RH (CPF, PIS) só aparecem para
-- quem tem "rh.ver". Fica no plano Gestão (não entra em niveis_plano dos outros planos).

-- ---------------------------------------------------------------------------
-- 1. Permissões
-- ---------------------------------------------------------------------------

-- Mesmo corpo de 20261029213000_cargos.sql, com RH no administrativo e no gerente da piscicultura.
create or replace function app.permissoes_perfil(p_perfil text) returns text[]
language sql immutable as $$
  select case p_perfil
    when 'visualizacao' then array['*.ver']
    when 'cadastros' then array['*.ver', 'piscicultura.editar', 'lotes.editar', 'estoque.editar', 'configuracoes.editar',
      'produtos.editar', 'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar', 'manutencao.editar']
    when 'apontador' then array['apontamentos.editar', 'sanidade.editar', 'piscicultura.ver', 'lotes.ver', 'manutencao.lancar']
    when 'vendedor' then array['vendas.lancar', 'pdv.operar', 'estoque.ver', 'contas-a-receber.ver', 'cobrancas.ver',
      'contatos.editar', 'produtos.ver']
    when 'caixa' then array['pdv.operar', 'vendas.ver']
    when 'financeiro' then array['contas-a-pagar.editar', 'contas-a-receber.editar', 'contas.editar', 'cobrancas.emitir',
      'cartoes.editar', 'conciliacao.editar', 'fluxo-de-caixa.ver', 'relatorios.editar', 'financeiro.fechar', 'custo-do-kg.ver',
      'contatos.editar', 'categorias.editar', 'centros-de-custo.editar', 'planejamento.editar']
    -- Escritório: vê tudo, cuida dos cadastros, das contas a pagar e receber, dos pedidos, das notas e do RH.
    when 'administrativo' then array['*.ver', 'contatos.editar', 'produtos.editar', 'categorias.editar', 'centros-de-custo.editar',
      'contas-a-pagar.editar', 'contas-a-receber.editar', 'vendas.lancar', 'notas.editar', 'configuracoes.editar', 'rh.editar', 'rh.ponto']
    -- Operação de campo inteira, e o ponto e as folgas da equipe.
    when 'gerente_piscicultura' then array['piscicultura.editar', 'lotes.editar', 'apontamentos.editar', 'sanidade.editar', 'estoque.editar',
      'racao.editar', 'manutencao.editar', 'manutencao.lancar', 'planejamento.editar', 'custo-do-kg.ver', 'produtos.ver', 'contatos.ver',
      'rh.ponto']
    when 'tratador' then array['apontamentos.editar', 'piscicultura.ver', 'lotes.ver', 'sanidade.ver', 'manutencao.lancar']
    when 'fabrica_racao' then array['racao.editar', 'produtos.ver', 'estoque.ver', 'manutencao.lancar']
    when 'manutencao' then array['manutencao.editar', 'manutencao.lancar', 'piscicultura.ver', 'estoque.ver', 'produtos.ver']
    else array[]::text[]
  end
$$;

-- Batidas são muitas e não precisam de histórico linha a linha (a importação e o acerto ficam registrados).
-- Mesmo corpo de 20261029140000_nfe_completa.sql, mais ponto_marcacoes.
create or replace function app.tabelas_sem_historico() returns text[]
language sql immutable as $$
  select array['audit_log', 'custos_lote_mensal', 'importacao_vinculos', 'contas_asaas_segredos',
               'sessoes_2fa', 'dispositivos_confiaveis', 'webhook_eventos', 'aceites_termos',
               'api_chaves_uso', 'api_webhook_entregas', 'focus_emitentes_segredos', 'ponto_marcacoes']
$$;

create or replace function app.cpf_valido(p text) returns boolean
language plpgsql immutable as $$
declare
  d int[];
  s int;
  r int;
begin
  if p is null or p !~ '^\d{11}$' or p ~ '^(\d)\1{10}$' then return false; end if;
  d := (select array_agg(substr(p, i, 1)::int order by i) from generate_series(1, 11) i);
  for n in 9..10 loop
    s := 0;
    for i in 1..n loop s := s + d[i] * (n + 2 - i); end loop;
    r := (s * 10) % 11;
    if r = 10 then r := 0; end if;
    if r <> d[n + 1] then return false; end if;
  end loop;
  return true;
end $$;

-- {"e": "06:00", "s": "15:20", "i": 120}: entrada, saída e minutos de intervalo
create or replace function app.horario_valido(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and coalesce(p ->> 'e', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
     and coalesce(p ->> 's', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
     and p ->> 'e' <> p ->> 's'
     and coalesce(p ->> 'i', '0') ~ '^\d{1,3}$'
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------

create table escalas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  tipo text not null default 'semanal' check (tipo in ('semanal', '12x36')),
  dias jsonb,             -- semanal: 7 posições, de domingo a sábado, cada uma um horário ou null (folga)
  horario jsonb,          -- 12x36: o horário do plantão
  inicio_ciclo date,      -- 12x36: um dia de plantão, a partir do qual alterna
  observacoes text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint escala_semanal check (tipo <> 'semanal' or (jsonb_typeof(dias) = 'array' and jsonb_array_length(dias) = 7)),
  constraint escala_12x36 check (tipo <> '12x36' or (app.horario_valido(horario) and inicio_ciclo is not null))
);
create unique index escalas_nome_unico on escalas (empresa_id, lower(trim(nome)));

create table funcionarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  cpf text check (cpf is null or app.cpf_valido(cpf)),
  pis text check (pis ~ '^\d{11}$'),
  matricula text check (length(matricula) <= 20),        -- código do funcionário na folha da contadora
  perfil text check (perfil = any (app.perfis_validos())), -- cargo pronto
  cargo_id uuid references cargos(id),                    -- ou cargo criado pela empresa
  user_id uuid,                                           -- usuário do sistema, se tiver acesso
  escala_id uuid references escalas(id) on delete set null,
  centro_custo_id uuid references centros_custo(id) on delete set null,
  admissao date,
  demissao date,
  telefone text check (length(telefone) <= 30),
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint um_cargo check (perfil is null or cargo_id is null),
  constraint demissao_depois check (demissao is null or admissao is null or demissao >= admissao),
  constraint usuario_da_empresa foreign key (empresa_id, user_id) references usuarios_empresa (empresa_id, user_id) on delete set null (user_id)
);
create unique index funcionarios_cpf on funcionarios (empresa_id, cpf) where cpf is not null;
create unique index funcionarios_pis on funcionarios (empresa_id, pis) where pis is not null;
create unique index funcionarios_matricula on funcionarios (empresa_id, lower(matricula)) where matricula is not null;
create unique index funcionarios_usuario on funcionarios (empresa_id, user_id) where user_id is not null;
create index on funcionarios (cargo_id);
create index on funcionarios (escala_id);
create index on funcionarios (centro_custo_id);

create table funcionario_atribuicoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  local text not null default 'viveiro'
    check (local in ('viveiro', 'fabrica_racao', 'classificacao', 'manutencao', 'escritorio', 'piscicultura', 'vendas', 'outro')),
  viveiro_id uuid references viveiros(id) on delete cascade,
  descricao text check (length(descricao) <= 200),
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  constraint viveiro_da_atribuicao check ((local = 'viveiro') = (viveiro_id is not null))
);
create index on funcionario_atribuicoes (funcionario_id);
create index on funcionario_atribuicoes (viveiro_id);
create unique index atribuicao_principal on funcionario_atribuicoes (funcionario_id) where principal;

create table rh_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  funcionario_id uuid not null references funcionarios(id) on delete cascade,
  tipo text not null check (tipo in ('folga', 'ferias', 'atestado', 'afastamento', 'falta_justificada', 'falta', 'trabalho')),
  inicio date not null,
  fim date not null,
  observacoes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint periodo check (fim >= inicio and fim - inicio <= 366)
);
create index on rh_ocorrencias (funcionario_id, inicio);
create index on rh_ocorrencias (empresa_id, inicio);

create table feriados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  data date not null,
  nome text not null check (length(trim(nome)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index feriados_data on feriados (empresa_id, data);

create table rh_parametros (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  tolerancia_min integer not null default 10 check (tolerancia_min between 0 and 30),
  noturno_inicio time not null default '20:00',
  noturno_fim time not null default '04:00',
  codigos jsonb not null default '{}' check (jsonb_typeof(codigos) = 'object'),
  updated_at timestamptz not null default now()
);

create table ponto_importacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome_arquivo text not null check (length(nome_arquivo) <= 200),
  formato text not null check (formato in ('afd671', 'afd1510', 'planilha')),
  documento text,         -- CNPJ ou CPF do empregador no cabeçalho do AFD
  rep text,               -- número de fabricação do relógio ou registro do programa no INPI
  periodo_inicio date,
  periodo_fim date,
  total integer not null default 0,
  novas integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on ponto_importacoes (empresa_id, created_at desc);

create table ponto_marcacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  importacao_id uuid references ponto_importacoes(id) on delete cascade,
  cpf text check (cpf ~ '^\d{11}$'),
  pis text check (pis ~ '^\d{11}$'),
  data date not null,
  hora time(0) not null,
  nsr bigint,
  origem text not null default 'arquivo' check (origem in ('arquivo', 'manual')),
  justificativa text check (length(justificativa) <= 300),
  desconsiderada boolean not null default false,
  motivo text check (length(motivo) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint tem_identificacao check (cpf is not null or pis is not null),
  constraint manual_justificada check (origem = 'arquivo' or length(trim(coalesce(justificativa, ''))) >= 3),
  constraint arquivo_com_importacao check (origem = 'manual' or importacao_id is not null),
  constraint desconsiderada_com_motivo check (not desconsiderada or length(trim(coalesce(motivo, ''))) >= 3)
);
create unique index ponto_marcacoes_unica on ponto_marcacoes (empresa_id, (coalesce(cpf, 'p' || pis)), data, hora);
create index on ponto_marcacoes (empresa_id, data);
create index on ponto_marcacoes (importacao_id);

-- ---------------------------------------------------------------------------
-- 3. Acesso: membros da empresa; leitura só com rh.ver; escrita com rh.editar ou rh.ponto
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  escrita text;
begin
  foreach t in array array['escalas', 'funcionarios', 'funcionario_atribuicoes', 'rh_ocorrencias', 'feriados', 'rh_parametros',
                           'ponto_importacoes', 'ponto_marcacoes'] loop
    escrita := case when t in ('rh_ocorrencias', 'ponto_importacoes', 'ponto_marcacoes') then 'rh.ponto' else 'rh.editar' end;
    execute format('alter table %I enable row level security', t);
    execute format('create policy membros on %I using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy leitura_rh on %I as restrictive for select using (empresa_id in (select app.empresas_onde_pode(%L)))', t, 'rh.ver');
    execute format('create policy escrita_inserir on %I as restrictive for insert with check (app.pode(empresa_id, %L))', t, escrita);
    execute format('create policy escrita_alterar on %I as restrictive for update using (app.pode(empresa_id, %L)) with check (app.pode(empresa_id, %L))', t, escrita, escrita);
    execute format('create policy escrita_apagar on %I as restrictive for delete using (app.pode(empresa_id, %L))', t, escrita);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Regras
-- ---------------------------------------------------------------------------

create or replace function app.escala_conferir() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := trim(new.nome);
  new.updated_at := now();
  if new.tipo = 'semanal' then
    new.horario := null;
    new.inicio_ciclo := null;
    if exists (select 1 from jsonb_array_elements(new.dias) d where jsonb_typeof(d) <> 'null' and not app.horario_valido(d)) then
      raise exception 'Horário inválido na escala: use entrada e saída em HH:MM e o intervalo em minutos' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from jsonb_array_elements(new.dias) d where jsonb_typeof(d) <> 'null') then
      raise exception 'A escala precisa de pelo menos um dia de trabalho' using errcode = 'check_violation';
    end if;
  else
    new.dias := null;
  end if;
  return new;
end $$;
create trigger conferir before insert or update on escalas for each row execute function app.escala_conferir();

-- Cargo do funcionário e do usuário ligado andam juntos. Funcionário novo ligado a um usuário herda o cargo dele;
-- mudar o cargo de quem tem acesso muda o acesso, então só o master pode.
create or replace function app.funcionario_conferir() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u record;
begin
  new.nome := trim(new.nome);
  new.matricula := nullif(trim(coalesce(new.matricula, '')), '');
  new.updated_at := now();
  if new.cargo_id is not null and not exists (select 1 from cargos where id = new.cargo_id and empresa_id = new.empresa_id) then
    raise exception 'Cargo não encontrado nesta empresa' using errcode = 'no_data_found';
  end if;
  if new.user_id is null then return new; end if;
  select perfil, cargo_id into u from usuarios_empresa where empresa_id = new.empresa_id and user_id = new.user_id;
  if not found then raise exception 'Usuário não encontrado nesta empresa' using errcode = 'no_data_found'; end if;
  if new.perfil is null and new.cargo_id is null then
    new.cargo_id := u.cargo_id;
    new.perfil := case when u.cargo_id is null then u.perfil end;
    return new;
  end if;
  if new.cargo_id is distinct from u.cargo_id or (new.cargo_id is null and new.perfil is distinct from u.perfil) then
    perform app.exige_master(new.empresa_id);
    update usuarios_empresa set perfil = coalesce(case when new.cargo_id is not null then 'personalizado' end, new.perfil), cargo_id = new.cargo_id
     where empresa_id = new.empresa_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger conferir before insert or update on funcionarios for each row execute function app.funcionario_conferir();

-- O master mudou o cargo na tela de usuários: o funcionário ligado acompanha. Quando a mudança veio do próprio
-- funcionário (trigger acima), ele já está certo e não pode ser alterado de novo no mesmo comando.
create or replace function app.usuario_cargo_no_funcionario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update funcionarios
     set cargo_id = new.cargo_id, perfil = case when new.cargo_id is null then new.perfil end
   where empresa_id = new.empresa_id and user_id = new.user_id
     and (cargo_id is distinct from new.cargo_id or (new.cargo_id is null and perfil is distinct from new.perfil));
  return null;
end $$;
create trigger cargo_no_funcionario after update of perfil, cargo_id on usuarios_empresa
  for each row execute function app.usuario_cargo_no_funcionario();

create or replace function app.ocorrencia_conferir() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from rh_ocorrencias o where o.funcionario_id = new.funcionario_id and o.id <> new.id
             and o.inicio <= new.fim and new.inicio <= o.fim) then
    raise exception 'Já existe folga, férias ou outra ocorrência nesse período para este funcionário' using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;
create trigger conferir before insert or update on rh_ocorrencias for each row execute function app.ocorrencia_conferir();

-- Batida do arquivo é o que o relógio registrou: não muda. Só "desconsiderar" (com motivo) e a importação inteira some.
create or replace function app.marcacao_proteger() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.origem = 'arquivo' and pg_trigger_depth() < 2 then
      raise exception 'Batida do relógio não se apaga: marque como desconsiderada, com o motivo, ou apague a importação inteira'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if (new.cpf, new.pis, new.data, new.hora, new.origem, new.nsr, new.importacao_id, new.empresa_id)
     is distinct from (old.cpf, old.pis, old.data, old.hora, old.origem, old.nsr, old.importacao_id, old.empresa_id) then
    raise exception 'Data e hora da batida não mudam: lance uma batida manual com justificativa e desconsidere a errada'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger proteger before update or delete on ponto_marcacoes for each row execute function app.marcacao_proteger();

-- Importa as batidas lidas do arquivo (src/lib/ponto.ts). Batida repetida (mesma pessoa, dia e hora) entra uma vez só,
-- então dá para importar o mesmo AFD de novo ou um arquivo que cobre o anterior.
-- p_arquivo: {nome, formato, documento, rep, inicio, fim}; p_marcacoes: [{cpf, pis, data, hora, nsr}]
create or replace function public.importar_ponto(p_empresa uuid, p_arquivo jsonb, p_marcacoes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_total int;
  v_novas int;
  v_sem int;
begin
  if not app.pode(p_empresa, 'rh.ponto') then
    raise exception 'Seu usuário não tem permissão para importar o ponto' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_marcacoes) <> 'array' or jsonb_array_length(p_marcacoes) = 0 then
    raise exception 'Nenhuma batida no arquivo' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_marcacoes) > 50000 then
    raise exception 'Arquivo grande demais: importe um mês por vez' using errcode = 'check_violation';
  end if;

  insert into ponto_importacoes (empresa_id, nome_arquivo, formato, documento, rep, periodo_inicio, periodo_fim)
  values (p_empresa, left(coalesce(nullif(trim(p_arquivo ->> 'nome'), ''), 'arquivo'), 200), p_arquivo ->> 'formato',
          nullif(p_arquivo ->> 'documento', ''), nullif(p_arquivo ->> 'rep', ''),
          (p_arquivo ->> 'inicio')::date, (p_arquivo ->> 'fim')::date)
  returning id into v_id;

  with lidas as (
    select nullif(m ->> 'cpf', '') as cpf, case when nullif(m ->> 'cpf', '') is null then nullif(m ->> 'pis', '') end as pis,
           (m ->> 'data')::date as data, (m ->> 'hora')::time(0) as hora, (m ->> 'nsr')::bigint as nsr
    from jsonb_array_elements(p_marcacoes) m
  ), novas as (
    insert into ponto_marcacoes (empresa_id, importacao_id, cpf, pis, data, hora, nsr, origem)
    select p_empresa, v_id, cpf, pis, data, hora, nsr, 'arquivo' from lidas
    on conflict (empresa_id, (coalesce(cpf, 'p' || pis)), data, hora) do nothing
    returning 1
  )
  select (select count(*) from lidas), (select count(*) from novas) into v_total, v_novas;

  update ponto_importacoes set total = v_total, novas = v_novas,
         periodo_inicio = coalesce(periodo_inicio, (select min(data) from ponto_marcacoes where importacao_id = v_id)),
         periodo_fim = coalesce(periodo_fim, (select max(data) from ponto_marcacoes where importacao_id = v_id))
   where id = v_id;

  select count(distinct coalesce(m.cpf, 'p' || m.pis)) into v_sem
  from ponto_marcacoes m
  where m.importacao_id = v_id
    and not exists (select 1 from funcionarios f where f.empresa_id = p_empresa and (f.cpf = m.cpf or f.pis = m.pis));

  if v_novas = 0 then delete from ponto_importacoes where id = v_id; v_id := null; end if;
  return jsonb_build_object('importacao_id', v_id, 'total', v_total, 'novas', v_novas, 'sem_funcionario', v_sem);
end $$;

-- Mesmo corpo de 20261029213000_cargos.sql, contando também os funcionários com o cargo.
create or replace function public.apagar_cargo(p_cargo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_empresa uuid;
  v_em_uso int;
begin
  select empresa_id into v_empresa from cargos where id = p_cargo;
  if v_empresa is null then raise exception 'Cargo não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exige_master(v_empresa);
  select (select count(*) from usuarios_empresa where cargo_id = p_cargo) + (select count(*) from convites where cargo_id = p_cargo)
       + (select count(*) from funcionarios where cargo_id = p_cargo)
    into v_em_uso;
  if v_em_uso > 0 then
    raise exception 'Este cargo está com % usuário(s), convite(s) ou funcionário(s). Troque o cargo deles antes de apagar.', v_em_uso
      using errcode = 'foreign_key_violation';
  end if;
  delete from cargos where id = p_cargo;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select, insert, update, delete on escalas, funcionarios, funcionario_atribuicoes, rh_ocorrencias, feriados, rh_parametros,
      ponto_importacoes, ponto_marcacoes to authenticated;
    grant execute on function public.importar_ponto(uuid, jsonb, jsonb) to authenticated;
    grant execute on function app.cpf_valido(text), app.horario_valido(jsonb) to authenticated;
  end if;
end $$;
revoke execute on function public.importar_ponto(uuid, jsonb, jsonb) from public, anon;

select app.travar_referencias();
