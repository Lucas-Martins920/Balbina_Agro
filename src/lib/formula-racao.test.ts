import { test } from "node:test";
import assert from "node:assert/strict";
import { montarItensFormula, resumoFormula } from "./formula-racao.ts";

test("em kg aceita batida de qualquer total, maior ou menor que 1.000", () => {
  const r = montarItensFormula([{ insumo_id: "milho", quantidade: 700 }, { insumo_id: "farelo", quantidade: 350 }], "kg");
  assert.deepEqual(r, { ok: true, total: 1050, itens: [{ insumo_id: "milho", kg: 700 }, { insumo_id: "farelo", kg: 350 }] });
  const menor = montarItensFormula([{ insumo_id: "milho", quantidade: 400 }, { insumo_id: "farelo", quantidade: 100 }], "kg");
  assert.equal(menor.ok && menor.total, 500);
});

test("em % precisa fechar 100 e usa o total da batida informado", () => {
  const r = montarItensFormula([{ insumo_id: "milho", quantidade: 60 }, { insumo_id: "farelo", quantidade: 40 }], "pct", 1200);
  assert.deepEqual(r, { ok: true, total: 1200, itens: [{ insumo_id: "milho", kg: 720 }, { insumo_id: "farelo", kg: 480 }] });
  const errado = montarItensFormula([{ insumo_id: "milho", quantidade: 60 }], "pct", 1000);
  assert.equal(errado.ok, false);
  const semTotal = montarItensFormula([{ insumo_id: "milho", quantidade: 100 }], "pct", null);
  assert.equal(semTotal.ok, false);
});

test("linha incompleta ou fórmula vazia é recusada", () => {
  assert.deepEqual(montarItensFormula([], "kg"), { ok: false, erro: "Informe os ingredientes." });
  const r = montarItensFormula([{ insumo_id: "", quantidade: 10, linha: 3 }], "kg");
  assert.deepEqual(r, { ok: false, erro: "Linha 3: escolha o ingrediente e informe a quantidade." });
});

test("resumo mostra o total da batida e a parte de cada ingrediente", () => {
  assert.deepEqual(resumoFormula([700, 350]), { total: 1050, percentuais: [66.67, 33.33] });
  assert.deepEqual(resumoFormula([]), { total: 0, percentuais: [] });
});
