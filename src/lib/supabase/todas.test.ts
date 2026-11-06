import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTodas, PAGINA_SUPABASE } from "./todas.ts";

// Imita o PostgREST: devolve no máximo 1.000 linhas por chamada, o que vier pedido no range.
function tabela(total: number, falhaNaPagina?: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ i }));
  const pedidos: [number, number][] = [];
  const montar = () => ({
    range(de: number, ate: number) {
      pedidos.push([de, ate]);
      if (falhaNaPagina !== undefined && pedidos.length === falhaNaPagina) {
        return Promise.resolve({ data: null, error: { message: "caiu" } });
      }
      return Promise.resolve({ data: linhas.slice(de, Math.min(ate + 1, de + PAGINA_SUPABASE)), error: null });
    },
  });
  return { montar, pedidos };
}

test("lê tudo além das 1.000 linhas do Supabase", async () => {
  const t = tabela(2500);
  const { data, error } = await lerTodas(t.montar);
  assert.equal(error, null);
  assert.equal(data?.length, 2500);
  assert.deepEqual(data?.at(-1), { i: 2499 });
  assert.deepEqual(t.pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("uma chamada só quando cabe numa página", async () => {
  const t = tabela(10);
  const { data } = await lerTodas(t.montar);
  assert.equal(data?.length, 10);
  assert.equal(t.pedidos.length, 1);
});

test("página cheia exata pede mais uma e para no vazio", async () => {
  const t = tabela(2000);
  const { data } = await lerTodas(t.montar);
  assert.equal(data?.length, 2000);
  assert.equal(t.pedidos.length, 3);
});

test("respeita o teto", async () => {
  const t = tabela(5000);
  const { data } = await lerTodas(t.montar, 1500);
  assert.equal(data?.length, 1500);
  assert.deepEqual(t.pedidos, [[0, 999], [1000, 1499]]);
});

test("erro em qualquer página devolve o erro, não dados pela metade", async () => {
  const t = tabela(2500, 2);
  const { data, error } = await lerTodas(t.montar);
  assert.equal(data, null);
  assert.equal(error?.message, "caiu");
});
