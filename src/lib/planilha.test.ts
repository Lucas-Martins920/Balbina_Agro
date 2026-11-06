import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { abaTitulos, LINHA_CABECALHO, planilhaXlsx, type TituloPlanilha } from "./planilha.ts";

const titulos: TituloPlanilha[] = [
  { vencimento: "2026-10-05", competencia: "2026-10-01", descricao: "Milho", parcela_numero: 1, parcela_total: 3, contato_nome: "Agro Norte",
    categorias: "Ração", centros_custo: "Viveiro 1", valor_cents: 150000, pago_cents: 0, saldo_cents: 150000, situacao: "vencido", referencia: "NF 12" },
  { vencimento: "2026-11-10", competencia: "2026-11-01", descricao: "Vacina", contato_nome: "Vet", categorias: "Medicamentos",
    centros_custo: null, valor_cents: "25050", pago_cents: "25050", saldo_cents: "0", situacao: "quitado", referencia: null },
];

async function abrir(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

test("planilha de contas: faixa da marca, cabeçalho na linha 4 congelado, datas, R$ e total que segue o filtro", async () => {
  const aba = abaTitulos("pagar", titulos, { titulo: "Balbina · Piscicultura Teste", subtitulo: "Contas a pagar", completa: true });
  const ws = (await abrir(await planilhaXlsx([aba]))).worksheets[0];
  assert.equal(ws.name, "Contas a pagar");
  assert.equal(ws.getCell(1, 1).value, "Balbina · Piscicultura Teste");
  assert.equal((ws.views[0] as ExcelJS.WorksheetViewFrozen).ySplit, LINHA_CABECALHO);
  const cab = (ws.getRow(LINHA_CABECALHO).values as unknown[]).slice(1);
  assert.deepEqual(cab, ["Vencimento", "Competência", "Descrição", "Parcela", "Fornecedor", "Categoria", "Centro de custo",
    "Valor (R$)", "Pago (R$)", "Saldo (R$)", "Situação", "Documento"]);
  const l1 = ws.getRow(LINHA_CABECALHO + 1);
  assert.deepEqual(l1.getCell(1).value, new Date(Date.UTC(2026, 9, 5)));
  assert.equal(l1.getCell(2).value, "10/2026");
  assert.equal(l1.getCell(4).value, "1/3");
  assert.equal(l1.getCell(8).value, 1500);
  assert.match(l1.getCell(8).numFmt, /\[Red\]/);
  assert.equal(l1.getCell(11).value, "Vencida");
  assert.equal(ws.getRow(LINHA_CABECALHO + 2).getCell(11).value, "Paga");
  const total = ws.getRow(LINHA_CABECALHO + 3);
  assert.equal(total.getCell(1).value, "Total (2 contas)");
  assert.deepEqual(total.getCell(8).value, { formula: "SUBTOTAL(9,H5:H6)", result: 1750.5 });
  assert.ok(ws.autoFilter);
});

test("lista da tela (versão curta) e planilha vazia não quebram", async () => {
  const curta = abaTitulos("receber", titulos.slice(0, 1), { titulo: "Balbina · Contas a receber", subtitulo: "1 conta" });
  const ws = (await abrir(await planilhaXlsx([curta]))).worksheets[0];
  assert.deepEqual((ws.getRow(LINHA_CABECALHO).values as unknown[]).slice(1),
    ["Vencimento", "Descrição", "Documento", "Cliente", "Categoria", "Centro de custo", "Valor (R$)", "Saldo (R$)", "Situação"]);
  const vazia = (await abrir(await planilhaXlsx([abaTitulos("pagar", [], { titulo: "x", subtitulo: "y" })]))).worksheets[0];
  assert.equal(vazia.getRow(LINHA_CABECALHO + 1).getCell(1).value, "Nada para mostrar com estes filtros.");
  assert.equal(vazia.getRow(LINHA_CABECALHO + 2).getCell(1).value, "Total (0 contas)");
});
