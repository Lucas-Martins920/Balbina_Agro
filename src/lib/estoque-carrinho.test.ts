import { test } from "node:test";
import assert from "node:assert/strict";
import { estoqueNoCarrinho, quantidadeQueCabe } from "./estoque-carrinho.ts";

// Tambaqui Grande: 474,5 kg no estoque, vendido por kg (fator 1) e em caixa de 20 kg
const kg = { id: "kg", classe_peixe_id: "gr", fator_kg: 1, kg_classe: 474.5 };
const caixa = { id: "cx", classe_peixe_id: "gr", fator_kg: 20, kg_classe: 474.5 };
const medio = { id: "md", classe_peixe_id: "md", fator_kg: 1, kg_classe: 30 };
const avulso = { id: "av", classe_peixe_id: null, fator_kg: null, kg_classe: null };
const produtos = [kg, caixa, medio, avulso];

test("sem carrinho, cada forma mostra o estoque inteiro da classe", () => {
  const e = estoqueNoCarrinho(produtos, {});
  assert.equal(e.get("kg")?.resta, 474.5);
  assert.equal(e.get("cx")?.resta, 23, "caixas cheias de 20 kg");
  assert.equal(e.get("av"), null);
});

test("ao pôr uma caixa no carrinho, os kg da mesma classe caem junto", () => {
  const e = estoqueNoCarrinho(produtos, { cx: 1 });
  assert.equal(e.get("kg")?.resta, 454.5);
  assert.equal(e.get("cx")?.resta, 22);
  assert.equal(e.get("md")?.resta, 30, "outra classe não muda");
});

test("venda por kg aceita fração e não cria sobra de ponto flutuante", () => {
  const e = estoqueNoCarrinho(produtos, { kg: 12.3, md: 0.1 });
  assert.equal(e.get("kg")?.resta, 462.2);
  assert.equal(e.get("kg")?.max, 474.5);
  assert.equal(e.get("md")?.resta, 29.9);
  assert.equal(e.get("cx")?.resta, 23, "462,2 kg ainda dão 23 caixas");
});

test("o máximo de cada forma soma o que já está no carrinho com o que sobrou", () => {
  const e = estoqueNoCarrinho(produtos, { cx: 2, kg: 100 });
  // 474,5 − 40 − 100 = 334,5 kg
  assert.equal(e.get("cx")?.resta, 16);
  assert.equal(e.get("cx")?.max, 18);
  assert.equal(e.get("kg")?.resta, 334.5);
  assert.equal(e.get("kg")?.max, 434.5);
});

test("estoque todo no carrinho não deixa vender mais em nenhuma forma", () => {
  const e = estoqueNoCarrinho(produtos, { kg: 474.5 });
  assert.equal(e.get("kg")?.resta, 0);
  assert.equal(e.get("cx")?.resta, 0);
  assert.equal(e.get("cx")?.max, 0);
});

test("carrinho acima do estoque não fica negativo", () => {
  const e = estoqueNoCarrinho(produtos, { cx: 30 });
  assert.equal(e.get("kg")?.resta, 0);
  assert.equal(e.get("cx")?.max, 23);
});

test("tirar do carrinho devolve ao estoque", () => {
  const com = estoqueNoCarrinho(produtos, { cx: 1 });
  const sem = estoqueNoCarrinho(produtos, { cx: 0 });
  assert.equal(com.get("kg")?.resta, 454.5);
  assert.equal(sem.get("kg")?.resta, 474.5);
});

test("quantidadeQueCabe: kg até o grama, embalagem em unidades inteiras", () => {
  assert.equal(quantidadeQueCabe(10.0004, 1), 10);
  assert.equal(quantidadeQueCabe(0.3, 1), 0.3);
  assert.equal(quantidadeQueCabe(39.99, 20), 1);
  assert.equal(quantidadeQueCabe(-5, 1), 0);
  assert.equal(quantidadeQueCabe(10, 0), 0);
});
