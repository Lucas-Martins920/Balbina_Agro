import { test } from "node:test";
import assert from "node:assert/strict";
import { eventoDaAssinatura, eventoDoPagamento, lerEventoAssinatura, montarAssinatura, nivelQueLibera, primeiroVencimento, situacao, type Assinatura } from "./assinatura-mapa.ts";

const base: Assinatura = { status: "teste", liberada: true, teste_ate: null, pago_ate: null, plano_id: null, fatura_url: null, tem_assinatura: false };

test("primeira mensalidade vence no fim do teste", () => {
  assert.equal(primeiroVencimento("2026-11-01", "2026-11-10"), "2026-11-10");
  assert.equal(primeiroVencimento("2026-11-20", "2026-11-10"), "2026-11-20");
  assert.equal(primeiroVencimento("2026-11-20", null), "2026-11-20");
});

test("assinatura anual no Asaas", () => {
  const a = montarAssinatura({ cliente: "cus_1", empresaId: "emp", vencimento: "2026-11-10",
    plano: { id: "anual", nome: "Anual", descricao: null, valor_cents: 249000, ciclo: "anual" } });
  assert.equal(a.cycle, "YEARLY");
  assert.equal(a.value, 2490);
  assert.equal(a.billingType, "UNDEFINED");
  assert.equal(a.externalReference, "emp");
});

test("só eventos de assinatura interessam", () => {
  assert.deepEqual(lerEventoAssinatura({ event: "PAYMENT_RECEIVED", payment: { subscription: "sub_1", dueDate: "2026-11-10", invoiceUrl: "u" } }),
    { assinatura: "sub_1", evento: "PAYMENT_RECEIVED", vencimento: "2026-11-10", fatura_url: "u" });
  assert.equal(lerEventoAssinatura({ event: "PAYMENT_RECEIVED", payment: { subscription: null } }), null);
  assert.deepEqual(lerEventoAssinatura({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_1" } }),
    { assinatura: "sub_1", evento: "SUBSCRIPTION_DELETED", vencimento: null, fatura_url: null });
});

test("texto da situação", () => {
  assert.equal(situacao({ ...base, teste_ate: "2026-11-10" }, "2026-11-01"), "Teste grátis: faltam 9 dias.");
  assert.equal(situacao({ ...base, teste_ate: "2026-11-02" }, "2026-11-01"), "Teste grátis: falta 1 dia.");
  assert.equal(situacao({ ...base, teste_ate: "2026-11-01" }, "2026-11-01"), "O teste grátis termina hoje.");
  assert.equal(situacao({ ...base, liberada: false, teste_ate: "2026-10-01" }, "2026-11-01"), "O teste grátis terminou.");
  assert.equal(situacao({ ...base, status: "ativa", pago_ate: "2026-11-30" }, "2026-11-01"), "Assinatura em dia até 30/11/2026.");
  assert.equal(situacao({ ...base, status: "atrasada", liberada: false, tem_assinatura: true }, "2026-11-01"), "Acesso suspenso por falta de pagamento.");
});

test("convite de upgrade aponta o menor plano que libera o módulo", () => {
  const niveis = [
    { id: "gestao", nome: "Balbina Gestão", descricao: null, ordem: 4, modulos: ["*"] },
    { id: "basic", nome: "Balbina Basic", descricao: null, ordem: 1, modulos: ["piscicultura", "estoque"] },
    { id: "fiscal", nome: "Balbina Fiscal", descricao: null, ordem: 3, modulos: ["piscicultura", "estoque", "vendas", "notas"] },
    { id: "vendas", nome: "Balbina Vendas", descricao: null, ordem: 2, modulos: ["piscicultura", "estoque", "vendas"] },
  ];
  assert.equal(nivelQueLibera(niveis, "estoque")?.id, "basic");
  assert.equal(nivelQueLibera(niveis, "notas")?.id, "fiscal");
  assert.equal(nivelQueLibera(niveis, "conciliacao")?.id, "gestao");
});

test("cobrança da assinatura conferida na API: a situação do Asaas decide, não o nome do aviso", () => {
  const p = { id: "pay_1", subscription: "sub_1", dueDate: "2026-11-10", invoiceUrl: "https://f" };
  assert.deepEqual(eventoDoPagamento({ ...p, status: "RECEIVED" }), { assinatura: "sub_1", evento: "PAYMENT_RECEIVED", vencimento: "2026-11-10", fatura_url: "https://f" });
  assert.equal(eventoDoPagamento({ ...p, status: "CONFIRMED" })?.evento, "PAYMENT_RECEIVED");
  assert.equal(eventoDoPagamento({ ...p, status: "RECEIVED_IN_CASH" })?.evento, "PAYMENT_RECEIVED");
  assert.equal(eventoDoPagamento({ ...p, status: "OVERDUE" })?.evento, "PAYMENT_OVERDUE");
  assert.equal(eventoDoPagamento({ ...p, status: "PENDING" })?.evento, "PAYMENT_UPDATED");
  assert.equal(eventoDoPagamento({ ...p, status: "REFUNDED" })?.evento, "PAYMENT_REFUNDED");
  assert.equal(eventoDoPagamento({ ...p, status: "CHARGEBACK_REQUESTED" })?.evento, "PAYMENT_REFUNDED");
  // cobrança apagada ou avulsa (sem assinatura) não mexe no acesso
  assert.equal(eventoDoPagamento({ ...p, status: "RECEIVED", deleted: true }), null);
  assert.equal(eventoDoPagamento({ ...p, subscription: null, status: "RECEIVED" }), null);
});

test("assinatura conferida na API: só encerra se o Asaas disser que acabou", () => {
  assert.deepEqual(eventoDaAssinatura({ id: "sub_1", deleted: true }), { assinatura: "sub_1", evento: "SUBSCRIPTION_INACTIVATED", vencimento: null, fatura_url: null });
  assert.equal(eventoDaAssinatura({ id: "sub_1", status: "INACTIVE" })?.evento, "SUBSCRIPTION_INACTIVATED");
  assert.equal(eventoDaAssinatura({ id: "sub_1", status: "EXPIRED" })?.evento, "SUBSCRIPTION_INACTIVATED");
  assert.equal(eventoDaAssinatura({ id: "sub_1", status: "ACTIVE" }), null);
});
