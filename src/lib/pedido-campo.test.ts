import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoWhatsapp, validarPedidoCampo } from "./pedido-campo.ts";

const ID = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const PROD = "7a1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const base = { client_id: ID, cliente_id: ID, data: "2026-10-29", condicao: "d7", forma_pagamento: "pix", entrega: "2026-10-30", observacoes: " portão azul ", itens: [{ produto_id: PROD, quantidade: 3 }] };

test("pedido válido do vendedor vira as parcelas da condição escolhida", () => {
  const r = validarPedidoCampo(base, "2026-10-29");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.parcelas, [{ dias: 7, pct: 100 }]);
  assert.equal(r.ok.observacoes, "portão azul");
  assert.deepEqual(r.ok.itens, [{ produto_id: PROD, quantidade: 3 }]);
});

test("pedido feito offline ontem ainda entra; do futuro ou de mais de 7 dias, não", () => {
  assert.ok("ok" in validarPedidoCampo({ ...base, data: "2026-10-28" }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, data: "2026-10-30" }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, data: "2026-10-21" }, "2026-10-29"));
});

test("itens: junta o mesmo produto, descarta zero e recusa quantidade inválida", () => {
  const r = validarPedidoCampo({ ...base, itens: [{ produto_id: PROD, quantidade: 2 }, { produto_id: PROD, quantidade: 1.5 }, { produto_id: ID, quantidade: 0 }] }, "2026-10-29");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.itens, [{ produto_id: PROD, quantidade: 3.5 }]);
  assert.ok("erro" in validarPedidoCampo({ ...base, itens: [{ produto_id: PROD, quantidade: -1 }] }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, itens: [] }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, itens: [{ produto_id: "x", quantidade: 1 }] }, "2026-10-29"));
});

test("vendedor não manda preço: o banco usa a tabela do cliente", () => {
  const r = validarPedidoCampo({ ...base, itens: [{ produto_id: PROD, quantidade: 1, preco_unit_cents: 1 }] }, "2026-10-29");
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.itens, [{ produto_id: PROD, quantidade: 1 }]);
});

test("recusa condição desconhecida, cliente ausente, entrega antes do pedido e identificador inválido", () => {
  assert.ok("erro" in validarPedidoCampo({ ...base, condicao: "d999" }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, cliente_id: "" }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, entrega: "2026-10-01" }, "2026-10-29"));
  assert.ok("erro" in validarPedidoCampo({ ...base, client_id: "abc" }, "2026-10-29"));
  assert.ok("ok" in validarPedidoCampo({ ...base, entrega: null, forma_pagamento: null }, "2026-10-29"));
});

test("resumo do pedido para mandar ao cliente no WhatsApp", () => {
  const t = resumoWhatsapp({ empresa: "Piscicultura Boa", cliente: "Mercado Sol", numero: 42, itens: [{ nome: "Caixa 20 kg · peixe grande", quantidade: 3, preco_cents: 2500 }], total_cents: 7500, condicao: "7 dias", entrega: "2026-10-30" });
  assert.match(t, /Pedido 42/);
  assert.match(t, /3 × Caixa 20 kg · peixe grande/);
  assert.match(t, /R\$\s?75,00/);
  assert.match(t, /Entrega: 30\/10\/2026/);
});
