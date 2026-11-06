import PptxGenJS from "pptxgenjs";
import { CORES, type Roteiro, type Slide } from "./apresentacao.ts";

// Apresentação em PowerPoint: mesmo roteiro do PDF, com gráficos nativos (editáveis no PowerPoint,
// Keynote e Google Slides). Medidas em polegadas no slide 16:9 de 10 × 5,625; 1 pt do PDF = 1/96 pol.

const pol = (pt: number) => pt / 96;
const M = pol(40), L = 10, A = 5.625;
const FONTE = "Segoe UI";

type Pptx = InstanceType<typeof PptxGenJS>;
type PptxSlide = ReturnType<Pptx["addSlide"]>;

function cabecalho(s: PptxSlide, titulo: string, subtitulo?: string) {
  s.addShape("rect", { x: M, y: pol(34), w: pol(36), h: pol(3), fill: { color: CORES.marca }, line: { color: CORES.marca, width: 0 } });
  s.addText(titulo, { x: M, y: pol(42), w: L - 2 * M, h: pol(36), fontFace: FONTE, fontSize: 22, bold: true, color: CORES.texto, fit: "shrink", margin: 0 });
  if (subtitulo) s.addText(subtitulo, { x: M, y: pol(78), w: L - 2 * M, h: pol(22), fontFace: FONTE, fontSize: 11, color: CORES.suave, margin: 0 });
}

function rodape(s: PptxSlide, r: Roteiro, n: number, total: number) {
  s.addShape("line", { x: M, y: A - pol(30), w: L - 2 * M, h: 0, line: { color: CORES.linha, width: 0.6 } });
  s.addText(r.rodape, { x: M, y: A - pol(26), w: 6, h: pol(16), fontFace: FONTE, fontSize: 8, color: CORES.suave, margin: 0 });
  s.addText(`${n} / ${total}`, { x: L - M - 1, y: A - pol(26), w: 1, h: pol(16), fontFace: FONTE, fontSize: 8, color: CORES.suave, align: "right", margin: 0 });
}

const corTom = (tom: string) => (tom === "positivo" ? CORES.positivo : tom === "perigo" ? CORES.perigo : CORES.suave);

function desenhar(pres: Pptx, s: PptxSlide, sl: Slide) {
  if (sl.tipo === "capa") {
    s.background = { color: CORES.faixa };
    s.addShape("rect", { x: 0, y: 0, w: pol(14), h: A, fill: { color: CORES.marca }, line: { color: CORES.marca, width: 0 } });
    s.addText(sl.subtitulo, { x: pol(80), y: pol(170), w: L - pol(160), h: pol(30), fontFace: FONTE, fontSize: 16, color: CORES.suave, margin: 0 });
    s.addText(sl.titulo, { x: pol(80), y: pol(205), w: L - pol(160), h: pol(60), fontFace: FONTE, fontSize: 40, bold: true, color: CORES.texto, fit: "shrink", margin: 0 });
    s.addText(sl.detalhe, { x: pol(80), y: pol(280), w: L - pol(160), h: pol(40), fontFace: FONTE, fontSize: 11, color: CORES.suave, margin: 0, valign: "top" });
    s.addText("Balbina", { x: pol(80), y: A - pol(70), w: 2, h: pol(24), fontFace: FONTE, fontSize: 12, bold: true, color: CORES.marca, margin: 0 });
    return;
  }

  if (sl.tipo === "resumo") {
    cabecalho(s, sl.titulo);
    s.addText(sl.texto, { x: M, y: pol(84), w: L - 2 * M, h: pol(80), fontFace: FONTE, fontSize: 14, color: CORES.texto, margin: 0, valign: "top", fit: "shrink" });
    const colunas = 4, gap = pol(16), w = (L - 2 * M - gap * (colunas - 1)) / colunas, h = pol(118), topo = pol(176);
    sl.kpis.forEach((k, i) => {
      const x = M + (i % colunas) * (w + gap), y = topo + Math.floor(i / colunas) * (h + gap);
      s.addShape("roundRect", { x, y, w, h, rectRadius: 0.08, fill: { color: CORES.fundo }, line: { color: CORES.linha, width: 0.8 } });
      s.addText(k.rotulo, { x: x + pol(14), y: y + pol(10), w: w - pol(28), h: pol(18), fontFace: FONTE, fontSize: 10, color: CORES.suave, margin: 0 });
      s.addText(k.valor, { x: x + pol(14), y: y + pol(30), w: w - pol(28), h: pol(30), fontFace: FONTE, fontSize: 20, bold: true, color: CORES.texto, margin: 0, fit: "shrink" });
      s.addText(k.comparacoes.map((c, j) => ({ text: c.texto, options: { color: corTom(c.tom), bold: c.tom !== "neutro", breakLine: j < k.comparacoes.length - 1 } })),
        { x: x + pol(14), y: y + pol(66), w: w - pol(28), h: pol(40), fontFace: FONTE, fontSize: 9, margin: 0, valign: "top" });
    });
    return;
  }

  if (sl.tipo === "colunas") {
    cabecalho(s, sl.titulo, sl.subtitulo);
    s.addChart(pres.ChartType.bar, sl.series.map((x) => ({ name: x.nome, labels: sl.rotulos, values: sl.unidade === "moeda" ? x.valores.map((v) => v / 100) : x.valores })), {
      x: M, y: pol(110), w: L - 2 * M, h: pol(sl.nota ? 330 : 360),
      barDir: "col", barGrouping: "clustered", barGapWidthPct: 60,
      chartColors: sl.series.map((x) => x.cor),
      showLegend: sl.series.length > 1, legendPos: "t", legendFontFace: FONTE, legendFontSize: 9, legendColor: CORES.suave,
      catAxisLabelFontFace: FONTE, catAxisLabelFontSize: 9, catAxisLabelColor: CORES.suave, catAxisLineShow: false,
      valAxisLabelFontFace: FONTE, valAxisLabelFontSize: 8, valAxisLabelColor: CORES.suave, valAxisLineShow: false,
      valAxisLabelFormatCode: sl.unidade === "moeda" ? '"R$" #,##0' : "#,##0",
      valGridLine: { color: CORES.linha, size: 0.5 },
      valAxisMinVal: 0, // coluna sempre a partir do zero
      showValue: sl.rotulos.length * sl.series.length <= 16,
      dataLabelFormatCode: sl.unidade === "moeda" ? '"R$" #,##0' : "#,##0", dataLabelFontSize: 7, dataLabelColor: CORES.suave, dataLabelPosition: "outEnd",
    });
    if (sl.nota) s.addText(sl.nota, { x: M, y: pol(450), w: L - 2 * M, h: pol(20), fontFace: FONTE, fontSize: 10, color: CORES.suave, margin: 0 });
    return;
  }

  if (sl.tipo === "ranking") {
    cabecalho(s, sl.titulo, sl.subtitulo);
    const topo = pol(120), linha = Math.min(pol(46), (A - pol(60) - topo) / Math.max(1, sl.itens.length));
    const xBarra = M + pol(250), largura = pol(430);
    const max = Math.max(1, ...sl.itens.map((i) => Math.abs(i.valor)));
    sl.itens.forEach((it, i) => {
      const y = topo + i * linha + linha / 2;
      s.addText(it.nome, { x: M, y: y - pol(10), w: pol(240), h: pol(20), fontFace: FONTE, fontSize: 11, color: CORES.texto, margin: 0, fit: "shrink" });
      s.addShape("rect", { x: xBarra, y: y - pol(6), w: largura, h: pol(12), fill: { color: CORES.faixa }, line: { color: CORES.faixa, width: 0 } });
      if (sl.divergente) {
        const meio = xBarra + largura / 2, w = (Math.abs(it.valor) / max) * (largura / 2), cor = it.valor > 0 ? CORES.perigo : CORES.positivo;
        if (w > 0) s.addShape("rect", { x: it.valor > 0 ? meio : meio - w, y: y - pol(6), w, h: pol(12), fill: { color: cor }, line: { color: cor, width: 0 } });
        s.addShape("line", { x: meio, y: y - pol(9), w: 0, h: pol(18), line: { color: CORES.suave, width: 0.75 } });
      } else if (it.valor > 0) {
        s.addShape("rect", { x: xBarra, y: y - pol(6), w: (it.valor / max) * largura, h: pol(12), fill: { color: sl.cor }, line: { color: sl.cor, width: 0 } });
      }
      s.addText(it.texto, { x: L - M - pol(220), y: y - pol(10), w: pol(220), h: pol(20), fontFace: FONTE, fontSize: 11, bold: true, color: CORES.texto, align: "right", margin: 0 });
    });
    return;
  }

  if (sl.tipo === "tabela") {
    cabecalho(s, sl.titulo, sl.subtitulo);
    const celula = (t: string, i: number, cab: boolean) => ({
      text: t,
      options: { align: sl.alinharDireita.includes(i) ? ("right" as const) : ("left" as const), bold: cab, color: cab ? CORES.suave : CORES.texto, fill: cab ? { color: CORES.faixa } : undefined },
    });
    s.addTable([sl.cabecalho.map((t, i) => celula(t, i, true)), ...sl.linhas.map((l) => l.map((t, i) => celula(t, i, false)))], {
      x: M, y: pol(116), w: L - 2 * M, fontFace: FONTE, fontSize: 11, margin: 0.06,
      border: { type: "solid", color: CORES.linha, pt: 0.5 },
    });
    return;
  }

  cabecalho(s, sl.titulo);
  s.addText(sl.itens.flatMap((d, i) => [
    { text: d.texto, options: { bullet: { characterCode: "25CF" }, color: CORES.texto, fontSize: 14, breakLine: true, paraSpaceBefore: i ? 10 : 0 } },
    ...(d.acao ? [{ text: `→ ${d.acao}`, options: { color: CORES.suave, fontSize: 11, indentLevel: 1, breakLine: true } }] : []),
  ]), { x: M, y: pol(100), w: L - 2 * M, h: A - pol(150), fontFace: FONTE, valign: "top", margin: 0, fit: "shrink" });
}

export async function apresentacaoPptx(r: Roteiro): Promise<ArrayBuffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Balbina";
  pres.company = r.empresa;
  pres.title = `${r.empresa} · ${r.periodo}`;
  r.slides.forEach((sl, i) => {
    const s = pres.addSlide();
    desenhar(pres, s, sl);
    if (sl.tipo !== "capa") rodape(s, r, i + 1, r.slides.length);
  });
  return (await pres.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}
