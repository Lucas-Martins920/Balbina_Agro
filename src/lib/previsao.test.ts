import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertasTendencia, coberturaRacao, custoSemanalVariavel, margemProjetada, mortalidadeSemanal, precoRacaoKg, primeiroSaldoNegativo,
  projetarLote, taxaNaCurva, type CurvaPadrao, type DiaLote,
} from "./previsao.ts";
import { pesoEsperado } from "./crescimento.ts";
import type { SemanaLote } from "./zootecnico.ts";

// Pedaço da curva do tambaqui (semana, peso g, taxa % PV/dia)
const CURVA: CurvaPadrao[] = [
  [1, 0.5, 20], [9, 22.3, 6.59], [10, 31.4, 5.72], [15, 124, 3.51], [16, 155, 3.12], [19, 275, 2.29], [20, 324, 2.07],
  [30, 1013, 1.0], [40, 1766, 0.9], [60, 2644, 0.8],
].map(([semana, peso_g, taxa_alimentacao_pct]) => ({ semana, peso_g, taxa_alimentacao_pct }));

function semana(semana: number, baixas: number, peixes = 10000, dias = 7): SemanaLote {
  return {
    semana, dias, peixes_medios: peixes, racao_kg: "100", consumo_g_peixe_dia: "2", baixas, mortalidade_acum_pct: "1",
    sobrevivencia_pct: "99", peso_medio_g: "100", biomassa_kg: "1000", racao_acum_kg: "500", kg_despescados_acum: "0",
    conversao_alimentar: "1.5", padrao_peso_g: null, padrao_consumo_g: null, padrao_sobrevivencia_pct: null, padrao_taxa_pct: null,
  };
}

test("mortalidade semanal: média das últimas 4 semanas completas, com teto de 5%", () => {
  // semanas 2 a 5 (a 6 tem só 2 dias): 10, 20, 30 e 40 baixas em 10.000 peixes
  assert.equal(mortalidadeSemanal([semana(1, 500), semana(2, 10), semana(3, 20), semana(4, 30), semana(5, 40), semana(6, 900, 10000, 2)]), 0.25);
  assert.equal(mortalidadeSemanal([semana(1, 2000)]), 5);
  assert.equal(mortalidadeSemanal([]), 0);
});

test("taxa de alimentação vem da semana da curva em que a espécie tem o peso", () => {
  assert.equal(taxaNaCurva(CURVA, 130), 3.51);
  assert.equal(taxaNaCurva(CURVA, 2000), 0.9);
  assert.equal(taxaNaCurva([], 100), null);
});

test("projeção segue a curva a partir do peso de hoje, no ritmo do lote", () => {
  const p = projetarLote({
    curva: CURVA, hoje: "2026-06-01", povoamento: "2026-03-01", pesoAtualG: 300, peixes: 10000,
    fator: 0.8, base: "lote", mortalidadeSemanaPct: 1, semanasAFrente: 2,
  });
  assert.equal(p.base, "lote");
  assert.equal(p.pontos.length, 2);
  const [a, b] = p.pontos;
  const esperado1 = pesoEsperado(CURVA, 300, 7)!;
  assert.equal(a.data, "2026-06-08");
  assert.equal(a.semana, 15);
  assert.equal(a.pesoG, Math.round((300 + (esperado1 - 300) * 0.8) * 10) / 10);
  assert.equal(a.peixes, 9900);
  assert.equal(b.peixes, 9801);
  assert.equal(a.biomassaKg, Math.round(9900 * a.pesoG / 100) / 10);
  assert.equal(a.ganhoKg, Math.round((a.biomassaKg - 3000) * 10) / 10);
  assert.equal(a.racaoKg, Math.round(a.biomassaKg * taxaNaCurva(CURVA, a.pesoG)! * 7 / 100 * 10) / 10);
  assert.equal(p.despesca, null);
});

test("previsão de despesca: primeira semana em que o peso chega ao alvo, mesmo além do horizonte", () => {
  const p = projetarLote({ curva: CURVA, hoje: "2026-06-01", povoamento: "2026-01-01", pesoAtualG: 1000, peixes: 5000, pesoAlvoG: 1500, semanasAFrente: 4 });
  assert.equal(p.pontos.length, 4);
  assert.ok(p.despesca);
  assert.ok(p.despesca!.pesoG >= 1500);
  // um dia antes o peso estava abaixo do alvo
  const semanas = (Date.parse(p.despesca!.data) - Date.parse("2026-06-01")) / 86400000 / 7;
  assert.ok(pesoEsperado(CURVA, 1000, 7 * (semanas - 1))! < 1500);
  // alvo acima do fim da curva não tem data; peso já no alvo é despesca hoje
  assert.equal(projetarLote({ curva: CURVA, hoje: "2026-06-01", povoamento: "2026-01-01", pesoAtualG: 1000, peixes: 1, pesoAlvoG: 3000 }).despesca, null);
  assert.equal(projetarLote({ curva: CURVA, hoje: "2026-06-01", povoamento: "2026-01-01", pesoAtualG: 1600, peixes: 1, pesoAlvoG: 1500 }).despesca?.data, "2026-06-01");
});

test("sem peso ou sem curva não há projeção", () => {
  assert.deepEqual(projetarLote({ curva: CURVA, hoje: "2026-06-01", povoamento: "2026-01-01", pesoAtualG: null, peixes: 10 }).pontos, []);
  assert.deepEqual(projetarLote({ curva: [], hoje: "2026-06-01", povoamento: "2026-01-01", pesoAtualG: 10, peixes: 10 }).pontos, []);
});

function dias(n: number, f: (i: number) => Partial<DiaLote>): DiaLote[] {
  return Array.from({ length: n }, (_, i) => ({
    lote_id: "L1", lote_codigo: "07", data: `2026-10-${String(i + 1).padStart(2, "0")}`, semana: 20,
    consumo_g_peixe_dia: 6, mortalidade_dia_pct: 0.01, oxigenio_min_mg_l: null, ...f(i),
  }));
}

test("lote estável não gera alerta", () => {
  assert.deepEqual(alertasTendencia(dias(12, () => ({ oxigenio_min_mg_l: 5.5 }))), []);
});

test("um sinal fora da tendência vira atenção; dois sinais juntos viram crítico", () => {
  const umSinal = alertasTendencia(dias(12, (i) => (i >= 9 ? { consumo_g_peixe_dia: 4.8 } : {})));
  assert.equal(umSinal.length, 1);
  assert.equal(umSinal[0].nivel, "atencao");
  assert.deepEqual(umSinal[0].sinais.map((s) => s.tipo), ["racao"]);
  assert.match(umSinal[0].detalhe, /ração aceita caiu 20% \(6,0 → 4,8 g por peixe\)/);

  const doisSinais = alertasTendencia(dias(12, (i) => (i >= 9 ? { consumo_g_peixe_dia: 4.8, mortalidade_dia_pct: 0.12 } : {})));
  assert.equal(doisSinais[0].nivel, "critico");
  assert.deepEqual(doisSinais[0].sinais.map((s) => s.tipo), ["racao", "mortalidade"]);
  assert.match(doisSinais[0].titulo, /Lote 07/);
});

test("queda pequena de ração não alerta", () => {
  assert.deepEqual(alertasTendencia(dias(12, (i) => (i >= 9 ? { consumo_g_peixe_dia: 5.4 } : {}))), []);
});

test("mortalidade só alerta acima do dobro da base e de 0,05% ao dia", () => {
  assert.deepEqual(alertasTendencia(dias(12, (i) => (i >= 9 ? { mortalidade_dia_pct: 0.04 } : {}))), []);
  const muita = alertasTendencia(dias(12, (i) => (i >= 9 ? { mortalidade_dia_pct: 0.12 } : {})));
  assert.deepEqual(muita[0].sinais.map((s) => s.tipo), ["mortalidade"]);
});

test("oxigênio da madrugada caindo é sinal quando a piscicultura mede", () => {
  const a = alertasTendencia(dias(12, (i) => ({ oxigenio_min_mg_l: i >= 9 ? 4.2 : 5.8 })));
  assert.deepEqual(a[0].sinais.map((s) => s.tipo), ["oxigenio"]);
  assert.match(a[0].detalhe, /5,8 → 4,2 mg\/L/);
  // caiu, mas continua com folga: não alerta
  assert.deepEqual(alertasTendencia(dias(12, (i) => ({ oxigenio_min_mg_l: i >= 9 ? 6.5 : 7.8 }))), []);
});

test("menos de 10 dias apontados não tem base para comparar", () => {
  assert.deepEqual(alertasTendencia(dias(8, (i) => (i >= 5 ? { consumo_g_peixe_dia: 1 } : {}))), []);
});

test("cobertura de ração divide o saldo pelo consumo médio diário", () => {
  const r = coberturaRacao(
    [
      { produto_id: "a", nome: "Ração engorda 28%", unidade: "kg", saldo: 1200 },
      { produto_id: "b", nome: "Farelo de soja", unidade: "kg", saldo: 9000 },
      { produto_id: "c", nome: "Calcário", unidade: "kg", saldo: 50 },
    ],
    [
      { produto_id: "a", quantidade: -3000 },
      { produto_id: "b", quantidade: -10000 },
      { produto_id: "b", quantidade: -2000 },
    ],
    30,
  );
  assert.deepEqual(r.map((x) => [x.nome, x.consumoDia, x.dias, x.nivel]), [
    ["Ração engorda 28%", 100, 12, "atencao"],
    ["Farelo de soja", 400, 22.5, null],
    ["Calcário", 0, null, null],
  ]);
  const critico = coberturaRacao([{ produto_id: "a", nome: "R", unidade: "kg", saldo: 500 }], [{ produto_id: "a", quantidade: -3000 }], 30);
  assert.equal(critico[0].nivel, "critico");
});

test("primeira semana com saldo negativo", () => {
  const s = (fim: string, saldo: number) => ({ inicio: fim, fim, entradas: 0, saidas: 0, saldo });
  assert.equal(primeiroSaldoNegativo([s("2026-11-01", 10), s("2026-11-08", -5), s("2026-11-15", -9)])?.fim, "2026-11-08");
  assert.equal(primeiroSaldoNegativo([s("2026-11-01", 10)]), null);
});

test("custo semanal variável deixa de fora alevinos, indiretos e a ração (projetada à parte)", () => {
  const c = { mes: "2026-09-01", custo_total_cents: 60000, alevinos_cents: 7000, indiretos_rateados_cents: 3000, racao_cents: 20000, racao_kg: 4000 };
  assert.equal(custoSemanalVariavel(c), 7000);
  assert.equal(precoRacaoKg(c), 5);
  assert.equal(precoRacaoKg({ ...c, racao_kg: 0 }), null);
});

test("margem da semana: kg ganho vale o preço de venda menos ração e outros custos", () => {
  const ponto = (semana: number, ganhoKg: number, racaoKg: number) =>
    ({ semana, data: `2026-07-${String(semana).padStart(2, "0")}`, pesoG: 0, peixes: 0, biomassaKg: 0, ganhoKg, racaoKg });
  const m = margemProjetada([ponto(1, 500, 900), ponto(2, 300, 950), ponto(3, 150, 1000)], { precoKgCents: 1200, precoRacaoKgCents: 350, outrosSemanaCents: 40000 });
  // 500×1200 − 900×350 − 40.000 = 245.000; 300×1200 − 332.500 − 40.000 = −12.500
  assert.deepEqual(m.semanas.map((x) => x.margemCents), [245000, -12500, -210000]);
  assert.equal(m.semanaNegativa, 2);
});

test("resultado do ciclo soma o custo já apurado com a ração e os outros custos das semanas que faltam", async () => {
  const { baseDoCiclo, resultadoCiclo } = await import("./previsao.ts");
  const pontos = [
    { semana: 20, data: "2026-11-13", pesoG: 1100, peixes: 6000, biomassaKg: 6600, ganhoKg: 300, racaoKg: 500 },
    { semana: 21, data: "2026-11-20", pesoG: 1150, peixes: 5990, biomassaKg: 6888.5, ganhoKg: 288.5, racaoKg: 480 },
  ];
  const base = baseDoCiclo({ pontos, custoAteAgoraCents: 4_000_000, precoRacaoKgCents: 300, outrosSemanaCents: 50_000, kgJaDespescados: 1000, biomassaHojeKg: 6300 });
  assert.deepEqual(base, { custoAteAgoraCents: 4_000_000, custoFuturoCents: 980 * 300 + 2 * 50_000, kgFinal: 6888.5, kgJaDespescados: 1000, semanasRestantes: 2 });

  const r = resultadoCiclo(base, 1200);
  assert.equal(r.kgTotal, 7888.5);
  assert.equal(r.custoTotalCents, 4_394_000);
  assert.equal(r.receitaCents, Math.round(7888.5 * 1200));
  assert.equal(r.lucroCents, r.receitaCents - 4_394_000);
  assert.equal(r.precoEquilibrioCents, Math.ceil(4_394_000 / 7888.5), "abaixo deste preço o ciclo dá prejuízo");
  assert.ok(r.margemPct! > 50);
});

test("resultado do ciclo sem projeção usa a biomassa de hoje e preço zero não divide por zero", async () => {
  const { baseDoCiclo, resultadoCiclo } = await import("./previsao.ts");
  const base = baseDoCiclo({ pontos: [], custoAteAgoraCents: 100_000, precoRacaoKgCents: null, outrosSemanaCents: 9_999, kgJaDespescados: 0, biomassaHojeKg: 500 });
  assert.deepEqual(base, { custoAteAgoraCents: 100_000, custoFuturoCents: 0, kgFinal: 500, kgJaDespescados: 0, semanasRestantes: 0 });
  const r = resultadoCiclo(base, 0);
  assert.equal(r.receitaCents, 0);
  assert.equal(r.margemPct, null);
  assert.equal(r.precoEquilibrioCents, 200);
  const vazio = resultadoCiclo({ ...base, kgFinal: 0 }, 1000);
  assert.equal(vazio.custoKgCents, null);
  assert.equal(vazio.precoEquilibrioCents, null);
});
