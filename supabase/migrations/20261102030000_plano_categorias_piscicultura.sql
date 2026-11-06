-- Plano de categorias padrão refeito para piscicultura de engorda (estudo em docs/plano-de-categorias.md).
--
-- * app.plano_categorias(): o plano novo, em árvore e já na ordem do DRE (pai, depois filhas).
-- * app.aplicar_plano_categorias(empresa): cria o que falta do plano, sem apagar nada. Categorias do plano
--   antigo que mudaram de lugar (ex.: "Tarifas bancárias" agora fica dentro de "Despesas financeiras") são
--   movidas, e os lançamentos continuam nelas. Categorias criadas pela piscicultura ficam onde estão, depois das do
--   plano. Pode rodar de novo quantas vezes quiser: só cria o que faltar.
-- * Empresa nova já nasce com o plano (app.carregar_padroes). Empresa que já existe recebe pelo botão
--   "Aplicar plano padrão" em Categorias (public.aplicar_plano_categorias).

create or replace function app.plano_categorias()
returns table (pos integer, grupo text, sentido text, pai text, nome text, componente text)
language sql immutable set search_path = public as $$
  with p(item, n) as (
    select item, n from jsonb_array_elements($j$[
      ["receita_operacional", "entrada", "Venda de ovos", null, []],
      ["receita_operacional", "entrada", "Venda de peixes de descarte", null, []],
      ["receita_operacional", "entrada", "Venda de esterco", null, []],
      ["receita_operacional", "entrada", "Venda de subprodutos e serviços", null,
        ["Cama de viveiro usada", "Sacaria e embalagens usadas", "Venda de ração e insumos", "Serviços prestados a terceiros"]],
      ["receita_operacional", "entrada", "Outras receitas operacionais", null,
        ["Indenizações de seguro", "Subvenções e incentivos", "Bonificações de fornecedores"]],
      ["receita_operacional", "saida", "Deduções da receita", null,
        ["Funrural e Senar", "ICMS sobre vendas", "PIS e Cofins sobre vendas", "Simples Nacional", "Devoluções e abatimentos"]],

      ["custo_operacional", "saida", "Ração e insumos", "racao",
        ["Ração pronta comprada", "Milho", "Farelo de soja", "Setor e premix", "Calcário", "Fosfato e minerais",
         "Óleo e aditivos", "Fabricação de ração por terceiros"]],
      ["custo_operacional", "saida", "Aquisição de peixes", "peixe",
        ["Alevinos de um dia", "Juvenis prontas para engorda", "Transporte das peixes"]],
      ["custo_operacional", "saida", "Vacinas e medicamentos", "sanidade",
        ["Vacinas", "Medicamentos", "Vitaminas e suplementos", "Debicagem e vacinação (serviço)", "Veterinário e exames"]],
      ["custo_operacional", "saida", "Biosseguridade e limpeza", "sanidade",
        ["Desinfetantes e sanitizantes", "Controle de moscas, roedores e cascudinho", "Higienização dos ovos",
         "Análises de água e ração"]],
      ["custo_operacional", "saida", "Mão de obra da produção", "mao_obra",
        ["Salários da produção", "INSS e FGTS da produção", "13º e férias da produção", "Alimentação e transporte da equipe",
         "Diaristas e serviços avulsos", "EPIs e uniformes", "Rescisões trabalhistas"]],
      ["custo_operacional", "saida", "Energia elétrica", "energia", []],
      ["custo_operacional", "saida", "Água e combustíveis da produção", "energia",
        ["Água e poço artesiano", "Lenha e gás para aquecimento", "Diesel do gerador"]],
      ["custo_operacional", "saida", "Embalagens", "embalagem",
        ["Cartelas de 30 ovos", "Caixas de papelão", "Etiquetas, fitas e filme"]],
      ["custo_operacional", "saida", "Manutenção de viveiros e equipamentos", "outros",
        ["Viveiros e instalações", "Gaiolas, comedouros e bebedouros", "Classificadora e sala de ovos",
         "Manutenção da fábrica de ração", "Peças e materiais de manutenção"]],
      ["custo_operacional", "saida", "Fretes", "outros",
        ["Frete de ração e insumos", "Frete entre pisciculturas e depósitos"]],
      ["custo_operacional", "saida", "Outros custos da produção", "outros",
        ["Cama de viveiro (maravalha)", "Arrendamento de terras e viveiros", "Seguro da produção e das peixes",
         "Assistência técnica (zootecnista)"]],
      ["custo_operacional", "saida", "Compra de ovos para revenda", "outros", []],

      ["despesa_operacional", "saida", "Despesas comerciais", null,
        ["Comissões de vendedores", "Frete de entrega aos clientes", "Veículos de entrega (combustível e manutenção)",
         "Marketing e propaganda", "Tarifas de cobrança (boleto e Pix)", "Perdas com clientes (inadimplência)"]],
      ["despesa_operacional", "saida", "Despesas administrativas", null,
        ["Salários administrativos", "Encargos e benefícios", "Pró-labore", "Contabilidade", "Jurídico e consultorias",
         "Software e sistemas", "Telefone e internet", "Aluguel", "Material de escritório e copa", "Combustível",
         "Viagens e deslocamentos", "Seguros gerais", "Certificado digital e cartório"]],
      ["despesa_operacional", "saida", "Despesas tributárias", null,
        ["ITR e IPTU", "IPVA e licenciamento", "Licenças e taxas sanitárias e ambientais", "Contribuição sindical rural",
         "Imposto de renda e CSLL", "Multas e juros de impostos"]],
      ["despesa_operacional", "saida", "Despesas financeiras", null,
        ["Tarifas bancárias", "Juros de empréstimos e financiamentos", "Juros e multas por atraso", "IOF",
         "Taxas de cartão e antecipação"]],
      ["despesa_operacional", "entrada", "Receitas financeiras", null,
        ["Rendimentos de aplicações", "Juros e multas recebidos", "Descontos obtidos"]],
      ["despesa_operacional", "saida", "Outras despesas", null,
        ["Doações e patrocínios", "Perdas e quebras diversas"]],

      ["investimento", "saida", "Instalações e viveiros", null,
        ["Construção de viveiros", "Reforma e ampliação", "Obras da fábrica de ração", "Poços, cercas e estradas"]],
      ["investimento", "saida", "Máquinas e equipamentos", null,
        ["Equipamentos de viveiro", "Classificadora de ovos", "Gerador e energia solar", "Equipamentos da fábrica de ração"]],
      ["investimento", "saida", "Veículos e máquinas agrícolas", null, []],
      ["investimento", "saida", "Terras e benfeitorias", null, []],
      ["investimento", "saida", "Informática e tecnologia", null, []],
      ["investimento", "entrada", "Venda de ativos", null,
        ["Venda de veículos e máquinas", "Venda de equipamentos usados", "Venda de terras e benfeitorias"]],

      ["financiamento", "entrada", "Empréstimos recebidos", null,
        ["Crédito rural de custeio", "Crédito rural de investimento", "Capital de giro"]],
      ["financiamento", "saida", "Pagamento de empréstimos", null,
        ["Amortização de crédito rural", "Amortização de capital de giro", "Consórcios"]],
      ["financiamento", "entrada", "Aporte de sócios", null, []],
      ["financiamento", "saida", "Distribuição de lucros", null,
        ["Lucros distribuídos", "Retiradas pessoais do produtor"]]
    ]$j$::jsonb) with ordinality as e(item, n)
  )
  select (p.n * 100)::integer, p.item->>0, p.item->>1, null::text, p.item->>2, p.item->>3 from p
  union all
  select (p.n * 100 + f.m)::integer, p.item->>0, p.item->>1, p.item->>2, f.nome, null::text
  from p cross join lateral jsonb_array_elements_text(p.item->4) with ordinality as f(nome, m)
  order by 1;
$$;

-- Categorias do plano antigo que agora ficam dentro de uma principal (nome antigo → pai e nome novos).
create or replace function app.plano_categorias_mudancas()
returns table (antigo text, pai text, nome text)
language sql immutable set search_path = public as $$
  values
    ('Impostos sobre vendas', 'Deduções da receita', 'Impostos sobre vendas'),
    ('Salários administrativos', 'Despesas administrativas', 'Salários administrativos'),
    ('Encargos e benefícios', 'Despesas administrativas', 'Encargos e benefícios'),
    ('Combustível', 'Despesas administrativas', 'Combustível'),
    ('Contabilidade', 'Despesas administrativas', 'Contabilidade'),
    ('Software e serviços', 'Despesas administrativas', 'Software e sistemas'),
    ('Tarifas bancárias', 'Despesas financeiras', 'Tarifas bancárias'),
    ('Rendimentos financeiros', 'Receitas financeiras', 'Rendimentos de aplicações'),
    ('Construção de viveiros', 'Instalações e viveiros', 'Construção de viveiros'),
    ('Compra de equipamentos', 'Máquinas e equipamentos', 'Equipamentos de viveiro')
$$;

create or replace function app.aplicar_plano_categorias(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_id uuid;
  v_pai uuid;
  v_criadas integer := 0;
  v_movidas integer := 0;
begin
  -- 1. Categorias principais do plano (casa pelo nome, sem diferenciar maiúsculas)
  for r in select * from app.plano_categorias() where pai is null order by pos loop
    select id into v_id from categorias
    where empresa_id = p_empresa and parent_id is null and lower(trim(nome)) = lower(r.nome)
    order by (grupo = r.grupo) desc, created_at limit 1;
    if v_id is null then
      insert into categorias (empresa_id, grupo, sentido, nome, componente_custo, ordem)
      values (p_empresa, r.grupo, r.sentido, r.nome, r.componente, r.pos);
      v_criadas := v_criadas + 1;
    elsif r.componente is not null then
      update categorias set componente_custo = r.componente
      where id = v_id and componente_custo is null and grupo = 'custo_operacional';
    end if;
  end loop;

  -- 2. Categorias do plano antigo que viraram subcategoria: mudam de lugar com os lançamentos.
  --    Só se ainda for principal, sem filhas, não for do sistema e o pai novo ainda não tiver o nome novo.
  for r in select * from app.plano_categorias_mudancas() loop
    select id into v_pai from categorias
    where empresa_id = p_empresa and parent_id is null and lower(trim(nome)) = lower(r.pai)
    order by created_at limit 1;
    select c.id into v_id from categorias c
    where c.empresa_id = p_empresa and c.parent_id is null and lower(trim(c.nome)) = lower(r.antigo) and not c.sistema
      and not exists (select 1 from categorias f where f.parent_id = c.id)
    order by c.created_at limit 1;
    if v_pai is not null and v_id is not null
       and not exists (select 1 from categorias where parent_id = v_pai and lower(trim(nome)) = lower(r.nome)) then
      update categorias set parent_id = v_pai, nome = r.nome, updated_at = now() where id = v_id;
      v_movidas := v_movidas + 1;
    end if;
  end loop;

  -- 3. Subcategorias do plano que faltam
  for r in select * from app.plano_categorias() where pai is not null order by pos loop
    select id into v_pai from categorias
    where empresa_id = p_empresa and parent_id is null and lower(trim(nome)) = lower(r.pai)
    order by created_at limit 1;
    continue when v_pai is null;
    if not exists (select 1 from categorias where parent_id = v_pai and lower(trim(nome)) = lower(r.nome)) then
      insert into categorias (empresa_id, grupo, sentido, parent_id, nome, ordem)
      select p_empresa, grupo, sentido, v_pai, r.nome, r.pos from categorias where id = v_pai;
      v_criadas := v_criadas + 1;
    end if;
  end loop;

  -- 4. Ordem: as do plano na ordem do plano; as criadas pela piscicultura depois, na ordem em que estavam.
  update categorias c set ordem = o.n
  from (
    select c.id, row_number() over (
      partition by c.parent_id, case when c.parent_id is null then c.grupo end
      order by p.pos nulls last, c.ordem, c.nome, c.id) as n
    from categorias c
    left join categorias pai on pai.id = c.parent_id
    left join app.plano_categorias() p
      on lower(p.nome) = lower(trim(c.nome))
     and (case when c.parent_id is null then p.pai is null else lower(p.pai) = lower(trim(pai.nome)) end)
    where c.empresa_id = p_empresa
  ) o
  where o.id = c.id and c.ordem is distinct from o.n;

  -- Centro de custo da sala de ovos (classificação, embalagem e expedição), rateado nos lotes como os demais.
  insert into centros_custo (empresa_id, nome, tipo) values (p_empresa, 'Classificação e expedição', 'geral')
  on conflict do nothing;

  return jsonb_build_object('criadas', v_criadas, 'movidas', v_movidas);
end $$;

revoke all on function app.aplicar_plano_categorias(uuid) from public;

-- Botão "Aplicar plano padrão" em Categorias: quem edita categorias da empresa.
create or replace function public.aplicar_plano_categorias(p_empresa uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.pode(p_empresa, 'categorias.editar') and not app.pode(p_empresa, 'configuracoes.editar') then
    raise exception 'Seu usuário não pode editar as categorias desta empresa' using errcode = 'insufficient_privilege';
  end if;
  return app.aplicar_plano_categorias(p_empresa);
end $$;

revoke all on function public.aplicar_plano_categorias(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.aplicar_plano_categorias(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.aplicar_plano_categorias(uuid) to authenticated;
  end if;
end $$;

-- Empresa nova: mesmos cadastros de antes, com o plano de categorias novo.
create or replace function app.carregar_padroes(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.aplicar_plano_categorias(p_empresa);

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

-- Quem cria categoria com estes nomes à mão também já entra no componente certo do custo do kg.
create or replace function app.marcar_componente_custo() returns trigger language plpgsql set search_path = public as $$
begin
  if new.componente_custo is null and new.parent_id is null and new.grupo = 'custo_operacional' then
    new.componente_custo := case new.nome
      when 'Ração e insumos' then 'racao' when 'Aquisição de peixes' then 'peixe'
      when 'Vacinas e medicamentos' then 'sanidade' when 'Biosseguridade e limpeza' then 'sanidade'
      when 'Mão de obra da produção' then 'mao_obra'
      when 'Energia elétrica' then 'energia' when 'Água e combustíveis da produção' then 'energia'
      when 'Embalagens' then 'embalagem' end;
  end if;
  return new;
end $$;
