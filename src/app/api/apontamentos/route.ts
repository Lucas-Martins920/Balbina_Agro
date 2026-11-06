import { NextResponse } from "next/server";
import { gravarApontamentoCampo } from "@/lib/apontamento-campo-servidor";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// Recebe a fila do app de campo (/campo). A regra fica em gravarApontamentoCampo, a mesma do app de celular.
export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const { atual } = await getEmpresaAtual();
  const r = await gravarApontamentoCampo(await createClient(), atual, corpo);
  return NextResponse.json(r.corpo, { status: r.status });
}
