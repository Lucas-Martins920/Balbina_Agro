import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREMISSAS_INICIAIS, peixesPorMes, dia, estudar, fluxoMensal, itensVigentes, prever, situacaoRenovacao, sugerirPelaMeta,
  type CurvaSemana, type ItemCusto, type LoteEntrada, type Parametros, type Renovacao, type Viveiro,
} from "./planejamento.ts";
import { somarDias } from "./formato.ts";

// Manejo de exemplo dos testes (o app não pré-preenche: cada piscicultura cadastra o seu)
const PADRAO: Parametros = {
  ...PREMISSAS_INICIAIS,
  semanasAlevinagem: 4, semanasRecria: 12, semanasCultivo: 52, vazioAlevinagem: 15, vazioRecria: 15, vazioEngorda: 30,
  intervaloSemanas: 12, peixesPorLote: null, metaPeixes: null, especieId: null, precoKg: null,
  racaoAlevinagemKg: null, racaoRecriaKg: null, racaoEngordaKg: null,
};

const viveiros: Viveiro[] = [
  { id: "al", nome: "Alevinagem", finalidade: "alevinagem", capacidade: 10000 },
  { id: "r1", nome: "Recria 1", finalidade: "recria", capacidade: 10000 },
  { id: "r2", nome: "Recria 2", finalidade: "recria", capacidade: 10000 },
  ...[1, 2, 3, 4, 5, 6].map((n): Viveiro => ({ id: `e${n}`, nome: `Engorda ${n}`, finalidade: "engorda", capacidade: 10000 })),
];
const hoje = "2026-11-02";

// Curva de Gompertz parecida com a do tambaqui: 0,5 g na semana 1, perto de 90 g na 17 e de 2,3 kg na 57.
// Ração de 2% do peso por dia, só para o teste.
const CURVA: CurvaSemana[] = Array.from({ length: 70 }, (_, i) => {
  const s = i + 1;
  const peso = Math.round(3500 * Math.exp(-Math.log(3500 / 0.5) * Math.exp(-0.055 * (s - 1))) * 10) / 10;
  return { semana: s, pesoG: peso, consumo: Math.round(peso * 2) / 100, taxa: 2 };
});

test("4 + 12 semanas, dois viveiros de recria e um lote a cada 12 semanas", () => {
  const prev = prever({ ...PADRAO, horizonteMeses: 12 }, viveiros, [], [], hoje);
  const sug = prev.lotes.filter((l) => l.origem === "sugerido");
  assert.ok(sug.length >= 4);
  assert.equal(sug[0].povoamento, hoje);
  assert.equal(dia(sug[1].povoamento) - dia(sug[0].povoamento), 84);
  assert.equal(sug[0].etapas.map((e) => e.viveiroId).join(","), "al,r1,e1");
  assert.equal(sug[1].etapas.map((e) => e.viveiroId).join(","), "al,r2,e2");
  assert.equal(sug[0].despesca, somarDias(hoje, 52 * 7));
  assert.deepEqual(prev.conflitos, []);
  assert.ok(prev.eventos.some((e) => e.tipo === "povoamento" && e.texto === "Povoar 10.000 alevinos no Alevinagem"));
  assert.ok(prev.eventos.some((e) => e.tipo === "transferencia_engorda" && e.texto === "Transferir do Recria 1 para o Engorda 1"));
});

test("intervalo menor que alevinagem + vazio empurra o próximo lote para quando a alevinagem libera", () => {
  const sug = prever({ ...PADRAO, intervaloSemanas: 4, horizonteMeses: 6 }, viveiros, [], [], hoje).lotes.filter((l) => l.origem === "sugerido");
  // 4 semanas na alevinagem + 15 dias de vazio = 43 dias
  assert.equal(dia(sug[1].povoamento) - dia(sug[0].povoamento), 43);
});

test("lote real na engorda: renovação diz até quando povoar o substituto", () => {
  const real: LoteEntrada = {
    id: "r", codigo: "L01", origem: "real", povoamento: "2026-01-05", peixes: 9000, especieId: null,
    fase: "engorda", viveirosAtuais: ["e1"], previsaoDespesca: null,
  };
  const prev = prever({ ...PADRAO, horizonteMeses: 12 }, viveiros.filter((g) => ["al", "r1", "e1"].includes(g.id)), [real], [], hoje, false);
  const r = prev.renovacao[0];
  const despesca = somarDias("2026-01-05", 52 * 7);
  assert.equal(r.atual?.fim, despesca);
  assert.equal(r.livreEm, somarDias(despesca, 30));
  assert.equal(r.povoarAte, somarDias(despesca, 30 - 16 * 7));
  assert.ok(prev.eventos.some((e) => e.tipo === "despesca" && e.codigo === "L01" && e.texto.startsWith("Despesca com 52 semanas")));
});

test("previsão de despesca do lote real vale no lugar do ciclo padrão", () => {
  const real: LoteEntrada = {
    id: "r", codigo: "L01", origem: "real", povoamento: "2026-01-05", peixes: 9000, especieId: null,
    fase: "engorda", viveirosAtuais: ["e1"], previsaoDespesca: "2026-12-15",
  };
  const prev = prever(PADRAO, viveiros, [real], [], hoje, false);
  assert.equal(prev.lotes[0].despesca, "2026-12-15");
  assert.equal(prev.renovacao.find((x) => x.viveiro.id === "e1")?.livreEm, somarDias("2026-12-15", 30));
});

test("planejado em viveiro ocupado gera conflito", () => {
  const real: LoteEntrada = { id: "r", codigo: "L01", origem: "real", povoamento: "2026-10-20", peixes: 9000, especieId: null, fase: "alevinagem", viveirosAtuais: ["al"] };
  const plan: LoteEntrada = { id: "x", codigo: "P1", origem: "planejado", povoamento: "2026-11-10", peixes: 9000, especieId: null, viveiroAlevinagem: "al" };
  const prev = prever(PADRAO, viveiros.filter((g) => g.id !== "r2"), [real], [plan], hoje, false);
  // a alevinagem está ocupada e, 4 semanas depois, a única recria também
  assert.equal(prev.conflitos.length, 2);
  assert.match(prev.conflitos[0].texto, /^Alevinagem não estará livre/);
  assert.match(prev.conflitos[1].texto, /^Nenhum viveiro de recria livre/);
});

test("viveiro de alevinagem e recria segura o lote nas duas etapas", () => {
  const g: Viveiro[] = [
    { id: "ar", nome: "Berçário", finalidade: "alevinagem_recria", capacidade: 5000 },
    { id: "e1", nome: "Engorda", finalidade: "engorda", capacidade: 5000 },
  ];
  const prev = prever({ ...PADRAO, horizonteMeses: 8 }, g, [], [], hoje);
  const l = prev.lotes[0];
  assert.deepEqual(l.etapas.map((e) => e.viveiroId), ["ar", "e1"]);
  assert.equal(prev.ocupacoes.filter((o) => o.viveiroId === "ar" && o.loteId === l.id)[0].fim, somarDias(hoje, 16 * 7));
});

test("juvenis povoados direto na engorda: sem alevinagem nem recria", () => {
  const p = { ...PADRAO, semanasAlevinagem: 0, semanasRecria: 0, semanasCultivo: 40, horizonteMeses: 12 };
  const prev = prever(p, viveiros.filter((g) => g.finalidade === "engorda"), [], [], hoje);
  const l = prev.lotes[0];
  assert.deepEqual(l.etapas.map((e) => [e.etapa, e.viveiroId]), [["engorda", "e1"]]);
  assert.ok(prev.eventos.some((e) => e.tipo === "povoamento" && e.texto === "Povoar 10.000 juvenis no Engorda 1"));
  assert.ok(!prev.eventos.some((e) => e.tipo.startsWith("transferencia")));
  assert.deepEqual(prev.conflitos, []);
});

test("preço futuro vale a partir da vigência", () => {
  const itens: ItemCusto[] = [
    { id: "a", descricao: "Alevino", categoria: "alevino", fase: "alevinagem", base: "peixe", valor: 25, semana: 1, vigenteDesde: null },
    { id: "b", descricao: "alevino ", categoria: "alevino", fase: "alevinagem", base: "peixe", valor: 30, semana: 1, vigenteDesde: "2027-03-01" },
  ];
  assert.equal(itensVigentes(itens, "2027-02-28")[0].valor, 25);
  assert.equal(itensVigentes(itens, "2027-03-01")[0].valor, 30);
});

const PRECOS = { precoKg: 1000, racaoAlevinagemKg: 600, racaoRecriaKg: 380, racaoEngordaKg: 300 };

test("estudo de viabilidade fecha a conta do lote", () => {
  const itens: ItemCusto[] = [
    { id: "a", descricao: "Alevino", categoria: "alevino", fase: "alevinagem", base: "peixe", valor: 25, semana: null, vigenteDesde: null },
    { id: "b", descricao: "Mão de obra", categoria: "mao_obra", fase: "ciclo", base: "mes", valor: 300000, semana: null, vigenteDesde: null },
    { id: "c", descricao: "Gelo da despesca", categoria: "embalagem", fase: "engorda", base: "kg", valor: 20, semana: null, vigenteDesde: null },
  ];
  const e = estudar({ ...PADRAO, ...PRECOS }, "2027-01-04", 10000, itens, CURVA);
  assert.equal(e.semanas.length, 52);
  assert.deepEqual(e.faltando, []);
  assert.equal(e.custos.alevino, 250_000);
  // 15% de mortalidade até a engorda e 5% na engorda
  assert.ok(Math.abs(e.peixesDespescados - 10000 * 0.85 * 0.95) < 1e-6);
  const biomassa = (e.peixesDespescados * e.pesoFinalG!) / 1000;
  assert.ok(Math.abs(e.kgDespescados - biomassa * 0.97) < 1e-6, "3% da despesca não é vendida");
  assert.equal(e.receita, Math.round(e.kgDespescados * 1000));
  assert.equal(e.custos.embalagem, Math.round(e.kgDespescados * 20));
  assert.equal(e.resultado, e.receita - e.custoTotal);
  assert.ok(e.custoKg !== null && Math.abs(e.custoKg - e.custoTotal / e.kgDespescados) < 1e-9);
  assert.ok(e.conversao !== null && e.conversao > 1 && e.conversao < 3, `conversão ${e.conversao}`);
  assert.ok(e.custoAteEngorda > 250_000 && e.custoAteEngorda < e.custoTotal);
  // toda a receita entra na despesca: o capital empatado é quase todo o custo
  assert.ok(e.piorCaixa < 0);
  assert.equal(e.payback, e.resultado >= 0 ? e.semanas.at(-1)!.data : null);
  const fluxo = fluxoMensal([e], "2027-01-01", "2027-12-31");
  assert.equal(fluxo.length, 12);
  assert.equal(fluxo[0].entradas, 0);
  assert.ok(Math.abs(fluxo.reduce((s, m) => s + m.kg, 0) - e.kgDespescados) < 1e-6);
});

test("lote que chega como juvenil começa adiante na curva e despesca mais pesado", () => {
  const alevino = estudar({ ...PADRAO, ...PRECOS }, "2027-01-04", 1000, [], CURVA);
  const juvenil = estudar({ ...PADRAO, ...PRECOS, pesoPovoamentoG: 150 }, "2027-01-04", 1000, [], CURVA);
  assert.ok(juvenil.pesoFinalG! > alevino.pesoFinalG! + 300, `${juvenil.pesoFinalG} × ${alevino.pesoFinalG}`);
  assert.ok(juvenil.racaoKg > alevino.racaoKg);
});

test("premissas sem valor aparecem como faltando", () => {
  const e = estudar(PADRAO, "2027-01-04", 1000, []);
  assert.ok(e.faltando.includes("preço do kg do peixe"));
  assert.ok(e.faltando.includes("custo do alevino"));
  assert.ok(e.faltando.includes("curva de crescimento da espécie"));
  const comCurva = estudar(PADRAO, "2027-01-04", 1000, [], CURVA);
  assert.ok(comCurva.faltando.includes("preço da ração de engorda"));
});

test("peixes por mês separa as etapas", () => {
  const prev = prever({ ...PADRAO, horizonteMeses: 12 }, viveiros, [], [], hoje);
  const meses = peixesPorMes(prev.lotes, hoje, prev.fim);
  assert.equal(meses[0].mes, "2026-11");
  assert.equal(meses[0].alevinagem, 10000);
  assert.equal(meses[0].engorda, 0);
  assert.ok(meses.at(-1)!.engorda >= 20000);
});

test("meta de peixes: divide entre os viveiros de engorda e escalona a renovação pelo ciclo", () => {
  const s = sugerirPelaMeta({ ...PADRAO, metaPeixes: 20000 }, viveiros);
  assert.equal(s.lotesNaEngorda, 2);
  assert.equal(s.peixesNaEngorda, 10000);
  assert.equal(s.peixesPorLote, 11765); // 10.000 na engorda com 15% de mortalidade na alevinagem e recria
  // (52 − 16) semanas na engorda + 30 dias de vazio = 282 dias; dois lotes revezando = um a cada 20 semanas
  assert.equal(s.intervaloSemanas, 20);
  assert.equal(s.alcancavel, 20000);
  assert.ok(s.avisos.some((a) => a.includes("11.765 alevinos")), "alevinagem de 10.000 não comporta 11.765 alevinos");
});

test("meta acima da capacidade da engorda vira o máximo possível, com aviso", () => {
  const s = sugerirPelaMeta({ ...PADRAO, metaPeixes: 80000, mortalidadeRecria: 0 }, viveiros);
  assert.equal(s.lotesNaEngorda, 6);
  assert.equal(s.peixesNaEngorda, 10000);
  assert.equal(s.alcancavel, 60000);
  assert.ok(s.avisos.some((a) => a.includes("60.000")));
});

test("intervalo da meta nunca fica menor que o ciclo da alevinagem com o vazio", () => {
  const s = sugerirPelaMeta({ ...PADRAO, metaPeixes: 60000, vazioAlevinagem: 60, mortalidadeRecria: 0 }, viveiros);
  assert.equal(s.lotesNaEngorda, 6);
  assert.equal(s.intervaloSemanas, 13); // 4 semanas + 60 dias de vazio ≈ 13 semanas
  assert.ok(s.avisos.some((a) => a.includes("a alevinagem com o vazio")));
});

test("sem alevinagem nem recria a meta não desconta mortalidade antes da engorda", () => {
  const p = { ...PADRAO, semanasAlevinagem: 0, semanasRecria: 0, semanasCultivo: 40, metaPeixes: 10000 };
  const s = sugerirPelaMeta(p, viveiros.filter((g) => g.finalidade === "engorda"));
  assert.equal(s.peixesPorLote, 10000);
  assert.equal(s.intervaloSemanas, 44); // 40 × 7 + 30 = 310 dias, um lote só
  assert.deepEqual(s.avisos, []);
});

test("situacaoRenovacao: atrasada, urgente (até 30 dias sem reposição) ou em dia", () => {
  const g: Viveiro = { id: "e1", nome: "Engorda 1", finalidade: "engorda", capacidade: 10000 };
  const ocup = (inicio: string) => ({ loteId: "x", codigo: "X", origem: "planejado" as const, viveiroId: "e1", etapa: "engorda" as const, inicio, fim: "2030-01-01", livre: "2030-02-01" });
  const base: Renovacao = { viveiro: g, atual: null, livreEm: "2026-12-01", povoarAte: "2026-09-01", proximo: null, diasParado: null };
  const dia = "2026-10-28";
  // Data de povoar já passou e ninguém entra a tempo
  assert.equal(situacaoRenovacao(base, dia), "atrasada");
  // Passou, mas a reposição entra antes do viveiro liberar: em dia
  assert.equal(situacaoRenovacao({ ...base, proximo: ocup("2026-11-20") }, dia), "em_dia");
  // Faltam 20 dias e não há reposição prevista
  assert.equal(situacaoRenovacao({ ...base, povoarAte: "2026-11-17" }, dia), "urgente");
  // Faltam 20 dias, mas já há lote previsto
  assert.equal(situacaoRenovacao({ ...base, povoarAte: "2026-11-17", proximo: ocup("2027-01-01") }, dia), "em_dia");
  // Folga de mais de 30 dias
  assert.equal(situacaoRenovacao({ ...base, povoarAte: "2027-03-01" }, dia), "em_dia");
});
