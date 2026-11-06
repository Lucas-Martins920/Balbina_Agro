import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import JSZip from "jszip";
import { resolverPeriodo, resumoCusto, resumoFinanceiro, resumoProducao, resumoVendasPeriodo, type Analise } from "./analise-periodo.ts";
import { montarRoteiro } from "./apresentacao.ts";
import { apresentacaoPdf, textoPdf } from "./apresentacao-pdf.ts";
import { apresentacaoPptx } from "./apresentacao-pptx.ts";
import type { LinhaResultado } from "./relatorios.ts";

const p = resolverPeriodo("trimestre", "2026-10-30");
const l = (mes: string, tipo: string, grupo: string, categoria: string, valor_cents: number): LinhaResultado =>
  ({ mes, tipo, grupo, categoria, categoria_id: categoria, valor_cents });
const linhas: LinhaResultado[] = [];
for (const [i, mes] of ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].entries()) {
  linhas.push(l(mes, "receber", "receita_operacional", "Venda de peixe", 9000000 + i * 400000));
  linhas.push(l(mes, "pagar", "custo_operacional", "Ração", 5200000 + i * 300000));
  linhas.push(l(mes, "pagar", "despesa_operacional", "Energia", 600000));
}
const custo = (mes: string, lote: string, total: number, ganho: number) => ({
  mes, lote_codigo: lote, custo_total_cents: total, ganho_kg: ganho, racao_kg: ganho * 1.6, racao_cents: total * 0.7, alevinos_cents: total * 0.2,
  sanidade_cents: total * 0.1, mao_obra_cents: 0, energia_cents: 0, embalagem_cents: 0, outros_diretos_cents: 0, indiretos_rateados_cents: 0,
});
const analise: Analise = {
  periodos: p,
  regime: "caixa",
  financeiro: resumoFinanceiro(linhas, p),
  producao: resumoProducao([
    { data: "2026-08-10", peixes: 10000, baixas_peixes: 3, racao_kg: 90, biomassa_kg: 3000 }, { data: "2026-09-10", peixes: 9990, baixas_peixes: 4, racao_kg: 120, biomassa_kg: 4500 },
    { data: "2026-10-10", peixes: 9980, baixas_peixes: 5, racao_kg: 150, biomassa_kg: 6000 }, { data: "2026-06-10", peixes: 10000, baixas_peixes: 2, racao_kg: 40, biomassa_kg: 1000 },
  ], p),
  custo: resumoCusto([custo("2026-10-01", "L-01", 4000000, 2500), custo("2026-10-01", "L-02", 3000000, 2600)], p),
  vendas: resumoVendasPeriodo([
    { mes: "2026-10-01", cliente_id: "a", cliente: "Peixaria Rio Negro", kg: 2000, total_cents: 5000000 },
    { mes: "2026-09-01", cliente_id: "b", cliente: "Restaurante Sabor da Amazônia", kg: 1000, total_cents: 2600000 },
  ], p),
};
const roteiro = montarRoteiro(analise, "Piscicultura Teste", "30/10/2026");

test("roteiro da apresentação: capa, resumo, financeiro, gastos, produção, custo, vendas e destaques", () => {
  assert.deepEqual(roteiro.slides.map((s) => s.tipo), ["capa", "resumo", "colunas", "ranking", "ranking", "colunas", "tabela", "ranking", "destaques"]);
  const resumo = roteiro.slides[1];
  assert.equal(resumo.tipo, "resumo");
  if (resumo.tipo === "resumo") {
    assert.equal(resumo.kpis.length, 8);
    assert.equal(resumo.kpis[1].comparacoes[0].tom, "perigo"); // gastos subiram
  }
  const gastos = roteiro.slides[3];
  assert.match(gastos.titulo, /^Ração é o maior gasto/);
  assert.match(roteiro.slides[5].titulo, /^Ração dada de 360 kg/);
  assert.match(roteiro.slides[6].titulo, /^O kg do peixe custou R\$\s13,73 e foi vendido a R\$\s25,33/);
  assert.equal(roteiro.rodape, "Piscicultura Teste · Ago/26 a out/26 · Balbina");
});

test("PDF com um slide 16:9 por página e texto só com caracteres da fonte padrão", () => {
  const pdf = Buffer.from(apresentacaoPdf(roteiro));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, roteiro.slides.length);
  assert.equal(textoPdf("−R$ 1 → 2"), "-R$ 1 -> 2");
  if (process.env.SALVAR_APRESENTACAO) writeFileSync(`${process.env.SALVAR_APRESENTACAO}.pdf`, pdf);
});

test("PowerPoint com os mesmos slides e gráficos nativos", async () => {
  const pptx = await apresentacaoPptx(roteiro);
  // o .pptx é um zip
  const zip = await JSZip.loadAsync(pptx);
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slides.length, roteiro.slides.length);
  assert.ok(Object.keys(zip.files).some((n) => n.startsWith("ppt/charts/chart")));
  if (process.env.SALVAR_APRESENTACAO) writeFileSync(`${process.env.SALVAR_APRESENTACAO}.pptx`, Buffer.from(pptx));
});

test("em 12 meses o período anterior é o do ano passado: uma comparação só", () => {
  const doze = resolverPeriodo("12m", "2026-10-30");
  const r = montarRoteiro({ ...analise, periodos: doze, financeiro: resumoFinanceiro(linhas, doze) }, "Piscicultura Teste", "30/10/2026");
  const resumo = r.slides[1];
  assert.ok(resumo.tipo === "resumo" && resumo.kpis[0].comparacoes.length === 1);
});
