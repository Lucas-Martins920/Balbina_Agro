import { COLUNAS_LANCAMENTO, comSituacao } from "@/lib/api/consultas";
import { dataValida, instanteValido, uuidValido, validarTitulo } from "@/lib/api/regras";
import { erroApi, erroBanco, lerCorpo, pagina, paginacao, respostaApi, rotaApi, semEscopo } from "@/lib/api/servidor";
import { hojeISO } from "@/lib/formato";

const STATUS = ["aberto", "parcial", "quitado", "perda", "cancelado"];

// Contas a pagar e a receber. Sem ?tipo, devolve os tipos que a chave pode ler.
export const GET = rotaApi(async (ctx, request) => {
  const url = new URL(request.url);
  const p = paginacao(url);
  if (p instanceof Response) return p;
  const f = url.searchParams;
  const tipo = f.get("tipo");
  if (tipo && tipo !== "pagar" && tipo !== "receber") return erroApi(400, "parametro_invalido", "tipo deve ser pagar ou receber");
  const tipos = (tipo ? [tipo] : ["pagar", "receber"]).filter((t) => ctx.pode(`contas-a-${t}.ver`));
  if (tipos.length === 0) return semEscopo(tipo ? `contas-a-${tipo}.ver` : "contas-a-pagar.ver ou contas-a-receber.ver");

  let q = ctx.db.from("agendamentos").select(COLUNAS_LANCAMENTO, { count: "exact" }).eq("empresa_id", ctx.empresaId).in("tipo", tipos);
  const status = f.get("status");
  if (status) {
    if (!STATUS.includes(status)) return erroApi(400, "parametro_invalido", `status deve ser um de: ${STATUS.join(", ")}`);
    q = q.eq("status", status);
  }
  for (const [param, coluna, op] of [["vencimento_de", "vencimento", "gte"], ["vencimento_ate", "vencimento", "lte"],
    ["competencia_de", "competencia", "gte"], ["competencia_ate", "competencia", "lte"]] as const) {
    const v = f.get(param);
    if (v === null) continue;
    if (!dataValida(v)) return erroApi(400, "parametro_invalido", `${param} deve ser AAAA-MM-DD`);
    q = op === "gte" ? q.gte(coluna, v) : q.lte(coluna, v);
  }
  const contato = f.get("contato_id");
  if (contato) {
    if (!uuidValido(contato)) return erroApi(400, "parametro_invalido", "contato_id inválido");
    q = q.eq("contato_id", contato);
  }
  const desde = f.get("atualizado_desde");
  if (desde) {
    if (!instanteValido(desde)) return erroApi(400, "parametro_invalido", "atualizado_desde deve ser data e hora ISO 8601 com fuso");
    q = q.gte("updated_at", desde);
  }
  const { data, count, error } = await q.order("vencimento").order("id").range(p.inicio, p.fim);
  if (error) return erroBanco(error);
  const hoje = hojeISO(ctx.fuso);
  return pagina((data ?? []).map((l) => comSituacao(l, hoje)), count, p);
});

// Inclui um título (ou várias parcelas mensais). Devolve as parcelas criadas.
export const POST = rotaApi(async (ctx, request) => {
  const corpo = await lerCorpo(request);
  if (corpo instanceof Response) return corpo;
  const v = validarTitulo(corpo);
  if ("erro" in v) return erroApi(422, "dados_invalidos", v.erro);
  if (!ctx.pode(`contas-a-${v.ok.p_tipo}.editar`)) return semEscopo(`contas-a-${v.ok.p_tipo}.editar`);

  const { data: id, error } = await ctx.db.rpc("agendar_titulo", { p_empresa: ctx.empresaId, ...v.ok });
  if (error) return erroBanco(error);
  const coluna = v.ok.p_parcelas > 1 ? "grupo_parcelamento_id" : "id";
  const { data, error: erroLeitura } = await ctx.db.from("agendamentos").select(COLUNAS_LANCAMENTO)
    .eq("empresa_id", ctx.empresaId).eq(coluna, id).order("vencimento");
  if (erroLeitura) return erroBanco(erroLeitura);
  const hoje = hojeISO(ctx.fuso);
  return respostaApi({ dados: (data ?? []).map((l) => comSituacao(l, hoje)) }, 201);
});
