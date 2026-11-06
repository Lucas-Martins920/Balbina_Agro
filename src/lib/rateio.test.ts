import { test } from "node:test";
import assert from "node:assert/strict";
import { lerRateio, restanteDoRateio } from "./rateio.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "33333333-3333-4333-8333-333333333333";
const CC = "22222222-2222-4222-8222-222222222222";

function form(linhas: [string, string, string, string?][]) {
  const f = new FormData();
  for (const [cat, cc, valor, desc] of linhas) {
    f.append("rateio_categoria", cat);
    f.append("rateio_cc", cc);
    f.append("rateio_valor", valor);
    if (desc !== undefined) f.append("rateio_descricao", desc);
  }
  return f;
}

test("uma linha só leva o total, sem precisar de valor", () => {
  const r = lerRateio(form([[A, CC, ""]]), 15000);
  assert.deepEqual(r, { ok: [{ categoria_id: A, centro_custo_id: CC, valor_cents: 15000, descricao: null }] });
});

test("várias linhas precisam somar o total", () => {
  const r = lerRateio(form([[A, "", "600,00", "Milho"], [B, CC, "400"]]), 100000);
  assert.deepEqual(r, { ok: [
    { categoria_id: A, centro_custo_id: null, valor_cents: 60000, descricao: "Milho" },
    { categoria_id: B, centro_custo_id: CC, valor_cents: 40000, descricao: null },
  ] });
  assert.match((lerRateio(form([[A, "", "600"], [B, "", "300"]]), 100000) as { erro: string }).erro, /soma R\$\s900,00.*R\$\s1\.000,00/);
});

test("recusa linha sem categoria ou sem valor", () => {
  assert.ok("erro" in lerRateio(form([[A, "", "10"], ["", "", "10"]]), 2000));
  assert.ok("erro" in lerRateio(form([[A, "", "10"], [B, "", ""]]), 1000));
  assert.ok("erro" in lerRateio(form([[A, "", "10"], [B, "", "0"]]), 1000));
  assert.ok("erro" in lerRateio(new FormData(), 1000));
});

test("restante mostra quanto falta ou sobra", () => {
  assert.equal(restanteDoRateio(["600,00", "300"], 100000), 10000);
  assert.equal(restanteDoRateio(["600,00", "500"], 100000), -10000);
  assert.equal(restanteDoRateio(["", "abc"], 100000), 100000);
});
