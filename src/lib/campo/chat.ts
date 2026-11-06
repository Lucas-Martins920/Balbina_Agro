import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { EmpresaCampo } from "@/lib/apontamento-campo-servidor";
import { CAUSAS_MORTE } from "@/lib/causas-morte";
import { hojeISO } from "@/lib/formato";
import { ErroIa, MODELO, cliente } from "@/lib/ia";
import { textoBaseConhecimento } from "./conhecimento-tambaqui";
import { textoDadosPiscicultura, type MensagemChat } from "./contexto-chat";
import { cartoesDaIa, type Cartao } from "./propostas";
import { painelCampo } from "./servidor";
import type { MedicamentoOpcao } from "./tipos";
import { TIPOS_INSUMO } from "./validar";

// Chat de manejo do app de campo (POST /api/chat/manejo). Responde dúvidas pela base de conhecimento do
// tambaqui (Embrapa) e pelos dados de hoje, e transforma o que a pessoa conta ("coloquei 2 sacos no tanque 02")
// em cartões de lançamento. Nada é gravado aqui: o cartão só entra na fila quando a pessoa confirma.

const INSTRUCOES = `Você é o assistente de manejo do Balbina Campo, o app que o tratador usa na beira do viveiro de uma piscicultura de tambaqui no Brasil.

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
const Resposta = z.object({
  resposta: z.string().describe("texto curto para o tratador"),
  propostas: z.array(Proposta),
});

export type RespostaChat = { resposta: string; cartoes: Cartao[] };

export async function responderManejo(supabase: SupabaseClient, empresa: EmpresaCampo, mensagens: MensagemChat[], kgSaco: number | null): Promise<RespostaChat> {
  const [painel, { data: medicamentos }, { data: racoes }] = await Promise.all([
    painelCampo(supabase, empresa),
    supabase.from("medicamentos").select("id, nome, dose_por_unidade, unidade_dose, via, carencia_dias").eq("empresa_id", empresa.id).eq("ativo", true).order("nome"),
    supabase.from("produtos").select("id, nome").eq("empresa_id", empresa.id).eq("tipo", "racao").eq("ativo", true).order("nome"),
  ]);
  const meds: MedicamentoOpcao[] = (medicamentos ?? []).map((m) => ({
    id: m.id, nome: m.nome, dose: m.dose_por_unidade === null ? null : Number(m.dose_por_unidade), unidade: m.unidade_dose, via: m.via, carencia: m.carencia_dias ?? 0,
  }));
  const dados = textoDadosPiscicultura({ painel, medicamentos: meds, racoes: racoes ?? [], hoje: hojeISO(empresa.fuso), kgSaco });

  try {
    const r = await cliente().beta.messages.parse({
      model: MODELO,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Resposta) },
      // instruções + base de conhecimento ficam no cache; os dados de hoje vêm depois, fora dele
      system: [
        { type: "text", text: `${INSTRUCOES}\n\n${textoBaseConhecimento()}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: dados },
      ],
      messages: mensagens.map((m) => ({ role: m.papel === "pessoa" ? "user" : "assistant", content: m.texto })),
    }, { timeout: 50_000 });
    if (r.stop_reason === "refusal") throw new ErroIa("A IA não respondeu a esta mensagem. Escreva de outro jeito ou fale com o técnico.");
    const saida = r.parsed_output;
    if (!saida) throw new ErroIa("A IA não conseguiu responder agora. Tente de novo.");
    return {
      resposta: saida.resposta.trim(),
      cartoes: cartoesDaIa(saida.propostas, {
        tanques: painel.tanques.map((t) => ({ id: t.id, rotulo: t.rotulo, lote: t.lote ? { id: t.lote.id } : null })),
        insumos: painel.insumos, medicamentos: meds, racoes: racoes ?? [],
      }),
    };
  } catch (e) {
    if (e instanceof ErroIa) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new ErroIa("Muita gente usando a IA agora. Tente de novo em um minuto.");
    if (e instanceof Anthropic.AuthenticationError) throw new ErroIa("A chave da IA no servidor não vale. Avise o suporte.");
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErroIa("A IA demorou para responder. Tente de novo.");
    if (e instanceof Anthropic.APIError) throw new ErroIa(`A IA falhou (${e.status ?? "sem resposta"}). Tente de novo.`);
    throw e;
  }
}
