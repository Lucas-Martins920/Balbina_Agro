import { test } from "node:test";
import assert from "node:assert/strict";
import { textoLembrete, textoPacoteContador, textoResumo } from "./lembretes.ts";

test("lembrete com um viveiro", () => {
  assert.deepEqual(textoLembrete("manha", [{ viveiro: "Sede / G1", lote: "A1" }]),
    { titulo: "Falta o apontamento da manhã", texto: "Sede / G1. Toque para lançar." });
});

test("lembrete com muitos viveiros resume a lista", () => {
  const g = Array.from({ length: 6 }, (_, i) => ({ viveiro: `G${i + 1}`, lote: "L" }));
  const r = textoLembrete("tarde", g);
  assert.equal(r.titulo, "Faltam 6 apontamentos da tarde");
  assert.equal(r.texto, "G1, G2, G3, G4 e mais 2. Toque para lançar.");
});

test("resumo diário com ração, baixas, oxigênio, contas e alertas", () => {
  const r = textoResumo({
    racao_kg: 850.5, peixes: 10000, mortes: 4, oxigenio_min: 3.8, sem_lancamento: 1,
    pagar_hoje: { n: 2, cents: 45000 }, pagar_vencidas: 1, receber_hoje: { n: 0, cents: 0 }, alertas_criticos: 3,
  });
  assert.equal(r.titulo, "Resumo do dia");
  assert.equal(r.texto,
    "Ontem: 850,5 kg de ração, 4 baixas, oxigênio mínimo de 3,8 mg/L; 1 viveiro sem lançamento. Hoje: pagar 2 (R$ 450,00), 1 vencida. 3 alertas críticos.");
});

test("resumo diário sem apontamento ontem", () => {
  const r = textoResumo({
    racao_kg: 0, peixes: 0, mortes: 0, oxigenio_min: null, sem_lancamento: 0,
    pagar_hoje: { n: 0, cents: 0 }, pagar_vencidas: 0, receber_hoje: { n: 1, cents: 100000 }, alertas_criticos: 0,
  });
  assert.equal(r.texto, "Ontem: nenhum apontamento. Hoje: receber 1 (R$ 1.000,00).");
});

test("aviso do pacote do contador", () => {
  assert.deepEqual(textoPacoteContador("2026-10"), {
    titulo: "Pacote de outubro para o contador",
    texto: "Resultado, contas, extratos, notas e ponto do mês num arquivo só. Toque para baixar.",
  });
});
