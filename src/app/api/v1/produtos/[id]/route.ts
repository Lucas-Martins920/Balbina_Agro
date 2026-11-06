import { COLUNAS_PRODUTO } from "@/lib/api/consultas";
import { uuidValido, validarProduto } from "@/lib/api/regras";
import { erroApi, erroBanco, lerCorpo, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

type Contexto = RouteContext<"/api/v1/produtos/[id]">;

export const GET = rotaApi(async (ctx, _request, { params }: Contexto) => {
  if (!ctx.pode("produtos.ver")) return semEscopo("produtos.ver");
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Produto não encontrado.");
  const { data, error } = await ctx.db.from("produtos").select(COLUNAS_PRODUTO).eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
  if (error) return erroBanco(error);
  if (!data) return erroApi(404, "nao_encontrado", "Produto não encontrado.");
  return respostaApi({ dados: data });
});

export const PATCH = rotaApi(async (ctx, request, { params }: Contexto) => {
  if (!ctx.pode("produtos.editar")) return semEscopo("produtos.editar");
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Produto não encontrado.");
  const corpo = await lerCorpo(request);
  if (corpo instanceof Response) return corpo;
  const v = validarProduto(corpo, true);
  if ("erro" in v) return erroApi(422, "dados_invalidos", v.erro);
  const { data: atual, error: erroAtual } = await ctx.db.from("produtos").select("tipo").eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
  if (erroAtual) return erroBanco(erroAtual);
  if (!atual) return erroApi(404, "nao_encontrado", "Produto não encontrado.");
  if (atual.tipo === "peixe" && v.ok.tipo) return erroApi(422, "regra_de_negocio", "O tipo de um produto de pescado não muda.");
  const { data, error } = await ctx.db.from("produtos").update({ ...v.ok, updated_at: new Date().toISOString() })
    .eq("empresa_id", ctx.empresaId).eq("id", id).select(COLUNAS_PRODUTO).single();
  if (error) return erroBanco(error);
  return respostaApi({ dados: data });
});
