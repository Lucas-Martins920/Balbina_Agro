import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { gravarVendaBalcao } from "@/lib/pdv-servidor";

// Venda de balcão do app de celular: { empresa_id, venda }. Mesma regra do PDV do site (gravarVendaBalcao);
// o client_id torna o reenvio inofensivo (venda_balcao devolve a mesma venda).
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  let corpo: { empresa_id?: unknown; venda?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  if (!(await permissoesDoApp(s, e.empresa.id)).pode("pdv.operar")) {
    return NextResponse.json({ erro: "Seu usuário não tem permissão para vender no caixa." }, { status: 403 });
  }
  const r = await gravarVendaBalcao(s.supabase, e.empresa, corpo.venda);
  return NextResponse.json(r, { status: "erro" in r ? 422 : 200 });
}
