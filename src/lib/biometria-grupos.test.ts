import { test } from "node:test";
import assert from "node:assert/strict";
import { totaisGrupos, validarGrupos } from "./biometria-grupos.ts";

test("média ponderada: peso total ÷ peixes, não a média dos grupos", () => {
  const t = totaisGrupos([{ peixes: 10, peso_kg: 1.5 }, { peixes: 40, peso_kg: 8 }]);
  assert.deepEqual(t, { grupos: 2, peixes: 50, pesoTotalG: 9500, pesoMedioG: 190 });   // média dos grupos daria 175 g
});

test("grupo incompleto (rascunho) fica fora da conta", () => {
  assert.deepEqual(totaisGrupos([{ peixes: 10, peso_kg: 2 }, { peixes: null, peso_kg: 3 }, { peixes: 5, peso_kg: null }]),
    { grupos: 1, peixes: 10, pesoTotalG: 2000, pesoMedioG: 200 });
  assert.equal(totaisGrupos([]).pesoMedioG, null);
});

test("validação dos grupos", () => {
  assert.deepEqual(validarGrupos([{ peixes: 10, peso_kg: 1.5, ponto_captura: " cocho ", observacao: "" }]),
    { ok: [{ peixes: 10, peso_kg: 1.5, ponto_captura: "cocho", observacao: undefined }] });
  assert.deepEqual(validarGrupos([]), { erro: "Informe pelo menos um grupo pesado." });
  assert.deepEqual(validarGrupos([{ peixes: 10, peso_kg: 1 }, { peixes: 2.5, peso_kg: 1 }]), { erro: "Grupo 2: informe quantos peixes foram pesados." });
  assert.deepEqual(validarGrupos([{ peixes: 10, peso_kg: 0 }]), { erro: "Grupo 1: o peso precisa ser maior que zero (em kg)." });
  assert.deepEqual(validarGrupos("x"), { erro: "Informe pelo menos um grupo pesado." });
});
