import { test } from "node:test";
import assert from "node:assert/strict";
import { foraDoEsperado, sugerirApontamentos, type LancamentoHistorico } from "./sugestao-apontamento.ts";

const L = (data: string, turno: string, racoes: { produto_id: string; kg: number }[] = [], extra: Partial<LancamentoHistorico> = {}): LancamentoHistorico =>
  ({ viveiro_id: "g1", lote_id: "l1", data, turno, racoes, racao_kg: racoes.reduce((t, r) => t + r.kg, 0), ...extra });

test("sem histórico suficiente não sugere nada", () => {
  assert.deepEqual(sugerirApontamentos([L("2026-10-30", "manha", [{ produto_id: "r1", kg: 20 }])], [{ viveiro_id: "g1", lote_id: "l1" }]), {});
});

test("ração pela mediana dos últimos lançamentos do mesmo turno e lote", () => {
  const hist = [
    L("2026-10-31", "manha", [{ produto_id: "r1", kg: 50 }]),
    L("2026-10-30", "manha", [{ produto_id: "r1", kg: 48 }]),
    L("2026-10-29", "manha", [{ produto_id: "r1", kg: 520 }]), // erro de digitação não puxa a mediana
    L("2026-10-31", "tarde", [{ produto_id: "r1", kg: 20 }]),
    L("2026-10-30", "tarde", [{ produto_id: "r1", kg: 22 }]),
    L("2026-10-30", "manha", [{ produto_id: "r1", kg: 7 }], { lote_id: "antigo" }), // lote anterior do viveiro fica de fora
  ];
  const s = sugerirApontamentos(hist, [{ viveiro_id: "g1", lote_id: "l1" }]);
  assert.deepEqual(s.g1.manha, { racaoKg: 50, racoes: [{ produto_id: "r1", kg: 50 }], base: 3 });
  assert.deepEqual(s.g1.tarde, { racaoKg: 21, racoes: [{ produto_id: "r1", kg: 21 }], base: 2 });
});

test("ração segue os tipos do último lançamento do turno e usa só os 7 mais recentes", () => {
  const hist = [
    L("2026-10-31", "manha", [{ produto_id: "r2", kg: 30 }, { produto_id: "r3", kg: 10 }]),
    L("2026-10-30", "manha", [{ produto_id: "r1", kg: 40 }]),
    L("2026-10-29", "manha", [{ produto_id: "r2", kg: 34 }]),
    ...Array.from({ length: 8 }, (_, i) => L(`2026-10-0${i + 1}`, "manha", [{ produto_id: "r1", kg: 1 }])),
  ];
  const s = sugerirApontamentos(hist, [{ viveiro_id: "g1", lote_id: "l1" }]);
  assert.equal(s.g1.manha.racaoKg, 1); // mediana de 7: 3 grandes e 4 de 1 kg
  assert.equal(s.g1.manha.base, 7);
  assert.deepEqual(s.g1.manha.racoes, [{ produto_id: "r2", kg: 32 }, { produto_id: "r3", kg: 10 }]);
});

test("foraDoEsperado: tolera a variação normal e marca o que foge", () => {
  assert.equal(foraDoEsperado(52, 50), false);
  assert.equal(foraDoEsperado(40, 50), true);
  assert.equal(foraDoEsperado(60, 50), true);
  assert.equal(foraDoEsperado(null, 50), false);
  assert.equal(foraDoEsperado(5, 0), false);
});
