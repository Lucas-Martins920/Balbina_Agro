import { test } from "node:test";
import assert from "node:assert/strict";
import { amoniaToxica, avisosAgua, lerMedida, resumoAgua, validarAgua } from "./agua.ts";

test("lerMedida aceita vírgula e ponto; vazio é undefined; texto é null", () => {
  assert.equal(lerMedida("5,2"), 5.2);
  assert.equal(lerMedida(" 7.5 "), 7.5);
  assert.equal(lerMedida(""), undefined);
  assert.equal(lerMedida(null), undefined);
  assert.equal(lerMedida("abc"), null);
});

test("validarAgua tira vazios, lê texto e números, recusa fora da faixa", () => {
  assert.deepEqual(validarAgua(null), { ok: null });
  assert.deepEqual(validarAgua({ oxigenio_mg_l: "", ph: null }), { ok: null });
  assert.deepEqual(validarAgua({ oxigenio_mg_l: "5,2", temperatura_c: 29 }), { ok: { oxigenio_mg_l: 5.2, temperatura_c: 29 } });
  assert.ok("erro" in validarAgua({ ph: 15 }));
  assert.ok("erro" in validarAgua({ ph: "x" }));
  assert.ok("erro" in validarAgua({ salinidade: 3 }));
  assert.ok("erro" in validarAgua([1]));
});

test("amônia tóxica pela fórmula de Emerson: sobe com o pH e a temperatura", () => {
  assert.equal(amoniaToxica(1, null, 28), null);
  const ph7 = amoniaToxica(1, 7, 28)!;
  const ph8 = amoniaToxica(1, 8, 28)!;
  assert.ok(ph7 > 0.005 && ph7 < 0.01, `pH 7 a 28 °C: ${ph7}`);
  assert.ok(ph8 > ph7 * 8, "um ponto de pH multiplica perto de 10 vezes");
});

test("avisos da água seguem as faixas do tambaqui", () => {
  assert.deepEqual(avisosAgua({ oxigenio_mg_l: 5, temperatura_c: 29, ph: 6.5 }), []);
  const od = avisosAgua({ oxigenio_mg_l: 2.5 });
  assert.equal(od[0].nivel, "critico");
  assert.match(od[0].texto, /suspenda a ração/);
  assert.equal(avisosAgua({ oxigenio_mg_l: 3.5 })[0].nivel, "atencao");
  assert.equal(avisosAgua({ temperatura_c: 22 })[0].chave, "temperatura_c");
  assert.match(avisosAgua({ ph: 4 })[0].texto, /calagem/);
  assert.equal(avisosAgua({ amonia_mg_l: 3, ph: 8.5, temperatura_c: 30 })[0].nivel, "critico");
  assert.equal(avisosAgua({ amonia_mg_l: 1.5 })[0].chave, "amonia_mg_l");
});

test("resumoAgua junta as medidas numa linha", () => {
  assert.equal(resumoAgua({ oxigenio_mg_l: 5.2, temperatura_c: 29, ph: 6.5 }), "OD 5,2 · 29 °C · pH 6,5");
  assert.equal(resumoAgua(null), "");
});
