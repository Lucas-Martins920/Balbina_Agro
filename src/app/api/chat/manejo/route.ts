import { NextResponse } from "next/server";
import { responderManejo } from "@/lib/campo/chat";
import { validarConversa } from "@/lib/campo/contexto-chat";
import { getEmpresaAtual } from "@/lib/empresa";
import { ErroIa, iaConfigurada } from "@/lib/ia";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Chat de manejo do app de campo. Sem IA no servidor (ou sem sinal), o celular responde pela base local.
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
  if (!iaConfigurada()) return NextResponse.json({ erro: "A IA não está ligada no servidor.", sem_ia: true }, { status: 503 });
  const supabase = await createClient();
  // cada pergunta conta no limite mensal do chat (custo da IA); passou dele, o celular responde pela base local
  const uso = await supabase.rpc("registrar_uso_ia", { p_empresa: atual.id, p_tipo: "chat" });
  if (uso.error) return NextResponse.json({ erro: uso.error.message }, { status: 429 });
  try {
    return NextResponse.json(await responderManejo(supabase, atual, v.ok.mensagens, v.ok.kgSaco));
  } catch (e) {
    if (e instanceof ErroIa) return NextResponse.json({ erro: e.message }, { status: 502 });
    throw e;
  }
}
