import { COLUNAS_CONTATO } from "@/lib/api/consultas";
import { uuidValido, validarContato } from "@/lib/api/regras";
import { erroApi, erroBanco, lerCorpo, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

type Contexto = RouteContext<"/api/v1/contatos/[id]">;

export const GET = rotaApi(async (ctx, _request, { params }: Contexto) => {
  if (!ctx.pode("contatos.ver")) return semEscopo("contatos.ver");
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Contato não encontrado.");
  const { data, error } = await ctx.db.from("contatos").select(COLUNAS_CONTATO).eq("empresa_id", ctx.empresaId).eq("id", id).maybeSingle();
  if (error) return erroBanco(error);
  if (!data) return erroApi(404, "nao_encontrado", "Contato não encontrado.");
  return respostaApi({ dados: data });
});

// Edição parcial: só os campos enviados mudam.
export const PATCH = rotaApi(async (ctx, request, { params }: Contexto) => {
  if (!ctx.pode("contatos.editar")) return semEscopo("contatos.editar");
  const { id } = await params;
  if (!uuidValido(id)) return erroApi(404, "nao_encontrado", "Contato não encontrado.");
  const corpo = await lerCorpo(request);
  if (corpo instanceof Response) return corpo;
  const v = validarContato(corpo, true);
  if ("erro" in v) return erroApi(422, "dados_invalidos", v.erro);
  const { data, error } = await ctx.db.from("contatos").update({ ...v.ok, updated_at: new Date().toISOString() })
    .eq("empresa_id", ctx.empresaId).eq("id", id).select(COLUNAS_CONTATO).maybeSingle();
  if (error) return erroBanco(error);
  if (!data) return erroApi(404, "nao_encontrado", "Contato não encontrado.");
  return respostaApi({ dados: data });
});
