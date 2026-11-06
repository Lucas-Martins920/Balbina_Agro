import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { gravarPedidoCampo } from "@/lib/pedido-campo-servidor";

// Fila de pedidos do app de celular: { empresa_id, pedido }. Mesma regra do /vendedor.
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  let corpo: { empresa_id?: unknown; pedido?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  if (!(await permissoesDoApp(s, e.empresa.id)).pode("vendas.lancar")) {
    return NextResponse.json({ erro: "Seu usuário não tem permissão para lançar pedidos." }, { status: 403 });
  }
  const r = await gravarPedidoCampo(s.supabase, e.empresa, corpo.pedido);
  return NextResponse.json(r.corpo, { status: r.status });
}
