"use server";

import { falha, sucesso, type EstadoAcao } from "@/lib/acao";
import { lerDecimal } from "@/lib/formato";
import { avisarEmpresa } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// D3: pedido do cliente pelo link. Sem login: o token do link é a credencial e o banco confere tudo
// (cliente ativo, preço da tabela, limite por dia).
export async function fazerPedido(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const token = String(form.get("token") ?? "");
  if (!/^[a-f0-9]{32}$/.test(token)) return falha("Link inválido.");
  const ids = form.getAll("produto_id").map(String);
  const qtds = form.getAll("quantidade");
  const itens = ids.map((id, i) => ({ produto_id: id, quantidade: lerDecimal(qtds[i]) ?? 0 })).filter((i) => i.quantidade > 0);
  if (!itens.length) return falha("Informe a quantidade de pelo menos um produto.");
  const entrega = String(form.get("entrega") ?? "");
  const db = createAdminClient();
  const { data: numero, error } = await db.rpc("criar_pedido_portal", {
    p_token: token, p_itens: itens, p_entrega: DATA.test(entrega) ? entrega : null, p_observacoes: String(form.get("observacoes") ?? "").slice(0, 500) || null,
  });
  if (error) return falha(error.message.includes("permission") ? "Não deu para registrar o pedido. Fale com a piscicultura." : error.message);
  const { data: cliente } = await db.from("contatos").select("empresa_id, nome").eq("portal_token", token).single();
  if (cliente) {
    await avisarEmpresa(db, cliente.empresa_id, { titulo: "Pedido pelo link", texto: `${cliente.nome} fez o pedido nº ${numero}. Confira e fature.`, link: "/vendas", tag: `portal-${numero}` }, "vendas.lancar")
      .catch(() => 0);
  }
  return sucesso(`Pedido nº ${numero} enviado. A piscicultura confere e confirma com você.`);
}
