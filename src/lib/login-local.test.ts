import { test } from "node:test";
import assert from "node:assert/strict";
import { eLoginLocal, emailDeEntrada, emailDoLogin, FORMATO_LOGIN, loginDoEmail } from "./login-local.ts";

test("tela de entrada aceita e-mail ou usuário", () => {
  assert.equal(emailDeEntrada(" pessoa@piscicultura.com "), "pessoa@piscicultura.com");
  assert.equal(emailDeEntrada(" Ze.Viveiro "), "ze.viveiro@usuarios.balbina.test");
});

test("e-mail interno vai e volta para o usuário", () => {
  const email = emailDoLogin("ze.viveiro");
  assert.ok(eLoginLocal(email));
  assert.equal(loginDoEmail(email), "ze.viveiro");
  assert.equal(loginDoEmail("pessoa@piscicultura.com"), null);
});

test("formato do usuário", () => {
  for (const ok of ["ze.viveiro", "joao_2", "fab-racao"]) assert.match(ok, FORMATO_LOGIN);
  for (const ruim of ["zé", "ab", ".ze", "ze viveiro", "a".repeat(31)]) assert.doesNotMatch(ruim, FORMATO_LOGIN);
});
