# Plano de categorias da piscicultura

Plano de categorias padrão do Balbina, adaptado do plano da granja de postura do FINAVI (estudo de 2026-11-02, a
pedido do Nicolas: "refaça todas as categorias, pesquise e inclua as pertinentes") para a piscicultura de tambaqui
e outros peixes redondos. O plano fica no banco em `app.plano_categorias()` (versão do peixe na migration
`20261105000005_piscicultura_cadastros.sql`; a estrutura veio de `20261102030000_plano_categorias_piscicultura.sql`).

## Resumo

- **33 categorias principais e 109 subcategorias**, em dois níveis, já na ordem do DRE.
- Empresa nova nasce com o plano, e o botão **Categorias padrão** em Cadastros > Categorias deixa só o plano: cria o
  que falta, organiza as antigas dentro das novas principais, apaga as que não são do plano (ou desativa as que
  estão em uso). Pode ser apertado de novo sem duplicar nada.
- O custo do kg por lote tem sete componentes (ração, alevinos, sanidade, mão de obra, energia, embalagem, outros);
  toda principal de custo diz em qual deles entra, e as subcategorias herdam (`categorias.componente_custo`, view `categorias_custo`).
- Centros de custo padrão (`app.plano_centros_custo()`): Alevinagem, Recria, Engorda (comum aos viveiros), Fábrica
  de ração, Despesca e beneficiamento, Sanidade e qualidade da água, Manutenção de viveiros e barragens, Logística e
  entregas, Comercial e Administrativo. Setor, viveiro e lote ganham o próprio centro automaticamente; os gerais são
  rateados nos lotes pela biomassa de cada dia (kg·dia), não pela contagem de peixes.

## Fontes e o que cada uma pesou

| Fonte | O que entrou no plano |
|---|---|
| Embrapa (D1: Corrêa et al., *Criação de tambaquis*, 2018; D2: Izel et al., Circular Técnica 39, 2013), ver [`piscicultura.md`](piscicultura.md) | Estrutura do custo do peixe: ração (a maior parte do custo), alevinos, calagem e adubação dos viveiros, energia dos aeradores e bombas, mão de obra, despesca. Daí a abertura da ração por ingrediente e de sanidade e qualidade da água. |
| Plano de contas da atividade rural (contabilidade rural, LCDPR — Receita Federal, IN RFB 1.848/2018) | Receita da atividade × investimento × financiamento separados; juros como despesa, principal do empréstimo como financiamento; retirada pessoal do produtor fora do resultado. O LCDPR já exclui o grupo financiamento. |
| Funrural (Lei 8.212/91 art. 25) e tributos sobre venda (ICMS, PIS/Cofins, Simples) | Grupo **Deduções da receita** dentro das receitas, para o DRE mostrar receita líquida antes da margem. |
| NIBO (referência do financeiro) | Dois níveis (principal > subcategoria), grupos do DRE gerencial, despesas comerciais/administrativas/financeiras separadas. |
| Rotina da piscicultura (outorga e licença ambiental do setor, gelo e caixas na despesca, aeradores) | Outorga e taxa de uso da água, arrendamento de lâmina d'água, gelo e caixas térmicas, conserto de aeradores, equipe de despesca e taxas de inspeção. |

## Decisões

1. **Mantidos os cinco grupos do DRE** (receita, custo, despesa, investimento, financiamento). Criar grupos novos
   mexeria no DRE, na análise do período, na importação NIBO e no LCDPR. As deduções entram como categoria de
   **saída dentro de Receitas operacionais**: o DRE já soma pelo sentido, então a receita aparece líquida.
2. **Nomes que o sistema procura**: "Venda de peixes" (faturamento, categoria do sistema), "Fretes" (frete da
   transferência entre pontos de venda) e "Compra de peixe para revenda" (venda entre empresas do mesmo dono).
   Renomear essas três quebra o faturamento e as transferências.
3. **Nomes únicos no plano todo** (nenhuma subcategoria repete o nome de outra), para a busca por nome e a
   importação não ficarem ambíguas.
4. **Venda de peixes sem subcategorias por classe**: a classe (Pequeno, Médio, Grande, Extra) já vem de Vendas e do
   estoque. Abrir no financeiro duplicaria a informação e o faturamento precisaria escolher a subcategoria.
5. **Depreciação de viveiros e equipamentos não é categoria**: não passa pelo caixa. Fica como evolução do custo do
   kg (componente novo), fora deste plano.
6. **Alevinos é componente próprio do custo** (no FINAVI era a ave amortizada): o custo dos alevinos ou juvenis
   informado no povoamento (`povoar_lote`) e as contas da categoria Alevinos e juvenis entram no lote.

## O plano

### Receitas operacionais

- **Venda de peixes**
- **Venda de alevinos e juvenis**
- **Venda de subprodutos e serviços**
  - Venda de ração e insumos
  - Serviços prestados a terceiros
  - Aluguel de equipamentos
- **Outras receitas operacionais**
  - Indenizações de seguro
  - Subvenções e incentivos
  - Bonificações de fornecedores
- **Deduções da receita** (saída: deduz a receita)
  - Funrural e Senar
  - ICMS sobre vendas
  - PIS e Cofins sobre vendas
  - Simples Nacional
  - Devoluções e abatimentos

### Custos operacionais (custo de produção do kg)

- **Ração e insumos** (custo do kg: ração)
  - Ração extrusada comprada
  - Milho
  - Farelo de soja
  - Premix e vitaminas
  - Óleo e aditivos
  - Fabricação de ração por terceiros
- **Alevinos e juvenis** (custo do kg: alevinos)
  - Alevinos
  - Juvenis para engorda
  - Transporte de alevinos
- **Sanidade e qualidade da água** (custo do kg: sanidade)
  - Medicamentos
  - Vacinas
  - Probióticos e vitaminas
  - Sal, cal e calcário para os viveiros
  - Adubos e fertilizantes
  - Análises de água e de peixe
  - Veterinário e assistência técnica
- **Mão de obra da produção** (custo do kg: mão de obra)
  - Salários da produção
  - INSS e FGTS da produção
  - 13º e férias da produção
  - Alimentação e transporte da equipe
  - Diaristas e serviços avulsos
  - EPIs e uniformes
  - Rescisões trabalhistas
- **Energia elétrica** (custo do kg: energia)
- **Combustíveis e bombeamento** (custo do kg: energia)
  - Diesel de bombas e geradores
  - Gasolina de barcos e motores
  - Manutenção de bombas
- **Embalagens e gelo** (custo do kg: embalagem)
  - Gelo
  - Caixas térmicas e basquetas
  - Sacos e etiquetas
- **Manutenção de viveiros e equipamentos** (custo do kg: outros)
  - Viveiros, taludes e barragens
  - Conserto de aeradores
  - Redes, puçás e tarrafas
  - Comedouros e alimentadores
  - Peças e materiais de manutenção
- **Fretes** (custo do kg: outros)
  - Frete de ração e insumos
  - Frete entre pisciculturas e pontos de venda
- **Despesca e beneficiamento** (custo do kg: outros)
  - Equipe de despesca
  - Beneficiamento por terceiros
  - Taxas de inspeção
- **Outros custos da produção** (custo do kg: outros)
  - Arrendamento de terras e lâmina d'água
  - Seguro da produção
  - Outorga e taxa de uso da água
  - Assistência técnica (engenharia de pesca)
- **Compra de peixe para revenda** (custo do kg: outros)

### Despesas operacionais e outras receitas

- **Despesas comerciais**
  - Comissões de vendedores
  - Frete de entrega aos clientes
  - Veículos de entrega (combustível e manutenção)
  - Marketing e propaganda
  - Tarifas de cobrança (boleto e Pix)
  - Perdas com clientes (inadimplência)
- **Despesas administrativas**
  - Salários administrativos
  - Encargos e benefícios
  - Pró-labore
  - Contabilidade
  - Jurídico e consultorias
  - Software e sistemas
  - Telefone e internet
  - Aluguel
  - Material de escritório e copa
  - Combustível
  - Viagens e deslocamentos
  - Seguros gerais
  - Certificado digital e cartório
- **Despesas tributárias**
  - ITR e IPTU
  - IPVA e licenciamento
  - Licenças e taxas sanitárias e ambientais
  - Contribuição sindical rural
  - Imposto de renda e CSLL
  - Multas e juros de impostos
- **Despesas financeiras**
  - Tarifas bancárias
  - Juros de empréstimos e financiamentos
  - Juros e multas por atraso
  - IOF
  - Taxas de cartão e antecipação
- **Receitas financeiras** (entrada)
  - Rendimentos de aplicações
  - Juros e multas recebidos
  - Descontos obtidos
- **Outras despesas**
  - Doações e patrocínios
  - Perdas e quebras diversas

### Atividade de investimento

- **Instalações e viveiros**
  - Construção de viveiros
  - Reforma e ampliação
  - Barragens e canais
  - Poços, cercas e estradas
- **Máquinas e equipamentos**
  - Equipamentos de viveiro
  - Aeradores
  - Alimentadores automáticos
  - Gerador e energia solar
  - Equipamentos da fábrica de ração
- **Veículos e máquinas agrícolas**
- **Terras e benfeitorias**
- **Informática e tecnologia**
- **Venda de ativos** (entrada)
  - Venda de veículos e máquinas
  - Venda de equipamentos usados
  - Venda de terras e benfeitorias

### Atividade de financiamento

- **Empréstimos recebidos** (entrada)
  - Crédito rural de custeio
  - Crédito rural de investimento
  - Capital de giro
- **Pagamento de empréstimos**
  - Amortização de crédito rural
  - Amortização de capital de giro
  - Consórcios
- **Aporte de sócios** (entrada)
- **Distribuição de lucros**
  - Lucros distribuídos
  - Retiradas pessoais do produtor

## Pendências e próximos passos

- Compra de peixe para revenda entra como "outros" no custo do kg. Melhor seria um componente "fora do custo do kg";
  fica para um PR próprio.
- Componente de depreciação de viveiros e equipamentos no custo do kg (decisão 5).
- Os códigos para o contador ficam vazios: cada escritório usa a sua numeração, e a piscicultura preenche em
  Categorias.
