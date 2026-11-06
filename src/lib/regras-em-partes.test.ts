import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarRegrasEmPartes, type Parte, type Ponto } from "./regras-em-partes.ts";

test("continua de onde a parte anterior parou até o fim", async () => {
  const pontos: Ponto[] = [];
  const partes: Parte[] = [
    { aplicadas: 3, fim: false, apos_data: "2026-01-05", apos_id: "a" },
    { aplicadas: 2, fim: false, apos_data: "2026-02-01", apos_id: "b" },
    { aplicadas: 1, fim: true },
  ];
  const r = await aplicarRegrasEmPartes(async (p) => { pontos.push(p); return partes.shift()!; },
    { inicio: { apos_data: "2026-01-01", apos_id: "z" } });
  assert.deepEqual(r, { aplicadas: 6, fim: true });
  assert.deepEqual(pontos, [
    { apos_data: "2026-01-01", apos_id: "z" },
    { apos_data: "2026-01-05", apos_id: "a" },
    { apos_data: "2026-02-01", apos_id: "b" },
  ]);
});

test("para no prazo e avisa que não terminou", async () => {
  let relogio = 0;
  let chamadas = 0;
  const r = await aplicarRegrasEmPartes(
    async () => { chamadas++; relogio += 3000; return { aplicadas: 10, fim: false, apos_data: "2026-01-01", apos_id: "x" }; },
    { prazoMs: 7000, agora: () => relogio },
  );
  assert.equal(chamadas, 3);
  assert.deepEqual(r, { aplicadas: 30, fim: false });
});

test("sem ponto de continuação não recomeça do início", async () => {
  let chamadas = 0;
  const r = await aplicarRegrasEmPartes(async () => { chamadas++; return { aplicadas: 0, fim: false }; });
  assert.equal(chamadas, 1);
  assert.deepEqual(r, { aplicadas: 0, fim: false });
});
