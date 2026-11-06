import { test } from "node:test";
import assert from "node:assert/strict";
import { semanasFluxo } from "./fluxo.ts";

test("agrupa por semana e acumula o saldo", () => {
  // 2026-10-26 é segunda-feira
  const s = semanasFluxo(1000, "2026-10-28", "2026-11-09", [
    { data: "2026-10-28", valor_cents: 500 },
    { data: "2026-11-01", valor_cents: -200 },
    { data: "2026-11-02", valor_cents: -2000 },
  ]);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], { inicio: "2026-10-28", fim: "2026-11-01", entradas: 500, saidas: -200, saldo: 1300 });
  assert.equal(s[1].inicio, "2026-11-02");
  assert.equal(s[1].saldo, -700);
  assert.equal(s[2].saldo, -700);
});
