import { test } from "node:test";
import assert from "node:assert/strict";
import { mensagemBloqueio } from "./login-bloqueio.ts";

const agora = new Date("2026-10-30T12:00:00Z");

test("sem bloqueio não há mensagem", () => {
  assert.equal(mensagemBloqueio(null, agora), null);
  assert.equal(mensagemBloqueio("2026-10-30T11:59:00Z", agora), null);
});

test("bloqueio arredonda os minutos para cima", () => {
  assert.equal(mensagemBloqueio("2026-10-30T12:14:01Z", agora), "Muitas tentativas com senha errada. Por segurança, espere 15 minutos e tente de novo.");
  assert.equal(mensagemBloqueio("2026-10-30T12:00:30Z", agora), "Muitas tentativas com senha errada. Por segurança, espere 1 minuto e tente de novo.");
});
