import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarLinha, lerLinhaDigitavel, modulo10, modulo11Arrecadacao, modulo11Banco, vencimentoDoFator } from "./boleto.ts";

// Monta uma linha bancária válida a partir das partes, como o banco faz.
function linhaBancaria(fator: number, valorCents: number, livre = "1234567890123456789012345") {
  const fv = String(fator).padStart(4, "0") + String(valorCents).padStart(10, "0");
  const semDv = "0019" + fv + livre;
  const dv = modulo11Banco(semDv);
  const c1 = "0019" + livre.slice(0, 5), c2 = livre.slice(5, 15), c3 = livre.slice(15, 25);
  return `${c1}${modulo10(c1)}${c2}${modulo10(c2)}${c3}${modulo10(c3)}${dv}${fv}`;
}

test("exemplo publicado do Banco do Brasil confere", () => {
  const b = lerLinhaDigitavel("00190.50095 40144.816069 06809.350314 3 37370000000100", "2007-11-01");
  assert.ok(b);
  assert.equal(b.valor_cents, 100);
});

test("boleto bancário: valor, vencimento do ciclo novo e formato", () => {
  const linha = linhaBancaria(1000 + 626, 1234567); // 22/02/2025 + 626 dias
  const b = lerLinhaDigitavel(linha, "2026-11-01");
  assert.deepEqual({ ...b, linha: undefined }, { tipo: "bancario", linha: undefined, valor_cents: 1234567, vencimento: "2026-11-10" });
  assert.equal(formatarLinha(b!).replace(/\D/g, ""), linha);
});

test("um dígito errado invalida", () => {
  const linha = linhaBancaria(1500, 5000);
  const errada = linha.slice(0, 40) + ((Number(linha[40]) + 1) % 10) + linha.slice(41);
  assert.equal(lerLinhaDigitavel(errada, "2026-11-01"), null);
  assert.equal(lerLinhaDigitavel("123", "2026-11-01"), null);
});

test("fator de vencimento perto de hoje", () => {
  assert.equal(vencimentoDoFator(1000, "2025-03-01"), "2025-02-22");
  assert.equal(vencimentoDoFator(9999, "2025-02-01"), "2025-02-21");
  assert.equal(vencimentoDoFator(0, "2025-02-01"), null);
});

test("conta de consumo (arrecadação) com módulo 11", () => {
  const barrasSemDv = "828" + "00000012345" + "6789012345678901234567890123456789".slice(0, 29);
  const dvGeral = modulo11Arrecadacao(barrasSemDv);
  const barras = barrasSemDv.slice(0, 3) + dvGeral + barrasSemDv.slice(3);
  const linha = [0, 1, 2, 3].map((i) => { const b = barras.slice(i * 11, i * 11 + 11); return b + modulo11Arrecadacao(b); }).join("");
  const b = lerLinhaDigitavel(linha, "2026-11-01");
  assert.equal(b?.tipo, "arrecadacao");
  assert.equal(b?.valor_cents, 12345);
});
