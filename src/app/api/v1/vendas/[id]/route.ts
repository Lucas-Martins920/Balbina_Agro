import { COLUNAS_VENDA } from "@/lib/api/consultas";
import { uuidValido } from "@/lib/api/regras";
import { erroApi, erroBanco, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

export const GET = rotaApi(async (ctx, _request, { params }: RouteContext<"/api/v1/vendas/[id]">) => {
  if (!ctx.pode("vendas.ver")) return semEscopo("vendas.ver");
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Pedido não encontrado.");
  const { data, error } = await ctx.db.from("pedidos_venda").select(COLUNAS_VENDA).eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
  if (error) return erroBanco(error);
  if (!data) return erroApi(404, "nao_encontrado", "Pedido não encontrado.");
  return respostaApi({ dados: data });
});
