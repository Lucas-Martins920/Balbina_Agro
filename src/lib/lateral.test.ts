import { test } from "node:test";
import assert from "node:assert/strict";
import { podeEspiar } from "./lateral.ts";

const base = { recolhida: true, ponteiro: "mouse", telaComMouse: true, versaoCompleta: false };

test("barra recolhida abre ao passar o mouse no computador", () => {
  assert.equal(podeEspiar(base), true);
});

test("barra fixada aberta não entra no modo de espiar (e não recolhe ao sair)", () => {
  assert.equal(podeEspiar({ ...base, recolhida: false }), false);
});

test("toque e caneta não abrem por passagem: celular, tablet e notebook com tela de toque abrem pelo botão", () => {
  assert.equal(podeEspiar({ ...base, ponteiro: "touch" }), false);
  assert.equal(podeEspiar({ ...base, ponteiro: "pen" }), false);
});

test("tela sem mouse ou estreita (modo celular no computador) não abre por passagem", () => {
  assert.equal(podeEspiar({ ...base, telaComMouse: false }), false);
});

test("versão completa no celular continua abrindo pelo botão", () => {
  assert.equal(podeEspiar({ ...base, versaoCompleta: true }), false);
});
