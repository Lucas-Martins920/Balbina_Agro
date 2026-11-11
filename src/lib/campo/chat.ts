import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmpresaCampo } from "@/lib/apontamento-campo-servidor";
import { responderManejoOllama, type ConfigOllama } from "@/lib/ai/offline-chat";
import { hojeISO } from "@/lib/formato";
import { carregarPlanoRacao } from "@/lib/previsao-racao-dados";
import { ErroIa, MODELO, cliente } from "@/lib/ia";
import { textoBaseConhecimento } from "./conhecimento-tambaqui";
import { textoDadosPiscicultura, type MensagemChat } from "./contexto-chat";
import { INSTRUCOES_MANEJO, RespostaManejo, contextoDosCartoes, respostaDaSaida, type RespostaChat } from "./manejo-ia";
import type { ContextoCartoes } from "./propostas";
import { painelCampo } from "./servidor";
import type { MedicamentoOpcao } from "./tipos";

// Chat de manejo do app de campo (POST /api/chat/manejo). Responde dúvidas pela base de conhecimento do
// tambaqui (Embrapa) e pelos dados de hoje, e transforma o que a pessoa conta ("coloquei 2 sacos no tanque 02")
// em cartões de lançamento. Nada é gravado aqui: o cartão só entra na fila quando a pessoa confirma.
// Responde pelo Claude (responderManejo) ou, sem ele, pelo Ollama da fazenda (responderManejoLocal).

export type { RespostaChat };

// Os dados de hoje que a IA recebe junto com a conversa, e o que os cartões precisam para conferir os ids
async function prepararManejo(supabase: SupabaseClient, empresa: EmpresaCampo, kgSaco: number | null): Promise<{ dados: string; ctx: ContextoCartoes }> {
  const hoje = hojeISO(empresa.fuso);
  // o planejamento da ração é o mesmo da ficha do lote; sem ele a IA só não recebe a seção
  const [painel, { data: medicamentos }, { data: racoes }, plano] = await Promise.all([
    painelCampo(supabase, empresa),
    supabase.from("medicamentos").select("id, nome, dose_por_unidade, unidade_dose, via, carencia_dias").eq("empresa_id", empresa.id).eq("ativo", true).order("nome"),
    supabase.from("produtos").select("id, nome").eq("empresa_id", empresa.id).eq("tipo", "racao").eq("ativo", true).order("nome"),
    carregarPlanoRacao(supabase as Parameters<typeof carregarPlanoRacao>[0], empresa.id, hoje).catch(() => null),
  ]);
  const meds: MedicamentoOpcao[] = (medicamentos ?? []).map((m) => ({
    id: m.id, nome: m.nome, dose: m.dose_por_unidade === null ? null : Number(m.dose_por_unidade), unidade: m.unidade_dose, via: m.via, carencia: m.carencia_dias ?? 0,
  }));
  return {
    dados: textoDadosPiscicultura({ painel, medicamentos: meds, racoes: racoes ?? [], hoje, kgSaco, plano }),
    ctx: contextoDosCartoes(painel, meds, racoes ?? []),
  };
}

export async function responderManejoLocal(supabase: SupabaseClient, empresa: EmpresaCampo, mensagens: MensagemChat[], kgSaco: number | null, cfg: ConfigOllama): Promise<RespostaChat> {
  const { dados, ctx } = await prepararManejo(supabase, empresa, kgSaco);
  return responderManejoOllama(cfg, { mensagens, dados, ctx });
}

export async function responderManejo(supabase: SupabaseClient, empresa: EmpresaCampo, mensagens: MensagemChat[], kgSaco: number | null): Promise<RespostaChat> {
  const { dados, ctx } = await prepararManejo(supabase, empresa, kgSaco);
  try {
    const r = await cliente().beta.messages.parse({
      model: MODELO,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(RespostaManejo) },
      // instruções + base de conhecimento ficam no cache; os dados de hoje vêm depois, fora dele
      system: [
        { type: "text", text: `${INSTRUCOES_MANEJO}\n\n${textoBaseConhecimento()}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: dados },
      ],
      messages: mensagens.map((m) => ({ role: m.papel === "pessoa" ? "user" : "assistant", content: m.texto })),
    }, { timeout: 50_000 });
    if (r.stop_reason === "refusal") throw new ErroIa("A IA não respondeu a esta mensagem. Escreva de outro jeito ou fale com o técnico.");
    const saida = r.parsed_output;
    if (!saida) throw new ErroIa("A IA não conseguiu responder agora. Tente de novo.");
    return respostaDaSaida(saida, ctx);
  } catch (e) {
    if (e instanceof ErroIa) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new ErroIa("Muita gente usando a IA agora. Tente de novo em um minuto.");
    if (e instanceof Anthropic.AuthenticationError) throw new ErroIa("A chave da IA no servidor não vale. Avise o suporte.");
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErroIa("A IA demorou para responder. Tente de novo.");
    if (e instanceof Anthropic.APIError) throw new ErroIa(`A IA falhou (${e.status ?? "sem resposta"}). Tente de novo.`);
    throw e;
  }
}
