// Mapa de navegação. `marco` diz em que etapa do plano original do FINAVI (docs/legado/finavi/replica/architecture.md) o módulo ficou pronto.
export type Modulo = {
  slug: string;
  nome: string;
  descricao: string;
  marco: number;
  // chave de permissão quando difere do slug (ex.: PDV fica em /vendas/pdv e usa "pdv.*")
  permissao?: string;
  // aparece para quem tem o "ver" de qualquer um destes módulos (a central de relatórios junta vários assuntos)
  qualquer?: string[];
};

export type GrupoModulos = { nome: string; modulos: Modulo[] };

export const GRUPOS: GrupoModulos[] = [
  {
    nome: "Produção",
    modulos: [
      { slug: "piscicultura", nome: "Viveiros", descricao: "Setores, viveiros e tanques: área, volume, aeração e densidade de povoamento.", marco: 1 },
      { slug: "lotes", nome: "Lotes", descricao: "Povoamento, espécie, biometrias, curva de crescimento, transferências e encerramento.", marco: 1 },
      { slug: "apontamentos", nome: "Apontamento diário", descricao: "Ração, mortalidade, qualidade da água e medicamentos aplicados por viveiro.", marco: 1 },
      { slug: "despescas", permissao: "lotes", nome: "Despescas", descricao: "Retirada do peixe do viveiro em kg, por classe de tamanho, que entra no estoque.", marco: 1 },
      { slug: "sanidade", nome: "Sanidade", descricao: "Medicações e banhos com carência, calagem, adubação e análises.", marco: 3 },
      { slug: "sondas", permissao: "lotes", nome: "Sondas IoT", descricao: "Leituras em tempo real de oxigênio, temperatura, pH e amônia das sondas de qualidade da água.", marco: 3 },
    ],
  },
  {
    nome: "Financeiro",
    modulos: [
      { slug: "contas-a-pagar", nome: "Contas a pagar", descricao: "Agendamentos, parcelas, recorrências e rateio por centro de custo.", marco: 1 },
      { slug: "contas-a-receber", nome: "Contas a receber", descricao: "Recebimentos, parcelas, recorrências e clientes.", marco: 2 },
      { slug: "contas", nome: "Contas e saldos", descricao: "Contas bancárias, caixa, saldos e transferências.", marco: 2 },
      { slug: "cobrancas", nome: "Cobranças", descricao: "Boleto e Pix pelo Asaas com baixa automática.", marco: 5 },
      { slug: "cartoes", nome: "Cartões de crédito", descricao: "Compras parceladas, faturas e pagamento.", marco: 5 },
      { slug: "conciliacao", nome: "Conciliação", descricao: "Importação de extrato OFX, sugestões e regras automáticas.", marco: 2 },
      { slug: "fluxo-de-caixa", nome: "Fluxo de caixa", descricao: "Projeção do que está em aberto, vencido e por vir.", marco: 2 },
    ],
  },
  {
    nome: "Comercial",
    modulos: [
      { slug: "vendas", nome: "Vendas", descricao: "Pedidos, faturamento, cobrança e relatórios comerciais.", marco: 3 },
      { slug: "vendas/pdv", permissao: "pdv", nome: "PDV (balcão)", descricao: "Frente de caixa: venda rápida com troco e fechamento do dia.", marco: 3 },
      { slug: "vendedor", permissao: "vendas", nome: "App do vendedor", descricao: "Pedido em campo no celular: catálogo com a tabela do cliente, funciona sem internet.", marco: 5 },
      { slug: "notas", nome: "Notas fiscais", descricao: "NF-e dos pedidos pela Focus NFe.", marco: 5 },
    ],
  },
  {
    nome: "Estoque",
    modulos: [
      { slug: "estoque", nome: "Estoque", descricao: "Pescado em kg por classe, ração, corretivos, embalagens e medicamentos.", marco: 3 },
      { slug: "pontos-de-venda", permissao: "estoque", nome: "Pontos de venda", descricao: "Piscicultura, peixaria, feira: estoque de peixe por ponto e transferência com frete.", marco: 5 },
      { slug: "racao", nome: "Estoque de ração", descricao: "Ração comprada pronta: entradas numeradas com lote e validade, consumo pelo FEFO, sacos, cobertura e movimentos.", marco: 5 },
    ],
  },
  {
    nome: "Cadastros",
    modulos: [
      { slug: "contatos", nome: "Clientes e fornecedores", descricao: "Documentos e endereços para nota e cobrança, inclusive produtor rural.", marco: 5 },
      { slug: "medicamentos", permissao: "sanidade", nome: "Medicamentos e vitaminas", descricao: "Dose por kg de ração ou por m³ de água, carência antes da despesca e produto do estoque.", marco: 5 },
      { slug: "produtos", nome: "Produtos de venda", descricao: "O que a piscicultura vende: peixe por kg e em caixa, alevinos e outros itens com preço de venda.", marco: 5 },
      { slug: "insumos", permissao: "produtos", nome: "Insumos da piscicultura", descricao: "O que a piscicultura consome: ração e ingredientes, calcário, embalagens e medicamentos.", marco: 5 },
      { slug: "tabelas-de-preco", permissao: "vendas", nome: "Tabelas de preço", descricao: "Preço de venda de cada produto: tabela padrão e tabelas por tipo de cliente.", marco: 5 },
      { slug: "categorias", nome: "Categorias", descricao: "Plano de categorias de entradas e saídas, que vira o DRE.", marco: 5 },
      { slug: "centros-de-custo", nome: "Centros de custo", descricao: "Onde cada gasto cai: lote, viveiro, setor, fábrica ou administrativo.", marco: 5 },
    ],
  },
  {
    nome: "Gestão",
    modulos: [
      { slug: "planejamento", nome: "Planejamento", descricao: "Ciclos dos viveiros, povoamentos e despescas previstos e viabilidade dos próximos lotes.", marco: 5 },
      { slug: "previsoes", permissao: "planejamento", nome: "Previsões e alertas", descricao: "Biomassa e despesca previstas por lote, sinais fora do normal, dias de ração em estoque, caixa e margem da semana.", marco: 5 },
      { slug: "custo-do-kg", nome: "Custo do kg", descricao: "Custo do kg de peixe produzido por lote e mês, conversão alimentar e margem por cliente.", marco: 4 },
      {
        slug: "relatorios", nome: "Relatórios", marco: 2, qualquer: ["relatorios", "lotes", "vendas"],
        descricao: "Todos os relatórios num lugar só: análise do período em PDF e PowerPoint, DRE, contas, aging, orçamento, indicadores zootécnicos, comercial (curva ABC) e pacote do contador.",
      },
    ],
  },
  {
    nome: "Configurações",
    modulos: [
      { slug: "configuracoes", nome: "Configurações gerais", descricao: "Empresa, importação de dados e atalhos para os cadastros.", marco: 2 },
      { slug: "historico", nome: "Histórico de alterações", descricao: "Quem incluiu, editou ou excluiu cada registro, quando e o que mudou.", marco: 5 },
    ],
  },
];

// "ver" que libera o módulo no menu e na busca
export function podeVerModulo(m: Modulo, pode: (chave: string) => boolean): boolean {
  return (m.qualquer ?? [m.permissao ?? m.slug]).some((p) => pode(`${p}.ver`));
}

export function encontrarModulo(slug: string): Modulo | undefined {
  return GRUPOS.flatMap((g) => g.modulos).find((m) => m.slug === slug);
}
