import { test } from "node:test";
import assert from "node:assert/strict";
import { descricaoRacao, numeroEntrada, situacaoValidade, textoSacos } from "./racao-estoque.ts";

test("número da entrada", () => {
  assert.equal(numeroEntrada(42), "R-42");
});

test("situação da validade", () => {
  assert.deepEqual(situacaoValidade(-1), { texto: "vencida há 1 dia", tom: "perigo" });
  assert.deepEqual(situacaoValidade(0), { texto: "vence hoje", tom: "perigo" });
  assert.deepEqual(situacaoValidade(12), { texto: "vence em 12 dias", tom: "alerta" });
  assert.deepEqual(situacaoValidade(30), { texto: "vence em 30 dias", tom: "alerta" });
  assert.equal(situacaoValidade(31).tom, "neutro");
  assert.equal(situacaoValidade(null).tom, "alerta");
});

test("saldo em sacos", () => {
  assert.equal(textoSacos(200, 25), "8 sacos");
  assert.equal(textoSacos(187.5, 25), "7,5 sacos");
  assert.equal(textoSacos(25, 25), "1 saco");
  assert.equal(textoSacos(100, null), "");
});

test("descrição da ração com a ficha técnica", () => {
  assert.equal(descricaoRacao({ nome: "Crescimento", proteina_pct: "32.0", granulometria: "4–6 mm" }), "Crescimento · 32% PB · 4–6 mm");
  assert.equal(descricaoRacao({ nome: "Engorda", proteina_pct: null }), "Engorda");
});
