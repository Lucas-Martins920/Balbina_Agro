import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { hojeISO } from "@/lib/formato";
import { carregarCatalogo } from "@/lib/vendas-dados";

// Dados do PDV de balcão do app (os mesmos da tela /vendas/pdv): pontos de venda, produtos com o estoque
// do ponto escolhido (sem escolha, a piscicultura), preços, contas e quanto o caixa vendeu hoje.
// { empresa_id, ponto_venda_id? }
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = (await request.json().catch(() => ({}))) as { empresa_id?: unknown; ponto_venda_id?: unknown };
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  const permissoes = await permissoesDoApp(s, e.empresa.id);
  if (!permissoes.pode("pdv.operar")) return NextResponse.json({ erro: "Seu usuário não tem permissão para vender no caixa." }, { status: 403 });

  const { data: pontos } = await s.supabase.from("pontos_venda").select("id, nome, sede")
    .eq("empresa_id", e.empresa.id).eq("ativo", true).order("sede", { ascending: false }).order("nome");
  const ativos = pontos ?? [];
  const ponto = ativos.find((p) => p.id === corpo.ponto_venda_id) ?? ativos.find((p) => p.sede) ?? ativos[0] ?? null;
  const caixa = s.supabase.from("caixa_pdv").select("valor_cents").eq("empresa_id", e.empresa.id).eq("data", hojeISO(e.empresa.fuso));
  const [catalogo, { data: vendas }] = await Promise.all([
    carregarCatalogo(e.empresa.id, ponto?.id, { supabase: s.supabase, noPlano: permissoes.noPlano }),
    ponto ? caixa.eq("ponto_venda_id", ponto.id) : caixa,
  ]);
  return NextResponse.json({
    pontos: ativos,
    ponto,
    clientes: catalogo.clientes,
    produtos: catalogo.produtos,
    precos: catalogo.precos,
    listas: catalogo.listas,
    contas: catalogo.contas,
    vendido_hoje: (vendas ?? []).reduce((soma, c) => soma + Number(c.valor_cents), 0),
  });
}
