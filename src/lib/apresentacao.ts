// Apresentação pronta do resultado do período: a mesma análise da tela em slides 16:9.
// Aqui só o roteiro (puro, testável); apresentacao-pdf.ts e apresentacao-pptx.ts desenham.
// Regras (skill pbi-report-design): uma pergunta por slide, título que afirma o resultado,
// o mais importante em cima à esquerda, cor de destaque só para o que pede atenção.
import { destaques, manchete, sinalPct, sinalPontos, variacao, type Analise, type Comparado, type Destaque } from "./analise-periodo.ts";
import { formatarInteiro, formatarMoeda, formatarNumero, rotuloMes } from "./formato.ts";
import { numeroKg, textoKg } from "./pescado.ts";

// Cores do tema claro (globals.css): arquivos não leem variáveis CSS
export const CORES = {
  texto: "16181D", suave: "545A66", linha: "E3E5EA", fundo: "FFFFFF", faixa: "F5F3EF",
  marca: "0B7285", azul: "2A78D6", verde: "1BAF7A", laranja: "EB6834", violeta: "6250D6", amarelo: "EDA100",
  positivo: "13753A", perigo: "C62A26",
} as const;

export type TomSlide = "positivo" | "perigo" | "neutro";
export type KpiSlide = { rotulo: string; valor: string; comparacoes: { texto: string; tom: TomSlide }[] };
export type SerieSlide = { nome: string; cor: string; valores: number[] };
export type Slide =
  | { tipo: "capa"; titulo: string; subtitulo: string; detalhe: string }
  | { tipo: "resumo"; titulo: string; texto: string; kpis: KpiSlide[] }
  | { tipo: "colunas"; titulo: string; subtitulo: string; rotulos: string[]; series: SerieSlide[]; unidade: "moeda" | "numero"; nota?: string }
  | { tipo: "ranking"; titulo: string; subtitulo: string; itens: { nome: string; valor: number; texto: string }[]; cor: string; divergente?: boolean }
  | { tipo: "tabela"; titulo: string; subtitulo: string; cabecalho: string[]; linhas: string[][]; alinharDireita: number[] }
  | { tipo: "destaques"; titulo: string; itens: Destaque[] };

export type Roteiro = { empresa: string; periodo: string; rodape: string; slides: Slide[] };

// melhorSobe null: a variação não é boa nem ruim por si (ração dada cresce com o peixe), fica neutra
function comparacoes(cmp: Comparado, nomes: [string, string], melhorSobe: boolean | null = true, emPontos = false): KpiSlide["comparacoes"] {
  // em 12 meses o período anterior e o do ano passado são o mesmo: uma comparação só
  const bases = nomes[0] === nomes[1] ? [[cmp.anterior, nomes[0]] as const] : ([[cmp.anterior, nomes[0]], [cmp.anoAnterior, nomes[1]]] as const);
  return bases.map(([base, nome]) => {
    if (cmp.valor === null || base === null) return { texto: `vs ${nome}: sem dados`, tom: "neutro" as const };
    const d = emPontos ? cmp.valor - base : variacao(cmp.valor, base);
    if (d === null) return { texto: `vs ${nome}: sem base`, tom: "neutro" as const };
    const tom: TomSlide = Math.abs(d) < (emPontos ? 0.005 : 0.5) || melhorSobe === null ? "neutro" : (d > 0) === melhorSobe ? "positivo" : "perigo";
    return { texto: `${emPontos ? sinalPontos(d) : sinalPct(d)} vs ${nome}`, tom };
  });
}

const kpi = (rotulo: string, cmp: Comparado, formatar: (v: number) => string, nomes: [string, string], melhorSobe: boolean | null = true, emPontos = false): KpiSlide =>
  ({ rotulo, valor: cmp.valor === null ? "–" : formatar(cmp.valor), comparacoes: comparacoes(cmp, nomes, melhorSobe, emPontos) });

const moeda = (v: number) => formatarMoeda(Math.round(v));
const porcento = (casas: number) => (v: number) => `${formatarNumero(v, casas)}%`;

// Título que afirma o que aconteceu, com a comparação quando há base
function tituloVariacao(prefixo: string, cmp: Comparado, formatar: (v: number) => string, nomeBase: string) {
  if (cmp.valor === null) return `${prefixo}: sem lançamentos`;
  const d = variacao(cmp.valor, cmp.anterior);
  return `${prefixo} de ${formatar(cmp.valor)}${d === null ? "" : `, ${sinalPct(d)} sobre ${nomeBase}`}`;
}

export function montarRoteiro(a: Analise, empresa: string, geradoEm: string): Roteiro {
  const p = a.periodos, f = a.financeiro, pr = a.producao, c = a.custo, v = a.vendas;
  const nomes: [string, string] = [p.anterior.nome, p.anoAnterior.nome];
  const varios = p.atual.meses.length > 1;
  const rotulosMeses = p.atual.meses.map(rotuloMes);
  const rotulosBases = [rotuloMes(p.anoAnterior.meses[0]), rotuloMes(p.anterior.meses[0]), rotuloMes(p.atual.meses[0])];
  const tres = (cmp: Comparado) => [cmp.anoAnterior ?? 0, cmp.anterior ?? 0, cmp.valor ?? 0];
  const nomePeriodo = `${p.atual.nome.charAt(0).toUpperCase()}${p.atual.nome.slice(1)}`;
  const slides: Slide[] = [];

  slides.push({
    tipo: "capa",
    titulo: `Resultado de ${p.atual.nome}`,
    subtitulo: empresa,
    detalhe: `${a.regime === "caixa" ? "Regime de caixa" : "Regime de competência"} · comparado com ${nomes[0]}${nomes[0] === nomes[1] ? "" : ` e ${nomes[1]}`} · gerado em ${geradoEm}${p.emAndamento ? " · período em andamento" : ""}`,
  });

  const kpis: KpiSlide[] = [];
  if (f && !f.vazio) {
    kpis.push(kpi("Receita operacional", f.receita, moeda, nomes));
    kpis.push(kpi("Custos e despesas", f.gastos, moeda, nomes, false));
    kpis.push(kpi("Resultado operacional", f.resultado, moeda, nomes));
    kpis.push(kpi("Margem operacional", f.margem, porcento(1), nomes, true, true));
  }
  if (pr && !pr.vazio) {
    kpis.push(kpi("Biomassa estimada", pr.biomassa, (x) => textoKg(x, 0), nomes));
    kpis.push(kpi("Mortalidade", pr.mortalidade, porcento(2), nomes, false, true));
  }
  if (c && !c.vazio) kpis.push(kpi("Custo do kg produzido", c.custoKg, moeda, nomes, false));
  if (v && !v.vazio) kpis.push(kpi("Faturamento", v.faturamento, moeda, nomes));
  slides.push({ tipo: "resumo", titulo: "Resumo do período", texto: manchete(a), kpis: kpis.slice(0, 8) });

  if (f && !f.vazio) {
    slides.push({
      tipo: "colunas",
      titulo: tituloVariacao("Resultado operacional", f.resultado, moeda, nomes[0]),
      subtitulo: varios ? "Receita operacional × custos e despesas, mês a mês" : `Receita × custos em ${p.anoAnterior.nome}, ${p.anterior.nome} e ${p.atual.nome}`,
      rotulos: varios ? rotulosMeses : rotulosBases,
      series: [
        { nome: "Receita", cor: CORES.verde, valores: varios ? f.receita.serie.map((x) => x ?? 0) : tres(f.receita) },
        { nome: "Custos e despesas", cor: CORES.laranja, valores: varios ? f.gastos.serie.map((x) => x ?? 0) : tres(f.gastos) },
      ],
      unidade: "moeda",
      nota: f.meta?.receita && f.receita.valor !== null ? `Receita orçada no período: ${formatarMoeda(f.meta.receita)} (${formatarNumero((f.receita.valor / f.meta.receita) * 100, 0)}% atingido)` : undefined,
    });
    if (f.categorias.length) {
      const total = f.categorias.reduce((s, x) => s + x.valor, 0);
      slides.push({
        tipo: "ranking",
        titulo: `${f.categorias[0].nome} é o maior gasto: ${formatarNumero((f.categorias[0].valor / total) * 100, 0)}% do total`,
        subtitulo: `Custos e despesas operacionais por categoria · ${p.atual.nome}`,
        itens: f.categorias.map((x) => ({ nome: x.nome, valor: x.valor, texto: `${formatarMoeda(x.valor)} · ${formatarNumero((x.valor / total) * 100, 0)}%` })),
        cor: CORES.violeta,
      });
    }
    if (f.variacoes.length) {
      const maior = f.variacoes[0];
      slides.push({
        tipo: "ranking",
        titulo: `${maior.nome} foi o gasto que mais ${maior.delta > 0 ? "subiu" : "caiu"}: ${maior.delta > 0 ? "+" : "−"}${formatarMoeda(Math.abs(maior.delta))}`,
        subtitulo: `Variação por categoria sobre ${p.anterior.nome} · aumento em vermelho, queda em verde`,
        itens: f.variacoes.map((x) => ({ nome: x.nome, valor: x.delta, texto: `${x.delta > 0 ? "+" : "−"}${formatarMoeda(Math.abs(x.delta))}${x.pct === null ? " (novo)" : ` (${sinalPct(x.pct)})`}` })),
        cor: CORES.perigo,
        divergente: true,
      });
    }
  }

  if (pr && !pr.vazio) {
    const kg = (x: number | null) => Math.round(x ?? 0);
    slides.push({
      tipo: "colunas",
      titulo: tituloVariacao("Ração dada", pr.racao, (x) => textoKg(x, 0), nomes[0]),
      subtitulo: `Ração nos viveiros ${varios ? "por mês" : `em ${p.anoAnterior.nome}, ${p.anterior.nome} e ${p.atual.nome}`} · taxa ${pr.taxa.valor === null ? "–" : `${formatarNumero(pr.taxa.valor, 1)}% da biomassa por dia`} · mortalidade ${pr.mortalidade.valor === null ? "–" : `${formatarNumero(pr.mortalidade.valor, 2)}%`}`,
      rotulos: varios ? rotulosMeses : rotulosBases,
      series: [{ nome: "Ração (kg)", cor: CORES.amarelo, valores: varios ? pr.racao.serie.map(kg) : tres(pr.racao).map(kg) }],
      unidade: "numero",
      nota: `${pr.biomassa.valor === null ? "Sem biomassa estimada" : `${textoKg(pr.biomassa.valor, 0)} de peixe estimados no último dia apontado`} · ${formatarInteiro(pr.peixesMedios)} peixes em média`,
    });
  }

  if (c && !c.vazio && c.lotes.length) {
    const custoKg = c.custoKg.valor ?? 0;
    slides.push({
      tipo: "tabela",
      titulo: `O kg do peixe custou ${moeda(custoKg)}${v?.precoKg.valor ? ` e foi vendido a ${moeda(v.precoKg.valor)}` : ""}`,
      subtitulo: `Custo por lote · ${p.atual.nome}${c.conversao.valor !== null ? ` · conversão alimentar ${formatarNumero(c.conversao.valor, 2)}` : ""} · composição: ${c.composicao.slice(0, 3).map((x) => `${x.nome} ${formatarNumero((x.valor / c.total) * 100, 0)}%`).join(", ")}`,
      cabecalho: ["Lote", "Ganho (kg)", "Custo por kg", "Custo total", "vs média"],
      linhas: c.lotes.slice(0, 10).map((l) => {
        const d = variacao(l.custoKg!, c.custoKg.valor);
        return [l.lote, numeroKg(l.ganhoKg, 0), moeda(l.custoKg!), formatarMoeda(l.total), d === null ? "–" : sinalPct(d)];
      }),
      alinharDireita: [1, 2, 3, 4],
    });
  }

  if (v && !v.vazio) {
    slides.push({
      tipo: "ranking",
      titulo: tituloVariacao("Faturamento", v.faturamento, moeda, nomes[0]),
      subtitulo: `Maiores clientes · ${formatarInteiro(v.numClientes)} ${v.numClientes === 1 ? "cliente comprou" : "clientes compraram"}${v.numClientes >= 4 ? ` · os 3 maiores somam ${formatarNumero(v.concentracaoTop3, 0)}%` : ""}`,
      itens: v.clientes.map((x) => ({ nome: x.nome, valor: x.valor, texto: `${formatarMoeda(x.valor)} · ${formatarNumero(x.participacao, 0)}%` })),
      cor: CORES.azul,
    });
  }

  const lista = destaques(a);
  if (lista.length) slides.push({ tipo: "destaques", titulo: "Destaques e próximos passos", itens: lista });

  return { empresa, periodo: nomePeriodo, rodape: `${empresa} · ${nomePeriodo} · Balbina`, slides };
}
