import { test } from "node:test";
import assert from "node:assert/strict";
import { producaoPorDia, ranking, receitasDespesas, rotuloMes, type LinhaCaixa } from "./painel.ts";

const l = (mes: string, tipo: string, categoria: string, valor_cents: number, centro_custo_id: string | null = null): LinhaCaixa =>
  ({ mes, tipo, categoria, valor_cents, centro_custo_id });

test("separa receitas e despesas por mês e ignora meses fora da janela", () => {
  const r = receitasDespesas(["2026-09-01", "2026-10-01"], [
    l("2026-09-01", "receber", "Venda de peixe", 1000),
    l("2026-10-01", "pagar", "Ração", 400),
    l("2026-10-01", "pagar", "Energia", 100),
    l("2026-08-01", "pagar", "Ração", 999),
  ]);
  assert.deepEqual(r, { receitas: [1000, 0], despesas: [0, 500] });
});

test("ranking soma só despesas, ordena e junta o resto em Outros", () => {
  const r = ranking([
    l("2026-10-01", "pagar", "Ração", 500),
    l("2026-09-01", "pagar", "Ração", 300),
    l("2026-10-01", "pagar", "Energia", 200),
    l("2026-10-01", "pagar", "Calcário", 50),
    l("2026-10-01", "receber", "Venda de peixe", 9000),
  ], (x) => x.categoria, 2);
  assert.deepEqual(r, [{ nome: "Ração", valor: 800 }, { nome: "Energia", valor: 200 }, { nome: "Outros", valor: 50 }]);
});

test("produção do dia soma os lotes: ração, baixas, biomassa, taxa e menor oxigênio", () => {
  const p = producaoPorDia([
    { data: "2026-10-02", peixes: 1000, baixas_peixes: 2, racao_kg: 12, biomassa_kg: 400, oxigenio_min_mg_l: 4.5 },
    { data: "2026-10-01", peixes: 1000, baixas_peixes: 0, racao_kg: 10, biomassa_kg: 390, oxigenio_min_mg_l: null },
    { data: "2026-10-02", peixes: 3000, baixas_peixes: 6, racao_kg: 18, biomassa_kg: 600, oxigenio_min_mg_l: 3.8 },
  ]);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { data: "2026-10-01", peixes: 1000, baixas: 0, racaoKg: 10, biomassaKg: 390, oxigenioMin: null, taxaPct: (100 * 10) / 390, mortalidadePct: 0 });
  assert.deepEqual(p[1], { data: "2026-10-02", peixes: 4000, baixas: 8, racaoKg: 30, biomassaKg: 1000, oxigenioMin: 3.8, taxaPct: 3, mortalidadePct: 0.2 });
});

test("dia sem biomassa nem peixes não divide por zero", () => {
  const [d] = producaoPorDia([{ data: "2026-10-01", peixes: 0, baixas_peixes: 0, racao_kg: 5, biomassa_kg: null }]);
  assert.equal(d.taxaPct, null);
  assert.equal(d.mortalidadePct, null);
});

test("rótulo do mês", () => {
  assert.equal(rotuloMes("2026-10-01"), "out");
  assert.equal(rotuloMes("2027-01-01", true), "jan/27");
});
