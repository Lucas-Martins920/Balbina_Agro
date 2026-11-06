import { test } from "node:test";
import assert from "node:assert/strict";
import { clientesSugeridos, corpoPedido, linhasDoCarrinho, montarPedido } from "./carrinho.ts";
import type { DadosVendas } from "./tipos.ts";

const ID = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const CLASSE = ID(9);
const dados: DadosVendas = {
  clientes: [
    { id: ID(1), nome: "Mercado Bom Preço", telefone: "92999990000", cpf_cnpj: "12345678000199", lista_preco_id: null, cidade: "Manaus" },
    { id: ID(2), nome: "Padaria Sol", telefone: null, cpf_cnpj: null, lista_preco_id: ID(8), cidade: "Iranduba" },
  ],
  produtos: [
    { id: ID(3), nome: "Tambaqui médio caixa 20 kg", unidade: "cx", fator_kg: 20, classe_peixe_id: CLASSE, disponivel: 2, kg_classe: 50 },
    { id: ID(4), nome: "Tambaqui médio (kg)", unidade: "kg", fator_kg: 1, classe_peixe_id: CLASSE, disponivel: 50, kg_classe: 50 },
  ],
  precos: [
    { produto_id: ID(3), cliente_id: null, lista_id: ID(7), preco_cents: 20000, vigencia: "[2026-01-01,)" },
    { produto_id: ID(4), cliente_id: null, lista_id: ID(7), preco_cents: 1800, vigencia: "[2026-01-01,)" },
    { produto_id: ID(4), cliente_id: ID(1), lista_id: ID(7), preco_cents: 1700, vigencia: "[2026-01-01,)" },
  ],
  listas: [
    { id: ID(7), nome: "Padrão", padrao: true, ajuste_pct: 0, ativa: true },
    { id: ID(8), nome: "Atacado", padrao: false, ajuste_pct: -10, ativa: true },
  ],
  ultimos: [{ cliente_id: ID(2), data: "2026-11-01", condicao: "d7", forma_pagamento: "pix", itens: [] }],
  pedidos: [],
};
const hoje = "2026-11-03";
const base = { condicao: "avista", forma: "pix", entrega: "", observacoes: "", faturar: false };

test("preço especial do cliente e ajuste da tabela do cliente", () => {
  const a = linhasDoCarrinho(dados, dados.clientes[0], { [ID(4)]: 2 }, hoje);
  assert.equal(a.total, 3400);
  const b = linhasDoCarrinho(dados, dados.clientes[1], { [ID(3)]: 1 }, hoje);
  assert.equal(b.total, 18000); // 10% abaixo da padrão
});

test("caixa e kg tiram do mesmo estoque da classe do peixe", () => {
  const c = linhasDoCarrinho(dados, dados.clientes[0], { [ID(3)]: 2 }, hoje);
  const porKg = c.linhas.find((l) => l.id === ID(4));
  assert.equal(porKg?.max, 10); // 50 kg - 2 caixas de 20 kg = 10 kg
  assert.equal(c.kg, 40);
});

test("peixe por kg aceita fração até o grama", () => {
  const c = linhasDoCarrinho(dados, dados.clientes[0], { [ID(4)]: 2.5 }, hoje);
  assert.equal(c.total, 4250); // 2,5 kg × R$ 17,00 (preço do cliente)
  assert.equal(c.kg, 2.5);
});

test("montarPedido recusa acima do estoque e sem cliente", () => {
  assert.deepEqual(montarPedido(dados, { ...base, cliente: null, qtd: {} }, hoje, ID(5)), { erro: "Escolha o cliente." });
  const r = montarPedido(dados, { ...base, cliente: dados.clientes[0], qtd: { [ID(3)]: 2, [ID(4)]: 11 } }, hoje, ID(5));
  assert.deepEqual(r, { erro: "Tambaqui médio caixa 20 kg: só tem 1 cx em estoque." }); // 11 kg já no carrinho: cabe 1 caixa
});

test("montarPedido monta o que o servidor aceita", () => {
  const r = montarPedido(dados, { ...base, cliente: dados.clientes[0], qtd: { [ID(4)]: 3 }, faturar: true }, hoje, ID(5));
  assert.ok("ok" in r);
  assert.equal(r.ok.total_estimado, 5100);
  const corpo = corpoPedido(r.ok) as Record<string, unknown>;
  assert.equal(corpo.cliente_nome, undefined);
  assert.equal(corpo.faturar, true);
});

test("sem busca, quem comprou por último vem primeiro; busca por cidade", () => {
  assert.equal(clientesSugeridos(dados, "")[0].id, ID(2));
  assert.equal(clientesSugeridos(dados, "manaus")[0].id, ID(1));
});
