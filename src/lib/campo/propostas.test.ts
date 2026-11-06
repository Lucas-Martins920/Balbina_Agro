import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarFala } from "../fala-apontamento.ts";
import { cartaoDaFala, cartoesDaIa, itemDoCartao, pendenciaDoCartao, rotuloCartao, type PropostaIa } from "./propostas.ts";

const ctx = {
  tanques: [
    { id: "t2", rotulo: "Sede / Tanque 02", lote: { id: "l2" } },
    { id: "t5", rotulo: "Sede / Tanque 05", lote: null },
  ],
  insumos: [{ id: "cal", nome: "Calcário", unidade: "kg" }],
  medicamentos: [{ id: "oxi", nome: "Oxitetraciclina" }],
  racoes: [{ id: "r28", nome: "Engorda 28% 8 mm" }],
};

const vazia: PropostaIa = {
  tipo: "apontamento", viveiro_id: null, turno: null, racao_kg: null, sacos: null, racao_produto_id: null, mortes: null, causa: null,
  oxigenio_mg_l: null, temperatura_c: null, ph: null, transparencia_cm: null, amonia_mg_l: null, peixes_amostrados: null,
  peso_total_g: null, peso_medio_g: null, insumo_tipo: null, produto_id: null, medicamento_id: null, quantidade: null, observacoes: null,
};

test("proposta da IA vira cartão só com o que existe", () => {
  const r = cartoesDaIa([
    { ...vazia, viveiro_id: "t2", racao_kg: 50, sacos: 2, racao_produto_id: "inventada", mortes: 3, causa: "predador", oxigenio_mg_l: 4.2 },
    { ...vazia, tipo: "biometria", viveiro_id: "t2", peixes_amostrados: 30, peso_total_g: 10500, peso_medio_g: 350 },
    { ...vazia, tipo: "insumo", viveiro_id: "t5", insumo_tipo: "calagem", produto_id: "cal", quantidade: 200 },
    { ...vazia, tipo: "insumo", viveiro_id: "t2", insumo_tipo: "medicamento", medicamento_id: "oxi" },
    { ...vazia, tipo: "insumo", viveiro_id: "t2", insumo_tipo: "outro", produto_id: "inventado" },
    { ...vazia, viveiro_id: "x" },
  ], ctx);
  assert.deepEqual(r, [
    { tipo: "apontamento", viveiro_id: "t2", turno: null, racao_kg: 50, sacos: 2, racao_produto_id: null, mortes: 3, causa: "predador", agua: { oxigenio_mg_l: 4.2 }, observacoes: "" },
    { tipo: "biometria", viveiro_id: "t2", peixes: 30, peso_total_g: 10500, peso_medio_g: null, observacoes: "" },
    { tipo: "insumo", viveiro_id: "t5", insumo_tipo: "calagem", produto_id: "cal", medicamento_id: null, quantidade: 200, observacoes: "" },
    { tipo: "insumo", viveiro_id: "t2", insumo_tipo: "medicamento", produto_id: null, medicamento_id: "oxi", quantidade: null, observacoes: "" },
  ]);
});

test("frase sem sinal vira cartão de apontamento", () => {
  const c = cartaoDaFala(interpretarFala("Coloquei 2 sacos de ração no tanque 02", [{ id: "t2", rotulo: "Tanque 02" }], 25));
  assert.deepEqual(c, { tipo: "apontamento", viveiro_id: "t2", turno: null, racao_kg: 50, sacos: 2, racao_produto_id: null, mortes: null, causa: null, agua: null, observacoes: "" });
  assert.equal(cartaoDaFala({}), null);
});

test("pendências antes de confirmar", () => {
  const ap = cartaoDaFala({ viveiro_id: "t2", sacos: 2 })!;
  assert.equal(pendenciaDoCartao(ap, ctx), "Quantos kg tem cada saco?");
  assert.equal(pendenciaDoCartao({ ...ap, racao_kg: 50 }, ctx), null);
  assert.equal(pendenciaDoCartao({ ...ap, viveiro_id: "t5", racao_kg: 50 }, ctx), "Este viveiro está vazio: abra o lote antes de lançar ração.");
  assert.equal(pendenciaDoCartao({ ...ap, viveiro_id: null }, ctx), "Escolha o viveiro.");
  assert.equal(pendenciaDoCartao({ tipo: "biometria", viveiro_id: "t2", peixes: 30, peso_total_g: null, peso_medio_g: null, observacoes: "" }, ctx), "Informe o peso da amostra.");
  assert.equal(pendenciaDoCartao({ tipo: "insumo", viveiro_id: "t5", insumo_tipo: "calagem", produto_id: "cal", medicamento_id: null, quantidade: null, observacoes: "" }, ctx),
    "Informe a quantidade aplicada.");
  assert.equal(pendenciaDoCartao({ tipo: "insumo", viveiro_id: "t5", insumo_tipo: "banho", produto_id: null, medicamento_id: null, quantidade: null, observacoes: "" }, ctx),
    "Este viveiro está vazio: banho é aplicado nos peixes.");
});

test("rótulo do cartão", () => {
  assert.equal(rotuloCartao({ tipo: "apontamento", viveiro_id: "t2", turno: null, racao_kg: 50, sacos: 2, racao_produto_id: null, mortes: 3, causa: null, agua: { oxigenio_mg_l: 4.2 }, observacoes: "" }, ctx),
    "Ração · Sede / Tanque 02 · 50 kg (2 sacos) · 3 mortes · O₂ 4,2 mg/L");
  assert.equal(rotuloCartao({ tipo: "biometria", viveiro_id: "t2", peixes: 30, peso_total_g: 10500, peso_medio_g: null, observacoes: "" }, ctx),
    "Biometria · Sede / Tanque 02 · 30 peixes · 350 g");
  assert.equal(rotuloCartao({ tipo: "insumo", viveiro_id: "t5", insumo_tipo: "calagem", produto_id: "cal", medicamento_id: null, quantidade: 200, observacoes: "" }, ctx),
    "Calagem · Sede / Tanque 05 · Calcário 200 kg");
});

test("cartão confirmado vira envio da fila", () => {
  const extra = { client_id: "c1", data: "2026-11-05", turno: "manha" as const, agora: "2026-11-05T10:00:00Z" };
  const ap = itemDoCartao({ tipo: "apontamento", viveiro_id: "t2", turno: null, racao_kg: 50, sacos: 2, racao_produto_id: "r28", mortes: 3, causa: "predador", agua: null, observacoes: "" }, ctx, extra);
  assert.equal(ap.tipo, "apontamento");
  assert.deepEqual(ap.corpo, {
    client_id: "c1", viveiro_id: "t2", data: "2026-11-05", turno: "manha", mortes: 3, descartes: 0, racao_kg: 50,
    racoes: [{ produto_id: "r28", kg: 50 }], agua: null, observacoes: "", causas: { predador: 3 },
  });
  const bio = itemDoCartao({ tipo: "biometria", viveiro_id: "t2", peixes: 30, peso_total_g: 10500, peso_medio_g: null, observacoes: "" }, ctx, extra);
  assert.deepEqual(bio.corpo, { client_id: "c1", viveiro_id: "t2", data: "2026-11-05", lote_id: "l2", peixes: 30, peso_total_g: 10500, peso_medio_g: null, observacoes: "" });
  const ins = itemDoCartao({ tipo: "insumo", viveiro_id: "t5", insumo_tipo: "calagem", produto_id: "cal", medicamento_id: null, quantidade: 200, observacoes: "preparo" }, ctx, extra);
  assert.deepEqual(ins.corpo, { client_id: "c1", viveiro_id: "t5", data: "2026-11-05", tipo: "calagem", produto_id: "cal", quantidade: 200, medicamento_id: null, dias: 1, observacoes: "preparo" });
  assert.equal(ins.rotulo, "Calagem · Sede / Tanque 05 · Calcário 200 kg");
});
