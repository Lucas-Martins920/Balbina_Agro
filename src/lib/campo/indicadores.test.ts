import { test } from "node:test";
import assert from "node:assert/strict";
import { diferencaPct, pesoMedioAmostra, proximaBiometria, racaoPorTurno, sacosParaKg } from "./indicadores.ts";

test("biometria quinzenal até 70 g, mensal depois", () => {
  assert.deepEqual(proximaBiometria({ peso_g: 40, ultima_biometria: "2026-10-25", povoamento: "2026-10-01" }, "2026-11-05"),
    { data: "2026-11-09", intervalo: 15, atrasada: false, hoje: false });
  assert.deepEqual(proximaBiometria({ peso_g: 420, ultima_biometria: "2026-10-01", povoamento: "2026-08-01" }, "2026-11-05"),
    { data: "2026-10-31", intervalo: 30, atrasada: true, hoje: false });
  assert.equal(proximaBiometria({ peso_g: null, ultima_biometria: null, povoamento: "2026-10-21" }, "2026-11-20").hoje, true);
});

test("ração por turno pela tabela do dia", () => {
  assert.equal(racaoPorTurno(59.3), 29.5);
  assert.equal(racaoPorTurno(0.4), 0.5);
  assert.equal(racaoPorTurno(0), null);
  assert.equal(racaoPorTurno(null), null);
});

test("peso médio da amostra e diferença do estimado", () => {
  assert.equal(pesoMedioAmostra(12.5, 30), 416.6666666666667);
  assert.equal(pesoMedioAmostra(null, 30), null);
  assert.equal(pesoMedioAmostra(12, 0), null);
  assert.equal(Math.round(diferencaPct(441, 420)!), 5);
  assert.equal(diferencaPct(400, null), null);
});

test("sacos para levar", () => {
  assert.equal(sacosParaKg(412, 25), 17);
  assert.equal(sacosParaKg(50, 25), 2);
  assert.equal(sacosParaKg(10, 0), 0);
});
