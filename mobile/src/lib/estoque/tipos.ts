export interface ProdutoEstoque {
  id: string;
  nome: string;
  tipo: string;
  unidade: string;
  base_estoque: string;
  saldo: number;
  valor_cents: number | null;
  estoque_minimo: number | null;
  abaixo_minimo: boolean;
}

export interface Deposito {
  id: string;
  nome: string;
  tipo: string;
}

export interface MovimentoEstoque {
  id: string;
  data: string;
  tipo: string;
  quantidade: number;
  observacao: string;
  produto: string;
  lote: string;
}

export interface DadosEstoque {
  hoje: string;
  itens: ProdutoEstoque[];
  depositos: Deposito[];
  movimentos: MovimentoEstoque[];
  pode_editar: boolean;
}
