import { test } from "node:test";
import assert from "node:assert/strict";
import { centavosParaCampo, deslocarMes, diasAtrasISO, hojeISO, plural, rotuloMes, semAcento, somarDias, formatarData, lerCentavos, lerDecimal, lerInteiro } from "./formato.ts";

test("lerCentavos aceita formato brasileiro e com ponto decimal", () => {
  assert.equal(lerCentavos("1.234,56"), 123456);
  assert.equal(lerCentavos("R$ 1.234,56"), 123456);
  assert.equal(lerCentavos("1234.5"), 123450);
  assert.equal(lerCentavos("1234"), 123400);
  assert.equal(lerCentavos("0,01"), 1);
});

test("lerCentavos recusa o que não é dinheiro", () => {
  assert.equal(lerCentavos(""), null);
  assert.equal(lerCentavos("abc"), null);
  assert.equal(lerCentavos("1,234"), null);
  assert.equal(lerCentavos("-10"), null);
});

test("lerDecimal e lerInteiro", () => {
  assert.equal(lerDecimal("12,5"), 12.5);
  assert.equal(lerDecimal("1.250,75"), 1250.75);
  assert.equal(lerInteiro("17800"), 17800);
  assert.equal(lerInteiro("1,5"), null);
  assert.equal(lerInteiro(""), null);
});

test("formatarData não sofre com fuso horário", () => {
  assert.equal(formatarData("2026-01-01"), "01/01/2026");
  assert.equal(formatarData(null), "–");
});

test("diasAtrasISO devolve data ISO anterior a hoje", () => {
  assert.match(diasAtrasISO(14), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(diasAtrasISO(14) < diasAtrasISO(0));
});

test("hojeISO usa o fuso da empresa", () => {
  const agora = new Date("2026-10-28T03:30:00Z"); // 23h30 do dia 27 em Manaus, 00h30 do dia 28 em São Paulo
  assert.equal(hojeISO("America/Manaus", agora), "2026-10-27");
  assert.equal(hojeISO("America/Sao_Paulo", agora), "2026-10-28");
  assert.equal(hojeISO(undefined, agora), "2026-10-27");
});

test("centavos para o campo do formulário", () => {
  assert.equal(centavosParaCampo(123456), "1234,56");
  assert.equal(centavosParaCampo(0), "0,00");
  assert.equal(centavosParaCampo(null), "");
  assert.equal(centavosParaCampo(undefined), "");
});

test("somarDias vira mês e ano sem fuso", () => {
  assert.equal(somarDias("2026-10-30", 3), "2026-11-02");
  assert.equal(somarDias("2026-01-01", -1), "2025-12-31");
});

test("rotuloMes e deslocarMes atravessam a virada do ano", () => {
  assert.equal(rotuloMes("2026-10-01"), "out/26");
  assert.equal(rotuloMes("2027-05"), "mai/27");
  assert.equal(deslocarMes("2026-01", -1), "2025-12");
  assert.equal(deslocarMes("2026-10-30", 3), "2027-01");
});

test("semAcento e plural", () => {
  assert.equal(semAcento("  Ração Açaí "), "racao acai");
  assert.equal(plural(1, "conta", "contas"), "1 conta");
  assert.equal(plural(0, "dia", "dias"), "0 dias");
});
