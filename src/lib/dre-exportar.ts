import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { cabecalhoTabela, faixaTitulo, FMT_PCT, FMT_REAIS, FONTE, impressao, LINHA_CABECALHO, PLANILHA, preenche } from "./planilha.ts";
import type { Dre, LinhaDre } from "./relatorios.ts";

// Exportação da DRE no mesmo formato do relatório "Realizado" do NIBO:
// uma coluna por mês de jan a dez, o total do ano e os valores em reais (saídas negativas).

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
// valores em centavos viram reais; o "%" vem em pontos percentuais e vira fração para o formato de % do Excel
const emReais = (_l: LinhaDre, v: number) => v / 100;
const destaque = (l: LinhaDre) => l.tipo === "grupo" || l.tipo === "subtotal" || l.tipo === "resultado";

export type CabecalhoDre = { empresa: string; regime: "caixa" | "competencia"; ano: number; centroCusto?: string; geradoEm?: string };

const titulo = (c: CabecalhoDre) =>
  `Resultado ${c.regime === "caixa" ? "realizado (caixa)" : "por competência"} ${c.ano}${c.centroCusto ? ` · ${c.centroCusto}` : ""}`;

function impressaoDre(ws: ExcelJS.Worksheet, c: CabecalhoDre) {
  impressao(ws, `${c.empresa} · ${titulo(c)}`);
}

const rodape = (c: CabecalhoDre) => `Gerado pelo Balbina${c.geradoEm ? ` em ${c.geradoEm}` : ""} · ${c.empresa} · ${titulo(c)}`;

export async function dreXlsx(dre: Dre, c: CabecalhoDre): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Balbina";
  wb.title = titulo(c);
  const colunas = 14;
  const ws = wb.addWorksheet(c.regime === "caixa" ? "Realizado" : "Competência", {
    views: [{ state: "frozen", xSplit: 1, ySplit: LINHA_CABECALHO, showGridLines: false }],
    properties: { tabColor: { argb: PLANILHA.marca } },
  });
  ws.columns = [{ width: 46 }, ...MESES.map(() => ({ width: 13 })), { width: 15 }];
  faixaTitulo(ws, colunas, `Balbina · ${c.empresa}`, `${titulo(c)} · valores em R$`);
  const cab = ws.getRow(LINHA_CABECALHO);
  cab.values = ["Resultado", ...MESES, String(c.ano)];
  cabecalhoTabela(cab, colunas);

  for (const l of dre.linhas) {
    const row = ws.addRow([l.nome, ...l.valores.map((v) => emReais(l, v)), emReais(l, l.total)]);
    const forte = destaque(l) || l.tipo === "subgrupo";
    const fundo = l.tipo === "resultado" ? PLANILHA.marcaSuave : l.tipo === "grupo" || l.tipo === "subtotal" ? PLANILHA.faixa : undefined;
    row.height = l.tipo === "resultado" ? 22 : l.tipo === "grupo" || l.tipo === "subtotal" ? 18 : 16;
    for (let i = 1; i <= colunas; i++) {
      const cel = row.getCell(i);
      cel.font = {
        name: FONTE, size: l.tipo === "resultado" ? 11 : 10, bold: forte, italic: l.tipo === "percentual",
        color: { argb: l.tipo === "percentual" ? PLANILHA.suave : PLANILHA.texto },
      };
      if (i > 1) cel.numFmt = l.tipo === "percentual" ? FMT_PCT : FMT_REAIS;
      cel.alignment = i === 1 ? { indent: 1 + l.nivel * 2, vertical: "middle" } : { vertical: "middle" };
      // coluna do ano em destaque leve em toda a tabela
      const cor = fundo ?? (i === colunas ? PLANILHA.faixa : undefined);
      if (cor) cel.fill = preenche(cor);
      cel.border = l.tipo === "resultado"
        ? { top: { style: "medium", color: { argb: PLANILHA.marca } }, bottom: { style: "medium", color: { argb: PLANILHA.marca } } }
        : l.tipo === "subtotal"
          ? { top: { style: "thin", color: { argb: PLANILHA.suave } }, bottom: { style: "hair", color: { argb: PLANILHA.linha } } }
          : { bottom: { style: "hair", color: { argb: PLANILHA.linha } } };
    }
    // total do ano sempre em negrito, menos na linha de % (que fica discreta)
    if (l.tipo !== "percentual") row.getCell(colunas).font = { ...row.getCell(colunas).font, bold: true };
  }
  ws.addRow([]);
  const nota = ws.addRow([rodape(c)]);
  nota.getCell(1).font = { name: FONTE, italic: true, size: 9, color: { argb: PLANILHA.suave } };
  impressaoDre(ws, c);

  resumo(wb, dre, c);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// Aba "Resumo": as linhas-chave da DRE com o total do ano e o peso sobre a receita
function resumo(wb: ExcelJS.Workbook, dre: Dre, c: CabecalhoDre) {
  const ws = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }], properties: { tabColor: { argb: PLANILHA.texto } } });
  ws.columns = [{ width: 40 }, { width: 18 }, { width: 16 }];
  faixaTitulo(ws, 3, `Balbina · ${c.empresa}`, `${titulo(c)} · resumo do ano`);
  const receita = dre.receita.reduce((s, v) => s + v, 0);
  const cab = ws.getRow(LINHA_CABECALHO);
  cab.values = ["Indicador", `Total ${c.ano} (R$)`, "% da receita"];
  cabecalhoTabela(cab, 3);
  for (const l of dre.linhas.filter((x) => destaque(x))) {
    const row = ws.addRow([l.nome, emReais(l, l.total), receita ? l.total / receita : null]);
    row.height = l.tipo === "resultado" ? 22 : 18;
    for (let i = 1; i <= 3; i++) {
      const cel = row.getCell(i);
      cel.font = { name: FONTE, size: l.tipo === "resultado" ? 11 : 10, bold: l.tipo !== "grupo", color: { argb: PLANILHA.texto } };
      cel.alignment = i === 1 ? { indent: 1, vertical: "middle" } : { vertical: "middle" };
      if (i === 2) cel.numFmt = FMT_REAIS;
      if (i === 3) cel.numFmt = FMT_PCT;
      if (l.tipo === "resultado") {
        cel.fill = preenche(PLANILHA.marcaSuave);
        cel.border = { top: { style: "medium", color: { argb: PLANILHA.marca } }, bottom: { style: "medium", color: { argb: PLANILHA.marca } } };
      } else cel.border = { bottom: { style: "hair", color: { argb: PLANILHA.linha } } };
    }
  }
  ws.addRow([]);
  const info: [string, string][] = [
    ["Empresa", c.empresa],
    ["Regime", c.regime === "caixa" ? "Caixa: quando o dinheiro entrou ou saiu" : "Competência: o mês a que a receita ou despesa pertence"],
    ["Centro de custo", c.centroCusto ?? "Todos"],
    ...(c.geradoEm ? [["Gerado em", c.geradoEm] as [string, string]] : []),
  ];
  for (const [k, v] of info) {
    const row = ws.addRow([k, v]);
    row.getCell(1).font = { name: FONTE, size: 9, bold: true, color: { argb: PLANILHA.suave } };
    row.getCell(2).font = { name: FONTE, size: 9, color: { argb: PLANILHA.suave } };
  }
  ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

const reais = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const celula = (l: LinhaDre, v: number) => (l.tipo === "percentual" ? `${pct.format(v)}%` : v === 0 ? "–" : reais.format(v / 100));

export function drePdf(dre: Dre, c: CabecalhoDre): ArrayBuffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(12);
  doc.text(c.empresa, 28, 30);
  doc.setFontSize(9);
  doc.text(titulo(c), 28, 44);
  autoTable(doc, {
    startY: 54,
    margin: { left: 28, right: 28 },
    head: [["Resultado", ...MESES, String(c.ano)]],
    body: dre.linhas.map((l) => [`${"   ".repeat(l.nivel)}${l.nome}`, ...l.valores.map((v) => celula(l, v)), celula(l, l.total)]),
    styles: { fontSize: 6, cellPadding: 2, halign: "right", overflow: "ellipsize" },
    headStyles: { fillColor: [60, 52, 40], textColor: 255, halign: "center" },
    columnStyles: { 0: { halign: "left", cellWidth: 150 } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const l = dre.linhas[d.row.index];
      if (destaque(l) || l.tipo === "subgrupo") d.cell.styles.fontStyle = "bold";
      if (l.tipo === "grupo") d.cell.styles.fillColor = [240, 235, 225];
      if (l.tipo === "resultado") d.cell.styles.fillColor = [250, 236, 200];
    },
    didDrawPage: (d) => {
      doc.setFontSize(7);
      doc.text(`Página ${d.pageNumber} · gerado pelo Balbina`, 28, doc.internal.pageSize.getHeight() - 14);
    },
  });
  return doc.output("arraybuffer");
}

// paraCsv recebe centavos; a linha de % vai como texto
export function dreCsvLinhas(dre: Dre, c: CabecalhoDre): (string | number | null)[][] {
  const v = (l: LinhaDre, x: number) => (l.tipo === "percentual" ? `${pct.format(x)}%` : x);
  return [["Resultado", ...MESES, String(c.ano)],
    ...dre.linhas.map((l) => [`${"  ".repeat(l.nivel)}${l.nome}`, ...l.valores.map((x) => v(l, x)), v(l, l.total)])];
}
