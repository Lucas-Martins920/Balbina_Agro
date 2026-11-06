import type { ListaPreco, PrecoTabela } from "@regras/vendas.ts";
import type { ClienteVenda, ProdutoVenda } from "@/lib/vendas/tipos";

// Mesmo formato que /api/app/pdv devolve (dados da tela /vendas/pdv do site)
export type PontoPdv = { id: string; nome: string; sede: boolean };
export type ContaPdv = { id: string; nome: string; tipo: string };
export type DadosPdv = {
  pontos: PontoPdv[];
  ponto: PontoPdv | null;
  clientes: ClienteVenda[];
  produtos: ProdutoVenda[];
  precos: PrecoTabela[];
  listas: ListaPreco[];
  contas: ContaPdv[];
  vendido_hoje: number;
};
export type VendaFeita = { pedidoId: string; numero: number; total_cents: number; troco_cents: number };
