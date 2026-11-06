// Compra sugerida (B2) e ordem da fábrica sugerida (B3): a partir da cobertura de cada item (saldo e
// consumo médio por dia), quanto produzir de cada ração com fórmula e quanto comprar do resto.
import type { Cobertura } from "./previsao.ts";

export type FormulaVigente = { racao_id: string; itens: { insumo_id: string; kg_por_tonelada: number }[] };
export type Produzir = { produto_id: string; nome: string; kg: number; dias: number | null };
export type Comprar = { produto_id: string; nome: string; unidade: string; quantidade: number; dias: number | null; motivo: "consumo" | "producao" };

export const DIAS_COMPRA = 30;
export const DIAS_PRODUCAO = 7;

const arredondaCima = (v: number, passo: number) => Math.ceil(v / passo - 1e-9) * passo;

export function planoAbastecimento(cobertura: Cobertura[], formulas: FormulaVigente[], diasCompra = DIAS_COMPRA, diasProducao = DIAS_PRODUCAO) {
  const formulaDe = new Map(formulas.map((f) => [f.racao_id, f]));
  const item = new Map(cobertura.map((c) => [c.produto_id, c]));
  const produzir: Produzir[] = [];
  const precisaProducao = new Map<string, number>();

  // ração feita na fábrica: produzir o que falta para os próximos dias de produção (lotes de 100 kg)
  for (const c of cobertura) {
    const f = formulaDe.get(c.produto_id);
    if (!f || c.consumoDia <= 0) continue;
    const falta = c.consumoDia * diasProducao - c.saldo;
    if (falta <= 0) continue;
    const kg = arredondaCima(falta, 100);
    produzir.push({ produto_id: c.produto_id, nome: c.nome, kg, dias: c.dias });
    for (const i of f.itens) precisaProducao.set(i.insumo_id, (precisaProducao.get(i.insumo_id) ?? 0) + (kg * i.kg_por_tonelada) / 1000);
  }

  // o resto (insumos e ração comprada pronta): cobrir os dias de compra; nunca menos que o necessário
  // para a produção sugerida acima
  const comprar: Comprar[] = [];
  const ids = new Set([...cobertura.filter((c) => !formulaDe.has(c.produto_id)).map((c) => c.produto_id), ...precisaProducao.keys()]);
  for (const id of ids) {
    const c = item.get(id);
    if (!c) continue;
    const porConsumo = c.consumoDia * diasCompra - c.saldo;
    const porProducao = (precisaProducao.get(id) ?? 0) - c.saldo;
    const falta = Math.max(porConsumo, porProducao);
    if (falta <= 0) continue;
    comprar.push({
      produto_id: id, nome: c.nome, unidade: c.unidade, dias: c.dias,
      quantidade: arredondaCima(falta, c.unidade === "kg" ? 10 : 1),
      motivo: porProducao > porConsumo ? "producao" : "consumo",
    });
  }
  produzir.sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
  comprar.sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
  return { produzir, comprar };
}

// Texto para mandar ao fornecedor (copiar e colar no WhatsApp ou e-mail).
export function textoListaCompra(comprar: Comprar[], empresa: string) {
  const linhas = comprar.map((c) => `- ${c.nome}: ${c.quantidade.toLocaleString("pt-BR")} ${c.unidade}`);
  return [`Pedido de compra - ${empresa}`, ...linhas].join("\n");
}
