import { test } from "node:test";
import assert from "node:assert/strict";
import {
  destaques, janelaDeLeitura, manchete, mesesEntre, nomePeriodo, resolverPeriodo, resumoCusto, resumoFinanceiro, resumoProducao,
  resumoVendasPeriodo, variacao, type Analise, type CustoLote,
} from "./analise-periodo.ts";
import type { LinhaResultado } from "./relatorios.ts";

test("atalhos de período e as duas bases de comparação", () => {
  const t = resolverPeriodo("trimestre", "2026-02-15");
  assert.deepEqual(t.atual.meses, ["2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.equal(t.anterior.de, "2025-09");
  assert.equal(t.anterior.ate, "2025-11");
  assert.equal(t.anoAnterior.de, "2024-12");
  assert.equal(t.anoAnterior.ate, "2025-02");
  assert.equal(t.emAndamento, true);

  const passado = resolverPeriodo("mes-passado", "2026-01-10");
  assert.equal(passado.atual.de, "2025-12");
  assert.equal(passado.atual.nome, "dezembro de 2025");
  assert.equal(passado.emAndamento, false);

  assert.equal(resolverPeriodo("ano", "2026-10-30").atual.de, "2026-01");
  assert.equal(resolverPeriodo("qualquer", "2026-10-30").chave, "mes");
});

test("período personalizado inverte datas trocadas e limita a 24 meses", () => {
  const p = resolverPeriodo("personalizado", "2026-10-30", "2026-06", "2026-03");
  assert.equal(p.atual.de, "2026-03");
  assert.equal(p.atual.ate, "2026-06");
  assert.equal(p.anterior.de, "2025-11");
  const longo = resolverPeriodo("personalizado", "2026-10-30", "2020-01", "2026-10");
  assert.equal(longo.atual.meses.length, 24);
  assert.equal(longo.atual.ate, "2026-10");
  // sem datas válidas volta para este mês
  assert.equal(resolverPeriodo("personalizado", "2026-10-30", "x", "2026-10").chave, "mes");
});

test("nomes de período e janela de leitura", () => {
  assert.equal(nomePeriodo("2026-01", "2026-12"), "2026");
  assert.equal(nomePeriodo("2026-01", "2026-03"), "jan/26 a mar/26");
  assert.deepEqual(mesesEntre("2025-11", "2026-01"), ["2025-11-01", "2025-12-01", "2026-01-01"]);
  assert.deepEqual(janelaDeLeitura(resolverPeriodo("mes", "2026-02-10")), { de: "2025-02-01", ate: "2026-02-28" });
});

test("variação sem base é nula", () => {
  assert.equal(variacao(10, 0), null);
  assert.equal(variacao(10, null), null);
  assert.equal(variacao(150, 100), 50);
  assert.equal(variacao(-50, -100), 50);
});

const l = (mes: string, tipo: string, grupo: string, categoria: string, valor_cents: number): LinhaResultado =>
  ({ mes, tipo, grupo, categoria, categoria_id: categoria, valor_cents });

test("financeiro operacional compara com o período anterior e o ano anterior", () => {
  const p = resolverPeriodo("mes", "2026-10-30");
  const f = resumoFinanceiro([
    l("2026-10-01", "receber", "receita_operacional", "Venda de peixe", 100000),
    l("2026-10-01", "pagar", "custo_operacional", "Ração", 60000),
    l("2026-10-01", "receber", "despesa_operacional", "Outras receitas", 5000),
    l("2026-10-01", "pagar", "financiamento", "Empréstimo", 20000),
    l("2026-09-01", "receber", "receita_operacional", "Venda de peixe", 80000),
    l("2026-09-01", "pagar", "custo_operacional", "Ração", 40000),
    l("2025-10-01", "receber", "receita_operacional", "Venda de peixe", 50000),
  ], p, [
    { mes: "2026-10-01", grupo: "receita_operacional", sentido: "entrada", orcado_cents: 120000 },
    { mes: "2026-10-01", grupo: "custo_operacional", sentido: "saida", orcado_cents: 50000 },
  ]);
  assert.equal(f.receita.valor, 100000);
  assert.equal(f.gastos.valor, 55000); // outras receitas abatem
  assert.equal(f.resultado.valor, 45000);
  assert.equal(f.resultado.anterior, 40000);
  assert.equal(f.receita.anoAnterior, 50000);
  assert.equal(f.margem.valor, 45);
  assert.equal(f.caixa.valor, 25000); // inclui o financiamento
  assert.deepEqual(f.meta, { receita: 120000, gastos: 50000 });
  assert.equal(f.variacoes[0].nome, "Ração");
  assert.equal(f.variacoes[0].delta, 20000);
  assert.equal(f.variacoes[0].pct, 50);
  assert.deepEqual(f.categorias, [{ nome: "Ração", valor: 60000 }]);
});

test("financeiro sem lançamentos fica vazio e sem meta", () => {
  const f = resumoFinanceiro([], resolverPeriodo("mes", "2026-10-30"));
  assert.equal(f.vazio, true);
  assert.equal(f.meta, null);
  assert.equal(f.resultado.valor, null);
});

test("produção: ração, taxa sobre a biomassa, biomassa no último dia e mortalidade", () => {
  const p = resolverPeriodo("mes", "2026-10-30");
  const pr = resumoProducao([
    { data: "2026-10-01", peixes: 1000, baixas_peixes: 2, racao_kg: 12, biomassa_kg: 400 },
    { data: "2026-10-02", peixes: 1000, baixas_peixes: 3, racao_kg: 13, biomassa_kg: 410 },
    { data: "2026-10-02", peixes: 500, baixas_peixes: 0, racao_kg: 3, biomassa_kg: 190 },
    { data: "2026-09-10", peixes: 1000, baixas_peixes: 0, racao_kg: 9, biomassa_kg: 300 },
  ], p);
  assert.equal(pr.racao.valor, 28);
  assert.equal(pr.racao.anterior, 9);
  assert.equal(pr.taxa.valor, 2.8); // 28 kg sobre 1.000 kg de biomassa-dia
  assert.equal(pr.taxa.anterior, 3);
  assert.equal(pr.biomassa.valor, 600); // dia 2: os dois lotes
  assert.equal(pr.mortalidade.valor, (100 * 5) / 1250);
  assert.equal(pr.peixesMedios, 1250);
});

const custo = (mes: string, lote: string, total: number, ganho: number, racao = ganho * 1.5): CustoLote => ({
  mes, lote_codigo: lote, custo_total_cents: total, ganho_kg: ganho, racao_kg: racao, racao_cents: total * 0.7, alevinos_cents: total * 0.3,
  sanidade_cents: 0, mao_obra_cents: 0, energia_cents: 0, embalagem_cents: 0, outros_diretos_cents: 0, indiretos_rateados_cents: 0,
});

test("custo do kg sobre a biomassa ganha, conversão e lotes do mais caro para o mais barato", () => {
  const p = resolverPeriodo("mes", "2026-10-30");
  const c = resumoCusto([
    custo("2026-10-01", "L1", 30000, 1000), custo("2026-10-01", "L2", 50000, 1000), custo("2026-10-01", "L3", 10000, -50, 0),
    custo("2026-09-01", "L1", 20000, 1000, 1800),
  ], p);
  assert.equal(c.custoKg.valor, 45); // 90.000 centavos sobre 2.000 kg ganhos (o L3 perdeu peso e não conta no ganho)
  assert.equal(c.custoKg.anterior, 20);
  assert.equal(c.conversao.valor, 1.5);
  assert.equal(c.conversao.anterior, 1.8);
  assert.deepEqual(c.lotes.map((x) => x.lote), ["L2", "L1"]);
  assert.equal(c.composicao[0].nome, "Ração");
});

test("vendas: preço médio, clientes e concentração", () => {
  const p = resolverPeriodo("mes", "2026-10-30");
  const v = resumoVendasPeriodo([
    { mes: "2026-10-01", cliente_id: "a", cliente: "A", kg: 300, total_cents: 60000 },
    { mes: "2026-10-01", cliente_id: "b", cliente: "B", kg: 100, total_cents: 20000 },
    { mes: "2026-10-01", cliente_id: "a", cliente: "A", kg: 100, total_cents: 20000 },
  ], p);
  assert.equal(v.faturamento.valor, 100000);
  assert.equal(v.precoKg.valor, 200);
  assert.equal(v.clientes[0].nome, "A");
  assert.equal(v.clientes[0].participacao, 80);
  assert.equal(v.numClientes, 2);
});

test("destaques e manchete citam os números do período", () => {
  const p = resolverPeriodo("mes-passado", "2026-11-05");
  const a: Analise = {
    periodos: p,
    regime: "competencia",
    financeiro: resumoFinanceiro([
      l("2026-10-01", "receber", "receita_operacional", "Venda de peixe", 100000),
      l("2026-10-01", "pagar", "custo_operacional", "Ração", 60000),
      l("2026-09-01", "receber", "receita_operacional", "Venda de peixe", 80000),
      l("2026-09-01", "pagar", "custo_operacional", "Ração", 40000),
    ], p),
    producao: resumoProducao([
      { data: "2026-10-01", peixes: 1000, baixas_peixes: 10, racao_kg: 20, biomassa_kg: 800 },
      { data: "2026-09-01", peixes: 1000, baixas_peixes: 0, racao_kg: 18, biomassa_kg: 700 },
    ], p),
    custo: resumoCusto([custo("2026-10-01", "L1", 900000, 1000, 1700), custo("2026-09-01", "L1", 800000, 1000, 1500)], p),
    vendas: resumoVendasPeriodo([{ mes: "2026-10-01", cliente_id: "a", cliente: "A", kg: 1000, total_cents: 1200000 }], p),
  };
  const d = destaques(a);
  assert.ok(d.some((x) => x.tom === "perigo" && x.texto.startsWith("Ração subiu R$")));
  assert.ok(d.some((x) => x.tom === "perigo" && x.texto.startsWith("Mortalidade subiu 1 ponto")));
  // custo R$ 9,00 o kg, vendido a R$ 12,00: margem 25%
  assert.ok(d.some((x) => x.texto.includes("margem de 25%")));
  assert.ok(d.some((x) => x.tom === "perigo" && x.texto.startsWith("Conversão alimentar piorou de 1,50 para 1,70")));
  const m = manchete(a);
  assert.match(m, /^Outubro de 2026: resultado operacional de R\$\s400,00/);
  assert.match(m, /20 kg de ração nos viveiros, 800 kg de peixe estimados no fim/);
  assert.doesNotMatch(m, /andamento/);
});
