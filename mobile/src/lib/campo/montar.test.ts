import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDaDose, formularioVazio, itensDoViveiro, montarApontamento } from "./montar.ts";
import type { Viveiro } from "./tipos.ts";

const viveiros: Viveiro[] = [
  { id: "11111111-1111-4111-8111-111111111111", nome: "Sede / Tanque 01", lote: "L1", peixes: 1000, fase: "engorda", checklist: "engorda" },
  { id: "22222222-2222-4222-8222-222222222222", nome: "Sede / Berçário", lote: "L2", peixes: 500, fase: "alevinagem", checklist: "alevinagem_recria" },
];
const checklist = [
  { id: "33333333-3333-4333-8333-333333333333", nome: "Aerador funcionando", tipo: "sim_nao", unidade: null, aplica_em: "todos" },
  { id: "44444444-4444-4444-8444-444444444444", nome: "Sobra de ração", tipo: "numero", unidade: "%", aplica_em: "engorda" },
];
const RACAO = "55555555-5555-4555-8555-555555555555";
const MEDICAMENTO = "77777777-7777-4777-8777-777777777777";
const ctx = { viveiros, checklist, temTiposRacao: true, agua: true, hoje: "2026-11-03", clientId: "66666666-6666-4666-8666-666666666666" };

function preenchido() {
  const f = formularioVazio(viveiros[0].id, "2026-11-03", "manha");
  f.mortes = "2";
  f.racoes = [{ produto_id: RACAO, kg: "29,5" }];
  f.checklist[checklist[0].id] = { ok: true };
  f.checklist[checklist[1].id] = { valor: 5 };
  return f;
}

test("monta o lançamento com ração por tipo, mortes e checklist da engorda", () => {
  const r = montarApontamento(preenchido(), ctx);
  assert.ok("ok" in r);
  assert.equal(r.ok.mortes, 2);
  assert.equal(r.ok.descartes, 0);
  assert.equal(r.ok.racao_kg, 29.5);
  assert.deepEqual(r.ok.racoes, [{ produto_id: RACAO, kg: 29.5 }]);
  assert.equal(r.ok.checklist.length, 2);
  assert.equal(r.ok.agua, null);
});

test("qualidade da água vai só com as medidas preenchidas, e fora da faixa é recusada", () => {
  const f = preenchido();
  f.agua = { oxigenio_mg_l: "5,2", temperatura_c: "29", ph: "" };
  const r = montarApontamento(f, ctx);
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.agua, { oxigenio_mg_l: 5.2, temperatura_c: 29 });
  f.agua = { ph: "15" };
  const fora = montarApontamento(f, ctx);
  assert.ok("erro" in fora && fora.erro.startsWith("pH"));
  f.agua = { ph: "seis" };
  assert.deepEqual(montarApontamento(f, ctx), { erro: "pH: informe um número." });
});

test("sem medir a água na piscicultura, as medidas digitadas não vão", () => {
  const f = preenchido();
  f.agua = { oxigenio_mg_l: "5" };
  const r = montarApontamento(f, { ...ctx, agua: false });
  assert.ok("ok" in r && r.ok.agua === null);
});

test("mortes acima dos peixes do viveiro são recusadas", () => {
  const f = preenchido();
  f.mortes = "1001";
  assert.ok("erro" in montarApontamento(f, ctx));
  f.mortes = "2,5";
  assert.deepEqual(montarApontamento(f, ctx), { erro: "Peixes mortos: número inteiro." });
});

test("a causa vale para todas as mortes do lançamento; sem mortes, não vai", () => {
  const f = preenchido();
  f.causa = "oxigenio";
  const r = montarApontamento(f, ctx);
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.causas, { oxigenio: 2 });
  f.mortes = "";
  const s = montarApontamento(f, ctx);
  assert.ok("ok" in s && s.ok.causas === undefined);
  f.causa = "calor";
  assert.deepEqual(montarApontamento(f, ctx), { erro: "Causa das mortes desconhecida." });
});

test("checklist sim/não é obrigatório; medida pode ficar sem medir", () => {
  const f = preenchido();
  delete f.checklist[checklist[0].id];
  assert.ok("erro" in montarApontamento(f, ctx));
  const g = preenchido();
  g.checklist[checklist[1].id] = { naoMedir: true };
  const r = montarApontamento(g, ctx);
  assert.ok("ok" in r && r.ok.checklist.length === 1);
});

test("viveiro em alevinagem só usa o checklist da fase", () => {
  const f = formularioVazio(viveiros[1].id, "2026-11-03", "tarde");
  f.checklist[checklist[0].id] = { ok: false };
  const r = montarApontamento(f, ctx);
  assert.ok("ok" in r && r.ok.checklist.length === 1);
  assert.equal(itensDoViveiro(checklist, viveiros[1]).length, 1);
  assert.equal(itensDoViveiro(checklist, viveiros[0]).length, 2);
});

test("medicação usa a base da dose pela via (ração em kg, água em m³)", () => {
  const f = preenchido();
  f.medicamento_id = MEDICAMENTO;
  f.medBase = "29,5";
  f.medDias = "5";
  const r = montarApontamento(f, ctx);
  assert.ok("ok" in r);
  assert.deepEqual(r.ok.medicacao, { medicamento_id: MEDICAMENTO, dias: 5, dose_por_unidade: null, base_dose: 29.5, quantidade: null });
  assert.equal(baseDaDose("racao").unidade, "kg de ração");
  assert.equal(baseDaDose("banho").unidade, "m³ de água");
});

test("sem tipos de ração cadastrados, vale o total em kg", () => {
  const f = preenchido();
  f.racaoKg = "12,5";
  const r = montarApontamento(f, { ...ctx, temTiposRacao: false });
  assert.ok("ok" in r && r.ok.racao_kg === 12.5 && r.ok.racoes.length === 0);
});

test("data no futuro é recusada", () => {
  const f = preenchido();
  f.data = "2026-11-04";
  assert.deepEqual(montarApontamento(f, ctx), { erro: "Data inválida." });
});
