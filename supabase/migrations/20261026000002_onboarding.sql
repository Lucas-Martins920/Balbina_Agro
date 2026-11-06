-- Onboarding: cria uma empresa com o usuário logado como administrador
-- e carrega os cadastros padrão de uma piscicultura de engorda.

-- Papéis do Supabase precisam enxergar as funções usadas nas policies.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema app to authenticated;
    grant execute on all functions in schema app to authenticated;
  end if;
end $$;

create or replace function app.carregar_padroes(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pai uuid;
  r record;
begin
  -- Plano de categorias. Pais primeiro, filhos com o nome do pai.
  for r in
    select * from (values
      ('receita_operacional','entrada', null::text, 'Venda de ovos'),
      ('receita_operacional','entrada', null, 'Venda de peixes de descarte'),
      ('receita_operacional','entrada', null, 'Venda de esterco'),
      ('receita_operacional','entrada', null, 'Outras receitas operacionais'),
      ('custo_operacional','saida', null, 'Ração e insumos'),
      ('custo_operacional','saida', 'Ração e insumos', 'Milho'),
      ('custo_operacional','saida', 'Ração e insumos', 'Farelo de soja'),
      ('custo_operacional','saida', 'Ração e insumos', 'Setor e premix'),
      ('custo_operacional','saida', 'Ração e insumos', 'Calcário'),
      ('custo_operacional','saida', null, 'Aquisição de peixes'),
      ('custo_operacional','saida', null, 'Vacinas e medicamentos'),
      ('custo_operacional','saida', null, 'Embalagens'),
      ('custo_operacional','saida', null, 'Mão de obra da produção'),
      ('custo_operacional','saida', null, 'Energia elétrica'),
      ('custo_operacional','saida', null, 'Fretes'),
      ('custo_operacional','saida', null, 'Manutenção de viveiros e equipamentos'),
      ('despesa_operacional','saida', null, 'Salários administrativos'),
      ('despesa_operacional','saida', null, 'Encargos e benefícios'),
      ('despesa_operacional','saida', null, 'Impostos sobre vendas'),
      ('despesa_operacional','saida', null, 'Tarifas bancárias'),
      ('despesa_operacional','saida', null, 'Combustível'),
      ('despesa_operacional','saida', null, 'Contabilidade'),
      ('despesa_operacional','saida', null, 'Software e serviços'),
      ('despesa_operacional','saida', null, 'Outras despesas'),
      ('despesa_operacional','entrada', null, 'Rendimentos financeiros'),
      ('investimento','saida', null, 'Construção de viveiros'),
      ('investimento','saida', null, 'Compra de equipamentos'),
      ('investimento','entrada', null, 'Venda de ativos'),
      ('financiamento','entrada', null, 'Empréstimos recebidos'),
      ('financiamento','saida', null, 'Pagamento de empréstimos'),
      ('financiamento','entrada', null, 'Aporte de sócios'),
      ('financiamento','saida', null, 'Distribuição de lucros')
    ) v(grupo, sentido, pai, nome)
  loop
    v_pai := null;
    if r.pai is not null then
      select id into v_pai from categorias where empresa_id = p_empresa and nome = r.pai and parent_id is null;
    end if;
    insert into categorias (empresa_id, grupo, sentido, parent_id, nome)
    values (p_empresa, r.grupo, r.sentido, v_pai, r.nome)
    on conflict do nothing;
  end loop;

  -- Classes de ovo por peso (Portaria MAPA nº 1/1990; conferir norma vigente).
  insert into classes_peixe (empresa_id, nome, peso_min_g, peso_max_g, comercializavel, ordem) values
    (p_empresa, 'Jumbo',      66, null, true, 1),
    (p_empresa, 'Extra',      60, 66,   true, 2),
    (p_empresa, 'Grande',     55, 60,   true, 3),
    (p_empresa, 'Médio',      50, 55,   true, 4),
    (p_empresa, 'Pequeno',    45, 50,   true, 5),
    (p_empresa, 'Industrial', null, 45, true, 6),
    (p_empresa, 'Trincado',   null, null, false, 7),
    (p_empresa, 'Descarte',   null, null, false, 8)
  on conflict do nothing;

  insert into centros_custo (empresa_id, nome, tipo) values
    (p_empresa, 'Administrativo', 'administrativo'),
    (p_empresa, 'Fábrica de ração', 'fabrica_racao'),
    (p_empresa, 'Comercial', 'comercial')
  on conflict do nothing;

  insert into depositos (empresa_id, nome, tipo) values
    (p_empresa, 'Ovos', 'ovos'),
    (p_empresa, 'Insumos', 'insumos'),
    (p_empresa, 'Ração', 'racao'),
    (p_empresa, 'Almoxarifado', 'almoxarifado')
  on conflict do nothing;

  insert into contas_financeiras (empresa_id, tipo, nome) values
    (p_empresa, 'caixinha', 'Caixa da piscicultura');
end $$;

-- Chamada pelo app (supabase.rpc('criar_empresa', ...)).
create or replace function public.criar_empresa(p_cnpj text, p_razao_social text, p_nome_fantasia text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
begin
  if v_uid is null then
    raise exception 'Faça login para criar uma empresa' using errcode = 'insufficient_privilege';
  end if;
  if v_cnpj !~ '^\d{14}$' then
    raise exception 'CNPJ deve ter 14 dígitos' using errcode = 'check_violation';
  end if;
  if exists (select 1 from empresas where cnpj = v_cnpj) then
    raise exception 'Já existe uma empresa com este CNPJ' using errcode = 'unique_violation';
  end if;

  insert into empresas (cnpj, razao_social, nome_fantasia)
  values (v_cnpj, trim(p_razao_social), nullif(trim(p_nome_fantasia), ''))
  returning id into v_id;

  insert into usuarios_empresa (empresa_id, user_id, perfil, is_admin)
  values (v_id, v_uid, 'sem_restricao', true);

  perform app.carregar_padroes(v_id);
  return v_id;
end $$;

revoke all on function public.criar_empresa(text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.criar_empresa(text, text, text) to authenticated;
  end if;
end $$;
