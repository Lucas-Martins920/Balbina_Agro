import type { ListaPreco, PrecoTabela } from "@regras/vendas.ts";

// Mesmo formato que /api/app/vendas devolve (carregarCatalogo em src/lib/vendas-dados.ts).
export type ClienteVenda = { id: string; nome: string; telefone: string | null; cpf_cnpj: string | null; lista_preco_id: string | null; cidade?: string | null };
// fator_kg: kg de peixe por unidade do produto (1 = vendido por kg; 20 = caixa de 20 kg). kg_classe: kg livres da
// classe no estoque; disponivel: quanto do produto cabe nesses kg.
export type ProdutoVenda = { id: string; nome: string; unidade: string; fator_kg: number | null; classe_peixe_id: string | null; disponivel: number | null; kg_classe: number | null };
export type UltimoPedido = { cliente_id: string; data: string; condicao: string | null; forma_pagamento: string | null; itens: { produto_id: string; quantidade: number }[] };
export type PedidoFeito = { id: string; numero: number; data: string; status: string; total_cents: number; cliente: string };
export type DadosVendas = {
  clientes: ClienteVenda[];
  produtos: ProdutoVenda[];
  precos: PrecoTabela[];
  listas: ListaPreco[];
  ultimos: UltimoPedido[];
  pedidos: PedidoFeito[];
  baixadoEm?: string;
};

// O que vai para /api/app/pedidos, mais o que a tela mostra na fila sem rede
export type PedidoPendente = {
  client_id: string;
  cliente_id: string;
  data: string;
  condicao: string;
  forma_pagamento: string | null;
  entrega: string | null;
  observacoes: string;
  faturar: boolean;
  itens: { produto_id: string; quantidade: number }[];
  cliente_nome: string;
  telefone: string | null;
  total_estimado: number;
  resumo: { nome: string; quantidade: number; preco_cents: number | null }[];
  erro?: string;
};
export type PedidoEnviado = PedidoPendente & { numero: number | null; total_cents: number; aviso?: string; enviado_em: string };
