import { COLUNAS_BAIXA, COLUNAS_LANCAMENTO, comSituacao } from "@/lib/api/consultas";
import { uuidValido } from "@/lib/api/regras";
import { erroApi, erroBanco, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";
import { hojeISO } from "@/lib/formato";

export const GET = rotaApi(async (ctx, _request, { params }: RouteContext<"/api/v1/lancamentos/[id]">) => {
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Lançamento não encontrado.");
  const { data, error } = await ctx.db.from("agendamentos").select(`${COLUNAS_LANCAMENTO}, baixas(${COLUNAS_BAIXA})`)
    .eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
  if (error) return erroBanco(error);
  if (!data) return erroApi(404, "nao_encontrado", "Lançamento não encontrado.");
  if (!ctx.pode(`contas-a-${data.tipo}.ver`)) return semEscopo(`contas-a-${data.tipo}.ver`);
  return respostaApi({ dados: comSituacao(data, hojeISO(ctx.fuso)) });
});
