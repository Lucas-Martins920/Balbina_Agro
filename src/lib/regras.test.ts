import { test } from "node:test";
import assert from "node:assert/strict";
import { condicaoDoLancamento, descreverCondicao } from "./regras.ts";

test("lembrar pelo CNPJ quando o extrato traz", () => {
  assert.deepEqual(condicaoDoLancamento("PAG BOLETO 123", "11222333000144"), { campo: "cpf_cnpj", operador: "igual", valor: "11222333000144" });
});

test("sem CNPJ, usa o começo da descrição sem datas e números", () => {
  assert.deepEqual(condicaoDoLancamento("TARIFA PACOTE 10/2026 REF 12345", null), { campo: "descricao", operador: "comeca_com", valor: "TARIFA PACOTE REF" });
  assert.equal(condicaoDoLancamento("123456", null).valor, "123456");
});

test("descrição legível da condição", () => {
  assert.equal(descreverCondicao({ campo: "descricao", operador: "contem", valor: "tarifa" }), 'Descrição contém "tarifa"');
  assert.equal(descreverCondicao({ campo: "cpf_cnpj", operador: "vazio", valor: "" }), "CPF/CNPJ está vazio");
});
