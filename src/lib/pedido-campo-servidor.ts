import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemBanco } from "@/lib/acao";
import { hojeISO } from "@/lib/formato";
import { validarPedidoCampo } from "@/lib/pedido-campo";

// Gravação do pedido que vem da fila do vendedor (/vendedor no site e aba Vender do app de celular).
// O pedido entra aberto; o escritório separa e fatura (ou o vendedor já fatura, com "faturar": true).
export async function gravarPedidoCampo(supabase: SupabaseClient, empresa: { id: string; fuso: string }, corpo: unknown): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const v = validarPedidoCampo(corpo, hojeISO(empresa.fuso));
  if ("erro" in v) return { status: 422, corpo: { erro: v.erro } };
  const p = v.ok;
  const { data: id, error } = await supabase.rpc("criar_pedido", {
    p_empresa: empresa.id,
    p_cliente: p.cliente_id,
    p_itens: p.itens,
    p_data: p.data,
    p_entrega: p.entrega,
    p_parcelas: p.parcelas,
    p_forma_pagamento: p.forma_pagamento,
    p_observacoes: p.observacoes,
    p_client_id: p.client_id,
    p_origem: "app",
  });
  if (error) return { status: 422, corpo: { erro: mensagemBanco(error) } };

  const { data: pedido } = await supabase.from("pedidos_venda").select("numero, total_cents, status").eq("id", id).single();
  let aviso: string | undefined;
  // "Já faturar": baixa o estoque e gera o contas a receber na hora. Reenvio de pedido já faturado não refatura.
  if ((corpo as { faturar?: unknown }).faturar === true && (pedido?.status === "aberto" || pedido?.status === "separado")) {
    const { error: e2 } = await supabase.rpc("faturar_pedido", { p_pedido: id });
    if (e2) aviso = `Pedido salvo, mas não faturado: ${mensagemBanco(e2)}`;
  }
  return { status: 200, corpo: { id, numero: pedido?.numero ?? null, total_cents: Number(pedido?.total_cents ?? 0), aviso } };
}
