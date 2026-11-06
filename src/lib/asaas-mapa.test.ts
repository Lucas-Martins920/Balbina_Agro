import { test } from "node:test";
import assert from "node:assert/strict";
import { ambienteAsaas, ambienteDaChave, conferirCredencial, idAsaas, lerPagamento, lerWebhook, mensagemErroAsaas, montarCliente, montarCobranca, montarSubconta, montarWebhook, situacaoDoEvento, tokenConfere, urlBase } from "./asaas-mapa.ts";

test("sandbox é o padrão", () => {
  assert.equal(urlBase(undefined), "https://api-sandbox.asaas.com/v3");
  assert.equal(urlBase("producao"), "https://api.asaas.com/v3");
});

test("cobrança com boleto e Pix, multa, juros e desconto", () => {
  const c = montarCobranca({
    clienteAsaas: "cus_1", cobrancaId: "abc", meio: "boleto_pix", vencimento: "2026-11-10", valor_cents: 54050, descricao: "Tambaqui inteiro",
    perfil: { juros_mes_percentual: 1, multa_percentual: 2, desconto_ate_vencimento_percentual: 0 },
  });
  assert.equal(c.billingType, "UNDEFINED");
  assert.equal(c.value, 540.5);
  assert.deepEqual(c.fine, { value: 2, type: "PERCENTAGE" });
  assert.equal("discount" in c, false);
});

test("cliente só manda telefone válido", () => {
  assert.equal("mobilePhone" in montarCliente({ id: "1", nome: "X", cpf_cnpj: "123", email: null, telefone: "123" }), false);
  assert.equal(montarCliente({ id: "1", nome: "X", cpf_cnpj: "123", email: "a@b", telefone: "(51) 99999-0000" }).mobilePhone, "51999990000");
});

test("webhook: recebido baixa, confirmado espera, vencido marca", () => {
  assert.deepEqual(lerWebhook({ event: "PAYMENT_RECEIVED", payment: { id: "pay_1", value: 540.5, paymentDate: "2026-11-11" } }, "2026-11-12"),
    { acao: "baixar", pagamento: "pay_1", valor_cents: 54050, data: "2026-11-11" });
  assert.deepEqual(lerWebhook({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_1" } }, "2026-11-12"), { acao: "ignorar" });
  assert.deepEqual(lerWebhook({ event: "PAYMENT_OVERDUE", payment: { id: "pay_1" } }, "2026-11-12"), { acao: "status", pagamento: "pay_1", status: "expirada" });
  assert.deepEqual(lerWebhook({ event: "PAYMENT_RECEIVED" }, "2026-11-12"), { acao: "ignorar" });
});

test("token do webhook", () => {
  assert.equal(tokenConfere("abc", "abc"), true);
  assert.equal(tokenConfere("abd", "abc"), false);
  assert.equal(tokenConfere(null, "abc"), false);
  assert.equal(tokenConfere("abc", undefined), false);
});

test("id do Asaas só passa no formato certo", () => {
  assert.equal(idAsaas("pay_080225913252", "pay"), "pay_080225913252");
  assert.equal(idAsaas("cus_000005219613", "pay"), null);
  assert.equal(idAsaas("pay_1/../../customers", "pay"), null);
  assert.equal(idAsaas(null, "cus"), null);
});

const SUB = {
  nome: "Piscicultura X", documento: "12.345.678/0001-90", email: "Fin@Piscicultura.com", celular: "(11) 99999-0000", faturamento_cents: 5000000,
  cep: "89223-005", endereco: "Rua A", numero: "10", complemento: "", bairro: "Centro", tipo_empresa: "LIMITED", nascimento: "",
};

test("subconta de empresa", () => {
  const r = montarSubconta(SUB);
  assert.ok("corpo" in r);
  assert.equal(r.corpo.cpfCnpj, "12345678000190");
  assert.equal(r.corpo.incomeValue, 50000);
  assert.equal(r.corpo.companyType, "LIMITED");
  assert.equal(r.corpo.email, "fin@piscicultura.com");
  assert.equal("complement" in r.corpo, false);
});

test("subconta de produtor pessoa física pede nascimento", () => {
  assert.deepEqual(montarSubconta({ ...SUB, documento: "123.456.789-09" }), { erro: "Produtor pessoa física: informe a data de nascimento." });
  const r = montarSubconta({ ...SUB, documento: "123.456.789-09", nascimento: "1980-05-01" });
  assert.ok("corpo" in r && r.corpo.birthDate === "1980-05-01" && !("companyType" in r.corpo));
  assert.deepEqual(montarSubconta({ ...SUB, cep: "123" }), { erro: "Informe o CEP com 8 dígitos." });
});

test("situação da conta pelo evento", () => {
  assert.equal(situacaoDoEvento("ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED"), "APPROVED");
  assert.equal(situacaoDoEvento("ACCOUNT_STATUS_DOCUMENT_APPROVED"), null);
  assert.equal(situacaoDoEvento("PAYMENT_RECEIVED"), null);
  assert.equal(montarWebhook({ url: "u", email: "e", token: "t" }).events.includes("PAYMENT_RECEIVED"), true);
});

test("pagamento relido na API: só baixa o que o Asaas diz que recebeu, com o valor de lá", () => {
  assert.deepEqual(lerPagamento({ id: "pay_1", status: "RECEIVED", value: 540.5, paymentDate: "2026-11-11" }, "2026-11-12"),
    { pago: true, valor_cents: 54050, data: "2026-11-11", referencia: null });
  // recebido em dinheiro: vale a data informada pelo cliente
  assert.deepEqual(lerPagamento({ id: "pay_1", status: "RECEIVED_IN_CASH", value: 513.48, clientPaymentDate: "2026-11-10", externalReference: "c1" }, "2026-11-12"),
    { pago: true, valor_cents: 51348, data: "2026-11-10", referencia: "c1" });
  assert.equal(lerPagamento({ id: "pay_1", status: "PENDING", value: 540.5 }, "2026-11-12").pago, false);
  assert.equal(lerPagamento({ id: "pay_1", status: "CONFIRMED", value: 540.5 }, "2026-11-12").pago, false);
  assert.equal(lerPagamento({ id: "pay_1", status: "RECEIVED", value: 0 }, "2026-11-12").pago, false);
});

test("ambiente aceita grafias de produção e cai no sandbox no resto", () => {
  for (const v of ["producao", "produção", "PRODUCAO", " production "]) assert.equal(ambienteAsaas(v), "producao");
  for (const v of [undefined, "", "sandbox", "homologacao", "prod"]) assert.equal(ambienteAsaas(v), "sandbox");
  assert.equal(urlBase("produção"), "https://api.asaas.com/v3");
});

test("ambiente pela chave: prod e hmlg; chave antiga não diz", () => {
  assert.equal(ambienteDaChave("$aact_prod_000Mzk"), "producao");
  assert.equal(ambienteDaChave("$aact_hmlg_000Mzk"), "sandbox");
  assert.equal(ambienteDaChave("$aact_YTU5YTE0M2M"), null);
});

test("conferir credencial: chave de um ambiente apontada para o outro e produção fora da produção", () => {
  assert.equal(conferirCredencial({ chave: "$aact_prod_x", ambiente: "producao" }, { foraDaProducao: false }), null);
  assert.match(conferirCredencial({ chave: "$aact_hmlg_x", ambiente: "producao" }, { foraDaProducao: false })!, /sandbox/);
  assert.match(conferirCredencial({ chave: "$aact_prod_x", ambiente: "sandbox" }, { foraDaProducao: false })!, /produção/);
  assert.match(conferirCredencial({ chave: "$aact_prod_x", ambiente: "producao" }, { foraDaProducao: true })!, /Fora da produção/);
  assert.equal(conferirCredencial({ chave: "$aact_hmlg_x", ambiente: "sandbox" }, { foraDaProducao: true }), null);
});

test("erro do Asaas: lê errors, aguenta resposta que não é JSON e explica 401 e 429", () => {
  assert.equal(mensagemErroAsaas(400, '{"errors":[{"description":"CPF inválido"}]}'), "Asaas recusou (400): CPF inválido");
  assert.match(mensagemErroAsaas(502, "<html>Bad gateway</html>"), /^Asaas recusou \(502\): <html>/);
  assert.match(mensagemErroAsaas(401, ""), /chave/);
  assert.match(mensagemErroAsaas(429, ""), /muitas/i);
});
