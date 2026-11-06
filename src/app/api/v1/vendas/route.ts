import { COLUNAS_VENDA } from "@/lib/api/consultas";
import { dataValida, instanteValido, uuidValido } from "@/lib/api/regras";
import { erroApi, erroBanco, pagina, paginacao, rotaApi, semEscopo } from "@/lib/api/servidor";

const STATUS = ["rascunho", "aberto", "separado", "faturado", "entregue", "cancelado"];

// Pedidos de venda com cliente e itens.
export const GET = rotaApi(async (ctx, request) => {
  if (!ctx.pode("vendas.ver")) return semEscopo("vendas.ver");
  const url = new URL(request.url);
  const p = paginacao(url);
  if (p instanceof Response) return p;
  const f = url.searchParams;
  let q = ctx.db.from("pedidos_venda").select(COLUNAS_VENDA, { count: "exact" }).eq("empresa_id", ctx.empresaId);
  const status = f.get("status");
  if (status) {
    if (!STATUS.includes(status)) return erroApi(400, "parametro_invalido", `status deve ser um de: ${STATUS.join(", ")}`);
    q = q.eq("status", status);
  }
  for (const [param, op] of [["de", "gte"], ["ate", "lte"]] as const) {
    const v = f.get(param);
    if (v === null) continue;
    if (!dataValida(v)) return erroApi(400, "parametro_invalido", `${param} deve ser AAAA-MM-DD`);
    q = op === "gte" ? q.gte("data", v) : q.lte("data", v);
  }
  const cliente = f.get("cliente_id");
  if (cliente) {
    if (!uuidValido(cliente)) return erroApi(400, "parametro_invalido", "cliente_id inválido");
    q = q.eq("cliente_id", cliente);
  }
  const desde = f.get("atualizado_desde");
  if (desde) {
    if (!instanteValido(desde)) return erroApi(400, "parametro_invalido", "atualizado_desde deve ser data e hora ISO 8601 com fuso");
    q = q.gte("updated_at", desde);
  }
  const { data, count, error } = await q.order("data", { ascending: false }).order("numero", { ascending: false }).range(p.inicio, p.fim);
  if (error) return erroBanco(error);
  return pagina(data, count, p);
});
