import { NextResponse } from "next/server";
import { getEmpresaAtual } from "@/lib/empresa";
import { gravarPedidoCampo } from "@/lib/pedido-campo-servidor";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// Recebe a fila do app do vendedor (/vendedor). A regra fica em gravarPedidoCampo, a mesma do app de celular.
export async function POST(request: Request) {
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const { pode } = await getPermissoes();
  if (!pode("vendas.lancar")) return NextResponse.json({ erro: "Seu usuário não tem permissão para lançar pedidos." }, { status: 403 });
  const { atual } = await getEmpresaAtual();
  const r = await gravarPedidoCampo(await createClient(), atual, corpo);
  return NextResponse.json(r.corpo, { status: r.status });
}
