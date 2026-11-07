import { NextResponse } from "next/server";
import { configOllamaServidor, situacaoOllama } from "@/lib/ai/offline-chat";
import { iaConfigurada } from "@/lib/ia";
import { createClient } from "@/lib/supabase/server";

// Quem responde o chat agora: o Claude (chave no servidor) e/ou o Ollama da fazenda (OLLAMA_URL), e se o Ollama
// está ligado com o modelo baixado. A conversa em si é POST /api/chat/manejo.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const ollama = configOllamaServidor();
  const situacao = ollama ? await situacaoOllama(ollama) : null;
  return NextResponse.json({
    claude: iaConfigurada(),
    ollama: ollama ? { modelo: ollama.modelo, online: situacao!.online, modelo_baixado: situacao!.modelo } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
