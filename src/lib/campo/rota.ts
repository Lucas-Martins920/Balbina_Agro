import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmpresaCampo } from "@/lib/apontamento-campo-servidor";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

type Gravar = (supabase: SupabaseClient, empresa: EmpresaCampo, corpo: unknown) => Promise<{ status: number; corpo: Record<string, unknown> }>;

// Rotas que recebem a fila do app de campo (/campo), com a sessão do navegador (cookie). Sessão vencida vira
// redirecionamento para o login, que o celular reconhece e guarda a fila até a pessoa entrar de novo.
export async function receberDaFila(request: Request, gravar: Gravar) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const { atual } = await getEmpresaAtual();
  const r = await gravar(await createClient(), atual, corpo);
  return NextResponse.json(r.corpo, { status: r.status });
}
