import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { hojeISO } from "@/lib/formato";

// Estoque para o app de celular: saldos de produtos (produção e venda) e depósitos.
// POST /api/app/estoque → saldos
// POST /api/app/estoque/movimentar → entrada/saída/ajuste
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = (await request.json().catch(() => ({}))) as { empresa_id?: unknown };
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  const perm = await permissoesDoApp(s, e.empresa.id);
  if (!perm.pode("estoque.ver")) return NextResponse.json({ erro: "Sem permissão para ver estoque." }, { status: 403 });

  const [{ data: produtos }, { data: saldos }, { data: depositos }, { data: movimentos }] = await Promise.all([
    s.supabase.from("produtos").select("id, nome, tipo, unidade, base_estoque, ativo, estoque_minimo")
      .eq("empresa_id", e.empresa.id).eq("ativo", true).order("nome"),
    s.supabase.from("saldos_produtos").select("produto_id, saldo, valor_cents")
      .eq("empresa_id", e.empresa.id),
    s.supabase.from("depositos").select("id, nome, tipo")
      .eq("empresa_id", e.empresa.id).order("nome"),
    s.supabase.from("movimentos_estoque").select("id, data, tipo, quantidade, observacao, produtos(nome), lotes(codigo)")
      .eq("empresa_id", e.empresa.id)
      .order("data", { ascending: false }).order("created_at", { ascending: false }).limit(30),
  ]);

  const saldoMap = new Map((saldos ?? []).map((s) => [s.produto_id, s]));

  const itens = (produtos ?? []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    tipo: p.tipo as string,
    unidade: (p.unidade ?? "") as string,
    base_estoque: (p.base_estoque ?? "") as string,
    saldo: Number(saldoMap.get(p.id)?.saldo ?? 0),
    valor_cents: saldoMap.get(p.id)?.valor_cents == null ? null : Number(saldoMap.get(p.id)?.valor_cents),
    estoque_minimo: p.estoque_minimo === null ? null : Number(p.estoque_minimo),
    abaixo_minimo: p.estoque_minimo !== null && Number(saldoMap.get(p.id)?.saldo ?? 0) < Number(p.estoque_minimo),
  }));

  const hist = (movimentos ?? []).map((m) => ({
    id: m.id as string,
    data: m.data as string,
    tipo: m.tipo as string,
    quantidade: Number(m.quantidade),
    observacao: (m.observacao ?? "") as string,
    produto: (m.produtos as { nome?: string } | null)?.nome ?? "",
    lote: (m.lotes as { codigo?: string } | null)?.codigo ?? "",
  }));

  return NextResponse.json({
    hoje: hojeISO(e.empresa.fuso),
    itens,
    depositos: (depositos ?? []).map((d) => ({ id: d.id as string, nome: d.nome as string, tipo: d.tipo as string })),
    movimentos: hist,
    pode_editar: perm.pode("estoque.editar"),
  });
}
