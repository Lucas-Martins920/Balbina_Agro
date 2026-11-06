import { centavosParaCampo } from "./formato.ts";
import { GRUPOS_CATEGORIA } from "./titulos.ts";
import { compararOrdem } from "./ordem.ts";

export type LinhaResultado = { mes: string; tipo: string; categoria_id: string; categoria: string; grupo: string; valor_cents: number };
export type Matriz = {
  meses: string[];
  grupos: { grupo: string; nome: string; linhas: { categoria: string; valores: number[]; total: number }[]; valores: number[]; total: number }[];
  resultado: number[];
  totalResultado: number;
};

// Os 12 meses que terminam em `ate` (AAAA-MM), como AAAA-MM-01
export function ultimosMeses(ate: string, n = 12): string[] {
  const [a, m] = ate.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - n + i, 1)).toISOString().slice(0, 10));
}

// Monta a DRE gerencial: grupos na ordem do plano, receita positiva e saídas negativas.
export function montarMatriz(meses: string[], linhas: LinhaResultado[]): Matriz {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const grupos = Object.entries(GRUPOS_CATEGORIA).map(([grupo, nome]) => {
    const porCategoria = new Map<string, number[]>();
    for (const l of linhas.filter((x) => x.grupo === grupo)) {
      const i = idx.get(l.mes.slice(0, 10));
      if (i === undefined) continue;
      const s = l.tipo === "receber" ? 1 : -1;
      const v = porCategoria.get(l.categoria) ?? meses.map(() => 0);
      v[i] += s * Number(l.valor_cents);
      porCategoria.set(l.categoria, v);
    }
    const ls = [...porCategoria.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([categoria, valores]) => ({ categoria, valores, total: valores.reduce((s, v) => s + v, 0) }));
    const valores = meses.map((_, i) => ls.reduce((s, l) => s + l.valores[i], 0));
    return { grupo, nome, linhas: ls, valores, total: valores.reduce((s, v) => s + v, 0) };
  }).filter((g) => g.linhas.length > 0);
  const resultado = meses.map((_, i) => grupos.reduce((s, g) => s + g.valores[i], 0));
  return { meses, grupos, resultado, totalResultado: resultado.reduce((s, v) => s + v, 0) };
}

// CSV para Excel em português: ponto e vírgula, vírgula decimal e BOM.
// Texto que começa com = + - @ ou tab vira fórmula no Excel: o apóstrofo o mantém como texto.
export function paraCsv(linhas: (string | number | null)[][]): string {
  const celula = (v: string | number | null) => {
    const t = v === null ? "" : typeof v === "number" ? centavosParaCampo(v) : /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
}

// Linhas de subtotal da DRE gerencial, na ordem em que aparecem depois de cada grupo
export const SUBTOTAIS_DRE: Record<string, { nome: string; grupos: string[] }> = {
  custo_operacional: { nome: "Margem bruta", grupos: ["receita_operacional", "custo_operacional"] },
  despesa_operacional: { nome: "Resultado operacional", grupos: ["receita_operacional", "custo_operacional", "despesa_operacional"] },
};

export function subtotal(m: Matriz, grupos: string[]): number[] {
  return m.meses.map((_, i) => m.grupos.filter((g) => grupos.includes(g.grupo)).reduce((s, g) => s + g.valores[i], 0));
}

// Análise vertical: cada valor como % da receita operacional do mesmo mês
export function analiseVertical(valores: number[], receita: number[]): (number | null)[] {
  return valores.map((v, i) => (receita[i] ? (v / receita[i]) * 100 : null));
}

// Análise horizontal: variação % sobre o mês anterior (sobre o módulo, para despesa que cresce dar positivo)
export function analiseHorizontal(valores: number[]): (number | null)[] {
  return valores.map((v, i) => (i === 0 || valores[i - 1] === 0 ? null : ((v - valores[i - 1]) / Math.abs(valores[i - 1])) * 100));
}

export const FAIXAS_AGING: Record<string, string> = {
  a_vencer: "A vencer",
  ate_30: "1 a 30 dias",
  ate_60: "31 a 60 dias",
  ate_90: "61 a 90 dias",
  mais_90: "Mais de 90 dias",
};

export type LinhaAging = { contato_id: string | null; contato_nome: string; faixa: string; saldo_cents: number };

// Saldo por contato e faixa, com quem mais deve (ou a quem mais se deve) em atraso primeiro
export function montarAging(linhas: LinhaAging[]) {
  const faixas = Object.keys(FAIXAS_AGING);
  const porContato = new Map<string, { id: string; nome: string; valores: number[]; total: number; atrasado: number }>();
  const totais = faixas.map(() => 0);
  for (const l of linhas) {
    const i = faixas.indexOf(l.faixa);
    if (i < 0) continue;
    const chave = l.contato_id ?? "";
    const c = porContato.get(chave) ?? { id: chave, nome: l.contato_nome, valores: faixas.map(() => 0), total: 0, atrasado: 0 };
    const v = Number(l.saldo_cents);
    c.valores[i] += v;
    c.total += v;
    if (l.faixa !== "a_vencer") c.atrasado += v;
    totais[i] += v;
    porContato.set(chave, c);
  }
  const contatos = [...porContato.values()].sort((a, b) => b.atrasado - a.atrasado || b.total - a.total);
  return { faixas, contatos, totais, total: totais.reduce((s, v) => s + v, 0) };
}

// ---------------------------------------------------------------------------
// DRE no formato do NIBO: ano de janeiro a dezembro, grupo → subgrupo (categoria pai) → categoria,
// com margem de contribuição, %, resultado operacional e variação de caixa.
// ---------------------------------------------------------------------------

export const GRUPOS_DRE: Record<string, string> = {
  receita_operacional: "RECEITAS OPERACIONAIS",
  custo_operacional: "CUSTOS OPERACIONAIS",
  despesa_operacional: "DESPESAS OPERACIONAIS E OUTRAS RECEITAS",
  investimento: "ATIVIDADE DE INVESTIMENTO",
  financiamento: "ATIVIDADE DE FINANCIAMENTO",
};

export type TipoLinhaDre = "grupo" | "subgrupo" | "categoria" | "subtotal" | "percentual" | "resultado";
export type LinhaDre = { chave: string; nome: string; tipo: TipoLinhaDre; nivel: 0 | 1 | 2; valores: number[]; total: number };
export type Dre = { meses: string[]; linhas: LinhaDre[]; receita: number[]; vazio: boolean };
export type CategoriaDre = { id: string; nome: string; parent_id: string | null; ordem?: number | null };

export function mesesDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}-01`);
}

const somaValores = (listas: number[][], n: number) => Array.from({ length: n }, (_, i) => listas.reduce((s, v) => s + v[i], 0));
const linha = (chave: string, nome: string, tipo: TipoLinhaDre, nivel: 0 | 1 | 2, valores: number[]): LinhaDre =>
  ({ chave, nome, tipo, nivel, valores, total: valores.reduce((s, v) => s + v, 0) });

export function montarDre(meses: string[], linhas: LinhaResultado[], categorias: CategoriaDre[], regime: "caixa" | "competencia"): Dre {
  const n = meses.length;
  const idx = new Map(meses.map((m, i) => [m, i]));
  const cat = new Map(categorias.map((c) => [c.id, c]));

  // valor por categoria (pela id: duas categorias com o mesmo nome continuam separadas)
  const valores = new Map<string, { grupo: string; nome: string; valores: number[] }>();
  for (const l of linhas) {
    const i = idx.get(l.mes.slice(0, 10));
    if (i === undefined) continue;
    const v = valores.get(l.categoria_id) ?? { grupo: l.grupo, nome: l.categoria, valores: Array(n).fill(0) };
    v.valores[i] += (l.tipo === "receber" ? 1 : -1) * Number(l.valor_cents);
    valores.set(l.categoria_id, v);
  }

  const totais = new Map<string, number[]>();
  const saida: LinhaDre[] = [];
  const subtotalApos = (grupo: string) => {
    const r = totais.get("receita_operacional") ?? Array(n).fill(0);
    const c = totais.get("custo_operacional") ?? Array(n).fill(0);
    const d = totais.get("despesa_operacional") ?? Array(n).fill(0);
    if (grupo === "custo_operacional") {
      const margem = somaValores([r, c], n);
      saida.push(linha("margem", "Margem de contribuição", "subtotal", 0, margem));
      const pct = margem.map((m, i) => (r[i] ? (m / r[i]) * 100 : 0));
      const total = r.reduce((s, v) => s + v, 0);
      saida.push({ chave: "margem_pct", nome: "%", tipo: "percentual", nivel: 0, valores: pct,
        total: total ? (margem.reduce((s, v) => s + v, 0) / total) * 100 : 0 });
    }
    if (grupo === "despesa_operacional") saida.push(linha("resultado_operacional", "RESULTADO OPERACIONAL", "subtotal", 0, somaValores([r, c, d], n)));
  };

  for (const [grupo, nomeGrupo] of Object.entries(GRUPOS_DRE)) {
    // agrupa as categorias com valor pelo pai (subgrupo); categoria sem pai fica sozinha
    const subgrupos = new Map<string, { nome: string; ordem?: number | null; proprio?: number[]; filhos: { id: string; nome: string; ordem?: number | null; valores: number[] }[] }>();
    for (const [id, v] of valores) {
      if (v.grupo !== grupo) continue;
      const c = cat.get(id);
      const paiId = c?.parent_id ?? null;
      if (paiId) {
        const s = subgrupos.get(paiId) ?? { nome: cat.get(paiId)?.nome ?? "Outros", ordem: cat.get(paiId)?.ordem, filhos: [] };
        s.filhos.push({ id, nome: c?.nome ?? v.nome, ordem: c?.ordem, valores: v.valores });
        subgrupos.set(paiId, s);
      } else {
        const s = subgrupos.get(id) ?? { nome: c?.nome ?? v.nome, ordem: c?.ordem, filhos: [] };
        s.proprio = v.valores;
        subgrupos.set(id, s);
      }
    }
    // na ordem escolhida em Categorias (arrastando); sem ordem, pelo nome
    const blocos = [...subgrupos.entries()].map(([id, s]) => ({ id, ...s })).sort(compararOrdem);
    const valoresGrupo = somaValores(blocos.flatMap((b) => [...(b.proprio ? [b.proprio] : []), ...b.filhos.map((f) => f.valores)]), n);
    totais.set(grupo, valoresGrupo);
    if (blocos.length) {
      saida.push(linha(grupo, nomeGrupo, "grupo", 0, valoresGrupo));
      for (const b of blocos) {
        if (b.filhos.length === 0) {
          saida.push(linha(b.id, b.nome, "categoria", 1, b.proprio!));
          continue;
        }
        const filhos = [...b.filhos, ...(b.proprio ? [{ id: `${b.id}:proprio`, nome: b.nome, ordem: null, valores: b.proprio }] : [])].sort(compararOrdem);
        saida.push(linha(`sub:${b.id}`, b.nome, "subgrupo", 1, somaValores(filhos.map((f) => f.valores), n)));
        for (const f of filhos) saida.push(linha(f.id, f.nome, "categoria", 2, f.valores));
      }
    }
    subtotalApos(grupo);
  }

  const final = somaValores([...totais.values()], n);
  saida.push(linha("resultado", regime === "caixa" ? "VARIAÇÃO DE CAIXA" : "RESULTADO", "resultado", 0, final));
  return { meses, linhas: saida, receita: totais.get("receita_operacional") ?? Array(n).fill(0), vazio: valores.size === 0 };
}
