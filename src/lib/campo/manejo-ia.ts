// Chat de manejo: as instruções e o formato da resposta valem para qualquer IA que responda (Claude no servidor,
// Ollama no computador da fazenda ou no próprio aparelho). Sem "server-only": o app de campo também usa, para
// perguntar ao Ollama direto quando está sem internet (src/lib/ai/offline-chat.ts).

import { z } from "zod";
import { CAUSAS_MORTE } from "../causas-morte.ts";
import { cartoesDaIa, type Cartao, type ContextoCartoes } from "./propostas.ts";
import type { MedicamentoOpcao, Opcao, PainelCampo } from "./tipos.ts";
import { TIPOS_INSUMO } from "./validar.ts";

export const INSTRUCOES_MANEJO = `Você é o assistente de manejo do Balbina Campo, o app que o tratador usa na beira do viveiro de uma piscicultura de tambaqui no Brasil.

Como responder:
- Português do Brasil, frases curtas e diretas, no máximo 4 frases. Quem lê está no sol, com o celular na mão.
- Para dúvidas de manejo, use só a BASE DE CONHECIMENTO abaixo e os DADOS DA PISCICULTURA. Quando a dúvida for sobre um viveiro, use os números dele.
- Se a resposta não estiver na base nem nos dados, diga que isso não está na base e recomende falar com o técnico. Nunca invente dose de remédio, de calcário ou de adubo.
- Em situação de risco (oxigênio abaixo de 3 mg/L, mortandade grande), diga primeiro o que fazer agora.

Lançamentos:
- Quando a pessoa contar algo que já fez ou mediu (ração dada, sacos, mortes, oxigênio, temperatura, pH, biometria, calcário, adubo, remédio aplicado), proponha o lançamento em "propostas": um item por viveiro e tipo, com o id exato do viveiro, do produto, da ração ou do medicamento dos DADOS DA PISCICULTURA. Na resposta, diga que os cartões estão abaixo para conferir e confirmar.
- tipo "apontamento": ração dada no turno em racao_kg (sacos vezes o kg do saco; guarde também o número de sacos), mortes com a causa, medidas da água. Preencha turno ("manha" ou "tarde") só se a pessoa disser.
- tipo "biometria": peixes_amostrados e peso_total_g da amostra (ou peso_medio_g). Converta kg em gramas.
- tipo "insumo": calagem, adubação, banho, limpeza ou outro, com produto_id e quantidade na unidade do produto; remédio ou vitamina com medicamento_id.
- Se faltar o viveiro ou a quantidade, pergunte na resposta e não proponha. Em perguntas, "propostas" fica vazia.
- Nada é gravado sem a pessoa confirmar o cartão. Viveiro vazio não recebe ração, biometria nem remédio.`;

const CHAVES_CAUSA = CAUSAS_MORTE.map((c) => c.chave) as [string, ...string[]];
const TIPOS = Object.keys(TIPOS_INSUMO) as [keyof typeof TIPOS_INSUMO, ...(keyof typeof TIPOS_INSUMO)[]];

const Proposta = z.object({
  tipo: z.enum(["apontamento", "biometria", "insumo"]),
  viveiro_id: z.string().nullable().describe("id do viveiro, copiado dos DADOS DA PISCICULTURA"),
  turno: z.enum(["manha", "tarde"]).nullable(),
  racao_kg: z.number().nullable().describe("kg de ração dados no turno"),
  sacos: z.number().nullable().describe("sacos de ração ditos pela pessoa"),
  racao_produto_id: z.string().nullable().describe("id da ração, se a pessoa disse qual"),
  mortes: z.number().int().nullable(),
  causa: z.enum(CHAVES_CAUSA).nullable(),
  oxigenio_mg_l: z.number().nullable(),
  temperatura_c: z.number().nullable(),
  ph: z.number().nullable(),
  transparencia_cm: z.number().nullable(),
  amonia_mg_l: z.number().nullable(),
  peixes_amostrados: z.number().int().nullable(),
  peso_total_g: z.number().nullable().describe("peso total da amostra da biometria, em gramas"),
  peso_medio_g: z.number().nullable(),
  insumo_tipo: z.enum(TIPOS).nullable(),
  produto_id: z.string().nullable().describe("id do corretivo ou insumo"),
  medicamento_id: z.string().nullable(),
  quantidade: z.number().nullable().describe("quantidade aplicada, na unidade do produto"),
  observacoes: z.string().nullable(),
});
export const RespostaManejo = z.object({
  resposta: z.string().describe("texto curto para o tratador"),
  propostas: z.array(Proposta),
});

export type SaidaManejo = z.infer<typeof RespostaManejo>;
export type RespostaChat = { resposta: string; cartoes: Cartao[] };

// O que os cartões precisam para conferir os ids que a IA devolveu
export function contextoDosCartoes(painel: PainelCampo, medicamentos: MedicamentoOpcao[], racoes: Opcao[]): ContextoCartoes {
  return {
    tanques: painel.tanques.map((t) => ({ id: t.id, rotulo: t.rotulo, lote: t.lote ? { id: t.lote.id } : null })),
    insumos: painel.insumos, medicamentos, racoes,
  };
}

export function respostaDaSaida(saida: SaidaManejo, ctx: ContextoCartoes): RespostaChat {
  return { resposta: saida.resposta.trim(), cartoes: cartoesDaIa(saida.propostas, ctx) };
}
