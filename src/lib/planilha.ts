import ExcelJS from "exceljs";

// Visual comum das planilhas Excel que o Balbina exporta (Resultado, contas a pagar/receber, ponto...):
// faixa com a cor da marca no topo, subtítulo, cabeçalho escuro congelado, formatos brasileiros de R$ e %,
// linhas finas, sem grade, pronta para imprimir. As cores são as da apresentação (CORES em apresentacao.ts).

const argb = (hex: string) => `FF${hex}`;
export const PLANILHA = {
  marca: argb("0B7285"), marcaSuave: argb("D3EEF2"), texto: argb("16181D"), suave: argb("545A66"),
  linha: argb("E3E5EA"), faixa: argb("F5F3EF"), zebra: argb("FAF9F7"), branco: argb("FFFFFF"),
  positivo: argb("13753A"), perigo: argb("C62A26"),
} as const;
export const FONTE = "Calibri";
// reais com milhar, negativos em vermelho e zero como traço; % com uma casa
export const FMT_REAIS = '#,##0.00;[Red]-#,##0.00;"–"';
export const FMT_PCT = '0.0%;[Red]-0.0%;"–"';
export const FMT_DATA = "dd/mm/yyyy";
export const LINHA_CABECALHO = 4;

export const preenche = (cor: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: cor } });
const fio = (cor: string = PLANILHA.linha): Partial<ExcelJS.Borders> => ({ bottom: { style: "hair", color: { argb: cor } } });

// Faixa da marca (linha 1) e subtítulo (linha 2), mescladas sobre todas as colunas; a linha 3 é um respiro
export function faixaTitulo(ws: ExcelJS.Worksheet, colunas: number, texto: string, subtitulo: string) {
  ws.mergeCells(1, 1, 1, colunas);
  ws.mergeCells(2, 1, 2, colunas);
  const t = ws.getCell(1, 1);
  t.value = texto;
  t.font = { name: FONTE, size: 15, bold: true, color: { argb: PLANILHA.branco } };
  t.fill = preenche(PLANILHA.marca);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 30;
  const s = ws.getCell(2, 1);
  s.value = subtitulo;
  s.font = { name: FONTE, size: 10, color: { argb: PLANILHA.suave } };
  s.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 8;
}

// Cabeçalho escuro com fio da marca; a primeira coluna à esquerda e as numéricas à direita
export function cabecalhoTabela(row: ExcelJS.Row, colunas: number, direita: (coluna: number) => boolean = (i) => i > 1) {
  row.height = 22;
  for (let i = 1; i <= colunas; i++) {
    const cel = row.getCell(i);
    cel.font = { name: FONTE, size: 10, bold: true, color: { argb: PLANILHA.branco } };
    cel.fill = preenche(PLANILHA.texto);
    cel.alignment = { horizontal: direita(i) ? "center" : "left", vertical: "middle", indent: direita(i) ? 0 : 1, wrapText: true };
    cel.border = { bottom: { style: "medium", color: { argb: PLANILHA.marca } } };
  }
}

export function impressao(ws: ExcelJS.Worksheet, rodape: string, paisagem = true) {
  ws.pageSetup = {
    paperSize: 9, orientation: paisagem ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: `${LINHA_CABECALHO}:${LINHA_CABECALHO}`,
  };
  // & é código do cabeçalho do Excel: dobrado vira o próprio caractere
  ws.headerFooter = { oddFooter: `&L&8${rodape.replace(/&/g, "&&")}&R&8Página &P de &N · Balbina` };
}

export function notaRodape(ws: ExcelJS.Worksheet, texto: string) {
  ws.addRow([]);
  ws.addRow([texto]).getCell(1).font = { name: FONTE, italic: true, size: 9, color: { argb: PLANILHA.suave } };
}

// ---------- tabela simples (listas) ----------

// texto; centavos (inteiro em centavos, mostrado em R$); reais; data (ISO aaaa-mm-dd); inteiro; numero; pct (fração);
// horas ("HH:MM") e codigo (parcela, mês, matrícula) ficam como texto centralizado
export type TipoColuna = "texto" | "centavos" | "reais" | "data" | "inteiro" | "numero" | "pct" | "horas" | "codigo";
export type Celula = string | number | null | undefined;
export type ColunaPlanilha = {
  titulo: string;
  largura?: number;
  tipo?: TipoColuna;
  /** soma a coluna na linha de total */
  total?: boolean;
  /** cor do texto por valor da célula, ex.: { Vencida: "perigo" } */
  cores?: Record<string, "perigo" | "positivo" | "suave">;
};
export type AbaPlanilha = {
  nome: string;
  titulo: string;
  subtitulo: string;
  colunas: ColunaPlanilha[];
  linhas: Celula[][];
  /** linha de total no fim (só se alguma coluna tiver total) */
  rotuloTotal?: string;
  nota?: string;
  rodape?: string;
  retrato?: boolean;
};

const NUMERICAS: TipoColuna[] = ["centavos", "reais", "inteiro", "numero", "pct", "horas", "data", "codigo"];
const FORMATO: Partial<Record<TipoColuna, string>> = {
  centavos: FMT_REAIS, reais: FMT_REAIS, data: FMT_DATA, inteiro: "#,##0", numero: "#,##0.00", pct: FMT_PCT,
};

function valorCelula(v: Celula, tipo: TipoColuna): ExcelJS.CellValue {
  if (v === null || v === undefined || v === "") return null;
  if (tipo === "centavos" && typeof v === "number") return v / 100;
  if (tipo === "data" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }
  return v;
}

const letra = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export function abaTabela(wb: ExcelJS.Workbook, a: AbaPlanilha): ExcelJS.Worksheet {
  const n = a.colunas.length;
  const ws = wb.addWorksheet(a.nome.slice(0, 31), {
    views: [{ state: "frozen", xSplit: 0, ySplit: LINHA_CABECALHO, showGridLines: false }],
    properties: { tabColor: { argb: PLANILHA.marca } },
  });
  ws.columns = a.colunas.map((c) => ({ width: c.largura ?? 14 }));
  faixaTitulo(ws, n, a.titulo, a.subtitulo);
  const cab = ws.getRow(LINHA_CABECALHO);
  cab.values = a.colunas.map((c) => c.titulo);
  cabecalhoTabela(cab, n, (i) => NUMERICAS.includes(a.colunas[i - 1].tipo ?? "texto"));

  a.linhas.forEach((l, k) => {
    const row = ws.addRow(a.colunas.map((c, i) => valorCelula(l[i], c.tipo ?? "texto")));
    row.height = 17;
    a.colunas.forEach((c, i) => {
      const cel = row.getCell(i + 1);
      const tipo = c.tipo ?? "texto";
      const cor = c.cores?.[String(l[i] ?? "")];
      cel.font = { name: FONTE, size: 10, color: { argb: cor ? PLANILHA[cor] : PLANILHA.texto }, bold: Boolean(cor && cor !== "suave") };
      if (FORMATO[tipo]) cel.numFmt = FORMATO[tipo];
      cel.alignment = { vertical: "middle", horizontal: tipo === "horas" || tipo === "data" || tipo === "codigo" ? "center" : undefined, indent: tipo === "texto" ? 1 : 0 };
      if (k % 2 === 1) cel.fill = preenche(PLANILHA.zebra);
      cel.border = fio();
    });
  });

  const primeira = LINHA_CABECALHO + 1, ultima = LINHA_CABECALHO + a.linhas.length;
  if (a.linhas.length) ws.autoFilter = { from: { row: LINHA_CABECALHO, column: 1 }, to: { row: LINHA_CABECALHO, column: n } };
  if (!a.linhas.length) ws.addRow(["Nada para mostrar com estes filtros."]).getCell(1).font = { name: FONTE, italic: true, color: { argb: PLANILHA.suave } };
  if (a.colunas.some((c) => c.total)) {
    // SUBTOTAL(9) soma só as linhas visíveis: o total acompanha o filtro
    const row = ws.addRow(a.colunas.map((c, i) => {
      if (i === 0) return a.rotuloTotal ?? "Total";
      if (!c.total) return null;
      const soma = a.linhas.reduce((s, l) => s + (Number(valorCelula(l[i], c.tipo ?? "texto")) || 0), 0);
      return a.linhas.length ? { formula: `SUBTOTAL(9,${letra(i + 1)}${primeira}:${letra(i + 1)}${ultima})`, result: soma } : soma;
    }));
    row.height = 22;
    a.colunas.forEach((c, i) => {
      const cel = row.getCell(i + 1);
      cel.font = { name: FONTE, size: 11, bold: true, color: { argb: PLANILHA.texto } };
      cel.fill = preenche(PLANILHA.marcaSuave);
      cel.alignment = { vertical: "middle", indent: i === 0 ? 1 : 0 };
      if (c.total && FORMATO[c.tipo ?? "texto"]) cel.numFmt = FORMATO[c.tipo ?? "texto"]!;
      cel.border = { top: { style: "medium", color: { argb: PLANILHA.marca } }, bottom: { style: "medium", color: { argb: PLANILHA.marca } } };
    });
  }
  if (a.nota) notaRodape(ws, a.nota);
  impressao(ws, a.rodape ?? a.titulo, !a.retrato);
  return ws;
}

export async function planilhaXlsx(abas: AbaPlanilha[], titulo?: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Balbina";
  if (titulo) wb.title = titulo;
  for (const a of abas) abaTabela(wb, a);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// ---------- contas a pagar / a receber ----------

export type TituloPlanilha = {
  vencimento: string; competencia?: string | null; descricao: string; parcela_numero?: number | null; parcela_total?: number | null;
  contato_nome: string | null; categorias: string | null; centros_custo: string | null; valor_cents: number | string;
  pago_cents?: number | string | null; saldo_cents: number | string; situacao: string; referencia: string | null;
};

export function rotulosSituacao(tipo: "pagar" | "receber"): Record<string, string> {
  return { aberto: "Em aberto", parcial: "Parcial", vencido: "Vencida", quitado: tipo === "pagar" ? "Paga" : "Recebida", perda: "Perda", cancelado: "Excluída" };
}

const competenciaBr = (c?: string | null) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : "");

export function abaTitulos(tipo: "pagar" | "receber", titulos: TituloPlanilha[], o: { titulo: string; subtitulo: string; completa?: boolean; nota?: string }): AbaPlanilha {
  const rotulo = rotulosSituacao(tipo);
  const cores = { [rotulo.vencido]: "perigo", [rotulo.quitado]: "positivo", [rotulo.cancelado]: "suave", [rotulo.perda]: "suave" } as const;
  const contato = tipo === "pagar" ? "Fornecedor" : "Cliente";
  const completa = o.completa ?? false;
  const colunas: ColunaPlanilha[] = [
    { titulo: "Vencimento", tipo: "data", largura: 12 },
    ...(completa ? [{ titulo: "Competência", largura: 12, tipo: "codigo" as const }] : []),
    { titulo: "Descrição", largura: 38 },
    ...(completa ? [{ titulo: "Parcela", largura: 9, tipo: "codigo" as const }] : [{ titulo: "Documento", largura: 14 }]),
    { titulo: contato, largura: 28 },
    { titulo: "Categoria", largura: 24 },
    { titulo: "Centro de custo", largura: 20 },
    { titulo: "Valor (R$)", tipo: "centavos", largura: 14, total: true },
    ...(completa ? [{ titulo: "Pago (R$)", tipo: "centavos" as const, largura: 14, total: true }] : []),
    { titulo: "Saldo (R$)", tipo: "centavos", largura: 14, total: true },
    { titulo: "Situação", largura: 13, tipo: "codigo", cores },
    ...(completa ? [{ titulo: "Documento", largura: 14 }] : []),
  ];
  const linhas = titulos.map((t) => [
    t.vencimento,
    ...(completa ? [competenciaBr(t.competencia)] : []),
    t.descricao,
    ...(completa ? [t.parcela_total ? `${t.parcela_numero}/${t.parcela_total}` : ""] : [t.referencia ?? ""]),
    t.contato_nome ?? "", t.categorias ?? "", t.centros_custo ?? "",
    Number(t.valor_cents),
    ...(completa ? [Number(t.pago_cents ?? 0)] : []),
    Number(t.saldo_cents),
    rotulo[t.situacao] ?? t.situacao,
    ...(completa ? [t.referencia ?? ""] : []),
  ]);
  return {
    nome: tipo === "pagar" ? "Contas a pagar" : "Contas a receber", titulo: o.titulo, subtitulo: o.subtitulo, colunas, linhas,
    rotuloTotal: `Total (${titulos.length} ${titulos.length === 1 ? "conta" : "contas"})`, nota: o.nota, rodape: o.titulo,
  };
}
