import { NextResponse } from "next/server";
import { gravarApontamentoCampo } from "@/lib/apontamento-campo-servidor";
import { empresaDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";

// Fila de apontamentos do app de celular: { empresa_id, apontamento }. Mesma regra do /campo.
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  let corpo: { empresa_id?: unknown; apontamento?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  const r = await gravarApontamentoCampo(s.supabase, e.empresa, corpo.apontamento);
  return NextResponse.json(r.corpo, { status: r.status });
}
