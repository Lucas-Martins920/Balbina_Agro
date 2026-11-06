import { COLUNAS_PRODUTO } from "@/lib/api/consultas";
import { instanteValido, validarProduto } from "@/lib/api/regras";
import { erroApi, erroBanco, lerCorpo, pagina, paginacao, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";
import { TIPOS_PRODUTO_TODOS } from "@/lib/estoque";

const TIPOS = Object.keys(TIPOS_PRODUTO_TODOS);

export const GET = rotaApi(async (ctx, request) => {
  if (!ctx.pode("produtos.ver")) return semEscopo("produtos.ver");
  const url = new URL(request.url);
  const p = paginacao(url);
  if (p instanceof Response) return p;
  const f = url.searchParams;
  let q = ctx.db.from("produtos").select(COLUNAS_PRODUTO, { count: "exact" }).eq("empresa_id", ctx.empresaId);
  const tipo = f.get("tipo");
  if (tipo) {
    if (!TIPOS.includes(tipo)) return erroApi(400, "parametro_invalido", `tipo deve ser um de: ${TIPOS.join(", ")}`);
    q = q.eq("tipo", tipo);
  }
  const ativo = f.get("ativo");
  if (ativo !== null) {
    if (ativo !== "true" && ativo !== "false") return erroApi(400, "parametro_invalido", "ativo deve ser true ou false");
    q = q.eq("ativo", ativo === "true");
  }
  const venda = f.get("para_venda");
  if (venda !== null) {
    if (venda !== "true" && venda !== "false") return erroApi(400, "parametro_invalido", "para_venda deve ser true ou false");
    q = q.eq("para_venda", venda === "true");
  }
  const desde = f.get("atualizado_desde");
  if (desde) {
    if (!instanteValido(desde)) return erroApi(400, "parametro_invalido", "atualizado_desde deve ser data e hora ISO 8601 com fuso");
    q = q.gte("updated_at", desde);
  }
  const { data, count, error } = await q.order("nome").order("id").range(p.inicio, p.fim);
  if (error) return erroBanco(error);
  return pagina(data, count, p);
});

export const POST = rotaApi(async (ctx, request) => {
  if (!ctx.pode("produtos.editar")) return semEscopo("produtos.editar");
  const corpo = await lerCorpo(request);
  if (corpo instanceof Response) return corpo;
  const v = validarProduto(corpo);
  if ("erro" in v) return erroApi(422, "dados_invalidos", v.erro);
  const { data, error } = await ctx.db.from("produtos").insert({ ...v.ok, empresa_id: ctx.empresaId }).select(COLUNAS_PRODUTO).single();
  if (error) return erroBanco(error);
  return respostaApi({ dados: data }, 201);
});
