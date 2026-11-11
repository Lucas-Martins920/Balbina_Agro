import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amostraBiometria, consumoPorRacao, estoqueUtil, faixaDoPeso, filaDeConsumo, planejarReserva, preverLote, racaoDaFaixa, taxaDoPeso,
  type DadosLote, type FaixaArracoamento, type RacaoFicha,
} from "./previsao-racao.ts";
import { sacosDoSaldo } from "./racao-estoque.ts";

const F = (fase: string, min: number, max: number, pb: number, gr: string, ti: number, tf: number): FaixaArracoamento =>
  ({ fase, peso_min_g: min, peso_max_g: max, proteina_pct: pb, granulo: gr, taxa_inicio_pct: ti, taxa_fim_pct: tf, refeicoes: 3, fonte: "Embrapa" });
const TABELA = [F("Recria III", 70, 188, 32, "4–6 mm", 4.2, 2.7), F("Recria IV", 188, 298, 28, "8 mm", 2.6, 2.2), F("Engorda I", 298, 530, 28, "8 mm", 2.1, 1.8)];
const R32: RacaoFicha = { id: "r32", nome: "Ração 32% 4-6 mm", proteina_pct: 32, granulometria: "4-6 mm", saco_kg: 25, fase_recomendada: null };
const R28: RacaoFicha = { id: "r28", nome: "Ração 28% 8 mm", proteina_pct: 28, granulometria: "8 mm", saco_kg: 25, fase_recomendada: null };

const base = (x: Partial<DadosLote> = {}): DadosLote => ({
  hoje: "2026-11-11", especie: "Tambaqui", tabela: TABELA, curva: [], peixes: 2500,
  biometrias: [{ data: "2026-10-27", peso_medio_g: 120 }, { data: "2026-11-11", peso_medio_g: 150 }],
  tratoKgPorDia: [], racaoUsadaId: null, racoes: [R32, R28], saldos: [], ...x,
});

test("faixa e taxa interpolada da tabela", () => {
  assert.equal(faixaDoPeso(TABELA, 100)?.fase, "Recria III");
  assert.equal(faixaDoPeso(TABELA, 188)?.fase, "Recria IV");
  assert.equal(taxaDoPeso(TABELA, 70), 4.2);
  assert.equal(Math.round(taxaDoPeso(TABELA, 129)! * 100) / 100, 3.45);   // meio da faixa
  assert.equal(racaoDaFaixa([R32, R28], TABELA[0])?.id, "r32");             // "4–6 mm" bate com "4-6 mm"
});

test("biometria de hoje: peso medido, GMD entre as biometrias, biomassa e consumo da tabela", () => {
  const p = preverLote(base());
  assert.equal(p.pesoHoje.valor, 150);
  assert.equal(p.pesoHoje.origem, "medido");
  assert.equal(p.ganhoG.valor, 30);
  assert.equal(p.gmdG.valor, 2);
  assert.equal(p.gmdG.origem, "calculado");
  assert.equal(p.biomassaKg.valor, 375);
  assert.equal(p.faixaAtual?.fase, "Recria III");
  // 375 kg × taxa em 150 g (4,2 → 2,7 de 70 a 188 g) = 375 × 3,183% ≈ 11,9 kg
  assert.equal(p.consumoDiaKg.valor, 11.9);
  assert.equal(p.consumoDiaKg.origem, "previsao");
  assert.equal(p.confianca, "alta");
});

test("previsão de 15/30/45 dias com a troca de ração e a data provável da transição", () => {
  const p = preverLote(base());
  // 150 g + 2 g/dia chega a 188 g no dia 19 → troca para 28% 8 mm em 30/11
  assert.equal(p.transicao.valor, "2026-11-30");
  assert.equal(p.racaoAtual.valor?.id, "r32");
  assert.equal(p.racaoAtual.origem, "recomendacao");
  assert.equal(p.proximaRacao.valor?.id, "r28");
  const [h15, h30, h45] = p.horizontes;
  assert.deepEqual([h15.dias, h30.dias, h45.dias], [15, 30, 45]);
  assert.equal(h15.kgProxima, 0);
  assert.ok(h30.kgAtual > 0 && h30.kgProxima > 0, "30 dias já pegam as duas rações");
  assert.ok(h45.kg > h30.kg && h30.kg > h15.kg);
  assert.equal(h15.sacos, Math.round((h15.kg / 25) * 10) / 10);
});

test("dados insuficientes: sem biometria nada é inventado", () => {
  const p = preverLote(base({ biometrias: [] }));
  assert.equal(p.confianca, "indisponivel");
  assert.equal(p.pesoHoje.origem, "ausente");
  assert.equal(p.consumoDiaKg.valor, null);
  assert.deepEqual(p.horizontes, []);
  assert.equal(p.transicao.origem, "ausente");
});

test("uma biometria só: sem curva o peso fica parado e a confiança cai", () => {
  const p = preverLote(base({ biometrias: [{ data: "2026-11-01", peso_medio_g: 150 }] }));
  assert.equal(p.gmdG.valor, null);
  assert.equal(p.pesoHoje.valor, 150);
  assert.equal(p.confianca, "baixa");
  assert.ok(p.motivos.some((m) => m.includes("sem ganho de peso")));
});

test("biometria velha baixa a confiança", () => {
  const p = preverLote(base({ biometrias: [{ data: "2026-09-01", peso_medio_g: 100 }, { data: "2026-09-21", peso_medio_g: 130 }] }));
  assert.equal(p.confianca, "baixa");
  assert.equal(p.diasDesdeBiometria, 51);
  assert.equal(p.pesoHoje.origem, "previsao");
});

test("espécie sem tabela: não usa a do tambaqui; só o consumo real, com aviso", () => {
  const sem = preverLote(base({ especie: "Pirarucu", tabela: [] }));
  assert.equal(sem.semDadosTecnicos, true);
  assert.equal(sem.confianca, "indisponivel");
  assert.ok(sem.motivos.some((m) => m.includes("não há dados técnicos de arraçoamento para Pirarucu")));
  assert.equal(sem.taxaPct.origem, "ausente");
  const comTrato = preverLote(base({ especie: "Pirarucu", tabela: [], tratoKgPorDia: [{ data: "2026-11-10", kg: 20 }, { data: "2026-11-09", kg: 22 }] }));
  assert.equal(comTrato.consumoDiaKg.valor, 21);
  assert.equal(comTrato.confianca, "baixa");
  assert.equal(comTrato.horizontes[0].kg, 315);
  assert.equal(comTrato.transicao.origem, "ausente");
});

test("trato real acima da tabela ajusta a previsão (apetite)", () => {
  const trato = Array.from({ length: 7 }, (_, i) => ({ data: `2026-11-0${i + 1}`, kg: 15 }));
  const p = preverLote(base({ tratoKgPorDia: trato }));
  assert.equal(p.consumoRealDiaKg.valor, 15);
  assert.equal(p.consumoRealDiaKg.origem, "medido");
  assert.ok(p.ajusteApetite.valor! > 1.2);
  assert.ok(p.consumoDiaKg.valor! > 14.9 && p.consumoDiaKg.valor! < 15.1);
});

test("ração usada no trato é a atual (medido); cobertura do estoque até a troca", () => {
  const p = preverLote(base({ racaoUsadaId: "r32", saldos: [{ racao_id: "r32", numero: 1, saldo_kg: 1000, dias_para_vencer: 60 }] }));
  assert.equal(p.racaoAtual.origem, "medido");
  assert.equal(p.estoqueAtualKg.valor, 1000);
  assert.equal(p.coberturaDias.valor, 18);   // os 18 dias antes da troca
  assert.equal(p.coberturaDias.nota, "dura até a troca de ração");
  assert.equal(p.dataFalta.valor, null);
  const pouco = preverLote(base({ racaoUsadaId: "r32", saldos: [{ racao_id: "r32", numero: 1, saldo_kg: 50, dias_para_vencer: 60 }] }));
  assert.equal(pouco.coberturaDias.valor, 4);
  assert.equal(pouco.dataFalta.valor, "2026-11-16");
});

test("próxima ração sem cadastro vira recomendação do que comprar", () => {
  const p = preverLote(base({ racoes: [R32] }));
  assert.equal(p.proximaRacao.origem, "ausente");
  assert.equal(p.proximaRecomendada, "PB 28% · 8 mm");
});

test("reserva de 10 sacos dividida entre a ração atual e a próxima", () => {
  const atual = Array(45).fill(0).map((_, i) => (i < 10 ? 25 : 0));      // 10 dias de 25 kg e troca
  const proxima = Array(45).fill(0).map((_, i) => (i < 10 ? 0 : 50));
  const r = planejarReserva([{ racao: R32, consumo: atual }, { racao: R28, consumo: proxima }], [], { reservaSacos: 10, prazoEntregaDias: 7 });
  const a = r.find((x) => x.racao.id === "r32")!;
  const b = r.find((x) => x.racao.id === "r28")!;
  assert.equal(r[0].janelaDias, 22);
  // janela de 22 dias: 250 kg da atual (10 sacos) e 600 kg da próxima (24 sacos) → 10 sacos divididos 3 + 7
  assert.equal(a.reservaSacos! + b.reservaSacos!, 10);
  assert.equal(a.reservaSacos, 3);
  assert.equal(b.reservaSacos, 7);
  // até o fornecedor entregar (7 dias) a atual consome 175 kg; com a reserva de 75 kg e sem estoque, comprar 250 kg = 10 sacos
  assert.equal(a.comprarKg, 250);
  assert.equal(a.comprarSacos, 10);
});

test("reserva não passa do que a ração vai consumir (sem excesso de ração de alevino)", () => {
  const alevino = Array(45).fill(0).map((_, i) => (i < 4 ? 10 : 0));   // 40 kg e acaba
  const [r] = planejarReserva([{ racao: R32, consumo: alevino }], [], { reservaSacos: 10, prazoEntregaDias: 7 });
  assert.equal(r.reservaSacos, 2);   // 40 kg = 2 sacos, não 10
  assert.equal(r.comprarKg, 90);     // 40 kg do prazo + 50 kg de reserva (2 sacos); o saco aberto sobra
});

test("estoque que vence antes do uso não conta; reserva configurável", () => {
  const consumo = Array(45).fill(10);
  const e = estoqueUtil([{ racao_id: "r32", numero: 1, saldo_kg: 100, dias_para_vencer: 5 }, { racao_id: "r32", numero: 2, saldo_kg: 100, dias_para_vencer: 90 }], consumo);
  assert.equal(e.venceAntesKg, 50);   // 5 dias × 10 kg usados da R-1; 50 kg vencem
  assert.equal(e.utilKg, 150);
  const [r] = planejarReserva([{ racao: R32, consumo }], [{ racao_id: "r32", numero: 1, saldo_kg: 100, dias_para_vencer: 5 }], { reservaSacos: 4, prazoEntregaDias: 7 });
  assert.equal(r.reservaSacos, 4);
  assert.equal(r.venceAntesKg, 50);
  assert.equal(r.comprarKg, 70 + 100 - 50);
});

test("consumo de vários lotes somado por ração", () => {
  const p1 = preverLote(base());
  const p2 = preverLote(base({ peixes: 5000 }));
  const soma = consumoPorRacao([p1, p2]);
  const r32 = soma.find((s) => s.racao.id === "r32")!;
  assert.ok(Math.abs(r32.consumo[0] - (p1.consumoPorDia.atual[0] + p2.consumoPorDia.atual[0])) < 1e-9);
});

test("amostra da biometria: 50 peixes para 2.500, ajustável", () => {
  assert.equal(amostraBiometria(2500), 50);
  assert.equal(amostraBiometria(500), 30);
  assert.equal(amostraBiometria(20000), 100);
  assert.equal(amostraBiometria(20), 20);
  assert.equal(amostraBiometria(2500, { amostra_pct: 4, amostra_min: 10, amostra_max: 200 }), 100);
});

test("sacos fechados e saco aberto sem arredondar o estoque", () => {
  assert.deepEqual(sacosDoSaldo(63, 25), { equivalentes: 2.52, fechados: 2, abertoKg: 13 });
  assert.deepEqual(sacosDoSaldo(50, 25), { equivalentes: 2, fechados: 2, abertoKg: 0 });
  assert.deepEqual(sacosDoSaldo(12.345, 25), { equivalentes: 0.49, fechados: 0, abertoKg: 12.345 });
  assert.equal(sacosDoSaldo(63, null), null);
});

test("fila de consumo: quando cada entrada começa e acaba e o que vence antes do uso", () => {
  const consumo = Array(45).fill(20);
  const fila = filaDeConsumo([
    { racao_id: "r", numero: 2, saldo_kg: 100, dias_para_vencer: 60 },
    { racao_id: "r", numero: 1, saldo_kg: 50, dias_para_vencer: 10 },
    { racao_id: "r", numero: 3, saldo_kg: 100, dias_para_vencer: 6 },
  ], consumo);
  const de = (n: number) => fila.find((f) => f.numero === n)!;
  assert.deepEqual(de(3), { numero: 3, comecaDia: 1, acabaDia: 5, venceAntesKg: 0 });   // vence primeiro, sai primeiro
  assert.deepEqual(de(1), { numero: 1, comecaDia: 6, acabaDia: 8, venceAntesKg: 0 });
  assert.equal(de(2).acabaDia, 13);
  const vence = filaDeConsumo([{ racao_id: "r", numero: 1, saldo_kg: 100, dias_para_vencer: 2 }], consumo);
  assert.equal(vence[0].venceAntesKg, 60);
});
