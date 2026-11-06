// Contas do painel de acompanhamento: puras, para testar sem banco.
import { MESES_CURTOS, rotuloMes as mesComAno } from "./formato.ts";

export type LinhaCaixa = { mes: string; tipo: string; categoria: string; centro_custo_id: string | null; valor_cents: number };

// "2026-10-01" -> "out"; com ano quando a série cruza a virada: "jan/27"
export function rotuloMes(iso: string, comAno = false) {
  return comAno ? mesComAno(iso) : MESES_CURTOS[Number(iso.slice(5, 7)) - 1];
}

// Receitas e despesas pagas por mês, ambas positivas, na ordem de `meses` (AAAA-MM-01).
export function receitasDespesas(meses: string[], linhas: LinhaCaixa[]) {
  const receitas = meses.map(() => 0), despesas = meses.map(() => 0);
  for (const l of linhas) {
    const i = meses.indexOf(l.mes.slice(0, 10));
    if (i < 0) continue;
    if (l.tipo === "receber") receitas[i] += Number(l.valor_cents);
    else despesas[i] += Number(l.valor_cents);
  }
  return { receitas, despesas };
}

// Maiores despesas agrupadas por uma chave; o que passa de `limite` vira "Outros".
export function ranking(linhas: LinhaCaixa[], chave: (l: LinhaCaixa) => string, limite = 6) {
  const soma = new Map<string, number>();
  for (const l of linhas) {
    if (l.tipo !== "pagar") continue;
    const k = chave(l);
    soma.set(k, (soma.get(k) ?? 0) + Number(l.valor_cents));
  }
  const ordem = [...soma.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const topo = ordem.slice(0, limite).map(([nome, valor]) => ({ nome, valor }));
  const resto = ordem.slice(limite).reduce((s, [, v]) => s + v, 0);
  return resto > 0 ? [...topo, { nome: "Outros", valor: resto }] : topo;
}

// Produção diária da piscicultura somando os lotes: peixes, baixas, ração dada e biomassa estimada de cada dia,
// com a taxa de alimentação (% da biomassa) e a mortalidade do dia. O oxigênio é o menor medido entre os lotes.
export type LinhaLoteDia = {
  data: string; peixes: number | null; baixas_peixes: number | null; racao_kg: number | null;
  biomassa_kg: number | null; oxigenio_min_mg_l?: number | null;
};

export function producaoPorDia(linhas: LinhaLoteDia[]) {
  const dia = new Map<string, { peixes: number; baixas: number; racaoKg: number; biomassaKg: number; oxigenioMin: number | null }>();
  for (const l of linhas) {
    const d = dia.get(l.data) ?? { peixes: 0, baixas: 0, racaoKg: 0, biomassaKg: 0, oxigenioMin: null };
    d.peixes += Number(l.peixes ?? 0);
    d.baixas += Number(l.baixas_peixes ?? 0);
    d.racaoKg += Number(l.racao_kg ?? 0);
    d.biomassaKg += Number(l.biomassa_kg ?? 0);
    if (l.oxigenio_min_mg_l !== null && l.oxigenio_min_mg_l !== undefined) {
      const od = Number(l.oxigenio_min_mg_l);
      d.oxigenioMin = d.oxigenioMin === null ? od : Math.min(d.oxigenioMin, od);
    }
    dia.set(l.data, d);
  }
  return [...dia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([data, d]) => ({
    data,
    ...d,
    taxaPct: d.biomassaKg > 0 ? (100 * d.racaoKg) / d.biomassaKg : null,
    mortalidadePct: d.peixes > 0 ? (100 * d.baixas) / d.peixes : null,
  }));
}
