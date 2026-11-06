import { test } from "node:test";
import assert from "node:assert/strict";
import {
  frasesLote, INDICADORES, referenciaEspecie, resumoLote, resumoPorEspecie, semanasPorIndicador, serieIndicador, taxaSemana,
  type SemanaLote,
} from "./zootecnico.ts";

function semana(semana: number, campos: Partial<SemanaLote> = {}): SemanaLote {
  return {
    semana, dias: 7, inicio: undefined, fim: undefined, peixes_medios: 9800, racao_kg: "350", consumo_g_peixe_dia: "5.1", baixas: 20,
    mortalidade_acum_pct: "2", sobrevivencia_pct: "98", peso_medio_g: "200", biomassa_kg: "1960", racao_acum_kg: "2000",
    kg_despescados_acum: "0", conversao_alimentar: "1.8", padrao_peso_g: "210", padrao_consumo_g: "5.6",
    padrao_sobrevivencia_pct: null, padrao_taxa_pct: "2.45", ...campos,
  };
}

test("resumo do lote: peso contra a curva, ganho diário, sobrevivência e conversão", () => {
  const r = resumoLote([
    semana(9, { fim: "2026-03-04", peso_medio_g: "150", padrao_peso_g: "155" }),
    semana(10, { fim: "2026-03-11", peso_medio_g: "190", padrao_peso_g: "200", mortalidade_acum_pct: "3", sobrevivencia_pct: "97" }),
  ], { povoamento: "2026-01-01", pesoInicialG: 30, uniformidade: 72 });
  assert.equal(r.semanaAtual, 10);
  assert.equal(r.pesoAtual, 190);
  assert.equal(r.desvioPesoPct, (190 / 200 - 1) * 100);
  // 70 dias até o fim da semana, mais o dia seguinte em que o peso é estimado
  assert.equal(r.gpd, (190 - 30) / 70);
  assert.equal(r.padraoGpd, (200 - 30) / 70);
  assert.equal(r.sobrevivencia, 97);
  assert.equal(r.mortalidadeAcum, 3);
  assert.equal(r.conversao, 1.8);
  assert.equal(r.consumo, 5.1);
  assert.equal(r.taxaAlimentacao, (350 / 7 / 1960) * 100);
  assert.equal(r.uniformidade, 72);
});

test("semana com poucos dias não entra no consumo; sem semanas não há resumo", () => {
  const r = resumoLote([semana(4, { consumo_g_peixe_dia: "3" }), semana(5, { dias: 2, consumo_g_peixe_dia: "9" })], {});
  assert.equal(r.semanaAtual, 5);
  assert.equal(r.consumo, 3);
  assert.equal(r.gpd, null);
  const vazio = resumoLote([], {});
  assert.equal(vazio.semanaAtual, null);
  assert.deepEqual(frasesLote(vazio), [{ texto: "Ainda sem apontamento para calcular os indicadores.", alerta: false }]);
});

test("taxa de alimentação: ração média do dia sobre a biomassa", () => {
  assert.equal(taxaSemana(semana(1, { racao_kg: "70", biomassa_kg: "500", dias: 7 })), 2);
  assert.equal(taxaSemana(semana(1, { biomassa_kg: "0" })), null);
});

test("séries por indicador trazem real e padrão da própria view", () => {
  const semanas = [semana(2, { peso_medio_g: "40", padrao_peso_g: "42" }), semana(1, { peso_medio_g: "30", padrao_peso_g: "30" })];
  assert.deepEqual(serieIndicador(semanas, "peso"), [{ semana: 1, real: 30, padrao: 30 }, { semana: 2, real: 40, padrao: 42 }]);
  assert.deepEqual(serieIndicador(semanas, "conversao").map((p) => p.padrao), [null, null]);
  const lado = semanasPorIndicador(semanas);
  assert.deepEqual(Object.keys(lado[0].valores), Object.keys(INDICADORES));
  assert.equal(lado[1].valores.mortalidade.real, 2);
});

test("média por espécie ignora lote sem o número", () => {
  const a = resumoLote([semana(10, { fim: "2026-03-11", peso_medio_g: "300" })], { povoamento: "2026-01-01", pesoInicialG: 20 });
  const b = resumoLote([semana(10, { peso_medio_g: "500", conversao_alimentar: null })], {});
  const [t] = resumoPorEspecie([{ especie: "Tambaqui", resumo: a }, { especie: "Tambaqui", resumo: b }]);
  assert.equal(t.lotes, 2);
  assert.equal(t.pesoMedio, 400);
  assert.equal(t.gpdMedio, 4);
  assert.equal(t.conversaoMedia, 1.8);
});

test("frases do lote comparam com a curva e com a referência da Embrapa", () => {
  const ref = referenciaEspecie("Tambaqui");
  assert.ok(ref && ref.conversao === 2.09);
  assert.equal(referenciaEspecie("Pirarucu"), null);

  const r = resumoLote([semana(20, { fim: "2026-05-20", peso_medio_g: "250", padrao_peso_g: "324", conversao_alimentar: "2.6", sobrevivencia_pct: "91", mortalidade_acum_pct: "9", padrao_sobrevivencia_pct: "95" })],
    { povoamento: "2026-01-01", pesoInicialG: 30, uniformidade: 45 });
  const frases = frasesLote(r, ref);
  const peso = frases.find((f) => f.texto.startsWith("Na semana 20"))!;
  assert.match(peso.texto, /peso médio de 250 g; a curva da espécie espera 324 g — abaixo do esperado/);
  assert.equal(peso.alerta, true);
  const ca = frases.find((f) => f.texto.startsWith("Conversão"))!;
  assert.match(ca.texto, /2,60 kg de ração por kg de peixe ganho \(referência Embrapa na engorda: 2,09\) — abaixo do esperado/);
  assert.equal(ca.alerta, true);
  assert.match(frases.find((f) => f.texto.startsWith("Sobrevivência"))!.texto, /91,0% .* o padrão é 95,0% — abaixo do esperado/);
  assert.equal(frases.find((f) => f.texto.startsWith("Uniformidade"))!.alerta, true);

  const kg = frasesLote(resumoLote([semana(40, { peso_medio_g: "1800", padrao_peso_g: "1766", conversao_alimentar: "1.9" })], {}), ref);
  assert.match(kg[0].texto, /1,8 kg; a curva da espécie espera 1,77 kg — dentro do esperado/);
  assert.equal(kg.find((f) => f.texto.startsWith("Conversão"))!.classificacao, "normal");
});
