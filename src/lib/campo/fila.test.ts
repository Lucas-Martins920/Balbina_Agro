import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ENVIADOS, apontamentoDoTurno, desfecho, lerFila, marcaDoItem, prontosParaEnvio, registrarEnviado, resumoFila, rotaDoItem, type ItemFila,
} from "./fila.ts";

const item = (x: Partial<ItemFila> = {}): ItemFila => ({ client_id: "a", tipo: "apontamento", corpo: {}, rotulo: "r", criado_em: "2026-11-05T10:00:00Z", ...x });

test("cada envio vai para a sua rota", () => {
  assert.equal(rotaDoItem({ tipo: "apontamento" }), "/api/apontamentos");
  assert.equal(rotaDoItem({ tipo: "biometria" }), "/api/biometrias");
  assert.equal(rotaDoItem({ tipo: "insumo" }), "/api/lancar-insumos");
  assert.equal(rotaDoItem({ tipo: "abrir_lote" }), "/api/abrir-lote");
  assert.equal(rotaDoItem({ tipo: "fechar_lote", lote_id: "l 1" }), "/api/lotes/l%201/fechar");
});

test("desfecho da resposta", () => {
  assert.deepEqual(desfecho(200, false, { situacao: "repetido" }), { tipo: "enviado", repetido: true });
  assert.deepEqual(desfecho(201, false, {}), { tipo: "enviado", repetido: false });
  assert.deepEqual(desfecho(0, true, {}), { tipo: "sessao" });
  assert.deepEqual(desfecho(401, false, { erro: "x" }), { tipo: "sessao" });
  assert.deepEqual(desfecho(409, false, { erro: "turno", conflito: [] }), { tipo: "conflito", erro: "turno", existentes: [] });
  assert.deepEqual(desfecho(422, false, { erro: "Saldo insuficiente" }), { tipo: "erro", erro: "Saldo insuficiente", parado: true });
  assert.deepEqual(desfecho(503, false, {}), { tipo: "erro", erro: "O servidor respondeu 503. Vai de novo sozinho.", parado: false });
  assert.equal((desfecho(429, false, {}) as { parado: boolean }).parado, false);
});

test("só envia o que não espera a pessoa", () => {
  const fila = [item({ client_id: "1" }), item({ client_id: "2", parado: true, erro: "x" }), item({ client_id: "3", conflito: [] }), item({ client_id: "4", erro: "503" })];
  assert.deepEqual(prontosParaEnvio(fila).map((i) => i.client_id), ["1", "4"]);
  assert.deepEqual(resumoFila(fila), { total: 4, aguardando: 2, precisam: 2 });
});

test("histórico de enviados: mais novo primeiro, sem repetir e com limite", () => {
  const velho = Array.from({ length: MAX_ENVIADOS }, (_, i) => ({ client_id: `v${i}`, tipo: "insumo" as const, rotulo: "", enviado_em: "" }));
  const r = registrarEnviado(velho, [{ client_id: "n", tipo: "biometria", rotulo: "B", enviado_em: "agora" }, { client_id: "v0", tipo: "insumo", rotulo: "", enviado_em: "" }]);
  assert.equal(r.length, MAX_ENVIADOS);
  assert.deepEqual(r.slice(0, 3).map((e) => e.client_id), ["n", "v0", "v1"]);
});

test("fila corrompida ou de versão antiga não quebra a tela", () => {
  assert.deepEqual(lerFila(null), []);
  assert.deepEqual(lerFila("{x"), []);
  assert.deepEqual(lerFila(JSON.stringify([{ client_id: "x", viveiro_id: "y", ovos: 3 }, item({ client_id: "ok" }), item({ tipo: "pesca" as never })])).map((i) => i.client_id), ["ok"]);
});

test("viveiro lançado no turno: na fila ou já enviado deste celular", () => {
  const corpo = { viveiro_id: "v1", data: "2026-11-05", turno: "manha" };
  const fila = [item({ corpo }), item({ tipo: "biometria", corpo: { ...corpo, viveiro_id: "v2" } })];
  assert.equal(apontamentoDoTurno("v1", "2026-11-05", "manha", fila, []), "fila");
  assert.equal(apontamentoDoTurno("v1", "2026-11-05", "tarde", fila, []), null);
  assert.equal(apontamentoDoTurno("v2", "2026-11-05", "manha", fila, []), null, "biometria não é o apontamento do turno");
  const enviado = { client_id: "e", tipo: "apontamento" as const, rotulo: "", enviado_em: "", ...marcaDoItem(item({ corpo: { ...corpo, viveiro_id: "v3" } })) };
  assert.deepEqual(marcaDoItem(item({ corpo: { viveiro_id: "v3", data: "2026-11-05", turno: "manha" } })), { viveiro_id: "v3", data: "2026-11-05", turno: "manha" });
  assert.equal(apontamentoDoTurno("v3", "2026-11-05", "manha", [], [enviado]), "enviado");
  assert.deepEqual(marcaDoItem(item({ corpo: { viveiro_id: 3 } })), { viveiro_id: undefined, data: undefined, turno: undefined });
});

test("item que falhou no servidor só volta depois da espera; parado pelo limite não volta sozinho", () => {
  const agora = Date.parse("2026-11-06T12:00:00Z");
  const fila = [
    item({ client_id: "espera", proxima_em: new Date(agora + 10_000).toISOString(), tentativas: 2 }),
    item({ client_id: "pronto", proxima_em: new Date(agora - 1).toISOString(), tentativas: 1 }),
    item({ client_id: "limite", parado: true, tentativas: 8 }),
    item({ client_id: "novo" }),
  ];
  assert.deepEqual(prontosParaEnvio(fila, agora).map((i) => i.client_id), ["pronto", "novo"]);
  assert.deepEqual(prontosParaEnvio(fila, agora + 10_000).map((i) => i.client_id), ["espera", "pronto", "novo"]);
});
