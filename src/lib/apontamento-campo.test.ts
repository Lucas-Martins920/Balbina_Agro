import { test } from "node:test";
import assert from "node:assert/strict";
import { validarApontamentoCampo } from "./apontamento-campo.ts";

const base = {
  client_id: "5f2b7c1e-8a1d-4c4e-9b0a-1a2b3c4d5e6f",
  viveiro_id: "c0000000-0000-0000-0000-000000000002",
  data: "2026-10-25",
  turno: "tarde",
  mortes: 2,
  racao_kg: 110.5,
};

test("aceita lançamento válido com turno, ração e sem água", () => {
  const r = validarApontamentoCampo(base, "2026-10-26");
  assert.ok("ok" in r);
  assert.equal(r.ok.turno, "tarde");
  assert.equal(r.ok.racao_kg, 110.5);
  assert.equal(r.ok.descartes, 0);
  assert.equal(r.ok.agua, null);
});

test("sem turno vale a manhã", () => {
  const r = validarApontamentoCampo({ ...base, turno: undefined }, "2026-10-26");
  assert.ok("ok" in r);
  assert.equal(r.ok.turno, "manha");
});

test("qualidade da água vem junto e é conferida", () => {
  const r = validarApontamentoCampo({ ...base, agua: { oxigenio_mg_l: 4.2, temperatura_c: "29,5", ph: "" } }, "2026-10-26");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.agua, { oxigenio_mg_l: 4.2, temperatura_c: 29.5 });
  assert.ok("erro" in validarApontamentoCampo({ ...base, agua: { ph: 20 } }, "2026-10-26"));
  assert.ok("erro" in validarApontamentoCampo({ ...base, agua: "boa" }, "2026-10-26"));
});

test("recusa data futura, turno desconhecido e mortes fracionadas", () => {
  assert.ok("erro" in validarApontamentoCampo({ ...base, data: "2026-10-27" }, "2026-10-26"));
  assert.ok("erro" in validarApontamentoCampo({ ...base, turno: "noite" }, "2026-10-26"));
  assert.ok("erro" in validarApontamentoCampo({ ...base, mortes: 1.5 }, "2026-10-26"));
  assert.ok("erro" in validarApontamentoCampo({ ...base, racao_kg: -1 }, "2026-10-26"));
  assert.ok("erro" in validarApontamentoCampo({ ...base, client_id: "x" }, "2026-10-26"));
});

test("medicação opcional junto do lançamento", () => {
  const sem = validarApontamentoCampo(base, "2026-10-26");
  assert.ok("ok" in sem);
  assert.equal(sem.ok.medicacao, null);

  const med = { medicamento_id: "c0000000-0000-0000-0000-0000000000cc", dias: 3, dose_por_unidade: 5, base_dose: 100 };
  const r = validarApontamentoCampo({ ...base, medicacao: med }, "2026-10-26");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.medicacao, { ...med, quantidade: null });

  const padrao = validarApontamentoCampo({ ...base, medicacao: { medicamento_id: med.medicamento_id } }, "2026-10-26");
  assert.ok("ok" in padrao);
  assert.deepEqual(padrao.ok.medicacao, { medicamento_id: med.medicamento_id, dias: 1, dose_por_unidade: null, base_dose: null, quantidade: null });

  // versão antiga do celular manda a base como agua_l
  const antiga = validarApontamentoCampo({ ...base, medicacao: { medicamento_id: med.medicamento_id, agua_l: 50 } }, "2026-10-26");
  assert.ok("ok" in antiga);
  assert.equal(antiga.ok.medicacao?.base_dose, 50);
});

test("recusa medicação inválida", () => {
  const med = { medicamento_id: "c0000000-0000-0000-0000-0000000000cc" };
  for (const errado of [{ medicamento_id: "x" }, { ...med, dias: 0 }, { ...med, dias: 1.5 }, { ...med, dose_por_unidade: -1 }, { ...med, base_dose: 0 }, { ...med, quantidade: "2" }]) {
    assert.ok("erro" in validarApontamentoCampo({ ...base, medicacao: errado }, "2026-10-26"), JSON.stringify(errado));
  }
});

test("ração por tipo e checklist do viveiro vêm junto, como na tela web", () => {
  const racoes = [{ produto_id: "c0000000-0000-0000-0000-0000000000d1", kg: 60 }, { produto_id: "c0000000-0000-0000-0000-0000000000d2", kg: 50.5 }];
  const checklist = [{ item_id: "c0000000-0000-0000-0000-0000000000e1", ok: true }, { item_id: "c0000000-0000-0000-0000-0000000000e2", valor: 27.5 }];
  const r = validarApontamentoCampo({ ...base, racoes, checklist }, "2026-10-26");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.racoes, racoes);
  assert.deepEqual(r.ok.checklist, checklist);
  assert.equal(r.ok.forcar, false);

  // sem total, vale a soma dos tipos
  const semTotal = validarApontamentoCampo({ ...base, racao_kg: undefined, racoes }, "2026-10-26");
  assert.ok("ok" in semTotal);
  assert.equal(semTotal.ok.racao_kg, 110.5);

  const forcado = validarApontamentoCampo({ ...base, forcar: true }, "2026-10-26");
  assert.ok("ok" in forcado);
  assert.equal(forcado.ok.forcar, true);
});

test("fila antiga sem ração por tipo nem checklist continua aceita", () => {
  const r = validarApontamentoCampo(base, "2026-10-26");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.racoes, []);
  assert.deepEqual(r.ok.checklist, []);
});

test("recusa ração por tipo e checklist inválidos", () => {
  const prod = "c0000000-0000-0000-0000-0000000000d1";
  for (const racoes of [[{ produto_id: "x", kg: 1 }], [{ produto_id: prod, kg: 0 }], [{ produto_id: prod, kg: "5" }], [{ produto_id: prod, kg: 2000 }], "lista"]) {
    assert.ok("erro" in validarApontamentoCampo({ ...base, racoes }, "2026-10-26"), JSON.stringify(racoes));
  }
  const item = "c0000000-0000-0000-0000-0000000000e1";
  for (const checklist of [[{ item_id: "x", ok: true }], [{ item_id: item }], [{ item_id: item, ok: "sim" }], [{ item_id: item, valor: Infinity }]]) {
    assert.ok("erro" in validarApontamentoCampo({ ...base, checklist }, "2026-10-26"), JSON.stringify(checklist));
  }
});

test("causa das baixas é opcional e não passa das mortes + descartes", () => {
  const sem = validarApontamentoCampo(base, "2026-10-26");
  assert.ok("ok" in sem && Object.keys(sem.ok.causas).length === 0);
  const com = validarApontamentoCampo({ ...base, descartes: 1, causas: { oxigenio: 2, predador: 1 } }, "2026-10-26");
  assert.ok("ok" in com);
  assert.deepEqual(com.ok.causas, { oxigenio: 2, predador: 1 });
  assert.ok("erro" in validarApontamentoCampo({ ...base, causas: { oxigenio: 3 } }, "2026-10-26"));
  assert.ok("erro" in validarApontamentoCampo({ ...base, causas: { inventada: 1 } }, "2026-10-26"));
});
