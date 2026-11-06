import "server-only";
import {
  janelaDeLeitura, resolverPeriodo, resumoCusto, resumoFinanceiro, resumoProducao, resumoVendasPeriodo,
  type Analise, type CustoLote, type DiaLote, type ItemPeriodo, type Meta,
} from "@/lib/analise-periodo";
import { lerRegime } from "@/lib/consultas-relatorio";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import type { LinhaResultado } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Lê todas as linhas em páginas de 1.000 (o limite por consulta do Supabase), até 50 mil.
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; de < 50000; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(`Erro ao carregar a análise do período: ${error.message}`);
    linhas.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return linhas;
}

async function financeiro(s: Supabase, empresa: string, regime: "caixa" | "competencia", de: string, ate: string) {
  const [linhas, metas] = await Promise.all([
    todas<LinhaResultado>((i, f) => s.from(regime === "caixa" ? "resultado_caixa" : "resultado_competencia")
      .select("mes, tipo, categoria_id, categoria, grupo, valor_cents").eq("empresa_id", empresa).gte("mes", de).lte("mes", ate)
      .order("mes").order("categoria_id").order("tipo").order("centro_custo_id").range(i, f)),
    // o orçamento é por competência: só serve de meta nesse regime
    regime === "competencia"
      ? todas<Meta>((i, f) => s.from("orcado_realizado").select("mes, grupo, sentido, orcado_cents").eq("empresa_id", empresa)
        .gte("mes", de).lte("mes", ate).gt("orcado_cents", 0).order("mes").order("categoria_id").range(i, f))
      : Promise.resolve([] as Meta[]),
  ]);
  return { linhas, metas };
}

// Monta a análise do período escolhido. Cada bloco só aparece para quem tem a permissão do módulo
// (o plano da empresa entra na mesma regra); o RLS do banco garante a empresa.
export async function carregarAnalise(filtros: Record<string, string | string[] | undefined>) {
  const [{ atual }, { pode }] = await Promise.all([getEmpresaAtual(), getPermissoes()]);
  const hoje = hojeISO(atual.fuso);
  const periodos = resolverPeriodo(filtros.periodo, hoje, filtros.de, filtros.ate);
  const regime = lerRegime(filtros.regime);
  const { de, ate } = janelaDeLeitura(periodos);
  const s = await createClient();
  const empresa = atual.id;

  const [fin, dias, custos, itens] = await Promise.all([
    pode("relatorios.ver") ? financeiro(s, empresa, regime, de, ate) : null,
    pode("lotes.ver")
      ? todas<DiaLote>((i, f) => s.from("indicadores_lote_dia").select("data, peixes, baixas_peixes, racao_kg, biomassa_kg").eq("empresa_id", empresa)
        .gte("data", de).lte("data", ate).order("data").order("lote_id").range(i, f))
      : null,
    pode("custo-do-kg.ver")
      ? todas<CustoLote>((i, f) => s.from("custo_kg_lote")
        .select("mes, lote_codigo, custo_total_cents, ganho_kg, racao_kg, racao_cents, alevinos_cents, sanidade_cents, mao_obra_cents, energia_cents, embalagem_cents, outros_diretos_cents, indiretos_rateados_cents")
        .eq("empresa_id", empresa).gte("mes", de).lte("mes", ate).order("mes").order("lote_id").range(i, f))
      : null,
    pode("vendas.ver")
      ? todas<ItemPeriodo>((i, f) => s.from("vendas_itens").select("mes, cliente_id, cliente, kg, total_cents").eq("empresa_id", empresa)
        .gte("data", de).lte("data", ate).order("data").order("pedido_id").order("produto_id").order("total_cents").range(i, f))
      : null,
  ]);

  const analise: Analise = {
    periodos,
    regime,
    financeiro: fin ? resumoFinanceiro(fin.linhas, periodos, fin.metas) : null,
    producao: dias ? resumoProducao(dias, periodos) : null,
    custo: custos ? resumoCusto(custos, periodos) : null,
    vendas: itens ? resumoVendasPeriodo(itens, periodos) : null,
  };
  return { analise, empresa: atual };
}
