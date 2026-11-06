import { test } from "node:test";
import assert from "node:assert/strict";
import { analiseHorizontal, analiseVertical, montarAging, montarMatriz, paraCsv, subtotal, SUBTOTAIS_DRE, ultimosMeses } from "./relatorios.ts";

test("últimos 12 meses atravessam o ano", () => {
  const m = ultimosMeses("2026-02");
  assert.equal(m.length, 12);
  assert.equal(m[0], "2025-03-01");
  assert.equal(m[11], "2026-02-01");
});

test("matriz soma receitas e subtrai saídas", () => {
  const meses = ["2026-08-01", "2026-09-01"];
  const m = montarMatriz(meses, [
    { mes: "2026-09-01", tipo: "receber", categoria_id: "a", categoria: "Venda de peixe", grupo: "receita_operacional", valor_cents: 1000 },
    { mes: "2026-08-01", tipo: "pagar", categoria_id: "b", categoria: "Milho", grupo: "custo_operacional", valor_cents: 300 },
    { mes: "2026-09-01", tipo: "pagar", categoria_id: "b", categoria: "Milho", grupo: "custo_operacional", valor_cents: 200 },
    { mes: "2026-01-01", tipo: "pagar", categoria_id: "b", categoria: "Milho", grupo: "custo_operacional", valor_cents: 999 },
  ]);
  assert.equal(m.grupos.length, 2);
  assert.deepEqual(m.grupos[1].valores, [-300, -200]);
  assert.deepEqual(m.resultado, [-300, 800]);
  assert.equal(m.totalResultado, 500);
});

test("CSV no formato do Excel brasileiro", () => {
  assert.equal(paraCsv([["Categoria", "Valor"], ["Milho; moído", -12345]]), '﻿Categoria;Valor\r\n"Milho; moído";-123,45');
});

test("CSV não deixa texto virar fórmula no Excel", () => {
  // descrição e nome de contato vêm de importação e de quem lança: "=HYPERLINK(...)" não pode executar
  assert.equal(paraCsv([["=1+1", "+55 11", "-x", "@SOMA(A1)", "\tTAB", "Peixe"]]), "\uFEFF'=1+1;'+55 11;'-x;'@SOMA(A1);'\tTAB;Peixe");
  assert.equal(paraCsv([['=HYPERLINK("http://x";"a")']]), '\uFEFF"\'=HYPERLINK(""http://x"";""a"")"');
  // número negativo continua número
  assert.equal(paraCsv([[-500]]), "\uFEFF-5,00");
});

test("análises vertical e horizontal da DRE", () => {
  const meses = ["2026-08-01", "2026-09-01"];
  const m = montarMatriz(meses, [
    { mes: "2026-08-01", tipo: "receber", categoria_id: "a", categoria: "Venda de peixe", grupo: "receita_operacional", valor_cents: 1000 },
    { mes: "2026-09-01", tipo: "receber", categoria_id: "a", categoria: "Venda de peixe", grupo: "receita_operacional", valor_cents: 2000 },
    { mes: "2026-08-01", tipo: "pagar", categoria_id: "b", categoria: "Milho", grupo: "custo_operacional", valor_cents: 600 },
    { mes: "2026-09-01", tipo: "pagar", categoria_id: "b", categoria: "Milho", grupo: "custo_operacional", valor_cents: 900 },
  ]);
  const bruta = subtotal(m, SUBTOTAIS_DRE.custo_operacional.grupos);
  assert.deepEqual(bruta, [400, 1100]);
  assert.deepEqual(analiseVertical(m.grupos[1].valores, m.grupos[0].valores), [-60, -45]);
  assert.deepEqual(analiseHorizontal(m.grupos[1].valores), [null, -50]);
  assert.deepEqual(analiseVertical([5], [0]), [null]);
});

test("aging agrupa por contato e ordena pelo atraso", () => {
  const a = montarAging([
    { contato_id: "c1", contato_nome: "Mercado", faixa: "a_vencer", saldo_cents: 900 },
    { contato_id: "c2", contato_nome: "Padaria", faixa: "mais_90", saldo_cents: 100 },
    { contato_id: "c2", contato_nome: "Padaria", faixa: "ate_30", saldo_cents: 50 },
    { contato_id: "c1", contato_nome: "Mercado", faixa: "ate_30", saldo_cents: 10 },
  ]);
  assert.deepEqual(a.contatos.map((c) => c.nome), ["Padaria", "Mercado"]);
  assert.deepEqual(a.contatos[0].valores, [0, 50, 0, 0, 100]);
  assert.equal(a.total, 1060);
  assert.equal(a.totais[0], 900);
});

test("DRE no formato do NIBO: subgrupos, margem, resultado operacional e variação de caixa", async () => {
  const { montarDre, mesesDoAno } = await import("./relatorios.ts");
  const meses = mesesDoAno(2026);
  const categorias = [
    { id: "pv", nome: "Venda de Peixe Manaus", parent_id: null }, { id: "v1", nome: "Venda Peixe Pix Manaus", parent_id: "pv" },
    { id: "v2", nome: "Venda Peixe Espécie Manaus", parent_id: "pv" }, { id: "est", nome: "ESTORNO REALIZADO", parent_id: null },
    { id: "pa", nome: "Alimentação", parent_id: null }, { id: "r", nome: "Ração", parent_id: "pa" },
    { id: "pd", nome: "Administrativas", parent_id: null }, { id: "i", nome: "Internet", parent_id: "pd" },
    { id: "aj1", nome: "AJUSTE DE CAIXA", parent_id: null }, { id: "aj2", nome: "AJUSTE DE CAIXA", parent_id: null },
  ];
  const l = (mes: string, tipo: string, categoria_id: string, grupo: string, valor_cents: number) =>
    ({ mes, tipo, categoria_id, categoria: categorias.find((c) => c.id === categoria_id)!.nome, grupo, valor_cents });
  const d = montarDre(meses, [
    l("2026-01-01", "receber", "v1", "receita_operacional", 1000_00),
    l("2026-01-01", "receber", "v2", "receita_operacional", 500_00),
    l("2026-02-01", "receber", "est", "receita_operacional", 10_00),
    l("2026-01-01", "pagar", "r", "custo_operacional", 900_00),
    l("2026-01-01", "pagar", "i", "despesa_operacional", 100_00),
    l("2026-01-01", "receber", "aj1", "financiamento", 5_00),
    l("2026-01-01", "pagar", "aj2", "financiamento", 7_00),
  ], categorias, "caixa");
  const nomes = d.linhas.map((x) => `${x.nivel}:${x.nome}`);
  assert.deepEqual(nomes, [
    "0:RECEITAS OPERACIONAIS", "1:ESTORNO REALIZADO", "1:Venda de Peixe Manaus", "2:Venda Peixe Espécie Manaus", "2:Venda Peixe Pix Manaus",
    "0:CUSTOS OPERACIONAIS", "1:Alimentação", "2:Ração",
    "0:Margem de contribuição", "0:%",
    "0:DESPESAS OPERACIONAIS E OUTRAS RECEITAS", "1:Administrativas", "2:Internet",
    "0:RESULTADO OPERACIONAL",
    "0:ATIVIDADE DE FINANCIAMENTO", "1:AJUSTE DE CAIXA", "1:AJUSTE DE CAIXA",
    "0:VARIAÇÃO DE CAIXA",
  ]);
  const v = (nome: string) => d.linhas.find((x) => x.nome === nome)!;
  assert.equal(v("RECEITAS OPERACIONAIS").valores[0], 1500_00);
  assert.equal(v("RECEITAS OPERACIONAIS").total, 1510_00);
  assert.equal(v("Margem de contribuição").valores[0], 600_00);
  assert.equal(v("%").valores[0], 40);
  assert.equal(v("RESULTADO OPERACIONAL").valores[0], 500_00);
  assert.equal(v("VARIAÇÃO DE CAIXA").valores[0], 498_00);
  assert.equal(v("VARIAÇÃO DE CAIXA").total, 508_00);
  assert.equal(d.linhas.length, 18);
});

test("DRE segue a ordem escolhida em Categorias, não a alfabética", async () => {
  const { montarDre, mesesDoAno } = await import("./relatorios.ts");
  const meses = mesesDoAno(2026);
  const categorias = [
    { id: "pa", nome: "Alimentação", parent_id: null, ordem: 2 }, { id: "r", nome: "Ração", parent_id: "pa", ordem: 2 },
    { id: "m", nome: "Milho", parent_id: "pa", ordem: 1 },
    { id: "pz", nome: "Zeladoria", parent_id: null, ordem: 1 },
  ];
  const l = (categoria_id: string) => ({ mes: "2026-01-01", tipo: "pagar", categoria_id, grupo: "despesa_operacional",
    categoria: categorias.find((c) => c.id === categoria_id)!.nome, valor_cents: 100 });
  const d = montarDre(meses, [l("r"), l("m"), l("pz")], categorias, "caixa");
  const nomes = d.linhas.filter((x) => x.tipo === "categoria" || x.tipo === "subgrupo").map((x) => x.nome);
  assert.deepEqual(nomes, ["Zeladoria", "Alimentação", "Milho", "Ração"]);
});
