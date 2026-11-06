// Endpoints da API pública: alimenta o índice GET /api/v1 e a página de documentação em Configurações > API.
export type Endpoint = { metodo: "GET" | "POST" | "PATCH"; caminho: string; escopo: string; descricao: string; filtros?: string };

export const ENDPOINTS: Endpoint[] = [
  { metodo: "GET", caminho: "/api/v1/me", escopo: "qualquer", descricao: "Empresa da chave, escopos dados e escopos liberados pelo plano." },
  { metodo: "GET", caminho: "/api/v1/lancamentos", escopo: "contas-a-pagar.ver / contas-a-receber.ver", descricao: "Contas a pagar e a receber com rateio, saldo e situação.",
    filtros: "tipo, status, vencimento_de, vencimento_ate, competencia_de, competencia_ate, contato_id, atualizado_desde" },
  { metodo: "GET", caminho: "/api/v1/lancamentos/{id}", escopo: "contas-a-pagar.ver / contas-a-receber.ver", descricao: "Um título com as baixas." },
  { metodo: "POST", caminho: "/api/v1/lancamentos", escopo: "contas-a-pagar.editar / contas-a-receber.editar", descricao: "Inclui um título, à vista ou em parcelas mensais." },
  { metodo: "POST", caminho: "/api/v1/lancamentos/{id}/baixas", escopo: "contas-a-pagar.editar / contas-a-receber.editar", descricao: "Registra pagamento ou recebimento, total ou parcial." },
  { metodo: "GET", caminho: "/api/v1/contas", escopo: "contas.ver", descricao: "Contas, caixas e cartões com o saldo atual." },
  { metodo: "GET", caminho: "/api/v1/movimentos", escopo: "contas.ver", descricao: "Extrato: baixas e transferências por conta.", filtros: "conta_id, de, ate" },
  { metodo: "GET", caminho: "/api/v1/categorias", escopo: "categorias.ver", descricao: "Plano de categorias (id usado em categoria_id)." },
  { metodo: "GET", caminho: "/api/v1/centros-de-custo", escopo: "centros-de-custo.ver", descricao: "Centros de custo." },
  { metodo: "GET", caminho: "/api/v1/contatos", escopo: "contatos.ver", descricao: "Clientes, fornecedores, funcionários e sócios.", filtros: "tipo, cpf_cnpj, busca, arquivado, atualizado_desde" },
  { metodo: "GET", caminho: "/api/v1/contatos/{id}", escopo: "contatos.ver", descricao: "Um contato." },
  { metodo: "POST", caminho: "/api/v1/contatos", escopo: "contatos.editar", descricao: "Inclui contato." },
  { metodo: "PATCH", caminho: "/api/v1/contatos/{id}", escopo: "contatos.editar", descricao: "Altera só os campos enviados." },
  { metodo: "GET", caminho: "/api/v1/produtos", escopo: "produtos.ver", descricao: "Produtos de venda e insumos (para_venda diz qual é qual).", filtros: "tipo, para_venda, ativo, atualizado_desde" },
  { metodo: "GET", caminho: "/api/v1/produtos/{id}", escopo: "produtos.ver", descricao: "Um produto." },
  { metodo: "POST", caminho: "/api/v1/produtos", escopo: "produtos.editar", descricao: "Inclui produto (o peixe de venda vem das classes de peixe)." },
  { metodo: "PATCH", caminho: "/api/v1/produtos/{id}", escopo: "produtos.editar", descricao: "Altera só os campos enviados." },
  { metodo: "GET", caminho: "/api/v1/vendas", escopo: "vendas.ver", descricao: "Pedidos de venda com cliente e itens.", filtros: "status, de, ate, cliente_id, atualizado_desde" },
  { metodo: "GET", caminho: "/api/v1/vendas/{id}", escopo: "vendas.ver", descricao: "Um pedido de venda." },
  { metodo: "GET", caminho: "/api/v1/estoque", escopo: "estoque.ver", descricao: "Saldo de estoque por produto.", filtros: "tipo" },
];
