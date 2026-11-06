import { test } from "node:test";
import assert from "node:assert/strict";
import { crescimentoLote, fatorCrescimento, idadeEquivalente, pesoCurva, pesoEsperado, semanaCultivo } from "./crescimento.ts";

// Pedaço da curva do tambaqui cadastrada no banco (semana, peso em g)
const CURVA = [
  [1, 0.5], [2, 0.9], [3, 1.6], [9, 22.3], [10, 31.4], [15, 124], [16, 155], [19, 275], [20, 324], [60, 2644],
].map(([semana, peso_g]) => ({ semana, peso_g }));

const perto = (a: number | null, b: number, casas = 2) => assert.ok(a !== null && Math.abs(a - b) < 10 ** -casas, `${a} ≠ ${b}`);

test("semana de cultivo igual à do banco: (data - povoamento) / 7 + 1", () => {
  assert.equal(semanaCultivo("2026-01-01", "2026-01-01"), 1);
  assert.equal(semanaCultivo("2026-01-01", "2026-01-07"), 1);
  assert.equal(semanaCultivo("2026-01-01", "2026-01-08"), 2);
  assert.equal(semanaCultivo("2026-01-01", "2026-03-05"), 10);
});

test("peso da curva e idade equivalente dão o mesmo que app.peso_curva e app.idade_equivalente", () => {
  // valores tirados do banco com a curva completa do tambaqui
  perto(pesoCurva(CURVA, 10.5), 1.25);
  perto(idadeEquivalente(CURVA, 30), 61.923);
  assert.equal(pesoCurva(CURVA, 5000), 2644);
  assert.equal(idadeEquivalente(CURVA, 0.2), 0);
  assert.equal(idadeEquivalente(CURVA, 3000), 59 * 7);
  assert.equal(pesoCurva([], 10), null);
});

test("peso esperado parte do peso conhecido e só sobe", () => {
  // 30 g + 70 dias: semana equivalente 18,85 entre 155 g (16) e 275 g (19)
  const idade = idadeEquivalente(CURVA, 30)! + 70;
  perto(pesoEsperado(CURVA, 30, 70), pesoCurva(CURVA, idade)!);
  assert.equal(pesoEsperado(CURVA, 3000, 30), 3000);
  assert.equal(pesoEsperado(CURVA, null, 30), null);
  assert.equal(pesoEsperado([], 40, 30), 40);
});

test("biometrias contra o esperado desde o povoamento, com ganho diário", () => {
  const r = crescimentoLote({
    povoamento: "2026-01-01", pesoInicialG: 30, curva: CURVA,
    biometrias: [
      { data: "2026-03-12", peso_medio_g: "250", uniformidade_pct: "78" },
      { data: "2026-02-10", peso_medio_g: 110, uniformidade_pct: null },
    ],
  });
  assert.deepEqual(r.map((p) => [p.data, p.dias, p.semana, p.peso]), [["2026-02-10", 40, 6, 110], ["2026-03-12", 70, 11, 250]]);
  perto(r[1].esperado, pesoEsperado(CURVA, 30, 70)!);
  perto(r[1].diferencaPct, (250 / pesoEsperado(CURVA, 30, 70)! - 1) * 100);
  assert.equal(r[0].gpd, 2);
  perto(r[1].gpd, 140 / 30);
  assert.equal(r[1].uniformidade, 78);
});

test("fator de crescimento: ganho real sobre o ganho da curva, entre 0,5 e 1,3", () => {
  const r = crescimentoLote({ povoamento: "2026-01-01", pesoInicialG: 30, curva: CURVA, biometrias: [{ data: "2026-03-12", peso_medio_g: 250 }] });
  perto(fatorCrescimento(r, 30), (250 - 30) / (pesoEsperado(CURVA, 30, 70)! - 30), 6);
  assert.equal(fatorCrescimento([], 30), 1);
  const lento = crescimentoLote({ povoamento: "2026-01-01", pesoInicialG: 30, curva: CURVA, biometrias: [{ data: "2026-03-12", peso_medio_g: 40 }] });
  assert.equal(fatorCrescimento(lento, 30), 0.5);
});
