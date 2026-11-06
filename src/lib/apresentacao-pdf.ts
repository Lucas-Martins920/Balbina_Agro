import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CORES, type Roteiro, type Slide } from "./apresentacao.ts";

// Apresentação em PDF 16:9 (960 × 540 pt), gráficos desenhados em vetor com o jsPDF.
// Assinatura visual igual em todo slide: fio laranja da marca acima do título e rodapé com empresa e página.

const L = 960, A = 540, M = 40;
type Cor = [number, number, number];
const rgb = (hex: string): Cor => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
// As fontes padrão do PDF só têm o alfabeto latino (WinAnsi): troca o que fica fora dele
export const textoPdf = (t: string) => t.replace(/−/g, "-").replace(/→/g, "->").replace(/[  ]/g, " ");

const curto = (v: number, unidade: "moeda" | "numero") => {
  const a = Math.abs(v), s = v < 0 ? "-" : "", pre = unidade === "moeda" ? "R$ " : "";
  const n = unidade === "moeda" ? a / 100 : a;
  if (n >= 1e6) return `${s}${pre}${(n / 1e6).toFixed(1).replace(".", ",").replace(",0", "")} mi`;
  if (n >= 1e4) return `${s}${pre}${Math.round(n / 1e3)} mil`;
  return `${s}${pre}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n)}`;
};

function escala(max: number) {
  const bruto = Math.max(1, max / 4), pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((x) => x >= bruto) ?? 10 * pot;
  return { passo, fim: Math.ceil(max / passo) * passo || passo };
}

function texto(doc: jsPDF, t: string, x: number, y: number, o: { tam?: number; cor?: string; negrito?: boolean; alinhar?: "left" | "right" | "center"; largura?: number } = {}) {
  doc.setFont("helvetica", o.negrito ? "bold" : "normal");
  doc.setFontSize(o.tam ?? 12);
  doc.setTextColor(...rgb(o.cor ?? CORES.texto));
  const linhas = o.largura ? doc.splitTextToSize(textoPdf(t), o.largura) : textoPdf(t);
  doc.text(linhas, x, y, { align: o.alinhar ?? "left", baseline: "alphabetic" });
  return Array.isArray(linhas) ? linhas.length : 1;
}

function cabecalho(doc: jsPDF, titulo: string, subtitulo?: string) {
  doc.setFillColor(...rgb(CORES.marca));
  doc.rect(M, 34, 36, 3, "F");
  // título longo diminui em vez de quebrar e empurrar o gráfico
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const tam = doc.getTextWidth(textoPdf(titulo)) > L - 2 * M ? 17 : 22;
  texto(doc, titulo, M, 68, { tam, negrito: true, largura: L - 2 * M });
  if (subtitulo) texto(doc, subtitulo, M, 90, { tam: 11, cor: CORES.suave, largura: L - 2 * M });
}

function rodape(doc: jsPDF, r: Roteiro, n: number, total: number) {
  doc.setDrawColor(...rgb(CORES.linha));
  doc.setLineWidth(0.6);
  doc.line(M, A - 30, L - M, A - 30);
  texto(doc, r.rodape, M, A - 16, { tam: 8, cor: CORES.suave });
  texto(doc, `${n} / ${total}`, L - M, A - 16, { tam: 8, cor: CORES.suave, alinhar: "right" });
}

function capa(doc: jsPDF, s: Extract<Slide, { tipo: "capa" }>) {
  doc.setFillColor(...rgb(CORES.faixa));
  doc.rect(0, 0, L, A, "F");
  doc.setFillColor(...rgb(CORES.marca));
  doc.rect(0, 0, 14, A, "F");
  texto(doc, s.subtitulo, 80, 200, { tam: 16, cor: CORES.suave });
  texto(doc, s.titulo, 80, 250, { tam: 40, negrito: true, largura: L - 160 });
  texto(doc, s.detalhe, 80, 300, { tam: 11, cor: CORES.suave, largura: L - 160 });
  texto(doc, "Balbina", 80, A - 50, { tam: 12, negrito: true, cor: CORES.marca });
}

function resumo(doc: jsPDF, s: Extract<Slide, { tipo: "resumo" }>) {
  cabecalho(doc, s.titulo);
  const linhas = texto(doc, s.texto, M, 100, { tam: 15, largura: L - 2 * M });
  const topo = 100 + linhas * 19 + 18, colunas = 4, gap = 16;
  const w = (L - 2 * M - gap * (colunas - 1)) / colunas, h = 118;
  s.kpis.forEach((k, i) => {
    const x = M + (i % colunas) * (w + gap), y = topo + Math.floor(i / colunas) * (h + gap);
    doc.setDrawColor(...rgb(CORES.linha));
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, w, h, 8, 8, "S");
    texto(doc, k.rotulo, x + 14, y + 22, { tam: 10, cor: CORES.suave });
    texto(doc, k.valor, x + 14, y + 52, { tam: 22, negrito: true });
    k.comparacoes.forEach((c, j) => texto(doc, c.texto, x + 14, y + 76 + j * 15, {
      tam: 9, negrito: c.tom !== "neutro", cor: c.tom === "positivo" ? CORES.positivo : c.tom === "perigo" ? CORES.perigo : CORES.suave, largura: w - 28,
    }));
  });
}

function colunas(doc: jsPDF, s: Extract<Slide, { tipo: "colunas" }>) {
  cabecalho(doc, s.titulo, s.subtitulo);
  const x0 = M + 64, x1 = L - M, y0 = 128, y1 = s.nota ? 452 : 470;
  const max = Math.max(1, ...s.series.flatMap((x) => x.valores));
  const { passo, fim } = escala(max);
  const y = (v: number) => y1 - (Math.max(0, v) / fim) * (y1 - y0);
  doc.setLineWidth(0.5);
  for (let v = 0; v <= fim + passo / 2; v += passo) {
    doc.setDrawColor(...rgb(CORES.linha));
    doc.line(x0, y(v), x1, y(v));
    texto(doc, curto(v, s.unidade), x0 - 8, y(v) + 3, { tam: 8, cor: CORES.suave, alinhar: "right" });
  }
  // legenda no canto direito, acima do gráfico
  let lx = x1;
  for (const serie of [...s.series].reverse()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const w = doc.getTextWidth(textoPdf(serie.nome));
    lx -= w;
    texto(doc, serie.nome, lx, y0 - 14, { tam: 9, cor: CORES.suave });
    doc.setFillColor(...rgb(serie.cor));
    doc.rect(lx - 12, y0 - 21, 8, 8, "F");
    lx -= 26;
  }
  const n = s.rotulos.length, grupo = (x1 - x0) / n;
  const barra = Math.min(36, (grupo * 0.7) / s.series.length);
  const rotularValores = n * s.series.length <= 16;
  s.rotulos.forEach((r, i) => {
    const centro = x0 + grupo * (i + 0.5), ini = centro - (barra * s.series.length) / 2;
    s.series.forEach((serie, j) => {
      const v = serie.valores[i] ?? 0, topo = y(v);
      doc.setFillColor(...rgb(serie.cor));
      if (v > 0) doc.rect(ini + j * barra + 1, topo, barra - 2, y1 - topo, "F");
      if (rotularValores && v > 0) texto(doc, curto(v, s.unidade), ini + j * barra + barra / 2, topo - 4, { tam: 7, cor: CORES.suave, alinhar: "center" });
    });
    texto(doc, r, centro, y1 + 14, { tam: 9, cor: CORES.suave, alinhar: "center" });
  });
  if (s.nota) texto(doc, s.nota, M, y1 + 36, { tam: 10, cor: CORES.suave });
}

function ranking(doc: jsPDF, s: Extract<Slide, { tipo: "ranking" }>) {
  cabecalho(doc, s.titulo, s.subtitulo);
  const topo = 128, linha = Math.min(46, (A - 60 - topo) / Math.max(1, s.itens.length));
  const xNome = M, xBarra = M + 250, largura = 430, xTexto = L - M;
  const max = Math.max(1, ...s.itens.map((i) => Math.abs(i.valor)));
  s.itens.forEach((it, i) => {
    const y = topo + i * linha + linha / 2;
    texto(doc, it.nome, xNome, y + 4, { tam: 11, largura: 240 });
    doc.setFillColor(...rgb(CORES.faixa));
    doc.rect(xBarra, y - 6, largura, 12, "F");
    if (s.divergente) {
      const meio = xBarra + largura / 2, w = (Math.abs(it.valor) / max) * (largura / 2);
      doc.setFillColor(...rgb(it.valor > 0 ? CORES.perigo : CORES.positivo));
      doc.rect(it.valor > 0 ? meio : meio - w, y - 6, w, 12, "F");
      doc.setDrawColor(...rgb(CORES.suave));
      doc.line(meio, y - 9, meio, y + 9);
    } else {
      doc.setFillColor(...rgb(s.cor));
      doc.rect(xBarra, y - 6, (it.valor / max) * largura, 12, "F");
    }
    texto(doc, it.texto, xTexto, y + 4, { tam: 11, negrito: true, alinhar: "right" });
  });
}

function tabela(doc: jsPDF, s: Extract<Slide, { tipo: "tabela" }>) {
  cabecalho(doc, s.titulo, s.subtitulo);
  autoTable(doc, {
    startY: 120,
    margin: { left: M, right: M },
    head: [s.cabecalho.map(textoPdf)],
    body: s.linhas.map((l) => l.map(textoPdf)),
    styles: { fontSize: 11, cellPadding: 7, textColor: rgb(CORES.texto), lineColor: rgb(CORES.linha), lineWidth: { bottom: 0.5 } },
    headStyles: { fillColor: rgb(CORES.faixa), textColor: rgb(CORES.suave), fontStyle: "bold" },
    // números à direita, no corpo e no cabeçalho
    didParseCell: (d) => { if (s.alinharDireita.includes(d.column.index)) d.cell.styles.halign = "right"; },
    theme: "plain",
  });
}

function listaDestaques(doc: jsPDF, s: Extract<Slide, { tipo: "destaques" }>) {
  cabecalho(doc, s.titulo);
  let y = 112;
  for (const d of s.itens) {
    doc.setFillColor(...rgb(d.tom === "positivo" ? CORES.positivo : d.tom === "perigo" ? CORES.perigo : CORES.suave));
    doc.circle(M + 5, y - 4, 4, "F");
    const n = texto(doc, d.texto, M + 20, y, { tam: 13, largura: L - 2 * M - 20 });
    y += n * 17;
    if (d.acao) y += texto(doc, `-> ${d.acao}`, M + 20, y, { tam: 11, cor: CORES.suave, largura: L - 2 * M - 20 }) * 15;
    y += 12;
  }
}

export function apresentacaoPdf(r: Roteiro): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [L, A] });
  doc.setProperties({ title: textoPdf(`${r.empresa} · ${r.periodo}`), creator: "Balbina" });
  r.slides.forEach((s, i) => {
    if (i > 0) doc.addPage([L, A], "landscape");
    if (s.tipo === "capa") capa(doc, s);
    if (s.tipo === "resumo") resumo(doc, s);
    if (s.tipo === "colunas") colunas(doc, s);
    if (s.tipo === "ranking") ranking(doc, s);
    if (s.tipo === "tabela") tabela(doc, s);
    if (s.tipo === "destaques") listaDestaques(doc, s);
    if (s.tipo !== "capa") rodape(doc, r, i + 1, r.slides.length);
  });
  return doc.output("arraybuffer");
}
