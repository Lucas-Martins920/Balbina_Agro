import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarResultados, corpoEnvio, descartar, paraEnviar, reenviar, repetidoNaFila } from "./fila.ts";
import type { Pendente } from "./tipos.ts";

const base = (id: string, extra: Partial<Pendente> = {}): Pendente => ({
  client_id: id, viveiro_id: "g1", viveiro_nome: "Sede / Tanque 01", data: "2026-11-03", turno: "manha",
  mortes: 0, descartes: 0, racao_kg: 50, agua: null, observacoes: "", medicacao: null, racoes: [], checklist: [], ...extra,
});

test("repetidoNaFila acha mesmo viveiro, data e turno", () => {
  const fila = [base("a")];
  assert.ok(repetidoNaFila(fila, { viveiro_id: "g1", data: "2026-11-03", turno: "manha" }));
  assert.equal(repetidoNaFila(fila, { viveiro_id: "g1", data: "2026-11-03", turno: "tarde" }), undefined);
});

test("conflito não é reenviado sozinho", () => {
  const fila = [base("a"), base("b", { conflito: [] })];
  assert.deepEqual(paraEnviar(fila).map((p) => p.client_id), ["a"]);
});

test("aplicarResultados tira os enviados e marca erro e conflito, mantendo os novos", () => {
  const conflito = [{ origem: "web", mortes: 1, descartes: 0, racao_kg: 40, criado_em: "2026-11-03T10:00:00Z" }];
  const fila = [base("a"), base("b"), base("c"), base("novo")];
  const r = aplicarResultados(fila, [
    { client_id: "a", tipo: "enviado" },
    { client_id: "b", tipo: "erro", erro: "Saldo insuficiente" },
    { client_id: "c", tipo: "conflito", erro: "Já tem", conflito },
  ]);
  assert.deepEqual(r.map((p) => p.client_id), ["b", "c", "novo"]);
  assert.equal(r[0].erro, "Saldo insuficiente");
  assert.equal(r[0].conflito, undefined);
  assert.deepEqual(r[1].conflito, conflito);
});

test("reenviar limpa erro e conflito e aplica a mudança", () => {
  const fila = [base("a", { erro: "x", conflito: [] })];
  const [p] = reenviar(fila, "a", (x) => ({ ...x, forcar: true }));
  assert.equal(p.forcar, true);
  assert.equal(p.erro, undefined);
  assert.equal(p.conflito, undefined);
  assert.equal(descartar(fila, "a").length, 0);
});

test("corpoEnvio não manda nome do viveiro nem estado da fila", () => {
  const c = corpoEnvio(base("a", { erro: "x" })) as Record<string, unknown>;
  assert.equal(c.viveiro_nome, undefined);
  assert.equal(c.erro, undefined);
  assert.equal(c.client_id, "a");
});
