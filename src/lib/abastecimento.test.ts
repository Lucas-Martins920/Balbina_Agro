import { test } from "node:test";
import assert from "node:assert/strict";
import { planoAbastecimento, textoListaCompra } from "./abastecimento.ts";
import type { Cobertura } from "./previsao.ts";

const C = (produto_id: string, saldo: number, consumoDia: number, unidade = "kg"): Cobertura =>
  ({ produto_id, nome: produto_id, unidade, saldo, consumoDia, dias: consumoDia ? saldo / consumoDia : null, nivel: null });

test("ração com fórmula vira ordem da fábrica e puxa os insumos", () => {
  const cob = [C("engorda", 500, 1000), C("milho", 1000, 600), C("farelo", 5000, 200)];
  const r = planoAbastecimento(cob, [{ racao_id: "engorda", itens: [{ insumo_id: "milho", kg_por_tonelada: 600 }, { insumo_id: "farelo", kg_por_tonelada: 250 }] }]);
  assert.deepEqual(r.produzir, [{ produto_id: "engorda", nome: "engorda", kg: 6500, dias: 0.5 }]); // 7 dias × 1000 − 500
  const milho = r.comprar.find((c) => c.produto_id === "milho")!;
  assert.equal(milho.quantidade, 17000); // 30 × 600 − 1000 (maior que 6500 × 0,6 − 1000)
  assert.equal(milho.motivo, "consumo");
  const farelo = r.comprar.find((c) => c.produto_id === "farelo")!;
  assert.equal(farelo.quantidade, 1000); // 30 × 200 − 5000
});

test("insumo sem consumo histórico ainda entra se a produção precisa", () => {
  const cob = [C("engorda", 0, 1000), C("setor", 10, 0)];
  const r = planoAbastecimento(cob, [{ racao_id: "engorda", itens: [{ insumo_id: "setor", kg_por_tonelada: 40 }] }]);
  assert.deepEqual(r.comprar, [{ produto_id: "setor", nome: "setor", unidade: "kg", dias: null, quantidade: 270, motivo: "producao" }]);
});

test("com estoque suficiente não sugere nada", () => {
  const r = planoAbastecimento([C("pronta", 40000, 1000), C("vacina", 5, 0, "un")], []);
  assert.deepEqual(r, { produzir: [], comprar: [] });
});

test("texto da lista de compra", () => {
  assert.equal(textoListaCompra([{ produto_id: "m", nome: "Milho", unidade: "kg", quantidade: 17000, dias: 1, motivo: "consumo" }], "Piscicultura X"),
    "Pedido de compra - Piscicultura X\n- Milho: 17.000 kg");
});
