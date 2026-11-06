import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { carregarCatalogo } from "@/lib/vendas-dados";

// Catálogo do vendedor para o app guardar e vender sem sinal (o mesmo da tela /vendedor) e os últimos
// pedidos que este usuário lançou.
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = (await request.json().catch(() => ({}))) as { empresa_id?: unknown };
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  const permissoes = await permissoesDoApp(s, e.empresa.id);
  if (!permissoes.pode("vendas.lancar")) return NextResponse.json({ erro: "Seu usuário não tem permissão para lançar pedidos." }, { status: 403 });
  const [catalogo, { data: pedidos }] = await Promise.all([
    carregarCatalogo(e.empresa.id, null, { supabase: s.supabase, noPlano: permissoes.noPlano }),
    s.supabase.from("pedidos_venda").select("id, numero, data, status, total_cents, contatos(nome)")
      .eq("empresa_id", e.empresa.id).eq("vendedor_user_id", s.claims.sub).order("created_at", { ascending: false }).limit(30),
  ]);
  return NextResponse.json({
    clientes: catalogo.clientes,
    produtos: catalogo.produtos,
    precos: catalogo.precos,
    listas: catalogo.listas,
    ultimos: catalogo.ultimos,
    pedidos: (pedidos ?? []).map((p) => ({
      id: p.id, numero: p.numero, data: p.data, status: p.status, total_cents: Number(p.total_cents),
      cliente: (p.contatos as unknown as { nome: string } | null)?.nome ?? "",
    })),
  });
}
