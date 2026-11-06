import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorEmbalagem, custoKgMes, embalagemPescado, emKg, faixaClasse, lerKg, lerPeixes, numeroKg, precoKg, textoKg, textoPeso } from "./pescado.ts";

test("kg no formato brasileiro", () => {
  assert.equal(textoKg(1234.5), "1.234,5 kg");
  assert.equal(textoKg("20"), "20 kg");
  assert.equal(textoKg(0.25, 2), "0,25 kg");
  assert.equal(numeroKg(1234.56), "1.234,6");
  assert.equal(textoKg(null), "—");
});

test("peso do peixe em g até 1 kg e em kg acima", () => {
  assert.equal(textoPeso(850), "850 g");
  assert.equal(textoPeso(1250), "1,25 kg");
  assert.equal(textoPeso(0.5), "0,5 g");
  assert.equal(textoPeso(undefined), "—");
});

test("lê kg digitado com vírgula, ponto decimal ou milhar", () => {
  assert.equal(lerKg("12,5"), 12.5);
  assert.equal(lerKg("12.5"), 12.5);
  assert.equal(lerKg("1.234,5"), 1234.5);
  assert.equal(lerKg("1.234"), 1234);
  assert.equal(lerKg(" 20 kg"), 20);
  assert.equal(lerKg(""), undefined);
  assert.equal(lerKg("doze"), null);
  assert.equal(lerKg("-3"), null);
});

test("lê quantidade de peixes inteira", () => {
  assert.equal(lerPeixes("12.000"), 12000);
  assert.equal(lerPeixes(""), undefined);
  assert.equal(lerPeixes("1,5"), null);
});

test("produto em caixas vira kg pelo fator e preço médio por kg", () => {
  assert.equal(emKg(3, 20), 60);
  assert.equal(emKg(2.5, 1), 2.5);
  assert.equal(emKg(2, null), 2);
  assert.equal(precoKg(120000, 100), 1200);
  assert.equal(precoKg(1000, 0), null);
});

test("embalagem pelo fator de kg, não pelo nome", () => {
  assert.equal(embalagemPescado(1), "kg");
  assert.equal(embalagemPescado(20), "caixa");
  assert.equal(embalagemPescado(null), "outros");
  const grupos = agruparPorEmbalagem([
    { nome: "Caixa 20 kg", fator_kg: 20 }, { nome: "Peixe extra (kg)", fator_kg: 1 }, { nome: "Gelo", fator_kg: null },
  ]);
  assert.deepEqual(grupos.map((g) => g.embalagem), ["kg", "caixa", "outros"]);
  assert.equal(grupos[1].titulo, "Caixas");
});

test("faixa de peso da classe", () => {
  assert.equal(faixaClasse(null, 1000), "até 1 kg");
  assert.equal(faixaClasse(1000, 2000), "1 kg a 2 kg");
  assert.equal(faixaClasse(3000, null), "acima de 3 kg");
  assert.equal(faixaClasse(null, null), "");
});

test("custo do kg do mês: todo o custo sobre o ganho positivo de biomassa", () => {
  const r = custoKgMes([
    { custo_total_cents: 600000, ganho_kg: 1000 },
    { custo_total_cents: 100000, ganho_kg: -50 },
    { custo_total_cents: "50000", ganho_kg: "250" },
  ]);
  assert.deepEqual(r, { custoCents: 750000, ganhoKg: 1250, kgCents: 600 });
  assert.equal(custoKgMes([{ custo_total_cents: 1000, ganho_kg: 0 }]), null);
  assert.equal(custoKgMes([]), null);
});
