import { test } from "node:test";
import assert from "node:assert/strict";
import { CAUSAS_MORTE, lerCausasForm, resumoCausas, validarCausas } from "./causas-morte.ts";

test("lista fixa de causas com chave e nome", () => {
  assert.ok(CAUSAS_MORTE.length >= 6);
  assert.ok(CAUSAS_MORTE.every((c) => /^[a-z_]+$/.test(c.chave) && c.nome));
});

test("validarCausas aceita vazio e tira zeros", () => {
  assert.deepEqual(validarCausas(undefined, 3), { ok: {} });
  assert.deepEqual(validarCausas(null, 0), { ok: {} });
  assert.deepEqual(validarCausas({ oxigenio: 2, predador: 0 }, 3), { ok: { oxigenio: 2 } });
});

test("validarCausas recusa causa desconhecida, número quebrado e soma acima das baixas", () => {
  assert.ok("erro" in validarCausas({ prolapso: 1 }, 5), "causa de outra criação não vale para peixe");
  assert.ok("erro" in validarCausas({ oxigenio: 1.5 }, 5));
  assert.ok("erro" in validarCausas({ oxigenio: -1 }, 5));
  assert.ok("erro" in validarCausas([1], 5));
  const r = validarCausas({ oxigenio: 2, temperatura: 2 }, 3);
  assert.ok("erro" in r && /3/.test(r.erro));
});

test("lerCausasForm lê os campos causa_<chave> do formulário", () => {
  const f = new FormData();
  f.set("causa_oxigenio", "2");
  f.set("causa_temperatura", "");
  assert.deepEqual(lerCausasForm(f, 2), { ok: { oxigenio: 2 } });
  f.set("causa_temperatura", "x");
  assert.ok("erro" in lerCausasForm(f, 2));
});

test("resumoCausas soma por causa, do maior para o menor, com a parte sem causa", () => {
  const r = resumoCausas([{ causa: "oxigenio", peixes: 3 }, { causa: "predador", peixes: 5 }, { causa: "oxigenio", peixes: 1 }], 12);
  assert.deepEqual(r.linhas.map((l) => [l.nome, l.peixes]), [["Predador (aves, jacaré, lontra)", 5], ["Falta de oxigênio", 4]]);
  assert.equal(r.semCausa, 3);
});
