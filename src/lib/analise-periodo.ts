// Análise do período (Relatórios > Análise do período): contas puras, para testar sem banco.
// Tudo é comparado com o período anterior de mesmo tamanho e com o mesmo período do ano anterior,
// como os relatórios do Power BI: cada indicador tem valor, base de comparação e tendência mês a mês.
import { deslocarMes, formatarMoeda, formatarNumero, MESES_LONGOS, rotuloMes } from "./formato.ts";
import { textoKg } from "./pescado.ts";
import type { LinhaResultado } from "./relatorios.ts";

export const PERIODOS = {
  mes: "Este mês",
  "mes-passado": "Mês passado",
  trimestre: "3 meses",
  semestre: "6 meses",
  ano: "Este ano",
  "12m": "12 meses",
} as const;
export type ChavePeriodo = keyof typeof PERIODOS | "personalizado";

export type Periodo = { de: string; ate: string; meses: string[]; nome: string };
export type Periodos = { chave: ChavePeriodo; atual: Periodo; anterior: Periodo; anoAnterior: Periodo; emAndamento: boolean };

export const MAX_MESES = 24;

const mesValido = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function mesesEntre(de: string, ate: string): string[] {
  const [a1, m1] = de.split("-").map(Number), [a2, m2] = ate.split("-").map(Number);
  const n = (a2 - a1) * 12 + (m2 - m1) + 1;
  return Array.from({ length: Math.max(0, n) }, (_, i) => `${deslocarMes(de, i)}-01`);
}

// "outubro de 2026" para um mês, "2026" para o ano inteiro, "jan/26 a mar/26" no resto
export function nomePeriodo(de: string, ate: string) {
  if (de === ate) return `${MESES_LONGOS[Number(de.slice(5, 7)) - 1]} de ${de.slice(0, 4)}`;
  if (de.endsWith("-01") && ate.endsWith("-12") && de.slice(0, 4) === ate.slice(0, 4)) return de.slice(0, 4);
  return `${rotuloMes(de)} a ${rotuloMes(ate)}`;
}

function periodo(de: string, ate: string): Periodo {
  return { de, ate, meses: mesesEntre(de, ate), nome: nomePeriodo(de, ate) };
}

// Período escolhido (atalho ou de/até em AAAA-MM) e as duas bases de comparação.
export function resolverPeriodo(chave: unknown, hoje: string, de?: unknown, ate?: unknown): Periodos {
  const mesAtual = hoje.slice(0, 7);
  let k: ChavePeriodo = typeof chave === "string" && (chave in PERIODOS || chave === "personalizado") ? (chave as ChavePeriodo) : "mes";
  let ini = mesAtual, fim = mesAtual;
  if (k === "personalizado" && mesValido(de) && mesValido(ate)) {
    [ini, fim] = de <= ate ? [de, ate] : [ate, de];
    // no máximo 24 meses: guarda o fim e encurta o começo
    if (mesesEntre(ini, fim).length > MAX_MESES) ini = deslocarMes(fim, 1 - MAX_MESES);
  } else {
    if (k === "personalizado") k = "mes";
    if (k === "mes-passado") ini = fim = deslocarMes(mesAtual, -1);
    if (k === "trimestre") ini = deslocarMes(mesAtual, -2);
    if (k === "semestre") ini = deslocarMes(mesAtual, -5);
    if (k === "ano") ini = `${mesAtual.slice(0, 4)}-01`;
    if (k === "12m") ini = deslocarMes(mesAtual, -11);
  }
  const n = mesesEntre(ini, fim).length;
  return {
    chave: k,
    atual: periodo(ini, fim),
    anterior: periodo(deslocarMes(ini, -n), deslocarMes(ini, -1)),
    anoAnterior: periodo(deslocarMes(ini, -12), deslocarMes(fim, -12)),
    emAndamento: fim >= mesAtual,
  };
}

// Primeiro e último dia de tudo que a análise precisa ler (os três períodos)
export function janelaDeLeitura(p: Periodos) {
  const de = [p.atual.de, p.anterior.de, p.anoAnterior.de].sort()[0];
  const [a, m] = p.atual.ate.split("-").map(Number);
  return { de: `${de}-01`, ate: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) };
}

// Variação % sobre a base; null quando não há base para comparar
export function variacao(valor: number, base: number | null | undefined): number | null {
  if (base === null || base === undefined || base === 0) return null;
  return ((valor - base) / Math.abs(base)) * 100;
}

// Um indicador: valor no período, nas duas bases e a série mês a mês do período.
export type Comparado = { valor: number | null; anterior: number | null; anoAnterior: number | null; serie: (number | null)[] };

function comparar(p: Periodos, calc: (meses: Set<string>) => number | null): Comparado {
  const em = (meses: string[]) => calc(new Set(meses));
  return {
    valor: em(p.atual.meses),
    anterior: em(p.anterior.meses),
    anoAnterior: em(p.anoAnterior.meses),
    serie: p.atual.meses.map((m) => em([m])),
  };
}

const mesDe = (data: string) => `${data.slice(0, 7)}-01`;
const soma = <T>(itens: T[], f: (i: T) => number) => itens.reduce((s, i) => s + f(i), 0);

// ---------------------------------------------------------------------------
// Financeiro: visão operacional da DRE (receita, custos e despesas operacionais)
// ---------------------------------------------------------------------------

const OPERACIONAIS = ["receita_operacional", "custo_operacional", "despesa_operacional"];
const sinal = (l: { tipo: string }) => (l.tipo === "receber" ? 1 : -1);

export type Meta = { mes: string; grupo: string; sentido: string; orcado_cents: number };

export function resumoFinanceiro(linhas: LinhaResultado[], p: Periodos, metas: Meta[] = []) {
  const dos = (meses: Set<string>) => linhas.filter((l) => meses.has(mesDe(l.mes)));
  const receita = (ls: LinhaResultado[]) => soma(ls.filter((l) => l.grupo === "receita_operacional"), (l) => sinal(l) * Number(l.valor_cents));
  // custos e despesas operacionais como valor positivo (as "outras receitas" do grupo abatem)
  const gastos = (ls: LinhaResultado[]) => -soma(ls.filter((l) => l.grupo === "custo_operacional" || l.grupo === "despesa_operacional"), (l) => sinal(l) * Number(l.valor_cents));
  const temDados = (ls: LinhaResultado[]) => ls.some((l) => OPERACIONAIS.includes(l.grupo));

  const rec = comparar(p, (m) => { const ls = dos(m); return temDados(ls) ? receita(ls) : null; });
  const gas = comparar(p, (m) => { const ls = dos(m); return temDados(ls) ? gastos(ls) : null; });
  const res = comparar(p, (m) => { const ls = dos(m); return temDados(ls) ? receita(ls) - gastos(ls) : null; });
  const margem = comparar(p, (m) => { const ls = dos(m); const r = receita(ls); return r > 0 ? ((r - gastos(ls)) / r) * 100 : null; });
  const caixa = comparar(p, (m) => { const ls = dos(m); return ls.length ? soma(ls, (l) => sinal(l) * Number(l.valor_cents)) : null; });

  // Gasto por categoria no período e o que mais mudou sobre o período anterior
  const porCategoria = (ls: LinhaResultado[]) => {
    const mapa = new Map<string, number>();
    for (const l of ls) {
      if (l.grupo !== "custo_operacional" && l.grupo !== "despesa_operacional") continue;
      mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) - sinal(l) * Number(l.valor_cents));
    }
    return mapa;
  };
  const atual = porCategoria(dos(new Set(p.atual.meses)));
  const antes = porCategoria(dos(new Set(p.anterior.meses)));
  const ordem = [...atual.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const resto = soma(ordem.slice(6), ([, v]) => v);
  const categorias = [...ordem.slice(0, 6).map(([nome, valor]) => ({ nome, valor })), ...(resto > 0 ? [{ nome: "Outros", valor: resto }] : [])];
  const nomes = new Set([...atual.keys(), ...antes.keys()]);
  const variacoes = [...nomes].map((nome) => {
    const a = atual.get(nome) ?? 0, b = antes.get(nome) ?? 0;
    return { nome, atual: a, anterior: b, delta: a - b, pct: variacao(a, b) };
  }).filter((v) => v.delta !== 0).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 6);

  // Orçamento (competência) do período, quando a empresa preencheu
  const doPeriodo = metas.filter((m) => p.atual.meses.includes(mesDe(m.mes)));
  const metaReceita = soma(doPeriodo.filter((m) => m.grupo === "receita_operacional"), (m) => (m.sentido === "entrada" ? 1 : -1) * Number(m.orcado_cents));
  const metaGastos = soma(doPeriodo.filter((m) => m.grupo === "custo_operacional" || m.grupo === "despesa_operacional"), (m) => (m.sentido === "saida" ? 1 : -1) * Number(m.orcado_cents));

  return {
    receita: rec, gastos: gas, resultado: res, margem, caixa, categorias, variacoes,
    meta: metaReceita > 0 || metaGastos > 0 ? { receita: metaReceita || null, gastos: metaGastos || null } : null,
    vazio: rec.valor === null && gas.valor === null,
  };
}

// ---------------------------------------------------------------------------
// Produção: ração dada, taxa de alimentação, biomassa estimada e mortalidade
// ---------------------------------------------------------------------------

export type DiaLote = { data: string; peixes: number | null; baixas_peixes: number | null; racao_kg: number | null; biomassa_kg: number | null };

export function resumoProducao(dias: DiaLote[], p: Periodos) {
  const dos = (meses: Set<string>) => dias.filter((d) => meses.has(mesDe(d.data)));
  const racao = comparar(p, (m) => { const ds = dos(m); return ds.length ? soma(ds, (d) => Number(d.racao_kg ?? 0)) : null; });
  // ração do dia sobre a biomassa estimada do dia, na média dos dias apontados (% da biomassa por dia)
  const taxa = comparar(p, (m) => {
    const ds = dos(m).filter((d) => Number(d.biomassa_kg ?? 0) > 0), bio = soma(ds, (d) => Number(d.biomassa_kg));
    return bio ? (100 * soma(ds, (d) => Number(d.racao_kg ?? 0))) / bio : null;
  });
  // biomassa estimada no último dia apontado do período, somando os lotes
  const biomassa = comparar(p, (m) => {
    const ds = dos(m);
    if (!ds.length) return null;
    const ultimo = ds.reduce((u, d) => (d.data > u ? d.data : u), ds[0].data);
    return soma(ds.filter((d) => d.data === ultimo), (d) => Number(d.biomassa_kg ?? 0));
  });
  // baixas sobre a média de peixes por dia apontado
  const mortalidade = comparar(p, (m) => {
    const ds = dos(m), datas = new Set(ds.map((d) => d.data)).size, peixes = soma(ds, (d) => Number(d.peixes ?? 0));
    return peixes ? (100 * soma(ds, (d) => Number(d.baixas_peixes ?? 0))) / (peixes / datas) : null;
  });
  const doAtual = dos(new Set(p.atual.meses));
  const datas = new Set(doAtual.map((d) => d.data)).size;
  return { racao, taxa, biomassa, mortalidade, peixesMedios: datas ? Math.round(soma(doAtual, (d) => Number(d.peixes ?? 0)) / datas) : 0, vazio: racao.valor === null };
}

// ---------------------------------------------------------------------------
// Custo do kg por lote (custo_kg_lote) e composição do custo
// ---------------------------------------------------------------------------

export type CustoLote = {
  mes: string; lote_codigo: string; custo_total_cents: number; ganho_kg: number | null; racao_kg: number | null;
  racao_cents: number; alevinos_cents: number; sanidade_cents: number; mao_obra_cents: number;
  energia_cents: number; embalagem_cents: number; outros_diretos_cents: number; indiretos_rateados_cents: number;
};

const COMPOSICAO: [keyof CustoLote, string][] = [
  ["racao_cents", "Ração"], ["alevinos_cents", "Alevinos e juvenis"], ["mao_obra_cents", "Mão de obra"],
  ["sanidade_cents", "Sanidade"], ["energia_cents", "Energia"], ["embalagem_cents", "Embalagem"],
  ["outros_diretos_cents", "Outros diretos"], ["indiretos_rateados_cents", "Indiretos rateados"],
];

export function resumoCusto(custos: CustoLote[], p: Periodos) {
  const dos = (meses: Set<string>) => custos.filter((c) => meses.has(mesDe(c.mes)));
  // biomassa ganha: só a positiva; o lote que perdeu peso entra no custo e não no ganho (como custo_kg_lote)
  const ganho = (cs: CustoLote[]) => soma(cs, (c) => Math.max(0, Number(c.ganho_kg ?? 0)));
  // centavos por kg de peixe produzido (com fração)
  const porKg = (cs: CustoLote[]) => { const g = ganho(cs); return g ? soma(cs, (c) => Number(c.custo_total_cents)) / g : null; };
  const custoKg = comparar(p, (m) => porKg(dos(m)));
  // conversão alimentar: kg de ração por kg de peixe ganho
  const conversao = comparar(p, (m) => { const cs = dos(m), g = ganho(cs); return g ? soma(cs, (c) => Number(c.racao_kg ?? 0)) / g : null; });
  const doAtual = dos(new Set(p.atual.meses));
  const lotes = new Map<string, CustoLote[]>();
  for (const c of doAtual) lotes.set(c.lote_codigo, [...(lotes.get(c.lote_codigo) ?? []), c]);
  const total = soma(doAtual, (c) => Number(c.custo_total_cents));
  return {
    custoKg,
    conversao,
    lotes: [...lotes.entries()].map(([lote, cs]) => ({ lote, custoKg: porKg(cs), ganhoKg: ganho(cs), total: soma(cs, (c) => Number(c.custo_total_cents)) }))
      .filter((l) => l.custoKg !== null).sort((a, b) => (b.custoKg ?? 0) - (a.custoKg ?? 0)),
    composicao: COMPOSICAO.map(([k, nome]) => ({ nome, valor: soma(doAtual, (c) => Number(c[k] ?? 0)) })).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor),
    total,
    vazio: custoKg.valor === null,
  };
}

// ---------------------------------------------------------------------------
// Vendas faturadas (vendas_itens)
// ---------------------------------------------------------------------------

export type ItemPeriodo = { mes: string; cliente_id: string; cliente: string; kg: number; total_cents: number };

export function resumoVendasPeriodo(itens: ItemPeriodo[], p: Periodos) {
  const dos = (meses: Set<string>) => itens.filter((i) => meses.has(mesDe(i.mes)));
  const faturamento = comparar(p, (m) => { const is = dos(m); return is.length ? soma(is, (i) => Number(i.total_cents)) : null; });
  const kg = comparar(p, (m) => { const is = dos(m); return is.length ? soma(is, (i) => Number(i.kg)) : null; });
  const precoKg = comparar(p, (m) => { const is = dos(m), k = soma(is, (i) => Number(i.kg)); return k ? soma(is, (i) => Number(i.total_cents)) / k : null; });
  const doAtual = dos(new Set(p.atual.meses));
  const total = soma(doAtual, (i) => Number(i.total_cents));
  const porCliente = new Map<string, { nome: string; valor: number }>();
  for (const i of doAtual) {
    const c = porCliente.get(i.cliente_id) ?? { nome: i.cliente, valor: 0 };
    c.valor += Number(i.total_cents);
    porCliente.set(i.cliente_id, c);
  }
  const clientes = [...porCliente.values()].sort((a, b) => b.valor - a.valor).map((c) => ({ ...c, participacao: total ? (c.valor / total) * 100 : 0 }));
  return {
    faturamento, kg, precoKg,
    clientes: clientes.slice(0, 6),
    numClientes: clientes.length,
    concentracaoTop3: soma(clientes.slice(0, 3), (c) => c.participacao),
    vazio: faturamento.valor === null,
  };
}

// ---------------------------------------------------------------------------
// Destaques: frases curtas, cada uma apoiada num número que está na tela
// ---------------------------------------------------------------------------

export type Financeiro = ReturnType<typeof resumoFinanceiro>;
export type Producao = ReturnType<typeof resumoProducao>;
export type Custo = ReturnType<typeof resumoCusto>;
export type Vendas = ReturnType<typeof resumoVendasPeriodo>;
export type Tom = "positivo" | "perigo" | "neutro";
export type Destaque = { tom: Tom; texto: string; acao?: string };

export type Analise = {
  periodos: Periodos;
  regime: "caixa" | "competencia";
  financeiro: Financeiro | null;
  producao: Producao | null;
  custo: Custo | null;
  vendas: Vendas | null;
};

export const sinalPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatarNumero(Math.abs(v), Math.abs(v) < 10 ? 1 : 0)}%`;
// pontos percentuais: duas casas abaixo de 1 ponto (mortalidade), sem "−0,0" quando arredonda a zero
export const sinalPontos = (v: number) => {
  const casas = Math.abs(v) < 1 ? 2 : 1, r = Number(v.toFixed(casas));
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${formatarNumero(Math.abs(r), casas)} p.p.`;
};
const pct = (v: number, casas = 0) => `${formatarNumero(Math.abs(v), casas)}%`;
const pontos = (v: number) => `${formatarNumero(Math.abs(v), 1).replace(/,0$/, "")} ${Math.abs(v) >= 1 && Math.abs(v) < 2 ? "ponto" : "pontos"}`;

export function destaques(a: Analise): Destaque[] {
  const lista: Destaque[] = [];
  const f = a.financeiro, pr = a.producao, c = a.custo, v = a.vendas;

  if (f && !f.vazio && f.resultado.valor !== null) {
    const d = variacao(f.resultado.valor, f.resultado.anterior);
    if (d !== null && Math.abs(d) >= 1) {
      const subiu = f.resultado.valor > (f.resultado.anterior ?? 0);
      lista.push({ tom: subiu ? "positivo" : "perigo", texto: `Resultado operacional ${subiu ? "melhorou" : "piorou"} ${formatarMoeda(Math.abs(f.resultado.valor - (f.resultado.anterior ?? 0)))} sobre ${a.periodos.anterior.nome} (${formatarMoeda(f.resultado.anterior)} → ${formatarMoeda(f.resultado.valor)}).` });
    }
    if (f.meta?.receita && f.receita.valor !== null) {
      const d2 = variacao(f.receita.valor, f.meta.receita)!;
      lista.push({ tom: d2 >= 0 ? "positivo" : "perigo", texto: `Receita ${d2 >= 0 ? "acima" : "abaixo"} do orçado em ${pct(d2)} (${formatarMoeda(f.receita.valor)} de ${formatarMoeda(f.meta.receita)}).` });
    }
    const alta = f.variacoes.find((x) => x.delta > 0 && (x.pct === null || x.pct >= 10));
    if (alta) {
      lista.push({
        tom: "perigo",
        texto: `${alta.nome} subiu ${formatarMoeda(alta.delta)}${alta.pct === null ? "" : ` (+${pct(alta.pct)})`} sobre ${a.periodos.anterior.nome}.`,
        acao: `Revise as compras e contratos de ${alta.nome.toLocaleLowerCase("pt-BR")}.`,
      });
    }
    const queda = f.variacoes.find((x) => x.delta < 0);
    if (queda) lista.push({ tom: "positivo", texto: `${queda.nome} caiu ${formatarMoeda(-queda.delta)} sobre ${a.periodos.anterior.nome}.` });
  }

  if (pr && !pr.vazio && pr.mortalidade.valor !== null && pr.mortalidade.anterior !== null) {
    const d = pr.mortalidade.valor - pr.mortalidade.anterior;
    if (Math.abs(d) >= 0.5) {
      lista.push({
        tom: d > 0 ? "perigo" : "positivo",
        texto: `Mortalidade ${d > 0 ? "subiu" : "caiu"} ${pontos(d)} (${formatarNumero(pr.mortalidade.anterior, 2)}% → ${formatarNumero(pr.mortalidade.valor, 2)}%).`,
        acao: d > 0 ? "Confira o oxigênio, a amônia e as causas das baixas dos viveiros em Indicadores zootécnicos." : undefined,
      });
    }
  }

  if (c && !c.vazio && c.custoKg.valor !== null) {
    if (v && v.precoKg.valor !== null) {
      const margem = ((v.precoKg.valor - c.custoKg.valor) / v.precoKg.valor) * 100;
      lista.push({
        tom: margem >= 0 ? "positivo" : "perigo",
        texto: `O kg do peixe custou ${formatarMoeda(Math.round(c.custoKg.valor))} e foi vendido a ${formatarMoeda(Math.round(v.precoKg.valor))} em média: margem de ${margem < 0 ? "−" : ""}${pct(margem)}.`,
        acao: margem < 10 ? "Revise a tabela de preços ou a conversão alimentar: a ração costuma ser a maior parte do custo." : undefined,
      });
    }
    if (c.conversao.valor !== null && c.conversao.anterior !== null) {
      const d = c.conversao.valor - c.conversao.anterior;
      if (Math.abs(d) >= 0.1) {
        lista.push({
          tom: d > 0 ? "perigo" : "positivo",
          texto: `Conversão alimentar ${d > 0 ? "piorou" : "melhorou"} de ${formatarNumero(c.conversao.anterior, 2)} para ${formatarNumero(c.conversao.valor, 2)} kg de ração por kg de peixe.`,
          acao: d > 0 ? "Confira a ração dada contra a tabela, a sobra no trato e o oxigênio nas horas da alimentação." : undefined,
        });
      }
    }
    if (c.lotes.length > 1) {
      const caro = c.lotes[0], media = c.custoKg.valor;
      const acima = variacao(caro.custoKg!, media)!;
      if (acima >= 5) lista.push({ tom: "perigo", texto: `Lote ${caro.lote} tem o maior custo: ${formatarMoeda(Math.round(caro.custoKg!))} por kg, ${pct(acima)} acima da média da piscicultura.` });
    }
  }

  if (v && !v.vazio && v.numClientes >= 4 && v.concentracaoTop3 >= 60) {
    lista.push({ tom: "neutro", texto: `Os 3 maiores clientes somam ${pct(v.concentracaoTop3)} do faturamento.`, acao: "Concentração alta: vale buscar clientes novos para diluir o risco." });
  }
  if (v && !v.vazio && v.kg.valor !== null && v.kg.anterior) {
    const d = variacao(v.kg.valor, v.kg.anterior)!;
    if (Math.abs(d) >= 5) lista.push({ tom: d > 0 ? "positivo" : "perigo", texto: `Vendas em volume ${d > 0 ? "cresceram" : "caíram"} ${pct(d)}: ${textoKg(v.kg.valor, 0)} de peixe contra ${textoKg(v.kg.anterior, 0)}.` });
  }
  return lista.slice(0, 7);
}

// Frase de abertura: como foi o período, em uma linha
export function manchete(a: Analise) {
  const partes: string[] = [];
  const f = a.financeiro, pr = a.producao, v = a.vendas;
  if (f && !f.vazio && f.resultado.valor !== null) {
    const d = variacao(f.resultado.valor, f.resultado.anterior);
    partes.push(`resultado operacional de ${formatarMoeda(f.resultado.valor)}${d === null ? "" : ` (${d >= 0 ? "+" : "−"}${pct(d)} sobre o período anterior)`}`);
  }
  if (v && !v.vazio && v.faturamento.valor !== null) partes.push(`${formatarMoeda(v.faturamento.valor)} faturados`);
  if (pr && !pr.vazio && pr.racao.valor !== null) partes.push(`${textoKg(pr.racao.valor, 0)} de ração nos viveiros${pr.biomassa.valor ? `, ${textoKg(pr.biomassa.valor, 0)} de peixe estimados no fim` : ""}`);
  if (!partes.length) return `Sem lançamentos em ${a.periodos.atual.nome}.`;
  const texto = partes.join(", ");
  return `${a.periodos.atual.nome.charAt(0).toUpperCase()}${a.periodos.atual.nome.slice(1)}: ${texto}${a.periodos.emAndamento ? " (período em andamento)" : ""}.`;
}
