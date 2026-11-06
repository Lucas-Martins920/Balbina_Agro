import { test } from "node:test";
import assert from "node:assert/strict";
import { TABELA_ARRACOAMENTO, buscarConhecimento, normalizarPergunta, textoBaseConhecimento } from "./conhecimento-tambaqui.ts";

test("pergunta normalizada sem acento e pontuação", () => {
  assert.equal(normalizarPergunta("Oxigênio baixo, o que faço?!"), "oxigenio baixo o que faco");
});

test("oxigênio baixo acha o tópico de oxigênio primeiro", () => {
  const r = buscarConhecimento("os peixes estão boquejando, oxigênio em 2,5");
  assert.equal(r[0]?.chave, "oxigenio");
  assert.match(r[0].texto, /Abaixo de 3 mg\/L, suspenda a ração/);
});

test("quanto de ração acha a tabela de arraçoamento", () => {
  const r = buscarConhecimento("Quanto de ração dou para peixe de 300 gramas?");
  assert.equal(r[0]?.chave, "arracoamento");
  assert.match(r[0].texto, /Engorda I \(298 a 530 g\): ração com 28% de proteína, 8 mm, 2,1% a 1,8% do peso vivo por dia, em 3 refeições/);
});

test("palavra composta e limite de tópicos", () => {
  assert.equal(buscarConhecimento("qual o peso medio ideal na biometria?")[0]?.chave, "biometria");
  assert.equal(buscarConhecimento("ração oxigênio amônia temperatura", 2).length, 2);
});

test("pergunta fora da base não inventa tópico", () => {
  assert.deepEqual(buscarConhecimento("qual o preço do dólar hoje"), []);
});

test("tabela segue a Embrapa e cobre de 0,5 g a 2,5 kg sem buraco", () => {
  assert.equal(TABELA_ARRACOAMENTO[0].de, 0.5);
  assert.equal(TABELA_ARRACOAMENTO.at(-1)?.ate, 2500);
  for (let i = 1; i < TABELA_ARRACOAMENTO.length; i++) assert.equal(TABELA_ARRACOAMENTO[i].de, TABELA_ARRACOAMENTO[i - 1].ate);
});

test("texto da base cita as fontes", () => {
  const t = textoBaseConhecimento();
  assert.match(t, /Embrapa Amazônia Oriental, 2018/);
  assert.match(t, /Circular Técnica 39/);
  assert.match(t, /## Oxigênio dissolvido/);
});
