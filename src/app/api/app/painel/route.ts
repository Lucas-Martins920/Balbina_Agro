import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { hojeISO } from "@/lib/formato";

// Painel do dia para o app de celular: viveiros sem apontar, pedidos para entregar e alertas dos lotes.
// Não retorna dados financeiros (design do app: só operação da piscicultura e vendas).
export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = (await request.json().catch(() => ({}))) as { empresa_id?: unknown };
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  const perm = await permissoesDoApp(s, e.empresa.id);
  const hoje = hojeISO(e.empresa.fuso);

  // Viveiros com lote alocado e sem apontamento de hoje (ou nunca apontados).
  const { data: alocacoes } = await s.supabase
    .from("alocacoes_atuais")
    .select("viveiro_id, viveiro_nome, setor_nome, lote_codigo, peixes_atuais, semana, ultimo_apontamento, fase")
    .eq("empresa_id", e.empresa.id)
    .order("setor_nome")
    .order("viveiro_nome");

  const viveiros = (alocacoes ?? []).map((g) => ({
    viveiro_id: g.viveiro_id as string,
    viveiro: g.viveiro_nome as string,
    setor: g.setor_nome as string,
    lote: g.lote_codigo as string,
    peixes: Number(g.peixes_atuais ?? 0),
    semana: Number(g.semana ?? 0),
    fase: g.fase as string,
    apontado: typeof g.ultimo_apontamento === "string" && g.ultimo_apontamento >= hoje,
  }));

  // Pedidos para entregar hoje (faturados com entrega_prevista = hoje). Só se tem permissão de vendas.
  let entregas: { id: string; numero: number; cliente: string; total_cents: number; itens: string }[] = [];
  if (perm.pode("vendas.ver")) {
    const { data: pedidos } = await s.supabase
      .from("pedidos")
      .select("id, numero, cliente_nome, total_cents, itens, entrega_prevista, status")
      .eq("empresa_id", e.empresa.id)
      .eq("status", "faturado")
      .eq("entrega_prevista", hoje)
      .order("numero")
      .limit(50);
    entregas = (pedidos ?? []).map((p) => ({
      id: p.id as string,
      numero: Number(p.numero),
      cliente: p.cliente_nome as string,
      total_cents: Number(p.total_cents ?? 0),
      itens: (p.itens as string) ?? "",
    }));
  }

  // Alertas dos lotes (da view alertas, sem alertas financeiros).
  const TIPOS_PISCICULTURA = ["engorda", "mortalidade", "apontamento", "carencia", "sanidade", "estoque"];
  const { data: alertasRaw } = await s.supabase
    .from("alertas")
    .select("nivel, tipo, titulo, detalhe")
    .eq("empresa_id", e.empresa.id)
    .in("tipo", TIPOS_PISCICULTURA)
    .limit(30);

  const alertas = (alertasRaw ?? []).map((a) => ({
    nivel: a.nivel as string,
    tipo: a.tipo as string,
    titulo: a.titulo as string,
    detalhe: a.detalhe as string,
  }));

  return NextResponse.json({ hoje, viveiros, entregas, alertas });
}
