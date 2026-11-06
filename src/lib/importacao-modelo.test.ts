import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  abaCsv, interpretarPlanilha, lerCompetencia, lerData, lerValor, MODELOS, modeloCsv, reconhecerAba, type AbaLida, type Contexto,
} from "./importacao-modelo.ts";
import { lerXlsx, modeloXlsx } from "./importacao-modelo-xlsx.ts";

const ctx: Contexto = { financeiro: true, contas: ["Caixa da Piscicultura", "Sicredi"], contatos: ["Mercado Central"], categorias: ["Venda de peixe"] };
const aba = (nome: string, cabecalho: string[], linhas: string[][]): AbaLida =>
  ({ nome, cabecalho, linhas: linhas.map((valores, i) => ({ numero: i + 2, valores })) });

test("valores, datas e competência em formato brasileiro", () => {
  assert.equal(lerValor("1.234,56"), 123456);
  assert.equal(lerValor("R$ -10,5"), -1050);
  assert.equal(lerValor("(25,00)"), -2500);
  assert.equal(lerValor("1234.5"), 123450);
  assert.equal(lerValor("1.500"), 150000);
  assert.equal(lerValor("2500,5"), 250050);
  assert.equal(lerValor("1,234,567"), 123456700);
  assert.equal(lerValor("abc"), undefined);
  assert.equal(lerData("05/03/2026"), "2026-03-05");
  assert.equal(lerData("5-3-26"), "2026-03-05");
  assert.equal(lerData("2026-03-05"), "2026-03-05");
  assert.equal(lerData("46086"), "2026-03-05");
  assert.equal(lerData("31/02/2026"), undefined);
  assert.equal(lerCompetencia("03/2026"), "2026-03-01");
  assert.equal(lerCompetencia("2026-3"), "2026-03-01");
  assert.equal(lerCompetencia("15/03/2026"), "2026-03-01");
  assert.equal(lerCompetencia("13/2026"), undefined);
});

test("reconhece a aba pelo nome e, sem nome conhecido, pelas colunas", () => {
  assert.equal(reconhecerAba("Contas a pagar", [])?.tipo, "lancamentos");
  assert.equal(reconhecerAba("balbina-modelo-produtos", [])?.tipo, "produtos");
  assert.equal(reconhecerAba("Planilha1", ["Data de vencimento", "Histórico", "Valor (R$)", "Fornecedor"])?.tipo, "lancamentos");
  assert.equal(reconhecerAba("Plan1", ["Nome", "CPF/CNPJ", "Telefone", "Cidade"])?.tipo, "contatos");
  assert.equal(reconhecerAba("Plan1", ["Nome", "Tipo"])?.tipo, "categorias");
  assert.equal(reconhecerAba("Plan1", ["Produto", "Tipo", "Unidade"])?.tipo, "produtos");
  assert.equal(reconhecerAba("Plan1", ["Qualquer", "Coisa"]), null);
});

test("lançamentos: valida linha a linha, quita o que foi pago e ignora os exemplos", () => {
  const m = MODELOS.find((x) => x.tipo === "lancamentos")!;
  const cab = m.colunas.map((c) => c.titulo + (c.obrigatoria ? "*" : ""));
  const linha = (o: Record<string, string>) => m.colunas.map((c) => o[c.campo] ?? "");
  const { pacote, previa } = interpretarPlanilha([aba("Lançamentos", cab, [
    m.exemplos[0],
    linha({ tipo: "Pagar", descricao: "Milho", contato: "Cerealista Norte", vencimento: "10/03/2026", valor: "2.500,00", categoria: "Milho",
      pago_em: "11/03/2026", conta: "caixa da piscicultura" }),
    linha({ tipo: "receber", descricao: "Despesca", contato: "Mercado Central", vencimento: "15/03/2026", valor: "1800", categoria: "Venda de peixe",
      competencia: "02/2026", pago_em: "16/03/2026", valor_pago: "900", conta: "Sicredi" }),
    linha({ descricao: "Energia", vencimento: "20/03/2026", valor: "-300,00" }),
    linha({ tipo: "Pagar", descricao: "Data ruim", vencimento: "32/03/2026", valor: "10" }),
    linha({ tipo: "Pagar", descricao: "Conta inexistente", vencimento: "01/03/2026", valor: "10", pago_em: "01/03/2026", conta: "Bradesco" }),
    linha({ tipo: "Talvez", descricao: "Tipo ruim", vencimento: "01/03/2026", valor: "10" }),
    linha({ descricao: "Energia", vencimento: "20/03/2026", valor: "-300,00" }),
  ])], ctx);

  const r = previa.abas[0];
  assert.equal(r.tipo, "lancamentos");
  assert.equal(r.exemplos, 1);
  assert.equal(r.linhas, 8);
  assert.equal(r.validas, 4);
  assert.deepEqual(previa.problemas.map((p) => [p.linha, p.ignorada]), [[6, true], [7, true], [8, true]]);
  assert.match(previa.problemas[1].mensagem, /Bradesco/);
  assert.deepEqual(previa.pagar, { qtd: 3, cents: 310000 });
  assert.deepEqual(previa.receber, { qtd: 1, cents: 180000 });
  assert.equal(previa.quitados, 2);
  assert.deepEqual(previa.novos, { contatos: ["Cerealista Norte"], categorias: ["Milho"], especies: [] });

  const [milho, despesca, energia1, energia2] = pacote.titulos!;
  assert.deepEqual(milho.baixas, [{ chave: `${milho.chave}:pg`, conta: "caixa da piscicultura", data: "2026-03-11", valor_cents: 250000 }]);
  assert.deepEqual(milho.rateio, [{ categoria: "Milho", centro_custo: undefined, valor_cents: 250000 }]);
  assert.equal(despesca.competencia, "2026-02-01");
  assert.equal(despesca.baixas[0].valor_cents, 90000);
  assert.equal(energia1.tipo, "pagar");
  assert.equal(energia1.valor_cents, 30000);
  // linhas iguais viram dois lançamentos; mandar a planilha de novo gera as mesmas chaves
  assert.notEqual(energia1.chave, energia2.chave);
  assert.equal(energia1.chave.replace(/#1$/, ""), energia2.chave.replace(/#2$/, ""));
  const de_novo = interpretarPlanilha([aba("Lançamentos", cab, [linha({ descricao: "Energia", vencimento: "20/03/2026", valor: "-300,00" })])], ctx);
  assert.equal(de_novo.pacote.titulos![0].chave, energia1.chave);
});

test("código da pessoa vira a chave; conta nova na aba Contas vale para os lançamentos", () => {
  const { pacote, previa } = interpretarPlanilha([
    aba("Contas", ["Nome", "Tipo", "Saldo inicial", "Data do saldo"], [["Bradesco", "Conta corrente", "1.000,00", "01/03/2026"]]),
    aba("Despesas", ["Descrição", "Vencimento", "Valor", "Pago em", "Conta", "Código"], [["Luz", "05/03/2026", "150", "05/03/2026", "Bradesco", "L-9"]]),
  ], { ...ctx, contas: [] });
  assert.equal(previa.problemas.length, 0);
  assert.deepEqual(pacote.contas, [{ nome: "Bradesco", tipo: "corrente", banco_codigo: undefined, agencia: undefined, conta: undefined,
    conta_dv: undefined, saldo_inicial_cents: 100000, saldo_inicial_data: "2026-03-01" }]);
  assert.equal(pacote.titulos![0].chave, "lanc:L-9");
  assert.equal(pacote.titulos![0].tipo, "pagar");
});

test("contatos, categorias, produtos e transferências", () => {
  const { pacote, previa } = interpretarPlanilha([
    aba("Fornecedores", ["Nome", "CPF ou CNPJ", "Produtor rural", "UF", "CEP"], [
      ["Cerealista Norte", "1234567890", "Sim", "am", "69.000-000"],
      ["Sem doc", "111", "", "", ""],
      ["", "11222333000181", "", "", ""],
    ]),
    aba("Categorias", ["Nome", "Tipo", "Grupo da DRE", "Categoria pai"], [["Farelo de soja", "Saída", "Custo operacional", "Insumos"], ["X", "Talvez", "", ""]]),
    aba("Produtos", ["Nome", "Tipo", "Unidade", "Estoque mínimo"], [["Milho moído", "Insumo de ração", "kg", "1.000"], ["Tambaqui inteiro", "Peixe", "kg", ""]]),
    aba("Transferências", ["Data", "Conta de origem", "Conta de destino", "Valor"], [["05/03/2026", "Sicredi", "Caixa da piscicultura", "300"],
      ["05/03/2026", "Sicredi", "Sicredi", "300"]]),
  ], ctx);
  assert.deepEqual(pacote.contatos![0], {
    nome: "Cerealista Norte", tipos: ["fornecedor"], cpf_cnpj: "01234567890", inscricao_estadual: undefined, produtor_rural: true,
    telefone: undefined, email: undefined, cidade: undefined, uf: "AM", endereco: { cep: "69000000" },
  });
  assert.equal(pacote.contatos![1].cpf_cnpj, undefined);
  assert.equal(pacote.contatos!.length, 2);
  assert.deepEqual(pacote.categorias, [{ nome: "Farelo de soja", sentido: "saida", grupo: "custo_operacional", pai: "Insumos" }]);
  assert.deepEqual(pacote.produtos, [{ nome: "Milho moído", tipo: "insumo_racao", unidade: "kg", sku: undefined, ncm: undefined,
    estoque_minimo: 1000, observacoes: undefined }]);
  assert.equal(pacote.transferencias!.length, 1);
  assert.equal(pacote.transferencias![0].valor_cents, 30000);
  assert.deepEqual(previa.problemas.map((p) => `${p.aba}:${p.linha}:${p.ignorada ? "erro" : "aviso"}`),
    ["Fornecedores:3:aviso", "Fornecedores:4:erro", "Categorias:3:erro", "Produtos:3:erro", "Transferências:3:erro"]);
});

test("plano sem financeiro: só cadastros e produtos entram", () => {
  const { pacote, previa } = interpretarPlanilha([
    aba("Lançamentos", ["Descrição", "Vencimento", "Valor", "Tipo"], [["Milho", "01/03/2026", "10", "Pagar"]]),
    aba("Clientes", ["Nome"], [["Mercado"]]),
  ], { ...ctx, financeiro: false });
  assert.equal(pacote.titulos, undefined);
  assert.equal(pacote.contatos!.length, 1);
  assert.match(previa.abas[0].erro!, /plano/);
});

test("modelo CSV: lê de volta com os números de linha e ignora os exemplos", () => {
  const csv = modeloCsv("lancamentos");
  assert.ok(csv.startsWith("﻿Tipo;Descrição*;"));
  const a = abaCsv("modelo-lancamentos", csv + '\r\nPagar;"Ração; lote 3";;01/04/2026;"1.000,00"\r\n');
  assert.equal(a.linhas.at(-1)!.numero, 5);
  const { pacote, previa } = interpretarPlanilha([a], ctx);
  assert.equal(previa.abas[0].exemplos, 2);
  assert.equal(pacote.titulos!.length, 1);
  assert.equal(pacote.titulos![0].descricao, "Ração; lote 3");
});

test("modelo xlsx: todas as abas, e a planilha preenchida volta como pacote", async () => {
  const bytes = await modeloXlsx(MODELOS.map((m) => m.tipo));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Instruções", ...MODELOS.map((m) => m.aba)]);
  const ws = wb.getWorksheet("Lançamentos")!;
  ws.addRow(["Pagar", "Vacina", "Fornecedor X", new Date(Date.UTC(2026, 3, 2)), 1234.5, "Sanidade"]);
  wb.getWorksheet("Clientes e fornecedores")!.addRow(["Cliente novo", "Cliente", 11222333000181]);
  const abas = await lerXlsx((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  const { pacote, previa } = interpretarPlanilha(abas, ctx);
  assert.equal(previa.abas.length, MODELOS.length);
  assert.equal(previa.problemas.length, 0);
  assert.deepEqual(pacote.titulos!.map((t) => [t.descricao, t.vencimento, t.valor_cents]), [["Vacina", "2026-04-02", 123450]]);
  assert.equal(pacote.contatos![0].cpf_cnpj, "11222333000181");
  assert.equal(pacote.categorias, undefined);
});

test("piscicultura: viveiros, lotes e estoque inicial", () => {
  const { pacote, previa } = interpretarPlanilha([
    aba("Viveiros", ["Setor", "Viveiro", "Finalidade", "Sistema", "Capacidade de peixes", "Área (m²)", "Volume (m³)", "Profundidade (m)", "Aeração"], [
      ["Sede", "V1", "Engorda", "Tanque-rede", "10.000", "", "120", "", "sim"],
      ["Sede", "V2", "Berçário e recria", "", "5000", "1.000", "1.300,5", "1,3", ""],
      ["Sede", "V3", "Engorda", "", "0", "abc", "", "", ""],
    ]),
    aba("Lotes", ["Código do lote", "Espécie", "Data de povoamento", "Viveiro", "Peixes povoados", "Peso médio (g)", "Peso de despesca (g)", "Custo dos peixes"], [
      ["L01", "Tambaqui", "01/03/2026", "v1", "9.500", "150", "2.500", "12.000,00"],
      ["L02", "Matrinxã do rio", "01/03/2026", "Viveiro Antigo", "100", "0,8", "", ""],
      ["L03", "Pirarucu", "01/04/2026", "V9", "10,5", "", "", ""],
    ]),
    aba("Estoque inicial", ["Produto", "Quantidade", "Data do saldo", "Custo total"], [
      ["Ração engorda", "1.500", "01/03/2026", "3.000,00"],
      ["Farelo", "10", "01/03/2026", ""],
      ["Ração engorda", "1", "01/03/2030", ""],
    ]),
  ], { ...ctx, viveiros: [{ setor: "Velho", nome: "Viveiro Antigo" }], especies: ["Tambaqui"], produtos: ["Ração engorda"], hoje: "2026-03-10" });
  assert.deepEqual(pacote.viveiros, [
    { setor: "Sede", nome: "V1", finalidade: "engorda", sistema: "tanque_rede", capacidade: 10000, aeracao: true,
      area_m2: undefined, volume_m3: 120, profundidade_m: undefined },
    { setor: "Sede", nome: "V2", finalidade: "alevinagem_recria", sistema: undefined, capacidade: 5000, aeracao: false,
      area_m2: 1000, volume_m3: 1300.5, profundidade_m: 1.3 },
  ]);
  assert.deepEqual(pacote.lotes, [
    { codigo: "L01", especie: "Tambaqui", povoamento: "2026-03-01", setor: undefined, viveiro: "v1", qtd: 9500, peso_inicial_g: 150, peso_alvo_g: 2500,
      custo_cents: 1200000, fornecedor: undefined },
    { codigo: "L02", especie: "Matrinxã do rio", povoamento: "2026-03-01", setor: undefined, viveiro: "Viveiro Antigo", qtd: 100, peso_inicial_g: 0.8,
      peso_alvo_g: undefined, custo_cents: undefined, fornecedor: undefined },
  ]);
  assert.deepEqual(pacote.estoque, [{ produto: "Ração engorda", quantidade: 1500, data: "2026-03-01", custo_cents: 300000 }]);
  assert.deepEqual(previa.novos.especies, ["Matrinxã do rio"]);
  // V3: área inválida e capacidade zero; L03: povoamento no futuro, peixes quebrados, sem peso e viveiro que não existe
  assert.deepEqual(previa.problemas.map((p) => `${p.aba}:${p.linha}`),
    ["Viveiros:4", "Viveiros:4", "Lotes:4", "Lotes:4", "Lotes:4", "Lotes:4", "Estoque inicial:3", "Estoque inicial:4"]);
});

test("modelo começa pela piscicultura e deixa os lançamentos como opcionais", () => {
  assert.deepEqual(MODELOS.slice(0, 3).map((m) => m.tipo), ["viveiros", "lotes", "estoque"]);
  assert.ok(MODELOS.filter((m) => m.etapa === "opcional").every((m) => m.financeiro));
  assert.equal(MODELOS.find((m) => m.tipo === "lancamentos")!.etapa, "opcional");
});
