import { erroApi, erroBanco, pagina, paginacao, rotaApi, semEscopo } from "@/lib/api/servidor";
import { TIPOS_PRODUTO_TODOS } from "@/lib/estoque";

const TIPOS = Object.keys(TIPOS_PRODUTO_TODOS);

// Saldo de cada produto (pescado em kg na classe ou na unidade do produto de venda; demais com o valor pelo custo médio).
export const GET = rotaApi(async (ctx, request) => {
  if (!ctx.pode("estoque.ver")) return semEscopo("estoque.ver");
  const url = new URL(request.url);
  const p = paginacao(url);
  if (p instanceof Response) return p;
  const tipo = url.searchParams.get("tipo");
  let q = ctx.db.from("produtos").select("id, tipo, nome, sku, unidade, custo_medio_cents, estoque_minimo", { count: "exact" })
    .eq("empresa_id", ctx.empresaId).eq("ativo", true);
  if (tipo) {
    if (!TIPOS.includes(tipo)) return erroApi(400, "parametro_invalido", `tipo deve ser um de: ${TIPOS.join(", ")}`);
    q = q.eq("tipo", tipo);
  }
  const { data: produtos, count, error } = await q.order("nome").order("id").range(p.inicio, p.fim);
  if (error) return erroBanco(error);
  const ids = (produtos ?? []).map((x) => x.id);
  const { data: saldos, error: erroSaldo } = ids.length
    ? await ctx.db.from("saldos_produtos").select("produto_id, saldo, valor_cents").eq("empresa_id", ctx.empresaId).in("produto_id", ids)
    : { data: [], error: null };
  if (erroSaldo) return erroBanco(erroSaldo);
  const porProduto = new Map((saldos ?? []).map((s) => [s.produto_id, s]));
  return pagina((produtos ?? []).map(({ id, ...resto }) => ({
    produto_id: id,
    ...resto,
    saldo: Number(porProduto.get(id)?.saldo ?? 0),
    valor_cents: porProduto.get(id)?.valor_cents ?? null,
  })), count, p);
});
