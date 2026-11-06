import "server-only";
import { getEmpresaAtual, nomeEmpresa } from "@/lib/empresa";
import { semanasFluxo } from "@/lib/fluxo";
import { somarDias } from "@/lib/formato";
import { formatarData, hojeISO } from "@/lib/formato";
import { crescimentoLote, fatorCrescimento, semanaCultivo, type Biometria } from "@/lib/crescimento";
import {
  alertasTendencia, coberturaRacao, custoSemanalVariavel, margemProjetada, mortalidadeSemanal, precoRacaoKg, primeiroSaldoNegativo,
  projetarLote, type AlertaTendencia, type Cobertura, type CurvaPadrao, type DiaLote, type Projecao,
} from "@/lib/previsao";
import { planoAbastecimento, DIAS_COMPRA, DIAS_PRODUCAO, type FormulaVigente } from "@/lib/abastecimento";
import { createClient } from "@/lib/supabase/server";
import { lerTodas } from "@/lib/supabase/todas";
import type { SemanaFluxo } from "@/lib/fluxo";
import type { SemanaLote } from "@/lib/zootecnico";

export const DIAS_TENDENCIA = 14;
export const DIAS_CONSUMO = 30;
export const SEMANAS_PROJECAO = 12;

export type LotePrevisto = {
  id: string; codigo: string; fase: string; peixes: number; semanaAtual: number; pesoAtualG: number | null; biomassaKg: number | null;
  pesoAlvoG: number | null;
  projecao: Projecao;
  margem: {
    precoKgCents: number; precoRacaoKgCents: number | null; outrosSemanaCents: number; mes: string;
    semanas: { semana: number; data: string; margemCents: number }[]; semanaNegativa: number | null;
  } | null;
};

// Mesmo formato da view `alertas`, para o painel juntar os dois
export type AlertaPrevisao = { nivel: "critico" | "atencao" | "info"; tipo: string; titulo: string; detalhe: string; link: string };

type Opcoes = { projetar: boolean; verCaixa: boolean; verCusto: boolean; abastecer?: boolean };

export async function carregarPrevisoes({ projetar, verCaixa, verCusto, abastecer = false }: Opcoes) {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const desdeDias = somarDias(hoje, -DIAS_TENDENCIA);
  const desdeConsumo = somarDias(hoje, -DIAS_CONSUMO);
  const ate60 = somarDias(hoje, 60);

  const [{ data: lotes }, { data: alocacoes }, { data: dias }, { data: estoque }, { data: consumos }, caixa] = await Promise.all([
    supabase.from("lotes").select("id, codigo, fase, especie_id, data_povoamento, peso_inicial_g, peso_alvo_g")
      .eq("empresa_id", atual.id).neq("fase", "encerrado").limit(500),
    supabase.from("alocacoes_atuais").select("lote_id, peixes_atuais, peso_medio_g, biomassa_kg").eq("empresa_id", atual.id).limit(500),
    lerTodas(() => supabase.from("indicadores_lote_dia").select("lote_id, data, semana, consumo_g_peixe_dia, mortalidade_dia_pct, oxigenio_min_mg_l")
      .eq("empresa_id", atual.id).gte("data", desdeDias).order("data").order("lote_id")),
    supabase.from("estoque_produtos").select("produto_id, nome, unidade, saldo").eq("empresa_id", atual.id).in("tipo", ["racao", "insumo_racao"]).limit(2000),
    lerTodas(() => supabase.from("movimentos_estoque").select("produto_id, quantidade").eq("empresa_id", atual.id)
      .in("tipo", ["consumo_lote", "consumo_producao"]).gte("data", desdeConsumo).order("id")),
    verCaixa
      ? Promise.all([
        supabase.from("saldos_contas").select("saldo_cents, tipo").eq("empresa_id", atual.id).eq("arquivada", false),
        lerTodas(() => supabase.from("fluxo_previsto").select("data, valor_cents").eq("empresa_id", atual.id).lte("data", ate60).order("agendamento_id")),
      ])
      : null,
  ]);

  const lotesAtivos = lotes ?? [];
  const codigo = new Map(lotesAtivos.map((l) => [l.id, l.codigo]));
  const atuais = new Map<string, { peixes: number; biomassa: number; pesoPonderado: number }>();
  for (const a of alocacoes ?? []) {
    const v = atuais.get(a.lote_id) ?? { peixes: 0, biomassa: 0, pesoPonderado: 0 };
    const peixes = Number(a.peixes_atuais ?? 0);
    v.peixes += peixes;
    v.biomassa += Number(a.biomassa_kg ?? 0);
    v.pesoPonderado += peixes * Number(a.peso_medio_g ?? 0);
    atuais.set(a.lote_id, v);
  }

  const especies = [...new Set(lotesAtivos.map((l) => l.especie_id).filter(Boolean))] as string[];
  const ids = lotesAtivos.map((l) => l.id);
  const [{ data: curvas }, { data: semanas }, { data: biometrias }, { data: custos }, { data: formulas }, { data: dias_automacao }] = await Promise.all([
    projetar && especies.length
      ? lerTodas(() => supabase.from("curvas_crescimento").select("especie_id, semana, peso_g, taxa_alimentacao_pct").in("especie_id", especies)
        .order("especie_id").order("semana"))
      : { data: [] },
    projetar && ids.length
      ? lerTodas(() => supabase.from("indicadores_lote_semana").select("*").in("lote_id", ids).order("lote_id").order("semana"))
      : { data: [] },
    projetar && ids.length
      ? lerTodas(() => supabase.from("biometrias").select("lote_id, data, peso_medio_g").in("lote_id", ids).order("lote_id").order("data"))
      : { data: [] },
    projetar && verCusto && ids.length
      ? supabase.from("custo_kg_lote").select("lote_id, mes, custo_total_cents, alevinos_cents, indiretos_rateados_cents, racao_cents, racao_kg, preco_kg_cents")
        .eq("empresa_id", atual.id).in("lote_id", ids).order("mes", { ascending: false }).limit(1000)
      : { data: [] },
    // compra e produção sugeridas: fórmulas vigentes e os dias que a piscicultura quer cobrir
    abastecer
      ? supabase.from("formulas_racao").select("produto_racao_id, formula_itens(insumo_id, kg_por_tonelada)")
        .eq("empresa_id", atual.id).eq("vigente", true).limit(500)
      : { data: [] },
    abastecer
      ? supabase.from("automacoes_empresa").select("compra_dias, producao_dias").eq("empresa_id", atual.id).maybeSingle()
      : { data: null },
  ]);

  const diasLote: DiaLote[] = (dias ?? []).filter((d) => codigo.has(d.lote_id)).map((d) => ({ ...d, lote_codigo: codigo.get(d.lote_id)! }));
  const tendencia: AlertaTendencia[] = alertasTendencia(diasLote);

  const somaEstoque = new Map<string, { produto_id: string; nome: string; unidade: string; saldo: number }>();
  for (const e of estoque ?? []) {
    const v = somaEstoque.get(e.produto_id) ?? { produto_id: e.produto_id, nome: e.nome, unidade: e.unidade, saldo: 0 };
    v.saldo += Number(e.saldo ?? 0);
    somaEstoque.set(e.produto_id, v);
  }
  const cobertura: Cobertura[] = coberturaRacao([...somaEstoque.values()], consumos ?? [], DIAS_CONSUMO);

  let fluxo: { saldo: number; semanas: SemanaFluxo[]; negativa: SemanaFluxo | null } | null = null;
  if (caixa) {
    const [{ data: saldos }, { data: previsto }] = caixa;
    const saldo = (saldos ?? []).filter((s) => s.tipo !== "cartao_credito").reduce((t, s) => t + Number(s.saldo_cents), 0);
    const semanasCaixa = semanasFluxo(saldo, hoje, ate60, (previsto ?? []).map((p) => ({ data: p.data, valor_cents: Number(p.valor_cents) })));
    fluxo = { saldo, semanas: semanasCaixa, negativa: primeiroSaldoNegativo(semanasCaixa) };
  }

  const agrupar = <T extends { lote_id: string }>(linhas: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of linhas) m.set(x.lote_id, [...(m.get(x.lote_id) ?? []), x]);
    return m;
  };
  const curvaDa = new Map<string, CurvaPadrao[]>();
  for (const c of (curvas ?? []) as (CurvaPadrao & { especie_id: string })[]) curvaDa.set(c.especie_id, [...(curvaDa.get(c.especie_id) ?? []), c]);
  const semanasDo = agrupar((semanas ?? []) as (SemanaLote & { lote_id: string })[]);
  const biometriasDo = agrupar((biometrias ?? []) as (Biometria & { lote_id: string })[]);
  const custoDo = new Map<string, NonNullable<typeof custos>[number]>();
  for (const c of custos ?? []) if (!custoDo.has(c.lote_id)) custoDo.set(c.lote_id, c);

  const previstos: LotePrevisto[] = projetar ? lotesAtivos.map((l) => {
    const agora = atuais.get(l.id);
    const peixes = agora?.peixes ?? 0;
    const pesoAtualG = agora && agora.peixes > 0 ? Math.round((agora.pesoPonderado / agora.peixes) * 10) / 10 : null;
    const curva = curvaDa.get(l.especie_id) ?? [];
    const pontos = crescimentoLote({ povoamento: l.data_povoamento, pesoInicialG: l.peso_inicial_g, biometrias: biometriasDo.get(l.id) ?? [], curva });
    const medido = pontos.some((p) => p.peso !== null && p.esperado !== null);
    const projecao = projetarLote({
      curva, hoje, povoamento: l.data_povoamento, pesoAtualG, peixes,
      fator: fatorCrescimento(pontos, l.peso_inicial_g), base: medido ? "lote" : "padrao",
      mortalidadeSemanaPct: mortalidadeSemanal(semanasDo.get(l.id) ?? []), pesoAlvoG: l.peso_alvo_g, semanasAFrente: SEMANAS_PROJECAO,
    });
    const c = custoDo.get(l.id);
    const preco = c?.preco_kg_cents === null || c?.preco_kg_cents === undefined ? null : Number(c.preco_kg_cents);
    let margem: LotePrevisto["margem"] = null;
    if (c && preco !== null && preco > 0 && peixes > 0) {
      const base = { precoKgCents: preco, precoRacaoKgCents: precoRacaoKg(c), outrosSemanaCents: custoSemanalVariavel(c) };
      margem = { ...base, mes: c.mes, ...margemProjetada(projecao.pontos, base) };
    }
    return {
      id: l.id, codigo: l.codigo, fase: l.fase, peixes, semanaAtual: semanaCultivo(l.data_povoamento, hoje),
      pesoAtualG, biomassaKg: agora ? Math.round(agora.biomassa * 10) / 10 : null,
      pesoAlvoG: l.peso_alvo_g === null ? null : Number(l.peso_alvo_g),
      projecao, margem,
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })) : [];

  const alertas: AlertaPrevisao[] = [
    ...tendencia.map((a) => ({ nivel: a.nivel, tipo: "tendencia", titulo: a.titulo, detalhe: a.detalhe, link: `/lotes/${a.lote_id}` })),
    ...cobertura.filter((c) => c.nivel).map((c) => ({
      nivel: c.nivel!, tipo: "racao",
      titulo: `${c.nome}: estoque para ${Math.floor(c.dias!)} ${Math.floor(c.dias!) === 1 ? "dia" : "dias"}`,
      detalhe: `consumo médio de ${c.consumoDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${c.unidade} por dia nos últimos ${DIAS_CONSUMO} dias`,
      link: "/racao",
    })),
    ...(fluxo?.negativa ? [{
      nivel: "critico" as const, tipo: "caixa",
      titulo: "Caixa previsto fica negativo",
      detalhe: `na semana até ${formatarData(fluxo.negativa.fim)}, com o que está a pagar e a receber hoje`,
      link: "/fluxo-de-caixa",
    }] : []),
  ];

  const diasCompra = dias_automacao?.compra_dias ?? DIAS_COMPRA;
  const diasProducao = dias_automacao?.producao_dias ?? DIAS_PRODUCAO;
  const formulasVigentes: FormulaVigente[] = (formulas ?? []).map((f) => ({
    racao_id: f.produto_racao_id,
    itens: (f.formula_itens ?? []).map((i) => ({ insumo_id: i.insumo_id, kg_por_tonelada: Number(i.kg_por_tonelada) })),
  }));
  const abastecimento = abastecer
    ? { ...planoAbastecimento(cobertura, formulasVigentes, diasCompra, diasProducao), diasCompra, diasProducao, empresa: nomeEmpresa(atual) }
    : null;

  return { hoje, tendencia, cobertura, fluxo, lotes: previstos, alertas, abastecimento };
}
