import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeDaContraparte } from "./contraparte.ts";

test("tira o tipo, a data, a hora e os números do PIX", () => {
  assert.equal(nomeDaContraparte("PIX - ENVIADO 02/03 17:02 FRANCISCO HELDER DE OLIVE"), "Francisco Helder De Olive");
  assert.equal(nomeDaContraparte("PIX - RECEBIDO 02/03 17:33 00002369385251 JOSE BENILD"), "Jose Benild");
});

test("prefere o nome que o banco mandou", () => {
  assert.equal(nomeDaContraparte("PIX ENVIADO", "AGROPECUARIA BOA LTDA"), "Agropecuaria Boa Ltda");
});

test("TED, DOC e boleto", () => {
  assert.equal(nomeDaContraparte("TED ENVIADA 123 456 RACOES DO NORTE"), "Racoes Do Norte");
  assert.equal(nomeDaContraparte("PAGTO BOLETO EMBALAGENS SILVA"), "Embalagens Silva");
});

test("sem nome sobra vazio", () => {
  assert.equal(nomeDaContraparte("TARIFA 12,90"), "");
  assert.equal(nomeDaContraparte("PIX - ENVIADO 02/03 17:02"), "");
});
