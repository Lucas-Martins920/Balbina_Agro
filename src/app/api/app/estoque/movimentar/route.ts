import { NextResponse } from "next/server";
import { empresaDoApp, permissoesDoApp, sessaoDoApp } from "@/lib/app-celular/sessao";
import { hojeISO } from "@/lib/formato";

interface CorpoMovimentacao {
  empresa_id?: unknown;
  produto_id?: string;
  operacao?: string;
  quantidade?: number;
  deposito_id?: string | null;
  data?: string;
  custo_total_cents?: number | null;
  motivo?: string | null;
  lote_id?: string | null;
  observacao?: string | null;
}

export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const corpo = (await request.json().catch(() => ({}))) as CorpoMovimentacao;
  const e = await empresaDoApp(s, corpo.empresa_id);
  if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: e.status });
  const perm = await permissoesDoApp(s, e.empresa.id);
  if (!perm.pode("estoque.editar")) return NextResponse.json({ erro: "Sem permissão para movimentar estoque." }, { status: 403 });

  if (!corpo.produto_id) return NextResponse.json({ erro: "Escolha o produto." }, { status: 400 });
  if (!corpo.operacao || !["entrada", "saida", "ajuste"].includes(corpo.operacao)) return NextResponse.json({ erro: "Operação inválida." }, { status: 400 });
  if (corpo.quantidade == null || corpo.quantidade < 0 || (corpo.quantidade === 0 && corpo.operacao !== "ajuste")) return NextResponse.json({ erro: "Quantidade inválida." }, { status: 400 });

  const hoje = hojeISO(e.empresa.fuso);
  const data = corpo.data || hoje;
  if (data > hoje) return NextResponse.json({ erro: "Data não pode ser futura." }, { status: 400 });

  const { data: mov, error } = await s.supabase.rpc("movimentar_estoque", {
    p_produto: corpo.produto_id,
    p_operacao: corpo.operacao,
    p_quantidade: corpo.quantidade,
    p_deposito: corpo.deposito_id || null,
    p_data: data,
    p_custo_total_cents: corpo.custo_total_cents ?? null,
    p_motivo: corpo.operacao === "saida" ? (corpo.motivo || null) : null,
    p_lote: corpo.lote_id || null,
    p_observacao: corpo.observacao || null,
  });

  if (error) {
    const msg = error.message.includes("Saldo insuficiente") ? "Saldo insuficiente para esta saída." : error.message;
    return NextResponse.json({ erro: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, diferenca: Number(mov) });
}
