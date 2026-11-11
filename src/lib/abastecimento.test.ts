import { test } from "node:test";
import assert from "node:assert/strict";
import { planoAbastecimento, textoListaCompra } from "./abastecimento.ts";
import type { Cobertura } from "./previsao.ts";

const C = (produto_id: string, saldo: number, consumoDia: number, unidade = "kg"): Cobertura =>
  ({ produto_id, nome: produto_id, unidade, saldo, consumoDia, dias: consumoDia ? saldo / consumoDia : null, nivel: null });

test("compra cobre os dias de compra pelo consumo médio, a que acaba antes primeiro", () => {
  const r = planoAbastecimento([C("engorda", 5000, 200), C("recria", 500, 100)]);
  assert.deepEqual(r.comprar.map((c) => [c.produto_id, c.quantidade]), [["recria", 2500], ["engorda", 1000]]); // 30 × 100 − 500; 30 × 200 − 5000
});

test("dias de compra configurados e arredondamento de 10 kg", () => {
  const r = planoAbastecimento([C("engorda", 3, 10)], 7);
  assert.equal(r.comprar[0].quantidade, 70); // 7 × 10 − 3 = 67 → 70
});

test("com estoque suficiente ou sem consumo não sugere nada", () => {
  assert.deepEqual(planoAbastecimento([C("pronta", 40000, 1000), C("sem-uso", 5, 0)]), { comprar: [] });
});

test("texto da lista de compra", () => {
  assert.equal(textoListaCompra([{ produto_id: "m", nome: "Ração 32%", unidade: "kg", quantidade: 17000, dias: 1 }], "Piscicultura X"),
    "Pedido de compra - Piscicultura X\n- Ração 32%: 17.000 kg");
});
