import { test } from "node:test";
import assert from "node:assert/strict";

test("ordenarArvore: pais pela ordem escolhida, filhos logo abaixo, empate pelo nome", async () => {
  const { ordenarArvore } = await import("./ordem.ts");
  const itens = [
    { id: "b", nome: "Banco", parent_id: null, ordem: 2 },
    { id: "a", nome: "Água", parent_id: null, ordem: 1 },
    { id: "a2", nome: "Zinco", parent_id: "a", ordem: 1 },
    { id: "a1", nome: "Alfa", parent_id: "a", ordem: 2 },
    { id: "c", nome: "Casa", parent_id: null, ordem: 2 },
    { id: "n", nome: "Novo", parent_id: null },
  ];
  assert.deepEqual(ordenarArvore(itens).map((x) => `${x.item.id}:${x.nivel}`), ["a:0", "a2:1", "a1:1", "b:0", "c:0", "n:0"]);
});

test("ordenarArvore: filho sem o pai na lista sobe para a raiz; ciclo não trava", async () => {
  const { ordenarArvore } = await import("./ordem.ts");
  assert.deepEqual(ordenarArvore([{ id: "f", nome: "F", parent_id: "sumiu", ordem: 1 }]).map((x) => x.nivel), [0]);
  const ciclo = ordenarArvore([{ id: "x", nome: "X", parent_id: "y" }, { id: "y", nome: "Y", parent_id: "x" }]);
  assert.equal(ciclo.length, 2);
});

test("moverPara: arrasta um item para a posição de outro", async () => {
  const { moverPara } = await import("./ordem.ts");
  assert.deepEqual(moverPara(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moverPara(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
});

test("ordenarArvore: categorias principais seguem a ordem dos grupos do DRE", async () => {
  const { emOrdem } = await import("./ordem.ts");
  const itens = [
    { id: "d", nome: "Despesa", grupo: "despesa_operacional", ordem: 1 },
    { id: "r", nome: "Receita", grupo: "receita_operacional", ordem: 5 },
    { id: "c", nome: "Custo", grupo: "custo_operacional", ordem: 1 },
  ];
  assert.deepEqual(emOrdem(itens).map((x) => x.id), ["r", "c", "d"]);
});
