import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MENSAGENS, textoDadosPiscicultura, validarConversa } from "./contexto-chat.ts";
import type { PainelCampo } from "./tipos.ts";

test("conversa: mantém as últimas mensagens e começa pela pessoa", () => {
  const mensagens = Array.from({ length: 15 }, (_, i) => ({ papel: i % 2 ? "assistente" : "pessoa", texto: `m${i}` }));
  const r = validarConversa({ mensagens, kg_saco: 25 });
  assert.ok("ok" in r);
  assert.equal(r.ok.mensagens[0].papel, "pessoa");
  assert.ok(r.ok.mensagens.length <= MAX_MENSAGENS);
  assert.equal(r.ok.mensagens.at(-1)?.texto, "m14");
  assert.equal(r.ok.kgSaco, 25);
});

test("conversa: erros e kg do saco fora da faixa", () => {
  assert.deepEqual(validarConversa({ mensagens: [] }), { erro: "Mensagem inválida." });
  assert.deepEqual(validarConversa({ mensagens: [{ papel: "pessoa", texto: "oi" }, { papel: "assistente", texto: "olá" }] }), { erro: "Escreva a sua mensagem." });
  assert.deepEqual(validarConversa({ mensagens: [{ papel: "sistema", texto: "x" }] }), { erro: "Mensagem inválida." });
  const r = validarConversa({ mensagens: [{ papel: "pessoa", texto: "  ração?  " }], kg_saco: 500 });
  assert.deepEqual(r, { ok: { mensagens: [{ papel: "pessoa", texto: "ração?" }], kgSaco: null } });
});

test("dados da piscicultura levam ids, lote, ração sugerida e cadastros", () => {
  const painel: PainelCampo = {
    especies: [],
    insumos: [{ id: "cal", nome: "Calcário", unidade: "kg", tipo: "corretivo", saldo: 300 }],
    tanques: [
      { id: "t2", nome: "Tanque 02", setor: "Sede", rotulo: "Sede / Tanque 02", area_m2: 5000, volume_m3: 7500, aeracao: true, lote: {
        id: "l2", codigo: "L-12", fase: "engorda", especie: "Tambaqui", povoamento: "2026-09-01", dias: 65, semana: 10, peixes: 7850,
        peso_g: 420, biomassa_kg: 3297, peso_alvo_g: 2500, kg_m3: 0.44, peixes_m2: 1.57, ultima_biometria: "2026-10-20", ultimo_apontamento: "2026-11-04",
        previsao_despesca: null, carencia_ate: null, gpd: 6.1, conversao: 1.42, sobrevivencia: 98.1, desvio_peso_pct: -3,
        racao: { kg: 59.3, refeicoes: 3, por_refeicao_kg: 19.8, proteina: 28, granulo: "8 mm", fase: "Engorda I", taxa_pct: 1.8, alerta: null, oxigenio_min: 3.8 },
        curva: [], biometrias: [],
      } },
      { id: "t5", nome: "Tanque 05", setor: "Sede", rotulo: "Sede / Tanque 05", area_m2: 3000, volume_m3: null, aeracao: false, lote: null },
    ],
  };
  const t = textoDadosPiscicultura({ painel, medicamentos: [{ id: "oxi", nome: "Oxitetraciclina", dose: 5, unidade: "g", via: "racao", carencia: 21 }],
    racoes: [{ id: "r28", nome: "Engorda 28%" }], hoje: "2026-11-05", kgSaco: 25 });
  assert.match(t, /hoje 05\/11\/2026; kg por saco de ração: 25/);
  assert.match(t, /- id t2: Sede \/ Tanque 02 · lote L-12, engorda, tambaqui, 65 dias · 7\.850 peixes · 420 g de peso médio estimado · 3\.297 kg de biomassa · ração sugerida 59,3 kg\/dia em 3 refeições \(Engorda I, 28% de proteína, 8 mm\) · oxigênio mínimo recente 3,8 mg\/L · última biometria 20\/10\/2026 · conversão alimentar 1,42/);
  assert.match(t, /- id t5: Sede \/ Tanque 05 · vazio · 3\.000 m²/);
  assert.match(t, /- id r28: Engorda 28%/);
  assert.match(t, /- id cal: Calcário \(kg\), saldo 300 kg/);
  assert.match(t, /- id oxi: Oxitetraciclina \(dose do cadastro 5 g por kg de ração\), carência 21 dias/);
});

test("IA recebe o planejamento da ração com a origem de cada número e sem dados técnicos para outra espécie", async () => {
  const { preverLote, planejarReserva, PARAMETROS_PADRAO } = await import("../previsao-racao.ts");
  const tabela = [{ fase: "Recria III", peso_min_g: 70, peso_max_g: 188, proteina_pct: 32, granulo: "4-6 mm", taxa_inicio_pct: 4.2, taxa_fim_pct: 2.7, refeicoes: 3, fonte: "Embrapa" }];
  const r32 = { id: "r32", nome: "Ração 32% 4-6 mm", proteina_pct: 32, granulometria: "4-6 mm", saco_kg: 25, fase_recomendada: null };
  const saldos = [{ racao_id: "r32", numero: 1, saldo_kg: 63, dias_para_vencer: 60 }];
  const tambaqui = preverLote({ hoje: "2026-11-11", especie: "Tambaqui", tabela, curva: [], peixes: 2500,
    biometrias: [{ data: "2026-10-27", peso_medio_g: 120 }, { data: "2026-11-11", peso_medio_g: 150 }], tratoKgPorDia: [], racaoUsadaId: null, racoes: [r32], saldos });
  const pirarucu = preverLote({ hoje: "2026-11-11", especie: "Pirarucu", tabela: [], curva: [], peixes: 300,
    biometrias: [], tratoKgPorDia: [], racaoUsadaId: null, racoes: [r32], saldos });
  const reserva = planejarReserva([{ racao: r32, consumo: tambaqui.consumoPorDia.atual }], saldos, { reservaSacos: 10, prazoEntregaDias: 7 });
  const t = textoDadosPiscicultura({
    painel: { especies: [], insumos: [], tanques: [] }, medicamentos: [], racoes: [], hoje: "2026-11-11", kgSaco: 25,
    plano: { hoje: "2026-11-11", parametros: PARAMETROS_PADRAO, racoes: [r32], saldos, reserva,
      lotes: [{ lote_id: "l1", codigo: "L-1", especie: "Tambaqui", previsao: tambaqui }, { lote_id: "l2", codigo: "L-2", especie: "Pirarucu", previsao: pirarucu }] },
  });
  assert.match(t, /## Planejamento da ração/);
  assert.match(t, /lote L-1 \(Tambaqui\) · confiança alta/);
  assert.match(t, /peso médio hoje: 150 g \[medido/);
  assert.match(t, /GMD: 2 g\/dia \[calculado/);
  assert.match(t, /consumo diário previsto: 11,9 kg \[previsão/);
  assert.match(t, /faixa Recria III, fonte Embrapa/);
  assert.match(t, /sobra: \[ausente/);
  assert.match(t, /previsão de consumo \[previsão\]: 15 dias/);
  assert.match(t, /sem dados técnicos para Pirarucu: .*não use números do tambaqui/);
  assert.match(t, /lote L-2 \(Pirarucu\) · confiança indisponível/);
  assert.match(t, /- Ração 32% 4-6 mm \(saco de 25 kg\): estoque 63 kg = 2,5 sacos .*\[recomendação\]/);
  // sem plano, a seção não aparece (a IA continua respondendo com o resto)
  assert.doesNotMatch(textoDadosPiscicultura({ painel: { especies: [], insumos: [], tanques: [] }, medicamentos: [], racoes: [], hoje: "2026-11-11", kgSaco: null }), /Planejamento/);
});
