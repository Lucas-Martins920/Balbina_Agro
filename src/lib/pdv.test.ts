import { test } from "node:test";
import assert from "node:assert/strict";
import { validarVendaBalcao } from "./pdv.ts";

const ID = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const PROD = "7a1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const CONTA = "8a1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const base = {
  client_id: ID, cliente_id: null, lista_id: null, ponto_venda_id: null,
  itens: [{ produto_id: PROD, quantidade: 2 }, { produto_id: PROD, quantidade: 0 }],
  pagamentos: [{ forma: "dinheiro", valor_cents: 5000, conta_id: null }, { forma: "pix", valor_cents: 0, conta_id: CONTA }],
};

test("venda de balcão válida tira itens zerados e pagamentos sem valor", () => {
  const r = validarVendaBalcao(base);
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.itens, [{ produto_id: PROD, quantidade: 2 }]);
  assert.deepEqual(r.ok.pagamentos, [{ forma: "dinheiro", valor_cents: 5000, conta_id: null }]);
});

test("o preço nunca vem de quem opera o caixa", () => {
  const r = validarVendaBalcao({ ...base, itens: [{ produto_id: PROD, quantidade: 1, preco_unit_cents: 1 }] });
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.itens, [{ produto_id: PROD, quantidade: 1 }]);
});

test("venda sem produto, sem pagamento ou com forma desconhecida é recusada", () => {
  assert.ok("erro" in validarVendaBalcao({ ...base, itens: [] }));
  assert.ok("erro" in validarVendaBalcao({ ...base, pagamentos: [] }));
  assert.ok("erro" in validarVendaBalcao({ ...base, pagamentos: [{ forma: "cheque", valor_cents: 100, conta_id: null }] }));
  assert.ok("erro" in validarVendaBalcao({ ...base, itens: [{ produto_id: PROD, quantidade: -1 }] }));
  // peixe por kg: fração até o grama; mais casas que isso, não
  const kg = validarVendaBalcao({ ...base, itens: [{ produto_id: PROD, quantidade: 1.5 }] });
  assert.ok("ok" in kg && kg.ok.itens[0].quantidade === 1.5);
  assert.ok("ok" in validarVendaBalcao({ ...base, itens: [{ produto_id: PROD, quantidade: 2.345 }] }));
  assert.ok("erro" in validarVendaBalcao({ ...base, itens: [{ produto_id: PROD, quantidade: 2.3456 }] }));
});

test("Pix e cartão precisam da conta onde caem; dinheiro vai para o caixa", () => {
  assert.ok("erro" in validarVendaBalcao({ ...base, pagamentos: [{ forma: "pix", valor_cents: 100, conta_id: null }] }));
  const r = validarVendaBalcao({ ...base, pagamentos: [{ forma: "dinheiro", valor_cents: 100, conta_id: CONTA }] });
  assert.ok("ok" in r);
  assert.equal(r.ok.pagamentos[0].conta_id, null);
});

test("identificadores precisam ser UUID", () => {
  assert.ok("erro" in validarVendaBalcao({ ...base, client_id: "x" }));
  assert.ok("erro" in validarVendaBalcao({ ...base, cliente_id: "x" }));
  assert.ok("erro" in validarVendaBalcao({ ...base, ponto_venda_id: "x" }));
  assert.ok("ok" in validarVendaBalcao({ ...base, cliente_id: ID, lista_id: ID, ponto_venda_id: ID }));
});
