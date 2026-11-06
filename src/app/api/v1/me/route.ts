import { ESCOPOS, EVENTOS } from "@/lib/api/regras";
import { erroBanco, respostaApi, rotaApi } from "@/lib/api/servidor";

// Para conferir a chave: empresa, escopos dados e os que o plano libera hoje.
export const GET = rotaApi(async (ctx) => {
  const { data: empresa, error } = await ctx.db.from("empresas").select("id, cnpj, razao_social, nome_fantasia, fuso").eq("id", ctx.empresaId).single();
  if (error) return erroBanco(error);
  return respostaApi({
    dados: {
      chave: { id: ctx.chaveId, nome: ctx.nome },
      empresa,
      escopos: ctx.escopos,
      escopos_liberados: ESCOPOS.map((e) => e.chave).filter((e) => ctx.pode(e)),
      eventos_disponiveis: EVENTOS.map((e) => e.chave),
    },
  });
});
