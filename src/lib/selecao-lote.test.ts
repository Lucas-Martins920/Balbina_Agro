import { test } from "node:test";
import assert from "node:assert/strict";

test("alternarSelecao: marca e desmarca um id sem mexer no conjunto original", async () => {
  const { alternarSelecao } = await import("./selecao-lote.ts");
  const atual = new Set(["a"]);
  assert.deepEqual([...alternarSelecao(atual, "b")].sort(), ["a", "b"]);
  assert.deepEqual([...alternarSelecao(atual, "a")], []);
  assert.deepEqual([...atual], ["a"]);
});

test("alternarTodos: marca todos os visíveis; se já estão todos, desmarca só eles", async () => {
  const { alternarTodos } = await import("./selecao-lote.ts");
  // "z" estava marcado em outro filtro e continua marcado
  assert.deepEqual([...alternarTodos(new Set(["a", "z"]), ["a", "b"])].sort(), ["a", "b", "z"]);
  assert.deepEqual([...alternarTodos(new Set(["a", "b", "z"]), ["a", "b"])], ["z"]);
  assert.deepEqual([...alternarTodos(new Set(), [])], []);
});

test("lerIdsLote: tira vazios e repetidos e limita a quantidade", async () => {
  const { lerIdsLote, MAX_LOTE } = await import("./selecao-lote.ts");
  assert.deepEqual(lerIdsLote(["a", "", "b", "a", null]), { ids: ["a", "b"] });
  assert.deepEqual(lerIdsLote([]), { erro: "Selecione ao menos um item." });
  const muitos = Array.from({ length: MAX_LOTE + 1 }, (_, i) => `id${i}`);
  assert.deepEqual(lerIdsLote(muitos), { erro: `Selecione no máximo ${MAX_LOTE} itens por vez.` });
});

test("mensagemAtivacao: diz quantos mudaram e quantos ficaram de fora", async () => {
  const { mensagemAtivacao } = await import("./selecao-lote.ts");
  assert.equal(mensagemAtivacao(1, true, 0), "1 produto ativado.");
  assert.equal(mensagemAtivacao(3, false, 0), "3 produtos desativados. Eles somem das vendas e lançamentos, mas o histórico fica.");
  assert.equal(mensagemAtivacao(2, false, 1),
    "2 produtos desativados. Eles somem das vendas e lançamentos, mas o histórico fica. 1 produto de estoque da classe de peixe continua ativo.");
});
