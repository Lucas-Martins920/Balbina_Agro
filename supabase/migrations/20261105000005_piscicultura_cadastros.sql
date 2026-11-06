-- Balbina: cadastros padrão, plano de contas, planejamento e importação da piscicultura.

-- ---------------------------------------------------------------------------
-- 1. Plano de contas da piscicultura
-- ---------------------------------------------------------------------------
create or replace function app.plano_categorias()
returns table (pos integer, grupo text, sentido text, pai text, nome text, componente text)
language sql immutable set search_path = public as $$
  with p(item, n) as (
    select item, n from jsonb_array_elements($j$[
      ["receita_operacional", "entrada", "Venda de peixes", null, []],
      ["receita_operacional", "entrada", "Venda de alevinos e juvenis", null, []],
      ["receita_operacional", "entrada", "Venda de subprodutos e serviços", null,
        ["Venda de ração e insumos", "Serviços prestados a terceiros", "Aluguel de equipamentos"]],
      ["receita_operacional", "entrada", "Outras receitas operacionais", null,
        ["Indenizações de seguro", "Subvenções e incentivos", "Bonificações de fornecedores"]],
      ["receita_operacional", "saida", "Deduções da receita", null,
        ["Funrural e Senar", "ICMS sobre vendas", "PIS e Cofins sobre vendas", "Simples Nacional", "Devoluções e abatimentos"]],

      ["custo_operacional", "saida", "Ração e insumos", "racao",
        ["Ração extrusada comprada", "Milho", "Farelo de soja", "Premix e vitaminas", "Óleo e aditivos",
         "Fabricação de ração por terceiros"]],
      ["custo_operacional", "saida", "Alevinos e juvenis", "alevinos",
        ["Alevinos", "Juvenis para engorda", "Transporte de alevinos"]],
      ["custo_operacional", "saida", "Sanidade e qualidade da água", "sanidade",
        ["Medicamentos", "Vacinas", "Probióticos e vitaminas", "Sal, cal e calcário para os viveiros", "Adubos e fertilizantes",
         "Análises de água e de peixe", "Veterinário e assistência técnica"]],
      ["custo_operacional", "saida", "Mão de obra da produção", "mao_obra",
        ["Salários da produção", "INSS e FGTS da produção", "13º e férias da produção", "Alimentação e transporte da equipe",
         "Diaristas e serviços avulsos", "EPIs e uniformes", "Rescisões trabalhistas"]],
      ["custo_operacional", "saida", "Energia elétrica", "energia", []],
      ["custo_operacional", "saida", "Combustíveis e bombeamento", "energia",
        ["Diesel de bombas e geradores", "Gasolina de barcos e motores", "Manutenção de bombas"]],
      ["custo_operacional", "saida", "Embalagens e gelo", "embalagem",
        ["Gelo", "Caixas térmicas e basquetas", "Sacos e etiquetas"]],
      ["custo_operacional", "saida", "Manutenção de viveiros e equipamentos", "outros",
        ["Viveiros, taludes e barragens", "Conserto de aeradores", "Redes, puçás e tarrafas", "Comedouros e alimentadores",
         "Peças e materiais de manutenção"]],
      ["custo_operacional", "saida", "Fretes", "outros",
        ["Frete de ração e insumos", "Frete entre pisciculturas e pontos de venda"]],
      ["custo_operacional", "saida", "Despesca e beneficiamento", "outros",
        ["Equipe de despesca", "Beneficiamento por terceiros", "Taxas de inspeção"]],
      ["custo_operacional", "saida", "Outros custos da produção", "outros",
        ["Arrendamento de terras e lâmina d'água", "Seguro da produção", "Outorga e taxa de uso da água",
         "Assistência técnica (engenharia de pesca)"]],
      ["custo_operacional", "saida", "Compra de peixe para revenda", "outros", []],

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
        ["Construção de viveiros", "Reforma e ampliação", "Barragens e canais", "Poços, cercas e estradas"]],
      ["investimento", "saida", "Máquinas e equipamentos", null,
        ["Equipamentos de viveiro", "Aeradores", "Alimentadores automáticos", "Gerador e energia solar",
         "Equipamentos da fábrica de ração"]],
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

-- nomes do plano antigo (avicultura) que mudaram: renomeia nas empresas que já tinham
update categorias c set nome = x.novo, updated_at = now()
from (values ('Aquisição de peixes', 'Alevinos e juvenis'), ('Vacinas e medicamentos', 'Sanidade e qualidade da água'),
             ('Água e combustíveis da produção', 'Combustíveis e bombeamento'), ('Embalagens', 'Embalagens e gelo'),
             ('Compra de ovos para revenda', 'Compra de peixe para revenda'),
             ('Venda de peixes de descarte', 'Venda de alevinos e juvenis')) as x(antigo, novo)
where c.parent_id is null and c.nome = x.antigo
  and not exists (select 1 from categorias o where o.empresa_id = c.empresa_id and o.parent_id is null and o.nome = x.novo);

create or replace function app.plano_centros_custo()
returns table (pos integer, nome text, tipo text)
language sql immutable set search_path = public as $$
  values
    (1,  'Alevinagem', 'geral'),
    (2,  'Recria', 'geral'),
    (3,  'Engorda (comum aos viveiros)', 'geral'),
    (4,  'Fábrica de ração', 'fabrica_racao'),
    (5,  'Despesca e beneficiamento', 'geral'),
    (6,  'Sanidade e qualidade da água', 'geral'),
    (7,  'Manutenção de viveiros e barragens', 'geral'),
    (8,  'Logística e entregas', 'comercial'),
    (9,  'Comercial', 'comercial'),
    (10, 'Administrativo', 'administrativo')
$$;

-- O plano de contas criava o centro da sala de ovos ("Classificação e expedição"); na piscicultura esse
-- trabalho é o centro "Despesca e beneficiamento", que já está no plano de centros.
do $$
declare v text;
begin
  v := pg_get_functiondef('app.aplicar_plano_categorias(uuid)'::regprocedure);
  v := replace(v, $q$  -- Centro de custo da sala de ovos (classificação, embalagem e expedição), rateado nos lotes como os demais.
  insert into centros_custo (empresa_id, nome, tipo) values (p_empresa, 'Classificação e expedição', 'geral')
  on conflict do nothing;
$q$, '');
  if position('Classificação e expedição' in v) > 0 then
    raise exception 'aplicar_plano_categorias mudou: revise a retirada do centro da sala de ovos';
  end if;
  execute v;
end $$;

update centros_custo c set nome = 'Despesca e beneficiamento', updated_at = now()
where c.nome = 'Classificação e expedição'
  and not exists (select 1 from centros_custo o where o.empresa_id = c.empresa_id and o.nome = 'Despesca e beneficiamento');

-- ---------------------------------------------------------------------------
-- 2. Cadastros que toda empresa nova recebe
-- ---------------------------------------------------------------------------
create or replace function app.carregar_padroes(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.aplicar_plano_categorias(p_empresa);
  insert into centros_custo (empresa_id, nome, tipo, ordem)
  select p_empresa, p.nome, p.tipo, p.pos from app.plano_centros_custo() p
  on conflict do nothing;

  -- Classes do pescado por peso do peixe (o "Inteiro", sem separação, a empresa já ganha ao ser criada).
  insert into classes_peixe (empresa_id, nome, peso_min_g, peso_max_g, comercializavel, ordem) values
    (p_empresa, 'Pequeno', null, 1000, true, 1),
    (p_empresa, 'Médio', 1000, 2000, true, 2),
    (p_empresa, 'Grande', 2000, 3000, true, 3),
    (p_empresa, 'Extra', 3000, null, true, 4),
    (p_empresa, 'Descarte', null, null, false, 9)
  on conflict do nothing;

  insert into centros_custo (empresa_id, nome, tipo) values
    (p_empresa, 'Administrativo', 'administrativo'),
    (p_empresa, 'Fábrica de ração', 'fabrica_racao'),
    (p_empresa, 'Comercial', 'comercial')
  on conflict do nothing;

  insert into depositos (empresa_id, nome, tipo) values
    (p_empresa, 'Pescado', 'peixe'),
    (p_empresa, 'Insumos', 'insumos'),
    (p_empresa, 'Ração', 'racao'),
    (p_empresa, 'Almoxarifado', 'almoxarifado')
  on conflict do nothing;

  insert into contas_financeiras (empresa_id, tipo, nome) values
    (p_empresa, 'caixinha', 'Caixa da piscicultura');
end $$;

-- lote com biometria ou despesca também não se exclui
create or replace function app.lote_sem_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from apontamentos_diarios where lote_id = old.id)
     or exists (select 1 from eventos_sanitarios where lote_id = old.id)
     or exists (select 1 from biometrias where lote_id = old.id)
     or exists (select 1 from despescas where lote_id = old.id)
     or exists (select 1 from movimentos_estoque where lote_id = old.id) then
    raise exception 'O lote % já tem apontamentos, biometrias ou movimentos e não pode ser excluído. Encerre o lote.', old.codigo
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Planejamento: ciclo do peixe (alevinagem, recria, engorda até a despesca), preço do kg
-- ---------------------------------------------------------------------------
alter table planejamento_parametros drop constraint planejamento_parametros_preco_ovos_por_check;
alter table planejamento_parametros drop column preco_ovos_por;
alter table planejamento_parametros drop constraint planejamento_parametros_preco_peixe_descarte_cents_check;
alter table planejamento_parametros drop column preco_peixe_descarte_cents;
alter table planejamento_parametros drop constraint planejamento_parametros_semanas_alevinagem_check;
alter table planejamento_parametros drop constraint planejamento_parametros_semanas_recria_check;
alter table planejamento_parametros drop constraint planejamento_parametros_semanas_cultivo_check;
alter table planejamento_parametros drop constraint planejamento_parametros_vazio_alevinagem_dias_check;
alter table planejamento_parametros drop constraint planejamento_parametros_vazio_recria_dias_check;
alter table planejamento_parametros drop constraint planejamento_parametros_vazio_engorda_dias_check;
alter table planejamento_parametros drop constraint crescimento_total;
alter table planejamento_parametros drop constraint descarte_depois_da_recria;
update planejamento_parametros set semanas_alevinagem = least(semanas_alevinagem, 12), semanas_recria = least(semanas_recria, 30),
  semanas_cultivo = least(greatest(semanas_cultivo, 12), 104),
  vazio_alevinagem_dias = least(vazio_alevinagem_dias, 120), vazio_recria_dias = least(vazio_recria_dias, 120),
  vazio_engorda_dias = least(vazio_engorda_dias, 120);
alter table planejamento_parametros
  add constraint planejamento_parametros_semanas_alevinagem_check check (semanas_alevinagem between 0 and 20),
  add constraint planejamento_parametros_semanas_recria_check check (semanas_recria between 0 and 40),
  add constraint planejamento_parametros_semanas_cultivo_check check (semanas_cultivo between 8 and 104),
  add constraint planejamento_parametros_vazio_alevinagem_dias_check check (vazio_alevinagem_dias between 0 and 120),
  add constraint planejamento_parametros_vazio_recria_dias_check check (vazio_recria_dias between 0 and 120),
  add constraint planejamento_parametros_vazio_engorda_dias_check check (vazio_engorda_dias between 0 and 120),
  add constraint engorda_depois_da_recria check (semanas_cultivo > semanas_alevinagem + semanas_recria);
alter table planejamento_parametros alter column mortalidade_recria_pct set default 15;
alter table planejamento_parametros alter column mortalidade_engorda_pct set default 5;
alter table planejamento_parametros
  add column peso_povoamento_g numeric(8,2) not null default 1 check (peso_povoamento_g > 0 and peso_povoamento_g <= 2000);
comment on column planejamento_parametros.semanas_cultivo is 'Semanas do povoamento até a despesca total';
comment on column planejamento_parametros.semanas_alevinagem is 'Semanas no viveiro de alevinagem (0: povoa direto na recria ou na engorda)';
comment on column planejamento_parametros.mortalidade_recria_pct is 'Mortalidade na alevinagem e na recria (%)';
comment on column planejamento_parametros.mortalidade_engorda_pct is 'Mortalidade na engorda (%)';
comment on column planejamento_parametros.perda_despesca_pct is 'Peixe que sai na despesca e não é vendido: fora do padrão, machucado (%)';
comment on column planejamento_parametros.preco_kg_cents is 'Preço de venda do kg do peixe';
comment on column planejamento_parametros.peso_povoamento_g is 'Peso médio dos alevinos ou juvenis no povoamento (g): de onde a curva parte';

alter table planejamento_custos drop constraint ovos_so_na_producao;
alter table planejamento_custos drop constraint planejamento_custos_base_check;
alter table planejamento_custos drop constraint planejamento_custos_fase_check;
update planejamento_custos set fase = case fase when 'cria' then 'alevinagem' when 'producao' then 'engorda' else fase end;
update planejamento_custos set base = 'kg' where base in ('duzia', 'cartela', 'caixa');
alter table planejamento_custos
  add constraint planejamento_custos_base_check check (base in ('peixe', 'lote', 'mes', 'kg')),
  add constraint planejamento_custos_fase_check check (fase in ('alevinagem', 'recria', 'engorda', 'ciclo')),
  add constraint kg_so_na_engorda check (base <> 'kg' or fase in ('engorda', 'ciclo'));
comment on column planejamento_custos.base is 'peixe: por peixe povoado; lote: por lote; mes: por mês de fase; kg: por kg despescado';

-- ---------------------------------------------------------------------------
-- 4. Importação da planilha: viveiros com área e volume, lotes com peso do povoamento
-- ---------------------------------------------------------------------------
create or replace function public.importar_piscicultura(p_empresa uuid, p_pacote jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_setor uuid;
  v_viveiro uuid;
  v_especie uuid;
  v_fornecedor uuid;
  v_produto produtos%rowtype;
  v_qtd numeric;
  v_avisos text[] := '{}';
  n_setor int := 0; n_viveiro int := 0; n_viveiro_atual int := 0; n_lote int := 0; n_lote_existente int := 0;
  n_especie int := 0; n_estoque int := 0;
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o usuário master da empresa pode importar dados' using errcode = 'insufficient_privilege';
  end if;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'viveiros', '[]')) e loop
    continue when nullif(trim(r->>'nome'), '') is null or nullif(trim(r->>'setor'), '') is null;
    begin
      select id into v_setor from setores where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'setor') limit 1;
      if v_setor is null then
        insert into setores (empresa_id, nome) values (p_empresa, trim(r->>'setor')) returning id into v_setor;
        n_setor := n_setor + 1;
      end if;
      select id into v_viveiro from viveiros where setor_id = v_setor and app.nome_chave(nome) = app.nome_chave(r->>'nome') limit 1;
      if v_viveiro is null then
        insert into viveiros (empresa_id, setor_id, nome, finalidade, sistema, capacidade_peixes, aeracao, area_m2, volume_m3, profundidade_m)
        values (p_empresa, v_setor, trim(r->>'nome'), r->>'finalidade', coalesce(nullif(r->>'sistema', ''), 'escavado'),
                (r->>'capacidade')::int, coalesce((r->>'aeracao')::boolean, false), nullif(r->>'area_m2', '')::numeric,
                nullif(r->>'volume_m3', '')::numeric, nullif(r->>'profundidade_m', '')::numeric);
        n_viveiro := n_viveiro + 1;
      else
        -- finalidade só muda enquanto o viveiro nunca recebeu lote (ela decide a fase do lote povoado)
        update viveiros g set
          capacidade_peixes = (r->>'capacidade')::int,
          sistema = coalesce(nullif(r->>'sistema', ''), g.sistema),
          aeracao = coalesce((r->>'aeracao')::boolean, g.aeracao),
          area_m2 = coalesce(nullif(r->>'area_m2', '')::numeric, g.area_m2),
          volume_m3 = coalesce(nullif(r->>'volume_m3', '')::numeric, g.volume_m3),
          profundidade_m = coalesce(nullif(r->>'profundidade_m', '')::numeric, g.profundidade_m),
          finalidade = case when exists (select 1 from lote_alocacoes a where a.viveiro_id = g.id) then g.finalidade else r->>'finalidade' end
        where id = v_viveiro;
        n_viveiro_atual := n_viveiro_atual + 1;
      end if;
    exception when others then
      v_avisos := v_avisos || format('Viveiro "%s" (%s) não entrou: %s', r->>'nome', r->>'setor', sqlerrm);
    end;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'lotes', '[]')) e loop
    continue when nullif(trim(r->>'codigo'), '') is null;
    if exists (select 1 from lotes where empresa_id = p_empresa and lower(codigo) = lower(trim(r->>'codigo'))) then
      n_lote_existente := n_lote_existente + 1;
      continue;
    end if;
    begin
      select id into v_especie from especies
       where (empresa_id is null or empresa_id = p_empresa) and app.nome_chave(nome) = app.nome_chave(r->>'especie')
       order by empresa_id nulls last limit 1;
      if v_especie is null then
        insert into especies (empresa_id, nome) values (p_empresa, trim(r->>'especie'))
        returning id into v_especie;
        n_especie := n_especie + 1;
      end if;
      select g.id into v_viveiro from viveiros g join setores n on n.id = g.setor_id
       where g.empresa_id = p_empresa and app.nome_chave(g.nome) = app.nome_chave(r->>'viveiro')
         and (nullif(trim(r->>'setor'), '') is null or app.nome_chave(n.nome) = app.nome_chave(r->>'setor'))
       order by g.ativo desc limit 1;
      if v_viveiro is null then
        raise exception 'viveiro "%" não encontrado', r->>'viveiro';
      end if;
      v_fornecedor := null;
      if nullif(trim(r->>'fornecedor'), '') is not null then
        select id into v_fornecedor from contatos where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'fornecedor')
         order by 'fornecedor' = any(tipos) desc, arquivado limit 1;
        if v_fornecedor is null then
          insert into contatos (empresa_id, tipos, nome) values (p_empresa, array['fornecedor'], trim(r->>'fornecedor'))
          returning id into v_fornecedor;
        end if;
      end if;
      perform povoar_lote(p_empresa, trim(r->>'codigo'), v_especie, (r->>'povoamento')::date, v_viveiro, (r->>'qtd')::int,
                          (r->>'peso_inicial_g')::numeric, coalesce((r->>'custo_cents')::bigint, 0), v_fornecedor,
                          nullif(r->>'peso_alvo_g', '')::numeric);
      n_lote := n_lote + 1;
    exception when others then
      v_avisos := v_avisos || format('Lote "%s" não entrou: %s', r->>'codigo', sqlerrm);
    end;
  end loop;

  for r in select e from jsonb_array_elements(coalesce(p_pacote->'estoque', '[]')) e loop
    continue when nullif(trim(r->>'produto'), '') is null;
    begin
      select * into v_produto from produtos where empresa_id = p_empresa and app.nome_chave(nome) = app.nome_chave(r->>'produto')
       order by ativo desc limit 1;
      if not found then
        raise exception 'produto não cadastrado (inclua na aba Produtos)';
      end if;
      v_qtd := (r->>'quantidade')::numeric;
      -- custo informado vira o custo médio do saldo inicial (pescado não tem custo médio próprio)
      if v_produto.tipo <> 'peixe' and coalesce((r->>'custo_cents')::bigint, 0) > 0 and v_qtd > 0 then
        update produtos set custo_medio_cents = (r->>'custo_cents')::numeric / v_qtd where id = v_produto.id;
      end if;
      perform movimentar_estoque(v_produto.id, 'ajuste', v_qtd, null, coalesce((r->>'data')::date, current_date),
                                 null, null, null, 'Estoque inicial (planilha)');
      n_estoque := n_estoque + 1;
    exception when others then
      v_avisos := v_avisos || format('Estoque de "%s" não entrou: %s', r->>'produto', sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'setores', n_setor, 'viveiros', n_viveiro, 'viveiros_atualizados', n_viveiro_atual, 'especies', n_especie,
    'lotes', n_lote, 'lotes_existentes', n_lote_existente, 'estoque', n_estoque,
    'avisos', to_jsonb(v_avisos[1:50]), 'total_avisos', cardinality(v_avisos));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Zerar o sistema: biometrias e despescas saem antes dos lotes
-- ---------------------------------------------------------------------------
do $$
declare v text;
begin
  v := pg_get_functiondef('public.zerar_sistema(uuid, text, text)'::regprocedure);
  if position('  delete from despescas where empresa_id = p_empresa;' in v) = 0 then
    raise exception 'zerar_sistema mudou: revise a ordem das exclusões';
  end if;
  v := replace(v, '  delete from despescas where empresa_id = p_empresa;',
                  '  delete from despescas where empresa_id = p_empresa;' || chr(10) ||
                  '  get diagnostics n = row_count; v := v || jsonb_build_object(''despescas'', n);' || chr(10) ||
                  '  delete from biometrias where empresa_id = p_empresa;' || chr(10) ||
                  '  get diagnostics n = row_count; v := v || jsonb_build_object(''biometrias'', n);');
  v := replace(v, '-- 3. Estoque primeiro: com os movimentos fora, desfazer apontamento e classificação não tem o que estornar.',
                  '-- 3. Estoque primeiro: com os movimentos fora, desfazer apontamento e despesca não tem o que estornar.');
  execute v;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Classes do pescado editáveis (aba Classes de peixe em Piscicultura)
--    Classe que passa a ser comercializável ganha os produtos de venda (kg e caixa);
--    a que deixa de ser tem os produtos de venda desativados. O produto de estoque fica.
-- ---------------------------------------------------------------------------
create or replace function app.produtos_da_classe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.produto_base_peixe(new.id);
  if new.comercializavel then
    perform app.produtos_venda_peixe(new.id);
    if tg_op = 'UPDATE' then
      update produtos set ativo = true, updated_at = now()
      where classe_peixe_id = new.id and not base_estoque and not ativo;
    end if;
  elsif tg_op = 'UPDATE' then
    update produtos set ativo = false, updated_at = now()
    where classe_peixe_id = new.id and not base_estoque and ativo;
  end if;
  return new;
end $$;

drop trigger if exists produtos_da_classe on classes_peixe;
create trigger produtos_da_classe after insert or update of comercializavel on classes_peixe
  for each row execute function app.produtos_da_classe();

alter table classes_peixe add constraint classes_peixe_faixa_check
  check (peso_min_g is null or peso_max_g is null or peso_max_g > peso_min_g);
alter table classes_peixe add constraint classes_peixe_pesos_positivos_check
  check ((peso_min_g is null or peso_min_g > 0) and (peso_max_g is null or peso_max_g > 0));

select app.travar_referencias();
