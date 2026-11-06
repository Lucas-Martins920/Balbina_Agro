"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// D3: cria, troca ou desliga o link de pedido de um cliente.
export async function mudarLinkPedido(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await getPermissoes()).pode("vendas.lancar")) return falha("Seu usuário não pode lançar vendas.");
  const desligar = form.get("acao") === "desligar";
  const supabase = await createClient();
  const { data, error } = await supabase.from("contatos")
    .update({ portal_token: desligar ? null : randomBytes(16).toString("hex") })
    .eq("id", String(form.get("id") ?? "")).select("id");
  if (error) return falha(mensagemBanco(error));
  if (!data?.length) return falha("Cliente não encontrado.");
  revalidatePath("/vendas/links");
  return sucesso(desligar ? "Link desligado." : "Link pronto. Copie e mande para o cliente.");
}
