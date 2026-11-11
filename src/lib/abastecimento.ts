// Compra sugerida (B2): a partir da cobertura de cada ração (saldo e consumo médio por dia), quanto comprar
// para cobrir os dias de compra. A piscicultura compra ração pronta (a fábrica própria da granja saiu).
import type { Cobertura } from "./previsao.ts";

export type Comprar = { produto_id: string; nome: string; unidade: string; quantidade: number; dias: number | null };

export const DIAS_COMPRA = 30;

const arredondaCima = (v: number, passo: number) => Math.ceil(v / passo - 1e-9) * passo;

export function planoAbastecimento(cobertura: Cobertura[], diasCompra = DIAS_COMPRA) {
  const comprar: Comprar[] = [];
  for (const c of cobertura) {
    const falta = c.consumoDia * diasCompra - c.saldo;
    if (falta <= 0) continue;
    comprar.push({
      produto_id: c.produto_id, nome: c.nome, unidade: c.unidade, dias: c.dias,
      quantidade: arredondaCima(falta, c.unidade === "kg" ? 10 : 1),
    });
  }
  comprar.sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
  return { comprar };
}

// Texto para mandar ao fornecedor (copiar e colar no WhatsApp ou e-mail).
export function textoListaCompra(comprar: Comprar[], empresa: string) {
  const linhas = comprar.map((c) => `- ${c.nome}: ${c.quantidade.toLocaleString("pt-BR")} ${c.unidade}`);
  return [`Pedido de compra - ${empresa}`, ...linhas].join("\n");
}
