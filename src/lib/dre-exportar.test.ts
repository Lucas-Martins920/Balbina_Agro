import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { dreCsvLinhas, drePdf, dreXlsx } from "./dre-exportar.ts";
import { mesesDoAno, montarDre, type LinhaResultado } from "./relatorios.ts";

const meses = mesesDoAno(2026);
const linhas: LinhaResultado[] = [
  { mes: "2026-01-01", tipo: "receber", categoria_id: "v", categoria: "Venda de peixe", grupo: "receita_operacional", valor_cents: 100000 },
  { mes: "2026-01-01", tipo: "pagar", categoria_id: "r", categoria: "Ração", grupo: "custo_operacional", valor_cents: 60000 },
];
const dre = montarDre(meses, linhas, [], "caixa");
const cab = { empresa: "Piscicultura Teste", regime: "caixa" as const, ano: 2026 };

test("Excel da DRE no layout do NIBO: Resultado, Jan…Dez, ano e valores em reais", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await dreXlsx(dre, cab));
  const ws = wb.worksheets[0];
  assert.equal(ws.name, "Realizado");
  assert.equal(ws.getCell(1, 1).value, "Balbina · Piscicultura Teste");
  assert.deepEqual((ws.getRow(4).values as unknown[]).slice(1), ["Resultado", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez", "2026"]);
  const porNome = new Map<string, unknown[]>();
  ws.eachRow((r) => porNome.set(String(r.getCell(1).value), (r.values as unknown[]).slice(2)));
  assert.equal(porNome.get("Ração")![0], -600);
  assert.equal(porNome.get("Margem de contribuição")![12], 400);
  assert.equal(porNome.get("%")![0], 0.4);
  assert.equal(porNome.get("VARIAÇÃO DE CAIXA")![0], 400);
});

test("Excel da DRE vem formatado: cabeçalho congelado, R$ com negativo em vermelho, % e aba de resumo", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await dreXlsx(dre, { ...cab, geradoEm: "01/11/2026" }));
  const ws = wb.worksheets[0];
  assert.equal((ws.views[0] as ExcelJS.WorksheetViewFrozen).ySplit, 4);
  assert.equal(ws.views[0].showGridLines, false);
  let racao: ExcelJS.Row | undefined, pctLinha: ExcelJS.Row | undefined;
  ws.eachRow((r) => { if (r.getCell(1).value === "Ração") racao = r; if (r.getCell(1).value === "%") pctLinha = r; });
  assert.match(racao!.getCell(2).numFmt, /\[Red\]/);
  assert.match(pctLinha!.getCell(2).numFmt, /%/);
  assert.equal(ws.getRow(4).getCell(2).font.bold, true);

  const resumo = wb.getWorksheet("Resumo")!;
  const linhas = new Map<string, unknown[]>();
  resumo.eachRow((r) => linhas.set(String(r.getCell(1).value), (r.values as unknown[]).slice(2)));
  assert.deepEqual(linhas.get("VARIAÇÃO DE CAIXA"), [400, 0.4]);
  assert.equal(linhas.get("Gerado em")![0], "01/11/2026");
});

test("PDF da DRE é gerado", () => {
  const pdf = Buffer.from(drePdf(dre, cab));
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

test("CSV da DRE leva centavos para o paraCsv e o % como texto", () => {
  const csv = dreCsvLinhas(dre, cab);
  assert.equal(csv[0][13], "2026");
  assert.equal(csv.find((l) => l[0] === "%")![1], "40,0%");
});
