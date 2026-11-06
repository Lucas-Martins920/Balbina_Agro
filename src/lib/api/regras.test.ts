import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  assinarWebhook, dataValida, escopoLiberado, ESCOPOS, EVENTOS, gerarToken, ipPrivado, lerPaginacao, lerToken, prefixoToken,
  validarBaixa, validarContato, validarProduto, validarTitulo, validarUrlWebhook,
} from "./regras.ts";
import { CHAVES_VALIDAS } from "../permissoes-regras.ts";

const CAT = "11111111-1111-4111-8111-111111111111";
const CC = "22222222-2222-4222-8222-222222222222";

test("todo escopo da API é uma permissão do Balbina", () => {
  for (const e of ESCOPOS) assert.ok(CHAVES_VALIDAS.has(e.chave), e.chave);
  for (const e of EVENTOS) assert.ok(CHAVES_VALIDAS.has(`${e.modulo}.ver`), e.chave);
});

test("escopo vale só dentro do plano e editar inclui ver", () => {
  const acesso = { escopos: ["contas-a-pagar.editar", "contatos.ver"], modulos: null };
  assert.equal(escopoLiberado(acesso, "contas-a-pagar.ver"), true);
  assert.equal(escopoLiberado(acesso, "contas-a-pagar.editar"), true);
  assert.equal(escopoLiberado(acesso, "contatos.editar"), false);
  assert.equal(escopoLiberado(acesso, "vendas.ver"), false);
  assert.equal(escopoLiberado({ ...acesso, modulos: ["contatos", "produtos"] }, "contas-a-pagar.ver"), false);
  assert.equal(escopoLiberado({ ...acesso, modulos: ["contatos", "produtos"] }, "contatos.ver"), true);
});

test("token tem formato fixo e é lido do Bearer ou do X-API-Key", () => {
  const token = gerarToken();
  assert.match(token, /^balbina_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, gerarToken());
  assert.equal(lerToken(`Bearer ${token}`, null), token);
  assert.equal(lerToken(null, token), token);
  assert.equal(lerToken("Bearer abc", null), null);
  assert.equal(lerToken(null, null), null);
  assert.ok(prefixoToken(token).startsWith("balbina_"));
  assert.ok(!prefixoToken(token).includes(token.slice(20)));
});

test("paginação com limites", () => {
  assert.deepEqual(lerPaginacao(new URLSearchParams()), { pagina: 1, porPagina: 100, inicio: 0, fim: 99 });
  assert.deepEqual(lerPaginacao(new URLSearchParams("pagina=3&por_pagina=50")), { pagina: 3, porPagina: 50, inicio: 100, fim: 149 });
  assert.ok("erro" in lerPaginacao(new URLSearchParams("por_pagina=501")));
  assert.ok("erro" in lerPaginacao(new URLSearchParams("pagina=0")));
  assert.ok("erro" in lerPaginacao(new URLSearchParams("pagina=abc")));
});

test("datas no formato AAAA-MM-DD e existentes", () => {
  assert.equal(dataValida("2026-02-28"), true);
  assert.equal(dataValida("2026-02-30"), false);
  assert.equal(dataValida("28/02/2026"), false);
});

test("título com categoria única vira rateio de uma linha", () => {
  const r = validarTitulo({ tipo: "pagar", descricao: " Ração ", vencimento: "2026-11-10", valor_cents: 150000, categoria_id: CAT, centro_custo_id: CC });
  assert.ok("ok" in r);
  assert.equal(r.ok.p_descricao, "Ração");
  assert.equal(r.ok.p_competencia, "2026-11-10");
  assert.deepEqual(r.ok.p_rateio, [{ categoria_id: CAT, centro_custo_id: CC, valor_cents: 150000 }]);
  assert.equal(r.ok.p_parcelas, 1);
});

test("título recusa valor em reais, rateio que não fecha e tipo errado", () => {
  assert.ok("erro" in validarTitulo({ tipo: "pagar", descricao: "X", vencimento: "2026-11-10", valor_cents: 10.5, categoria_id: CAT }));
  assert.ok("erro" in validarTitulo({ tipo: "despesa", descricao: "X", vencimento: "2026-11-10", valor_cents: 10, categoria_id: CAT }));
  assert.ok("erro" in validarTitulo({ tipo: "pagar", descricao: "X", vencimento: "2026-11-10", valor_cents: 10 }));
  const r = validarTitulo({ tipo: "receber", descricao: "X", vencimento: "2026-11-10", valor_cents: 100,
    rateio: [{ categoria_id: CAT, valor_cents: 60 }, { categoria_id: CAT, valor_cents: 30 }] });
  assert.ok("erro" in r && r.erro.includes("soma 90"));
  assert.ok("erro" in validarTitulo({ tipo: "pagar", descricao: "X", vencimento: "2026-11-10", valor_cents: 10, categoria_id: CAT, forma_pagamento: "fiado" }));
});

test("baixa confere centavos e desconto", () => {
  assert.ok("ok" in validarBaixa({ conta_id: CAT, data: "2026-11-10", valor_cents: 100, juros_cents: 5 }));
  assert.ok("erro" in validarBaixa({ conta_id: CAT, data: "2026-11-10", valor_cents: 100, desconto_cents: 200 }));
  assert.ok("erro" in validarBaixa({ conta_id: "x", data: "2026-11-10", valor_cents: 100 }));
});

test("contato: inclusão exige tipos e nome, edição aceita parte", () => {
  const r = validarContato({ tipos: ["cliente", "cliente"], nome: "Mercado", cpf_cnpj: "12.345.678/0001-90", uf: "am" });
  assert.ok("ok" in r);
  assert.deepEqual(r.ok, { tipos: ["cliente"], nome: "Mercado", cpf_cnpj: "12345678000190", uf: "AM" });
  assert.ok("erro" in validarContato({ nome: "Sem tipo" }));
  assert.ok("erro" in validarContato({ tipos: ["cliente"], nome: "X", cpf_cnpj: "123" }));
  assert.deepEqual(validarContato({ telefone: "92 99999-0000" }, true), { ok: { telefone: "92 99999-0000" } });
  assert.ok("erro" in validarContato({}, true));
});

test("produto: tipos do Balbina, peixe fica nas classes", () => {
  assert.ok("ok" in validarProduto({ tipo: "racao", nome: "Ração engorda", unidade: "kg" }));
  assert.ok("erro" in validarProduto({ tipo: "peixe", nome: "Tambaqui inteiro", unidade: "kg" }));
  assert.ok("ok" in validarProduto({ tipo: "alevino", nome: "Alevino de tambaqui", unidade: "un" }));
  assert.ok("erro" in validarProduto({ tipo: "ovo", nome: "Ovo", unidade: "un" }));
  assert.ok("erro" in validarProduto({ tipo: "racao", nome: "Ração" }));
  assert.deepEqual(validarProduto({ ativo: false }, true), { ok: { ativo: false } });
});

test("produto: para_venda separa venda de insumo de consumo", () => {
  assert.deepEqual(validarProduto({ para_venda: true }, true), { ok: { para_venda: true } });
  assert.ok("erro" in validarProduto({ para_venda: "sim" }, true));
});

test("assinatura do webhook é HMAC de t.corpo", () => {
  const esperado = createHmac("sha256", "whsec_x").update('1700000000.{"a":1}').digest("hex");
  assert.equal(assinarWebhook("whsec_x", '{"a":1}', 1700000000), `t=1700000000,v1=${esperado}`);
});

test("webhook só para endereço público com https", () => {
  assert.equal(validarUrlWebhook("https://erp.exemplo.com.br/balbina"), null);
  assert.ok(validarUrlWebhook("http://erp.exemplo.com.br"));
  assert.ok(validarUrlWebhook("https://localhost/x"));
  assert.ok(validarUrlWebhook("https://10.0.0.5/x"));
  assert.ok(validarUrlWebhook("https://[::1]/x"));
  assert.ok(validarUrlWebhook("https://user:senha@erp.com/x"));
  assert.ok(validarUrlWebhook("https://erp.com:8443/x"));
  assert.ok(validarUrlWebhook("https://intranet/x"));
});

test("faixas internas de IP", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(ipPrivado(ip), true, ip);
  }
  for (const ip of ["8.8.8.8", "177.71.0.1", "2804:14c::1"]) assert.equal(ipPrivado(ip), false, ip);
});
