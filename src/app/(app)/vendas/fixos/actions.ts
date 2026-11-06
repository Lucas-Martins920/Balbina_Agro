"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerDecimal } from "@/lib/formato";
import { CONDICOES } from "@/lib/vendas";
import { createClient } from "@/lib/supabase/server";

// D2: pedido fixo do cliente (docs/automacoes.md)
export async function salvarPedidoFixo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const cliente = String(form.get("cliente_id") ?? "");
  const dias = form.getAll("dias").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const condicao = CONDICOES[String(form.get("condicao") ?? "")];
  if (!cliente) return falha("Escolha o cliente.");
  if (!dias.length) return falha("Marque os dias de entrega.");
  if (!condicao) return falha("Escolha a condição de pagamento.");
  const produtos = form.getAll("produto_id").map(String);
  const quantidades = form.getAll("quantidade").map(String);
  const itens: { produto_id: string; quantidade: number }[] = [];
  for (const [i, produto] of produtos.entries()) {
    if (!produto) continue;
    const q = lerDecimal(quantidades[i] ?? "");
    if (!q || q <= 0) return falha("Informe a quantidade de cada produto.");
    itens.push({ produto_id: produto, quantidade: q });
  }
  if (!itens.length) return falha("Adicione pelo menos um produto.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("pedidos_fixos").insert({
    empresa_id: atual.id, cliente_id: cliente, dias_semana: [...new Set(dias)].sort(), itens, parcelas: condicao.parcelas,
    forma_pagamento: String(form.get("forma_pagamento") ?? "") || null, observacoes: String(form.get("observacoes") ?? "").trim() || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/vendas/fixos");
  return sucesso("Pedido fixo salvo. O pedido sai sozinho na véspera de cada entrega, com o preço da tabela do dia.");
}

export async function alternarPedidoFixo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pedidos_fixos").update({ ativo: form.get("ativo") === "1" })
    .eq("id", String(form.get("id") ?? "")).select("id");
  if (error) return falha(mensagemBanco(error));
  if (!data?.length) return falha("Seu usuário não pode mudar pedidos fixos.");
  revalidatePath("/vendas/fixos");
  return sucesso(form.get("ativo") === "1" ? "Pedido fixo retomado." : "Pedido fixo pausado.");
}

export async function excluirPedidoFixo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("pedidos_fixos").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não pode excluir pedidos fixos.");
  revalidatePath("/vendas/fixos");
  return sucesso("Pedido fixo excluído.");
}
