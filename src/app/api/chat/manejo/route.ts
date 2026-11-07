import { NextResponse } from "next/server";
import { configOllamaServidor, ErroOllama } from "@/lib/ai/offline-chat";
import { responderManejo, responderManejoLocal } from "@/lib/campo/chat";
import { validarConversa } from "@/lib/campo/contexto-chat";
import { getEmpresaAtual } from "@/lib/empresa";
import { ErroIa, iaConfigurada } from "@/lib/ia";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Chat de manejo do app de campo. Ordem: Claude (com internet e dentro do limite do mês) → Ollama da fazenda
// (OLLAMA_URL, src/lib/ai/offline-chat.ts) → o celular responde pela base local (resposta 503 com sem_ia, ou
// sem sinal nenhum). A resposta diz quem respondeu em "motor".
export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const v = validarConversa(corpo);
  if ("erro" in v) return NextResponse.json({ erro: v.erro }, { status: 400 });
  const { atual } = await getEmpresaAtual();
  const ollama = configOllamaServidor();
  if (!iaConfigurada() && !ollama) return NextResponse.json({ erro: "A IA não está ligada no servidor.", sem_ia: true }, { status: 503 });
  const supabase = await createClient();
  const { mensagens, kgSaco } = v.ok;

  let erroClaude: { erro: string; status: number } | null = null;
  if (iaConfigurada()) {
    // cada pergunta ao Claude conta no limite mensal do chat (custo da IA); o Ollama é da fazenda e não conta
    const uso = await supabase.rpc("registrar_uso_ia", { p_empresa: atual.id, p_tipo: "chat" });
    if (uso.error) {
      erroClaude = { erro: uso.error.message, status: 429 };
    } else {
      try {
        return NextResponse.json({ ...(await responderManejo(supabase, atual, mensagens, kgSaco)), motor: "claude" });
      } catch (e) {
        if (!(e instanceof ErroIa)) throw e;
        erroClaude = { erro: e.message, status: 502 }; // sem internet no servidor da fazenda cai aqui também
      }
    }
  }
  if (!ollama) return NextResponse.json({ erro: erroClaude?.erro ?? "A IA não respondeu." }, { status: erroClaude?.status ?? 502 });
  try {
    return NextResponse.json({ ...(await responderManejoLocal(supabase, atual, mensagens, kgSaco, ollama)), motor: "ollama" });
  } catch (e) {
    if (e instanceof ErroOllama) {
      return NextResponse.json({ erro: erroClaude ? `${erroClaude.erro} ${e.message}` : e.message }, { status: 502 });
    }
    throw e;
  }
}
