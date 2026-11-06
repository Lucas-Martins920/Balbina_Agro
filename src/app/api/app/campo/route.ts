import { NextResponse } from "next/server";
import { dadosCampo } from "@/lib/apontamento-campo-servidor";
import { empresaDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";

// Dados do apontamento para o app de celular guardar e usar sem sinal (os mesmos da tela /campo).
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = (await request.json().catch(() => ({}))) as { empresa_id?: unknown };
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  return NextResponse.json(await dadosCampo(s.supabase, e.empresa));
}
