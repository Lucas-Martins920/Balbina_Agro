import { COLUNAS_BAIXA, COLUNAS_LANCAMENTO, comSituacao } from "@/lib/api/consultas";
import { uuidValido, validarBaixa } from "@/lib/api/regras";
import { erroApi, erroBanco, lerCorpo, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";
import { hojeISO } from "@/lib/formato";

// Baixa (pagamento ou recebimento) de um título, total ou parcial. A conta precisa ser da mesma empresa.
export const POST = rotaApi(async (ctx, request, { params }: RouteContext<"/api/v1/lancamentos/[id]/baixas">) => {
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Lançamento não encontrado.");
  const corpo = await lerCorpo(request);
  if (corpo instanceof Response) return corpo;
  const v = validarBaixa(corpo);
  if ("erro" in v) return erroApi(422, "dados_invalidos", v.erro);

  const { data: titulo, error } = await ctx.db.from("agendamentos").select("id, tipo, status")
    .eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
  if (error) return erroBanco(error);
  if (!titulo) return erroApi(404, "nao_encontrado", "Lançamento não encontrado.");
  if (!ctx.pode(`contas-a-${titulo.tipo}.editar`)) return semEscopo(`contas-a-${titulo.tipo}.editar`);
  if (!["aberto", "parcial"].includes(titulo.status)) return erroApi(422, "regra_de_negocio", `Título ${titulo.status} não recebe baixa.`);

  const { data: baixa, error: erroBaixa } = await ctx.db.from("baixas")
    .insert({ empresa_id: ctx.empresaId, agendamento_id: id, ...v.ok }).select(COLUNAS_BAIXA).single();
  if (erroBaixa) return erroBanco(erroBaixa);
  const { data: atualizado } = await ctx.db.from("agendamentos").select(COLUNAS_LANCAMENTO).eq("empresa_id", ctx.empresaId).eq("id", id).single();
  return respostaApi({ dados: { baixa, lancamento: atualizado ? comSituacao(atualizado, hojeISO(ctx.fuso)) : null } }, 201);
});
