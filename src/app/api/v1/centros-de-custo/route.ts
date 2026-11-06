import { erroBanco, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

export const GET = rotaApi(async (ctx) => {
  if (!ctx.pode("centros-de-custo.ver")) return semEscopo("centros-de-custo.ver");
  const { data, error } = await ctx.db.from("centros_custo").select("id, nome, tipo, parent_id, ordem, ativo")
    .eq("empresa_id", ctx.empresaId).order("ordem").order("nome");
  if (error) return erroBanco(error);
  return respostaApi({ dados: data ?? [] });
});
