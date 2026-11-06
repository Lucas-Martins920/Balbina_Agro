import { erroBanco, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

// Plano de categorias: o id vai em categoria_id ao lançar títulos.
export const GET = rotaApi(async (ctx) => {
  if (!ctx.pode("categorias.ver")) return semEscopo("categorias.ver");
  const { data, error } = await ctx.db.from("categorias").select("id, nome, codigo, grupo, sentido, parent_id, ordem, ativa")
    .eq("empresa_id", ctx.empresaId).order("sentido").order("ordem").order("nome");
  if (error) return erroBanco(error);
  return respostaApi({ dados: data ?? [] });
});
