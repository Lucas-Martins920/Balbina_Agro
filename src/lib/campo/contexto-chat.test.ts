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
