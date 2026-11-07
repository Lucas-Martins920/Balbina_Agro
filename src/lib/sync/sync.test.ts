import { test } from "node:test";
import assert from "node:assert/strict";
import { ESPERA_MAXIMA_MS, MAX_TENTATIVAS, type ComRetry, esperaAntes, liberar, prontoAgora, proximaRodada, registrarFalha } from "./queue.ts";
import { INTERVALO_SYNC_MS, criarSincronizador } from "./worker.ts";

const T0 = Date.parse("2026-11-06T12:00:00Z");

test("espera dobra a cada falha, de 5 s até no máximo 5 min", () => {
  assert.equal(esperaAntes(0), 0);
  assert.equal(esperaAntes(1), 5_000);
  assert.equal(esperaAntes(2), 10_000);
  assert.equal(esperaAntes(4), 40_000);
  assert.equal(esperaAntes(20), ESPERA_MAXIMA_MS);
});

test("falha do servidor agenda a próxima tentativa e não manda antes da hora", () => {
  const i = registrarFalha({ client_id: "a" } as { client_id: string } & ComRetry, "O servidor respondeu 503.", T0);
  assert.equal(i.tentativas, 1);
  assert.equal(i.parado, false);
  assert.equal(prontoAgora(i, T0 + 1_000), false);
  assert.equal(prontoAgora(i, T0 + 5_000), true);
});

test(`para depois de ${MAX_TENTATIVAS} tentativas e espera a pessoa`, () => {
  let i: { tentativas?: number; parado?: boolean; erro?: string; proxima_em?: string } = {};
  for (let n = 0; n < MAX_TENTATIVAS; n++) i = registrarFalha(i, "Erro 500.", T0);
  assert.equal(i.parado, true);
  assert.match(i.erro ?? "", /Reenviar/);
  assert.equal(prontoAgora(i, T0 + 10 * 60_000), false);
  const solto = liberar(i);
  assert.equal(solto.tentativas, 0);
  assert.equal(prontoAgora(solto, T0), true);
});

test("próxima rodada: o item mais cedo manda; parado não conta", () => {
  assert.equal(proximaRodada([], T0), null);
  assert.equal(proximaRodada([{ parado: true }], T0), null);
  assert.equal(proximaRodada([{ proxima_em: new Date(T0 + 7_000).toISOString() }, {}], T0), 0);
  assert.equal(proximaRodada([{ proxima_em: new Date(T0 + 7_000).toISOString() }], T0), 7_000);
});

function relogioDeMentira() {
  const cbs = new Map<number, () => void>();
  let id = 0;
  return {
    agendar: (cb: () => void) => { cbs.set(++id, cb); return id; },
    cancelar: (i: unknown) => { cbs.delete(i as number); },
    tique: async () => { for (const cb of cbs.values()) cb(); await new Promise((r) => setImmediate(r)); },
    ativos: () => cbs.size,
  };
}

test("roda a cada 5 s só com internet e só se há pendente", async () => {
  const r = relogioDeMentira();
  let online = true;
  let pendente = true;
  let vezes = 0;
  let intervalo = 0;
  const s = criarSincronizador({ online: () => online, agendar: (cb, ms) => { intervalo = ms; return r.agendar(cb); }, cancelar: r.cancelar });
  const parar = s.registrar({ nome: "campo", temPendente: () => pendente, rodar: async () => { vezes++; } });
  assert.equal(intervalo, INTERVALO_SYNC_MS);
  await r.tique();
  assert.equal(vezes, 1);
  online = false;
  await r.tique();
  assert.equal(vezes, 1, "sem internet não tenta");
  online = true;
  pendente = false;
  await r.tique();
  assert.equal(vezes, 1, "fila vazia não tenta");
  parar();
  assert.equal(r.ativos(), 0, "sem tarefa, desliga o relógio");
});

test("a mesma tarefa não roda duas vezes ao mesmo tempo", async () => {
  let soltar: () => void = () => undefined;
  let vezes = 0;
  const s = criarSincronizador({ online: () => true, agendar: () => 1, cancelar: () => undefined });
  s.registrar({ nome: "vendedor", temPendente: () => true, rodar: () => { vezes++; return new Promise<void>((ok) => { soltar = ok; }); } });
  const a = s.agora();
  const b = s.agora();
  assert.equal(s.rodando("vendedor"), true);
  soltar();
  await Promise.all([a, b]);
  assert.equal(vezes, 1);
  assert.equal(s.rodando("vendedor"), false);
});

test("erro solto numa tarefa não derruba as outras", async () => {
  let outra = 0;
  const s = criarSincronizador({ online: () => true, agendar: () => 1, cancelar: () => undefined });
  s.registrar({ nome: "a", temPendente: () => true, rodar: async () => { throw new Error("x"); } });
  s.registrar({ nome: "b", temPendente: () => true, rodar: async () => { outra++; } });
  await s.agora();
  assert.equal(outra, 1);
  assert.equal(s.rodando("a"), false);
});

test("pede Background Sync só quando há envio esperando", () => {
  let pedidos = 0;
  let pendente = false;
  const s = criarSincronizador({ online: () => false, agendar: () => 1, cancelar: () => undefined, pedirSegundoPlano: () => pedidos++ });
  s.registrar({ nome: "campo", temPendente: () => pendente, rodar: async () => undefined });
  s.pedirSegundoPlano();
  assert.equal(pedidos, 0);
  pendente = true;
  s.pedirSegundoPlano();
  assert.equal(pedidos, 1);
});
