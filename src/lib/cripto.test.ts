import { test } from "node:test";
import assert from "node:assert/strict";
import { cifrar, decifrar, hashToken, novoToken, tokenConfereHash } from "./cripto.ts";

const SEGREDO = "x".repeat(40);

test("cifra e decifra a chave da piscicultura", () => {
  const guardado = cifrar("$aact_chave_da_piscicultura", SEGREDO);
  assert.notEqual(guardado.includes("aact"), true);
  assert.equal(decifrar(guardado, SEGREDO), "$aact_chave_da_piscicultura");
  assert.notEqual(cifrar("a", SEGREDO), cifrar("a", SEGREDO));
});

test("segredo errado ou dado adulterado não decifra", () => {
  const guardado = cifrar("chave", SEGREDO);
  assert.throws(() => decifrar(guardado, "y".repeat(40)));
  const [v, iv, tag] = guardado.split(":");
  assert.throws(() => decifrar([v, iv, tag, Buffer.from("outra coisa").toString("base64")].join(":"), SEGREDO));
  assert.throws(() => cifrar("chave", "curto"));
});

test("token do webhook confere pelo hash", () => {
  const token = novoToken();
  assert.ok(token.length >= 32);
  assert.equal(tokenConfereHash(token, hashToken(token)), true);
  assert.equal(tokenConfereHash(token + "x", hashToken(token)), false);
  assert.equal(tokenConfereHash(null, hashToken(token)), false);
});
