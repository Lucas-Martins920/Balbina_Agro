import { COLUNAS_CONTATO } from "@/lib/api/consultas";
import { instanteValido, validarContato } from "@/lib/api/regras";
import { erroApi, erroBanco, lerCorpo, pagina, paginacao, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";

const TIPOS = ["cliente", "fornecedor", "funcionario", "socio"];

export const GET = rotaApi(async (ctx, request) => {
  if (!ctx.pode("contatos.ver")) return semEscopo("contatos.ver");
  const url = new URL(request.url);
  const p = paginacao(url);
  if (p instanceof Response) return p;
  const f = url.searchParams;
  let q = ctx.db.from("contatos").select(COLUNAS_CONTATO, { count: "exact" }).eq("empresa_id", ctx.empresaId);
  const tipo = f.get("tipo");
  if (tipo) {
    if (!TIPOS.includes(tipo)) return erroApi(400, "parametro_invalido", `tipo deve ser um de: ${TIPOS.join(", ")}`);
    q = q.contains("tipos", [tipo]);
  }
  const doc = f.get("cpf_cnpj")?.replace(/\D/g, "");
  if (doc) q = q.eq("cpf_cnpj", doc);
  const busca = f.get("busca")?.trim();
  if (busca) q = q.ilike("nome", `%${busca.replace(/[%_\\]/g, "\\$&")}%`);
  const arquivado = f.get("arquivado");
  if (arquivado !== null) {
    if (arquivado !== "true" && arquivado !== "false") return erroApi(400, "parametro_invalido", "arquivado deve ser true ou false");
    q = q.eq("arquivado", arquivado === "true");
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
  if (!ctx.pode("contatos.editar")) return semEscopo("contatos.editar");
  const corpo = await lerCorpo(request);
  if (corpo instanceof Response) return corpo;
  const v = validarContato(corpo);
  if ("erro" in v) return erroApi(422, "dados_invalidos", v.erro);
  const { data, error } = await ctx.db.from("contatos").insert({ ...v.ok, empresa_id: ctx.empresaId }).select(COLUNAS_CONTATO).single();
  if (error) return erroBanco(error);
  return respostaApi({ dados: data }, 201);
});
