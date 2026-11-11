import { test } from "node:test";
import assert from "node:assert/strict";
import { validarAbrirLote, validarBiometriaCampo, validarFecharLote, validarInsumoCampo } from "./validar.ts";

const HOJE = "2026-11-05";
const ID = "4d8f3f8e-1c2b-4a5d-9e6f-7a8b9c0d1e2f";
const VIV = "0b9c8d7e-6f5a-4b3c-8d2e-1f0a9b8c7d6e";
const OUTRO = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const base = { client_id: ID, viveiro_id: VIV, data: "2026-11-04" };

test("biometria pelo peso total da amostra", () => {
  assert.deepEqual(validarBiometriaCampo({ ...base, peixes: 30, peso_total_g: 10500, peso_medio_g: 999, observacoes: " ok " }, HOJE), {
    ok: { ...base, lote_id: null, peixes: 30, peso_total_g: 10500, peso_medio_g: null, observacoes: "ok" },
  });
});

test("biometria pelo peso médio e erros", () => {
  assert.equal((validarBiometriaCampo({ ...base, peixes: 20, peso_medio_g: 350 }, HOJE) as { ok: { peso_medio_g: number } }).ok.peso_medio_g, 350);
  assert.deepEqual(validarBiometriaCampo({ ...base, peixes: 20 }, HOJE), { erro: "Informe o peso total da amostra ou o peso médio." });
  assert.deepEqual(validarBiometriaCampo({ ...base, peixes: 2.5, peso_medio_g: 10 }, HOJE), { erro: "Informe quantos peixes foram pesados (número inteiro)." });
  assert.deepEqual(validarBiometriaCampo({ ...base, peixes: 10, peso_total_g: -1 }, HOJE), { erro: "Peso inválido: use gramas, maior que zero." });
  assert.deepEqual(validarBiometriaCampo({ ...base, data: "2026-11-06", peixes: 10, peso_medio_g: 5 }, HOJE),
    { erro: "Data inválida: use a data de hoje ou de um dia que já passou." });
  assert.deepEqual(validarBiometriaCampo({ ...base, client_id: "x", peixes: 10, peso_medio_g: 5 }, HOJE), { erro: "Identificador do envio inválido." });
  assert.deepEqual(validarBiometriaCampo(null, HOJE), { erro: "Envio inválido." });
});

test("abrir lote", () => {
  assert.deepEqual(validarAbrirLote({ ...base, codigo: " L-12 ", especie_id: OUTRO, quantidade: 8000, peso_inicial_g: 2.5, custo_cents: 120000 }, HOJE), {
    ok: { ...base, codigo: "L-12", especie_id: OUTRO, quantidade: 8000, peso_inicial_g: 2.5, peso_alvo_g: null, custo_cents: 120000 },
  });
  assert.deepEqual(validarAbrirLote({ ...base, codigo: "L", especie_id: OUTRO, quantidade: 100 }, HOJE),
    { erro: "Informe o peso médio dos peixes no povoamento, em gramas." });
  assert.deepEqual(validarAbrirLote({ ...base, codigo: "", especie_id: OUTRO }, HOJE), { erro: "Informe o código do lote." });
  assert.deepEqual(validarAbrirLote({ ...base, codigo: "L", especie_id: OUTRO, quantidade: 100, peso_inicial_g: 3, custo_cents: 10.5 }, HOJE),
    { erro: "Custo dos alevinos inválido." });
});

test("fechar lote: despesca total ou encerramento", () => {
  assert.deepEqual(validarFecharLote({ ...base, modo: "despesca", kg: 2450.5, peixes: 1800 }, HOJE), {
    ok: { ...base, modo: "despesca", kg: 2450.5, peixes: 1800, motivo: "", observacoes: "" },
  });
  assert.deepEqual(validarFecharLote({ ...base, modo: "despesca" }, HOJE), { erro: "Informe os kg despescados." });
  assert.deepEqual(validarFecharLote({ ...base, modo: "encerrar" }, HOJE), { erro: "Diga por que o lote está sendo encerrado sem despesca." });
  assert.equal((validarFecharLote({ ...base, modo: "encerrar", motivo: "perda por cheia" }, HOJE) as { ok: { motivo: string } }).ok.motivo, "perda por cheia");
  assert.deepEqual(validarFecharLote({ ...base, modo: "x" }, HOJE), { erro: "Escolha despesca total ou encerrar sem despesca." });
});

test("insumo: corretivo precisa do produto e da quantidade", () => {
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "calagem", produto_id: OUTRO, quantidade: 200 }, HOJE), {
    ok: { ...base, tipo: "calagem", produto_id: OUTRO, quantidade: 200, medicamento_id: null, dias: 1, dose: null, base: null, observacoes: "", baixar_estoque: true },
  });
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "calagem" }, HOJE), { erro: "Escolha o calcário ou a cal aplicada." });
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "outro", produto_id: OUTRO }, HOJE), { erro: "Informe a quantidade aplicada." });
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "limpeza", quantidade: 3 }, HOJE), { erro: "Escolha o produto aplicado." });
  assert.equal((validarInsumoCampo({ ...base, tipo: "limpeza", baixar_estoque: false }, HOJE) as { ok: { baixar_estoque: boolean } }).ok.baixar_estoque, false);
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "pesca" }, HOJE), { erro: "Escolha o tipo de manejo." });
});

test("insumo: medicamento do cadastro", () => {
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "medicamento", medicamento_id: OUTRO, dias: 3, base: 120 }, HOJE), {
    ok: { ...base, tipo: "medicamento", produto_id: null, quantidade: null, medicamento_id: OUTRO, dias: 3, dose: null, base: 120, observacoes: "", baixar_estoque: true },
  });
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "medicamento" }, HOJE), { erro: "Escolha o medicamento ou a vitamina." });
  assert.deepEqual(validarInsumoCampo({ ...base, tipo: "medicamento", medicamento_id: OUTRO, dias: 0 }, HOJE), { erro: "Dias de tratamento: de 1 a 120." });
});

test("biometria em grupos: totais pela média ponderada, água e jejum", () => {
  const r = validarBiometriaCampo({ ...base, grupos: [{ peixes: 10, peso_kg: 1.5, ponto_captura: "cocho" }, { peixes: 40, peso_kg: 8 }],
    jejum_horas: 12, temperatura_c: 29.5, oxigenio_mg_l: null, observacoes: "" }, HOJE) as { ok: Record<string, unknown> };
  assert.equal(r.ok.peixes, 50);
  assert.equal(r.ok.peso_total_g, 9500);
  assert.equal(r.ok.peso_medio_g, null);
  assert.equal((r.ok.grupos as unknown[]).length, 2);
  assert.equal(r.ok.jejum_horas, 12);
  assert.equal(r.ok.oxigenio_mg_l, null);
  assert.deepEqual(validarBiometriaCampo({ ...base, grupos: [] }, HOJE), { erro: "Informe pelo menos um grupo pesado." });
  assert.deepEqual(validarBiometriaCampo({ ...base, grupos: [{ peixes: 5, peso_kg: 1 }], temperatura_c: 80 }, HOJE), { erro: "Temperatura inválida: de 0 a 45 °C." });
});
