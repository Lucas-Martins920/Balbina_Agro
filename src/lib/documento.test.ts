import { test } from "node:test";
import assert from "node:assert/strict";
import { cnpjValido, cpfValido, formatarDocumento } from "./documento.ts";

test("cpfValido confere os dígitos", () => {
  assert.equal(cpfValido("123.456.789-09"), true);
  assert.equal(cpfValido("52998224725"), true);
  assert.equal(cpfValido("52998224724"), false);
  assert.equal(cpfValido("12345678900"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cpfValido("1234567890"), false);
});

test("cnpjValido confere os dígitos", () => {
  assert.equal(cnpjValido("11.222.333/0001-81"), true);
  assert.equal(cnpjValido("11222333000180"), false);
  assert.equal(cnpjValido("00000000000000"), false);
});

test("formatarDocumento põe a máscara de CPF e CNPJ", () => {
  assert.equal(formatarDocumento("12345678909"), "123.456.789-09");
  assert.equal(formatarDocumento("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatarDocumento(null), "");
});
