import { test } from "node:test";
import assert from "node:assert/strict";
import { juntar, partes } from "./cofre-partes.ts";

test("partes e juntar devolvem o mesmo texto", () => {
  const texto = "x".repeat(5000) + "fim";
  const lista = partes(texto, 1800);
  assert.equal(lista.length, 3);
  assert.ok(lista.every((p) => p.length <= 1800));
  assert.equal(juntar(lista), texto);
});

test("texto vazio vira um pedaço vazio", () => {
  assert.deepEqual(partes(""), [""]);
  assert.equal(juntar([""]), "");
});

test("pedaço faltando invalida o valor", () => {
  assert.equal(juntar(["a", null, "c"]), null);
  assert.equal(juntar([]), null);
});
