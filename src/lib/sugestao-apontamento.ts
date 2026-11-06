// Apontamento pré-preenchido: sugere a ração (e os tipos) de cada viveiro e turno pelo que o mesmo lote
// apontou nos últimos dias. É só sugestão: o tratador confere, corrige e salva. A quantidade da tabela de
// arraçoamento (pelo peso da biometria) vem à parte, de racao_sugerida no banco.

export type LancamentoHistorico = {
  viveiro_id: string;
  lote_id: string;
  data: string;
  turno: string;
  racao_kg: number; // total do lançamento (com ou sem tipo)
  racoes: { produto_id: string; kg: number }[];
};

export type Sugestao = { racaoKg: number; racoes: { produto_id: string; kg: number }[]; base: number };
export type Sugestoes = Record<string, Record<string, Sugestao>>;

export const LANCAMENTOS_BASE = 7; // quantos lançamentos recentes do turno entram na conta
export const MINIMO_BASE = 2; // com menos que isso não sugere
export const TOLERANCIA = 0.15; // fora de ±15% da sugestão, o campo avisa

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// Uma sugestão por viveiro ocupado e turno, só com lançamentos do lote que está nele agora
// (lote novo no viveiro começa sem sugestão). Mediana, para um erro de digitação não puxar a conta.
export function sugerirApontamentos(historico: LancamentoHistorico[], ocupados: { viveiro_id: string; lote_id: string }[]): Sugestoes {
  const resultado: Sugestoes = {};
  for (const { viveiro_id, lote_id } of ocupados) {
    const doLote = historico.filter((h) => h.viveiro_id === viveiro_id && h.lote_id === lote_id);
    for (const turno of new Set(doLote.map((h) => h.turno))) {
      const recentes = doLote.filter((h) => h.turno === turno).sort((a, b) => b.data.localeCompare(a.data)).slice(0, LANCAMENTOS_BASE);
      if (recentes.length < MINIMO_BASE) continue;
      // os tipos de ração seguem o último lançamento (troca de ração na fase vale a partir dela)
      const racoes = recentes[0].racoes.map(({ produto_id }) => {
        const kgs = recentes.flatMap((h) => h.racoes.filter((r) => r.produto_id === produto_id).map((r) => r.kg));
        return { produto_id, kg: Math.round(mediana(kgs) * 10) / 10 };
      });
      (resultado[viveiro_id] ??= {})[turno] = { racaoKg: Math.round(mediana(recentes.map((h) => h.racao_kg)) * 10) / 10, racoes, base: recentes.length };
    }
  }
  return resultado;
}

// O valor digitado foge da sugestão? Sem sugestão (zero) ou sem valor, não avisa.
export function foraDoEsperado(valor: number | null, sugerido: number, tolerancia = TOLERANCIA): boolean {
  if (valor === null || !sugerido) return false;
  return Math.abs(valor - sugerido) / sugerido > tolerancia;
}
