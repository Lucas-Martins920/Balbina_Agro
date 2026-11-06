import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { assinaturaConfere, chaveCelular, comandoDoTexto, formatarCelular, lerWebhook, numeroWhatsApp, parametroModelo, parametrosCobranca } from "./whatsapp-texto.ts";

test("número no formato da Meta", () => {
  assert.equal(numeroWhatsApp("(92) 99123-4567"), "5592991234567");
  assert.equal(numeroWhatsApp("+55 92 9912-3456"), "559299123456");
  assert.equal(numeroWhatsApp("5592991234567"), "5592991234567");
  assert.equal(numeroWhatsApp("123"), null);
  assert.equal(numeroWhatsApp(null), null);
  assert.equal(formatarCelular("5592991234567"), "(92) 99123-4567");
});

test("celular com e sem o 9 tem a mesma chave (como no banco)", () => {
  assert.equal(chaveCelular("5592991234567"), "9291234567");
  assert.equal(chaveCelular("559291234567"), "9291234567");
  assert.equal(chaveCelular("5511991234567"), "1191234567");
});

test("parâmetro de modelo sem quebra de linha e com limite", () => {
  assert.equal(parametroModelo("Linha 1\n\nLinha  2\t fim"), "Linha 1 Linha 2 fim");
  assert.equal(parametroModelo("   "), "-");
  assert.equal(parametroModelo("abcdef", 4), "abc…");
});

test("assinatura do webhook", () => {
  const corpo = '{"a":1}';
  const assinatura = `sha256=${createHmac("sha256", "segredo").update(corpo).digest("hex")}`;
  assert.equal(assinaturaConfere(corpo, assinatura, "segredo"), true);
  assert.equal(assinaturaConfere(corpo + " ", assinatura, "segredo"), false);
  assert.equal(assinaturaConfere(corpo, assinatura, "outro"), false);
  assert.equal(assinaturaConfere(corpo, null, "segredo"), false);
  assert.equal(assinaturaConfere(corpo, assinatura, undefined), false);
  assert.equal(assinaturaConfere(corpo, "sha256=abc", "segredo"), false);
});

test("lê as mensagens do webhook e ignora status", () => {
  const corpo = {
    object: "whatsapp_business_account",
    entry: [{ changes: [
      { field: "messages", value: { statuses: [{ id: "s1", status: "delivered" }] } },
      { field: "messages", value: { messages: [
        { from: "5592991234567", id: "m1", type: "text", text: { body: "Balbina 123 456" } },
        { from: "5592991234567", id: "m2", type: "image", image: { id: "img1", mime_type: "image/jpeg", caption: "luz" } },
        { from: "5592991234567", id: "m3", type: "document", document: { id: "doc1", mime_type: "application/pdf", filename: "boleto.pdf" } },
        { from: "5592991234567", id: "m4", type: "audio", audio: { id: "a1" } },
        { from: "5592991234567", id: "m5", type: "sticker", sticker: { id: "x" } },
        { id: "sem-remetente", type: "text", text: { body: "oi" } },
      ] } },
    ] }],
  };
  const m = lerWebhook(corpo);
  assert.deepEqual(m.map((x) => x.tipo), ["texto", "imagem", "documento", "audio", "outro"]);
  assert.equal(m[0].texto, "Balbina 123 456");
  assert.deepEqual(m[1].midia, { id: "img1", mime: "image/jpeg", nome: "foto.jpg" });
  assert.equal(m[2].midia?.nome, "boleto.pdf");
  assert.deepEqual(lerWebhook(null), []);
  assert.deepEqual(lerWebhook({ entry: "x" }), []);
});

test("comandos por texto", () => {
  assert.deepEqual(comandoDoTexto("Balbina 123456"), { tipo: "vincular", codigo: "123456" });
  assert.deepEqual(comandoDoTexto(" balbina 123 456 "), { tipo: "vincular", codigo: "123456" });
  assert.deepEqual(comandoDoTexto("123456"), { tipo: "vincular", codigo: "123456" });
  assert.deepEqual(comandoDoTexto("Sair"), { tipo: "sair" });
  assert.deepEqual(comandoDoTexto("VOLTAR"), { tipo: "voltar" });
  assert.deepEqual(comandoDoTexto("bom dia"), { tipo: "ajuda" });
  assert.deepEqual(comandoDoTexto("1234567"), { tipo: "ajuda" });
});

test("parâmetros da cobrança por fase", () => {
  const base = { cliente: "Mercado", empresa: "Piscicultura Boa", saldoCents: 12000, vencimento: "2026-11-05", segundaVia: null };
  const antes = parametrosCobranca({ ...base, faixa: "antes" });
  assert.equal(antes.length, 4);
  assert.match(antes[2], /^a conta de R\$ 120,00 vence em 05\/11\/2026$/);
  assert.match(parametrosCobranca({ ...base, faixa: "hoje" })[2], /vence hoje$/);
  const atraso = parametrosCobranca({ ...base, faixa: "atraso", segundaVia: "https://asaas.com/b/1" });
  assert.match(atraso[2], /venceu em 05\/11\/2026/);
  assert.equal(atraso[3], "Boleto/Pix: https://asaas.com/b/1");
  assert.equal(parametrosCobranca({ ...base, faixa: "atraso" })[3], "Se já pagou, desconsidere.");
});
