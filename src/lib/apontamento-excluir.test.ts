import { test } from "node:test";
import assert from "node:assert/strict";
import { periodoLancamentos, podeExcluirLancamento } from "./apontamento-excluir.ts";

const FUSO = "America/Manaus";
const agora = new Date("2026-11-01T15:00:00Z"); // 11h em Manaus

test("gerente e master excluem qualquer lançamento", () => {
  assert.equal(podeExcluirLancamento({ gerencia: true, eu: "a", criadoPor: "b", criadoEm: "2026-10-01T10:00:00Z", fuso: FUSO, agora }), true);
});

test("tratador exclui só o que ele lançou hoje, no fuso da piscicultura", () => {
  const base = { gerencia: false, eu: "g", fuso: FUSO, agora };
  assert.equal(podeExcluirLancamento({ ...base, criadoPor: "g", criadoEm: "2026-11-01T12:00:00Z" }), true);
  assert.equal(podeExcluirLancamento({ ...base, criadoPor: "outro", criadoEm: "2026-11-01T12:00:00Z" }), false);
  // 02h UTC de 01/11 ainda é 31/10 em Manaus
  assert.equal(podeExcluirLancamento({ ...base, criadoPor: "g", criadoEm: "2026-11-01T02:00:00Z" }), false);
  assert.equal(podeExcluirLancamento({ ...base, criadoPor: null, criadoEm: "2026-11-01T12:00:00Z" }), false);
});

test("período padrão são os últimos três dias; datas inválidas ou invertidas voltam ao padrão ou se ajustam", () => {
  assert.deepEqual(periodoLancamentos({}, "2026-11-01"), { de: "2026-10-30", ate: "2026-11-01" });
  assert.deepEqual(periodoLancamentos({ de: "2026-09-10", ate: "2026-09-12" }, "2026-11-01"), { de: "2026-09-10", ate: "2026-09-12" });
  assert.deepEqual(periodoLancamentos({ de: "lixo", ate: "2026-12-25" }, "2026-11-01"), { de: "2026-10-30", ate: "2026-11-01" });
  assert.deepEqual(periodoLancamentos({ de: "2026-10-20", ate: "2026-10-10" }, "2026-11-01"), { de: "2026-10-10", ate: "2026-10-20" });
  // no máximo 62 dias de uma vez
  assert.deepEqual(periodoLancamentos({ de: "2026-01-01", ate: "2026-10-31" }, "2026-11-01"), { de: "2026-08-31", ate: "2026-10-31" });
});
