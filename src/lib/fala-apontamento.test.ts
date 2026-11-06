import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarFala, numerosPorExtenso, resumoFala } from "./fala-apontamento.ts";

const viveiros = [{ id: "g1", rotulo: "Viveiro 1 · lote A" }, { id: "g3", rotulo: "Viveiro 3 · lote B" }, { id: "gv", rotulo: "Verde · lote C" }];

test("números por extenso viram algarismos", () => {
  assert.equal(numerosPorExtenso("quatro mil duzentos e dez peixes"), "4210 peixes");
  assert.equal(numerosPorExtenso("duas mortes"), "2 mortes");
  assert.equal(numerosPorExtenso("mil e quinhentos"), "1500");
  assert.equal(numerosPorExtenso("4.210 peixes e 12,5 kg"), "4210 peixes e 12.5 kg");
  assert.equal(numerosPorExtenso("cento e vinte e três"), "123");
  assert.equal(numerosPorExtenso("4 mil"), "4000");
  assert.equal(numerosPorExtenso("quatro vírgula dois"), "4.2");
});

test("frase completa do viveiro: ração, mortes, causa e água", () => {
  assert.deepEqual(
    interpretarFala("Viveiro três, quarenta quilos de ração, duas mortes por falta de oxigênio, oxigênio dois vírgula cinco, temperatura vinte e nove", viveiros),
    { viveiro_id: "g3", racao_kg: 40, mortes: 2, causa: "oxigenio", agua: { oxigenio_mg_l: 2.5, temperatura_c: 29 } },
  );
});

test("medida da água antes do nome não vira causa", () => {
  const r = interpretarFala("viveiro 1, 4,2 de oxigênio, pH 6,5, 30 graus, sem mortes", viveiros);
  assert.deepEqual(r, { viveiro_id: "g1", agua: { oxigenio_mg_l: 4.2, temperatura_c: 30, ph: 6.5 }, mortes: 0 });
});

test("descartes, ração sem kg e predador", () => {
  assert.deepEqual(interpretarFala("tanque verde, ração 35, 3 peixes mortos por garça, 1 descarte", viveiros),
    { viveiro_id: "gv", racao_kg: 35, mortes: 3, descartes: 1, causa: "predador" });
});

test("número depois da palavra e viveiro desconhecido", () => {
  const r = interpretarFala("viveiro 9 mortes 3 transparência 35 amônia 0,5", viveiros);
  assert.equal(r.viveiro_id, undefined);
  assert.equal(r.mortes, 3);
  assert.deepEqual(r.agua, { transparencia_cm: 35, amonia_mg_l: 0.5 });
});

test("resumo do que foi entendido", () => {
  const r = interpretarFala("viveiro 3, 40 quilos, oxigênio 5", viveiros);
  assert.equal(resumoFala(r, viveiros), "Viveiro 3 · lote B, 40 kg de ração, oxigênio 5 mg/L");
});

test("sacos de ração com o kg do saco da pessoa", () => {
  assert.deepEqual(interpretarFala("Coloquei dois sacos de ração no tanque 03", viveiros, 25), { viveiro_id: "g3", sacos: 2, racao_kg: 50 });
});

test("kg do saco dito na frase vale mais que o padrão", () => {
  assert.deepEqual(interpretarFala("viveiro 1, 3 sacos de 20 kg, sem mortes", viveiros, 25), { viveiro_id: "g1", sacos: 3, racao_kg: 60, mortes: 0 });
});

test("meio saco e saco e meio", () => {
  assert.equal(interpretarFala("meio saco no viveiro 1", viveiros, 25).racao_kg, 12.5);
  assert.equal(interpretarFala("viveiro 1, um saco e meio", viveiros, 30).racao_kg, 45);
});

test("sacos sem kg conhecido ficam para a pessoa completar", () => {
  const r = interpretarFala("2 sacos no viveiro 1", viveiros);
  assert.deepEqual(r, { viveiro_id: "g1", sacos: 2 });
  assert.equal(resumoFala(r, viveiros), "Viveiro 1 · lote A, 2 sacos de ração");
  assert.equal(resumoFala(interpretarFala("1 saco no viveiro 3", viveiros, 25), viveiros), "Viveiro 3 · lote B, 1 saco (25 kg de ração)");
});
