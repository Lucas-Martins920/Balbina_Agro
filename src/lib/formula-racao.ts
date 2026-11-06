// Fórmula de ração: a batida pode ter qualquer total (não precisa fechar 1.000 kg).
// O banco guarda o kg de cada ingrediente na batida e calcula a proporção por tonelada.

export type MedidaFormula = "kg" | "pct";
export type LinhaFormula = { insumo_id: string; quantidade: number | null; linha?: number };
export type ItensFormula =
  | { ok: true; total: number; itens: { insumo_id: string; kg: number }[] }
  | { ok: false; erro: string };

const arred = (n: number, casas = 3) => Math.round(n * 10 ** casas) / 10 ** casas;

export function montarItensFormula(linhas: LinhaFormula[], medida: MedidaFormula, totalBatida?: number | null): ItensFormula {
  if (!linhas.length) return { ok: false, erro: "Informe os ingredientes." };
  for (const [i, l] of linhas.entries()) {
    if (!l.insumo_id || !l.quantidade || l.quantidade <= 0)
      return { ok: false, erro: `Linha ${l.linha ?? i + 1}: escolha o ingrediente e informe a quantidade.` };
  }
  if (medida === "kg") {
    const itens = linhas.map((l) => ({ insumo_id: l.insumo_id, kg: arred(l.quantidade!) }));
    return { ok: true, total: arred(itens.reduce((s, x) => s + x.kg, 0)), itens };
  }
  const somaPct = linhas.reduce((s, l) => s + l.quantidade!, 0);
  if (Math.abs(somaPct - 100) > 0.05) return { ok: false, erro: `Os percentuais somam ${arred(somaPct, 2)}%; precisam somar 100%.` };
  if (!totalBatida || totalBatida <= 0) return { ok: false, erro: "Informe o total da batida em kg." };
  const itens = linhas.map((l) => ({ insumo_id: l.insumo_id, kg: arred((l.quantidade! * totalBatida) / 100) }));
  return { ok: true, total: arred(itens.reduce((s, x) => s + x.kg, 0)), itens };
}

// Total da batida e a parte (%) de cada ingrediente, para mostrar enquanto a pessoa digita e nos cartões.
export function resumoFormula(kgs: number[]) {
  const total = arred(kgs.reduce((s, k) => s + k, 0));
  return { total, percentuais: total > 0 ? kgs.map((k) => arred((k * 100) / total, 2)) : kgs.map(() => 0) };
}
