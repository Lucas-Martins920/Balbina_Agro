import { test } from "node:test";
import assert from "node:assert/strict";
import { faixaDaRegua, linkWhatsApp, textoLembreteCobranca } from "./regua-cobranca.ts";

test("faixas da régua pelo vencimento", () => {
  const hoje = "2026-11-10";
  assert.equal(faixaDaRegua("2026-11-13", hoje), "antes");
  assert.equal(faixaDaRegua("2026-11-14", hoje), null);
  assert.equal(faixaDaRegua("2026-11-10", hoje), "hoje");
  assert.equal(faixaDaRegua("2026-11-03", hoje), "atraso");
  assert.equal(faixaDaRegua("2026-11-02", hoje), "atraso_longo");
});

test("texto do lembrete muda com a faixa e leva a segunda via", () => {
  const base = { cliente: "Mercado Bom", empresa: "Piscicultura Sol", valorCents: 45000, vencimento: "2026-11-13", segundaVia: "https://pg.exemplo/x" };
  assert.equal(textoLembreteCobranca({ ...base, faixa: "antes" }),
    "Olá, Mercado Bom! Lembrete da Piscicultura Sol: a conta de R$ 450,00 vence em 13/11/2026. Boleto/Pix: https://pg.exemplo/x");
  assert.equal(textoLembreteCobranca({ ...base, faixa: "atraso", segundaVia: null }),
    "Olá, Mercado Bom! A conta de R$ 450,00 com a Piscicultura Sol venceu em 13/11/2026 e ainda consta em aberto. Se já pagou, desconsidere.");
});

test("link do WhatsApp com DDI do Brasil e texto codificado", () => {
  assert.equal(linkWhatsApp("(92) 99123-4567", "Oi 1"), "https://wa.me/5592991234567?text=Oi%201");
  assert.equal(linkWhatsApp("+55 92 99123-4567", "x"), "https://wa.me/5592991234567?text=x");
  assert.equal(linkWhatsApp("123", "x"), null);
});
