import { test } from "node:test";
import assert from "node:assert/strict";
import { cookiePonto, fretePorUnidade, lerDocumento, lerUf, pctPerda } from "./pontos.ts";

test("frete por kg divide o frete pelos kg que chegaram bons", () => {
  // R$ 150 para 480 kg recebidos: R$ 0,31 por kg; a caixa de 20 kg leva R$ 6,25
  assert.equal(fretePorUnidade(15000, 480), 31);
  assert.equal(fretePorUnidade(15000, 480, 20), 625);
  assert.equal(fretePorUnidade(0, 480), null);
  assert.equal(fretePorUnidade(15000, 0), null);
});

test("perda em porcentagem dos kg enviados", () => {
  assert.equal(pctPerda(12, 240), 5);
  assert.equal(pctPerda(1, 3), 33.3);
  assert.equal(pctPerda(0, 0), null);
});

test("documento do ponto aceita CPF ou CNPJ com ou sem máscara", () => {
  assert.equal(lerDocumento("12.345.678/0002-90"), "12345678000290");
  assert.equal(lerDocumento("123.456.789-01"), "12345678901");
  assert.equal(lerDocumento(""), null);
  assert.equal(lerDocumento("123"), "invalido");
});

test("UF vira maiúscula e precisa de duas letras", () => {
  assert.equal(lerUf("am"), "AM");
  assert.equal(lerUf(" "), null);
  assert.equal(lerUf("Amazonas"), "invalido");
});

test("cookie do ponto do PDV é por empresa", () => {
  assert.notEqual(cookiePonto("a"), cookiePonto("b"));
});
