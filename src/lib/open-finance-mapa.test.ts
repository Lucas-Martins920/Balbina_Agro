import { test } from "node:test";
import assert from "node:assert/strict";
import { cursorSeguinte, dataLocal, linhaDaTransacao, mesmaConta, saldoInicial, statusDoItem, tipoContaDe, webhookPedeSincronizar, type TransacaoPluggy } from "./open-finance-mapa.ts";

const base: TransacaoPluggy = { id: "tx1", description: "PIX RECEBIDO", amount: 120.5, date: "2026-09-11T00:00:00.000Z", type: "CREDIT", status: "POSTED" };

test("entrada vira valor positivo com CPF/CNPJ de quem pagou", () => {
  const l = linhaDaTransacao({ ...base, paymentData: { payer: { name: "Mercado Sol", documentNumber: { type: "CNPJ", value: "99.888.777/0001-66" } } } });
  assert.deepEqual(l, { id_externo: "tx1", data: "2026-09-11", descricao: "PIX RECEBIDO", valor_cents: 12050, cpf_cnpj: "99888777000166", nome: "Mercado Sol" });
});

test("saída vira negativa e usa quem recebeu, mesmo se o valor vier negativo", () => {
  const l = linhaDaTransacao({ ...base, amount: -99.9, type: "DEBIT", paymentData: { payer: { name: "Piscicultura" }, receiver: { name: "Agro Milho", documentNumber: { value: "123" } } } });
  assert.equal(l?.valor_cents, -9990);
  assert.equal(l?.nome, "Agro Milho");
  assert.equal(l?.cpf_cnpj, null, "documento inválido fica de fora");
});

test("pendente e valor zero não entram", () => {
  assert.equal(linhaDaTransacao({ ...base, status: "PENDING" }), null);
  assert.equal(linhaDaTransacao({ ...base, amount: 0 }), null);
});

test("data só com dia vale como está; com hora vai para o fuso de Brasília", () => {
  assert.equal(dataLocal("2026-09-11T00:00:00.000Z"), "2026-09-11");
  assert.equal(dataLocal("2026-09-11T02:30:00.000Z"), "2026-09-10");
  assert.equal(dataLocal("2026-09-11T15:00:00.000Z"), "2026-09-11");
});

test("tipo de conta", () => {
  assert.equal(tipoContaDe({ type: "BANK", subtype: "CHECKING_ACCOUNT" }), "corrente");
  assert.equal(tipoContaDe({ type: "BANK", subtype: "SAVINGS_ACCOUNT" }), "poupanca");
  assert.equal(tipoContaDe({ type: "CREDIT", subtype: "CREDIT_CARD" }), null);
});

test("reconhece a conta já cadastrada pelo número", () => {
  assert.ok(mesmaConta("0012345-6", "12345", "6"));
  assert.ok(mesmaConta("123456", "12345", null));
  assert.ok(!mesmaConta("99999", "12345", "6"));
  assert.ok(!mesmaConta("12345", null, null));
});

test("saldo inicial desconta o que entrou e saiu no período", () => {
  assert.equal(saldoInicial(1000, [{ valor_cents: 50000 }, { valor_cents: -20000 }]), 70000);
});

test("webhooks que pedem nova leitura", () => {
  assert.equal(webhookPedeSincronizar({ event: "transactions/created", itemId: "i1" }), "i1");
  assert.equal(webhookPedeSincronizar({ event: "item/error", itemId: "i1" }), null);
  assert.equal(webhookPedeSincronizar({ event: "item/updated" }), null);
});

test("status do item", () => {
  assert.equal(statusDoItem("UPDATED"), "ativa");
  assert.equal(statusDoItem("LOGIN_ERROR"), "precisa_login");
  assert.equal(statusDoItem("OUTDATED"), "erro");
});

test("cursor da próxima página da v2/transactions", () => {
  assert.equal(cursorSeguinte("/v2/transactions?accountId=a&after=eyJpZCI6MX0%3D"), "eyJpZCI6MX0=");
  assert.equal(cursorSeguinte("https://api.pluggy.ai/v2/transactions?after=abc"), "abc");
  assert.equal(cursorSeguinte(null), null);
});
