import { test } from "node:test";
import assert from "node:assert/strict";
import { organizarRotina } from "./pendencias.ts";

test("rotina do dia agrupa por área, pendentes e urgentes no alto, feitos embaixo", () => {
  const r = organizarRotina([
    { chave: "extrato", area: "financeiro", titulo: "Extrato para conciliar", quantidade: 12, link: "/conciliacao", urgente: false },
    { chave: "vencidas", area: "financeiro", titulo: "Contas a pagar vencidas", quantidade: 2, link: "/contas-a-pagar", urgente: true },
    { chave: "nfe", area: "financeiro", titulo: "Notas de compra", quantidade: 0, link: "/notas/recebidas", urgente: false },
    { chave: "regras", area: "financeiro", titulo: "Regras sugeridas", quantidade: null, link: "/conciliacao/regras", urgente: false },
    { chave: "viveiro-1", area: "viveiro", titulo: "Apontamento do viveiro 1", quantidade: 0, link: "/apontamentos", urgente: false },
  ]);
  assert.deepEqual(r.areas.map((a) => a.area), ["viveiro", "financeiro"], "viveiro primeiro, área sem item fica de fora");
  assert.deepEqual(r.areas[1].itens.map((p) => p.chave), ["vencidas", "extrato", "nfe"]);
  assert.equal(r.areas[1].pendentes, 2);
  assert.deepEqual({ feitos: r.feitos, total: r.total, pendentes: r.pendentes }, { feitos: 2, total: 4, pendentes: 2 });
});
