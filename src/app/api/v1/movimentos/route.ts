import { dataValida, uuidValido } from "@/lib/api/regras";
import { erroApi, erroBanco, pagina, paginacao, rotaApi, semEscopo } from "@/lib/api/servidor";

// Extrato do Balbina: baixas e transferências por conta (entrada positiva, saída negativa).
export const GET = rotaApi(async (ctx, request) => {
  if (!ctx.pode("contas.ver")) return semEscopo("contas.ver");
  const url = new URL(request.url);
  const p = paginacao(url);
  if (p instanceof Response) return p;
  const f = url.searchParams;
  let q = ctx.db.from("movimentos_caixa").select("conta_id, data, origem, origem_id, agendamento_id, descricao, valor_cents", { count: "exact" })
    .eq("empresa_id", ctx.empresaId);
  const conta = f.get("conta_id");
  if (conta) {
    if (!uuidValido(conta)) return erroApi(400, "parametro_invalido", "conta_id inválido");
    q = q.eq("conta_id", conta);
  }
  for (const [param, op] of [["de", "gte"], ["ate", "lte"]] as const) {
    const v = f.get(param);
    if (v === null) continue;
    if (!dataValida(v)) return erroApi(400, "parametro_invalido", `${param} deve ser AAAA-MM-DD`);
    q = op === "gte" ? q.gte("data", v) : q.lte("data", v);
  }
  const { data, count, error } = await q.order("data", { ascending: false }).order("origem_id").range(p.inicio, p.fim);
  if (error) return erroBanco(error);
  return pagina(data, count, p);
});
