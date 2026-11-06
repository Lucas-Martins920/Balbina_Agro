import { test } from "node:test";
import assert from "node:assert/strict";
import { emManutencao, respostaManutencao } from "./manutencao.ts";

test("só liga com BALBINA_MANUTENCAO=1", () => {
  assert.equal(emManutencao({ BALBINA_MANUTENCAO: "1" }), true);
  assert.equal(emManutencao({ BALBINA_MANUTENCAO: "0" }), false);
  assert.equal(emManutencao({}), false);
});

test("telas recebem uma página 503 que pede para voltar depois", async () => {
  const r = respostaManutencao("/painel");
  assert.equal(r.status, 503);
  assert.ok(r.headers.get("retry-after"));
  assert.match(r.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await r.text(), /manutenção/i);
});

test("API e webhooks recebem 503 em JSON, para o remetente tentar de novo", async () => {
  for (const caminho of ["/api/webhooks/asaas", "/api/apontamentos", "/api/v1/lotes", "/api/cron/webhooks"]) {
    const r = respostaManutencao(caminho);
    assert.equal(r.status, 503);
    assert.ok(r.headers.get("retry-after"));
    assert.match((await r.json()).erro, /manutenção/i);
  }
});
