import "server-only";
import { createClient } from "@/lib/supabase/server";
import { mesesDoAno, montarDre, type CategoriaDre, type LinhaResultado } from "@/lib/relatorios";

export type Regime = "caixa" | "competencia";

export function lerRegime(v: unknown): Regime {
  return v === "competencia" ? "competencia" : "caixa";
}

export function lerAno(v: unknown, padrao: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : padrao;
}

// DRE do ano (janeiro a dezembro) no formato do NIBO. Lê em páginas de 1.000 linhas, o limite
// padrão de linhas por consulta do Supabase.
export async function carregarDre(empresaId: string, regime: Regime, ano: number, centroCusto?: string) {
  const meses = mesesDoAno(ano);
  const supabase = await createClient();
  const linhas: LinhaResultado[] = [];
  for (let de = 0; ; de += 1000) {
    let consulta = supabase.from(regime === "caixa" ? "resultado_caixa" : "resultado_competencia")
      .select("mes, tipo, categoria_id, categoria, grupo, valor_cents")
      .eq("empresa_id", empresaId).gte("mes", meses[0]).lte("mes", meses[11])
      .order("mes").order("categoria_id").range(de, de + 999);
    if (centroCusto) consulta = consulta.eq("centro_custo_id", centroCusto);
    const { data, error } = await consulta;
    if (error) throw new Error(`Erro ao carregar o relatório: ${error.message}`);
    linhas.push(...((data ?? []) as LinhaResultado[]));
    if ((data ?? []).length < 1000) break;
  }
  const { data: categorias, error } = await supabase.from("categorias").select("id, nome, parent_id, ordem").eq("empresa_id", empresaId).range(0, 4999);
  if (error) throw new Error(`Erro ao carregar as categorias: ${error.message}`);
  return montarDre(meses, linhas, (categorias ?? []) as CategoriaDre[], regime);
}
