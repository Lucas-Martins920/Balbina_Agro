import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppVendedor, type PedidoVendedor } from "@/components/vendas/vendedor";
import { exigirAceiteTermos } from "@/lib/aceite-termos";
import { getAssinatura } from "@/lib/assinatura";
import { getUsuario } from "@/lib/auth";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { carregarCatalogo } from "@/lib/vendas-dados";

export const metadata: Metadata = { title: "Balbina Vendedor", manifest: "/manifest.webmanifest" };

// Tela de celular do vendedor externo: catálogo com a tabela de preço do cliente e pedido que vai para o escritório.
// Depois de aberta uma vez com sinal, funciona offline (o pedido fica na fila do celular).
export default async function PaginaVendedor() {
  await exigirAceiteTermos("/vendedor");
  const { atual } = await getEmpresaAtual();
  if (!(await getAssinatura(atual.id)).liberada) redirect("/assinatura");
  const { pode } = await getPermissoes();
  if (!pode("vendas.lancar")) redirect("/sem-acesso?modulo=vendas");
  const usuario = await getUsuario();
  const supabase = await createClient();
  const [catalogo, { data: pedidos }] = await Promise.all([
    carregarCatalogo(atual.id),
    supabase.from("pedidos_venda").select("id, numero, data, status, total_cents, contatos(nome)")
      .eq("empresa_id", atual.id).eq("vendedor_user_id", usuario.id).order("created_at", { ascending: false }).limit(30),
  ]);
  return (
    <AppVendedor
      empresa={{ id: atual.id, nome: nomeEmpresa(atual), fuso: atual.fuso }}
      clientes={catalogo.clientes}
      produtos={catalogo.produtos}
      precos={catalogo.precos}
      listas={catalogo.listas}
      ultimos={catalogo.ultimos}
      pedidos={(pedidos ?? []).map((p): PedidoVendedor => ({
        id: p.id, numero: p.numero, data: p.data, status: p.status, total_cents: Number(p.total_cents),
        cliente: (p.contatos as unknown as { nome: string } | null)?.nome ?? "",
      }))}
    />
  );
}
