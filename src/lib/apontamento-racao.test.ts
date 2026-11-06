import { test } from "node:test";
import assert from "node:assert/strict";
import { LINHAS_RACAO, lerChecklist, lerRacoes } from "./apontamento-racao.ts";

function form(campos: Record<string, string>) {
  return { get: (k: string) => campos[k] ?? null };
}

test("soma as rações por tipo e ignora linhas vazias", () => {
  const r = lerRacoes(form({ racao_produto_0: "a", racao_kg_0: "120,5", racao_produto_1: "", racao_kg_1: "", racao_produto_2: "b", racao_kg_2: "80" }));
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.itens, [{ produto_id: "a", kg: 120.5 }, { produto_id: "b", kg: 80 }]);
  assert.equal(r.ok.totalKg, 200.5);
});

test("soma o campo de kg sem tipo ao total", () => {
  const r = lerRacoes(form({ racao_kg: "50", racao_produto_0: "a", racao_kg_0: "10" }));
  assert.ok("ok" in r);
  assert.equal(r.ok.totalKg, 60);
});

test("recusa linha com ração sem kg ou kg sem ração", () => {
  assert.ok("erro" in lerRacoes(form({ racao_produto_0: "a" })));
  assert.ok("erro" in lerRacoes(form({ racao_kg_0: "10" })));
  assert.ok("erro" in lerRacoes(form({ racao_kg: "-1" })));
});

test("lê no máximo as linhas da tela", () => {
  const campos: Record<string, string> = {};
  for (let i = 0; i <= LINHAS_RACAO; i++) { campos[`racao_produto_${i}`] = `p${i}`; campos[`racao_kg_${i}`] = "1"; }
  const r = lerRacoes(form(campos));
  assert.ok("ok" in r);
  assert.equal(r.ok.itens.length, LINHAS_RACAO);
});

test("checklist: ok, não ok, número e item em branco", () => {
  const itens = [
    { id: "agua", tipo: "sim_nao" }, { id: "cama", tipo: "sim_nao" }, { id: "temp", tipo: "numero" }, { id: "luz", tipo: "sim_nao" },
  ];
  const r = lerChecklist(form({ ck_agua: "ok", ck_cama: "nao", ck_temp: "31,5", ck_luz: "" }), itens);
  assert.ok("ok" in r);
  assert.deepEqual(r.ok, [{ item_id: "agua", ok: true }, { item_id: "cama", ok: false }, { item_id: "temp", valor: 31.5 }]);
});

test("checklist recusa número inválido", () => {
  const r = lerChecklist(form({ ck_temp: "quente" }), [{ id: "temp", tipo: "numero", nome: "Temperatura" }]);
  assert.ok("erro" in r);
});
