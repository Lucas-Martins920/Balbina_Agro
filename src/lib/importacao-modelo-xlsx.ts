import ExcelJS from "exceljs";
import { cabecalhoTabela, FONTE, PLANILHA, preenche } from "./planilha.ts";
import { MODELOS, type AbaLida, type TipoModelo } from "./importacao-modelo.ts";

const LINHAS_COM_LISTA = 500;
const ETAPA = { comecar: " · para começar", cadastro: "", opcional: " · opcional" };

// Planilha modelo: aba de instruções e uma aba por tipo de dado, com o cabeçalho, linhas de exemplo
// (ignoradas na importação se ficarem como estão) e listas de opções nas colunas que têm escolha fixa.
export async function modeloXlsx(tipos: TipoModelo[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Balbina";
  const modelos = MODELOS.filter((m) => tipos.includes(m.tipo));

  const ins = wb.addWorksheet("Instruções", { views: [{ showGridLines: false }], properties: { tabColor: { argb: PLANILHA.marca } } });
  ins.columns = [{ width: 26 }, { width: 13 }, { width: 90 }];
  ins.mergeCells(1, 1, 1, 3);
  const capa = ins.getCell(1, 1);
  capa.value = "Modelo de importação do Balbina";
  capa.font = { name: FONTE, size: 15, bold: true, color: { argb: PLANILHA.branco } };
  capa.fill = preenche(PLANILHA.marca);
  capa.alignment = { vertical: "middle", indent: 1 };
  ins.getRow(1).height = 30;
  for (const t of [
    "Para começar: preencha Viveiros, Lotes e Estoque inicial (com os produtos na aba Produtos).",
    "Lançamentos e transferências antigos são opcionais: só se quiser o histórico no Balbina.",
    "",
    "1. Preencha uma linha por registro nas abas deste arquivo. Os títulos das colunas (linha 1) não podem mudar.",
    "2. As linhas em cinza são exemplos: apague ou escreva por cima. Se ficarem iguais, o Balbina ignora.",
    "3. Colunas com * são obrigatórias. Datas em dd/mm/aaaa e valores em reais (1.234,56).",
    "4. Pode deixar abas em branco ou apagar as que não usar.",
    "5. Em Configurações → Importar dados, envie o arquivo, confira a prévia e confirme.",
    "6. Pode enviar de novo: o que já entrou não duplica. Para corrigir algo que já entrou, edite no Balbina.",
  ]) ins.addRow([t]);
  for (const m of modelos) {
    ins.addRow([]);
    ins.addRow([`Aba "${m.aba}"${ETAPA[m.etapa]}`]).font = { name: FONTE, bold: true, size: 12, color: { argb: PLANILHA.marca } };
    ins.addRow([m.descricao]).font = { italic: true };
    const cab = ins.addRow(["Coluna", "Obrigatória", "Como preencher"]);
    cabecalhoTabela(cab, 3, () => false);
    for (const c of m.colunas) {
      const r = ins.addRow([c.titulo, c.obrigatoria ? "Sim" : "", c.ajuda + (c.opcoes ? ` Opções: ${c.opcoes.join(", ")}.` : "")]);
      r.getCell(3).alignment = { wrapText: true, vertical: "top" };
      for (let i = 1; i <= 3; i++) r.getCell(i).border = { bottom: { style: "hair", color: { argb: PLANILHA.linha } } };
    }
  }

  for (const m of modelos) {
    // o cabeçalho fica na linha 1 (a importação lê a primeira linha preenchida como títulos)
    const ws = wb.addWorksheet(m.aba, { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: m.etapa === "opcional" ? PLANILHA.suave : PLANILHA.marca } } });
    ws.columns = m.colunas.map((c) => ({ width: c.largura ?? 14 }));
    const cab = ws.addRow(m.colunas.map((c) => c.titulo + (c.obrigatoria ? "*" : "")));
    cabecalhoTabela(cab, m.colunas.length, () => false);
    m.colunas.forEach((c, i) => { cab.getCell(i + 1).note = c.ajuda; });
    for (const e of m.exemplos) ws.addRow(e).font = { italic: true, color: { argb: "FF8A8A8A" } };
    m.colunas.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      // documento, código e CEP como texto, para o Excel não comer o zero da frente
      if (/cpf|cep|codigo|sku|ncm|banco|agencia|numero|telefone|inscricao/.test(c.campo)) col.numFmt = "@";
      if (!c.opcoes) return;
      for (let r = 2; r <= LINHAS_COM_LISTA; r++) {
        ws.getCell(r, i + 1).dataValidation = {
          type: "list", allowBlank: true, formulae: [`"${c.opcoes.join(",")}"`],
          showErrorMessage: false,
        };
      }
    });
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function texto(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  // número com vírgula decimal, para 1.234 (um vírgula dois três quatro) não virar milhar
  if (typeof v === "number") return String(v).replace(".", ",");
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "string") return v;
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return texto((v.result ?? null) as ExcelJS.CellValue);
  if ("text" in v) return String(v.text);
  return "";
}

// Lê todas as abas do xlsx. O cabeçalho é a primeira linha com algo escrito; o número da linha é o do Excel.
export async function lerXlsx(bytes: ArrayBuffer): Promise<AbaLida[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const abas: AbaLida[] = [];
  wb.eachSheet((ws) => {
    let cabecalho: string[] | null = null;
    const linhas: AbaLida["linhas"] = [];
    ws.eachRow({ includeEmpty: false }, (row, numero) => {
      const valores: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { valores[col - 1] = texto(cell.value).trim(); });
      for (let i = 0; i < valores.length; i++) valores[i] ??= "";
      if (!valores.some((v) => v)) return;
      if (!cabecalho) cabecalho = valores;
      else linhas.push({ numero, valores });
    });
    abas.push({ nome: ws.name, cabecalho: cabecalho ?? [], linhas });
  });
  return abas;
}
