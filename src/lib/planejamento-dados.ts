import "server-only";
import { cache } from "react";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { estudar, prever, type CurvaSemana, type Estudo, type ItemCusto, type LoteEntrada, type Parametros, type Viveiro } from "@/lib/planejamento";

export type LinhaParametros = {
  semanas_alevinagem: number; semanas_recria: number; semanas_cultivo: number;
  vazio_alevinagem_dias: number; vazio_recria_dias: number; vazio_engorda_dias: number;
  intervalo_lotes_semanas: number; peixes_por_lote: number | null; meta_peixes: number | null; especie_id: string | null; horizonte_meses: number;
  preco_kg_cents: number | null; peso_povoamento_g: number | string;
  racao_alevinagem_kg_cents: number | null; racao_recria_kg_cents: number | null; racao_engorda_kg_cents: number | null;
  mortalidade_recria_pct: number; mortalidade_engorda_pct: number; perda_despesca_pct: number;
};

export type LotePlanejadoLinha = {
  id: string; codigo: string; data_povoamento: string; qtd_peixes: number; especie_id: string | null;
  viveiro_alevinagem_id: string | null; viveiro_recria_id: string | null; viveiro_engorda_id: string | null;
  situacao: string; lote_id: string | null; observacoes: string | null;
};

export type CustoLinha = {
  id: string; descricao: string; categoria: ItemCusto["categoria"]; fase: ItemCusto["fase"]; base: ItemCusto["base"];
  valor_cents: number; semana: number | null; vigente_desde: string | null; ativo: boolean; observacoes: string | null;
};

export function paraParametros(l: LinhaParametros | null): Parametros | null {
  if (!l) return null;
  const n = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    semanasAlevinagem: l.semanas_alevinagem, semanasRecria: l.semanas_recria, semanasCultivo: l.semanas_cultivo,
    vazioAlevinagem: l.vazio_alevinagem_dias, vazioRecria: l.vazio_recria_dias, vazioEngorda: l.vazio_engorda_dias,
    intervaloSemanas: l.intervalo_lotes_semanas, peixesPorLote: l.peixes_por_lote, metaPeixes: l.meta_peixes, especieId: l.especie_id, horizonteMeses: l.horizonte_meses,
    pesoPovoamentoG: Number(l.peso_povoamento_g) || 1, precoKg: n(l.preco_kg_cents),
    racaoAlevinagemKg: n(l.racao_alevinagem_kg_cents), racaoRecriaKg: n(l.racao_recria_kg_cents), racaoEngordaKg: n(l.racao_engorda_kg_cents),
    mortalidadeRecria: Number(l.mortalidade_recria_pct), mortalidadeEngorda: Number(l.mortalidade_engorda_pct), perdaDespesca: Number(l.perda_despesca_pct),
  };
}

// Tudo o que as telas do planejamento usam, numa leitura só por requisição.
export const carregarPlanejamento = cache(async () => {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const [{ data: param }, { data: viveiros }, { data: lotes }, { data: locais }, { data: planejados }, { data: custos }, { data: especies }] = await Promise.all([
    supabase.from("planejamento_parametros").select("*").eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("viveiros").select("id, nome, finalidade, capacidade_peixes, setores(nome)").eq("empresa_id", atual.id).eq("ativo", true).order("nome"),
    supabase.from("lotes").select("id, codigo, fase, especie_id, data_povoamento, qtd_povoada, previsao_despesca")
      .eq("empresa_id", atual.id).neq("fase", "encerrado").order("data_povoamento"),
    supabase.from("alocacoes_atuais").select("lote_id, viveiro_id, peixes_atuais").eq("empresa_id", atual.id),
    supabase.from("lotes_planejados").select("*").eq("empresa_id", atual.id).order("data_povoamento"),
    supabase.from("planejamento_custos").select("*").eq("empresa_id", atual.id).order("fase").order("descricao"),
    supabase.from("especies").select("id, nome, empresa_id").or(`empresa_id.is.null,empresa_id.eq.${atual.id}`).order("nome"),
  ]);

  const p = paraParametros(param as LinhaParametros | null);
  const listaViveiros: (Viveiro & { setor: string })[] = (viveiros ?? []).map((g) => ({
    id: g.id, nome: g.nome, finalidade: g.finalidade as Viveiro["finalidade"], capacidade: g.capacidade_peixes,
    setor: (g.setores as unknown as { nome: string } | null)?.nome ?? "",
  }));

  const porLote = new Map<string, { viveiros: string[]; peixes: number }>();
  for (const a of locais ?? []) {
    const v = porLote.get(a.lote_id) ?? { viveiros: [], peixes: 0 };
    v.viveiros.push(a.viveiro_id);
    v.peixes += a.peixes_atuais ?? 0;
    porLote.set(a.lote_id, v);
  }
  const reais: LoteEntrada[] = (lotes ?? []).map((l) => ({
    id: l.id, codigo: l.codigo, origem: "real", povoamento: l.data_povoamento, especieId: l.especie_id,
    peixes: porLote.get(l.id)?.peixes || l.qtd_povoada, fase: l.fase, previsaoDespesca: l.previsao_despesca,
    viveirosAtuais: porLote.get(l.id)?.viveiros ?? [],
  }));
  const linhasPlanejadas = (planejados ?? []) as LotePlanejadoLinha[];
  const ativosPlanejados: LoteEntrada[] = linhasPlanejadas
    .filter((l) => l.situacao === "planejado" || l.situacao === "confirmado")
    .map((l) => ({
      id: l.id, codigo: l.codigo, origem: "planejado", povoamento: l.data_povoamento, peixes: l.qtd_peixes, especieId: l.especie_id ?? p?.especieId ?? null,
      viveiroAlevinagem: l.viveiro_alevinagem_id, viveiroRecria: l.viveiro_recria_id, viveiroEngorda: l.viveiro_engorda_id,
    }));

  // Sem o manejo da piscicultura cadastrado não há previsão: as telas pedem o cadastro em vez de supor prazos.
  const previsao = p ? prever(p, listaViveiros, reais, ativosPlanejados, hoje) : null;
  const itens: ItemCusto[] = ((custos ?? []) as CustoLinha[]).filter((c) => c.ativo).map((c) => ({
    id: c.id, descricao: c.descricao, categoria: c.categoria, fase: c.fase, base: c.base, valor: Number(c.valor_cents),
    semana: c.semana, vigenteDesde: c.vigente_desde,
  }));

  return {
    hoje, parametros: p, viveiros: listaViveiros, reais, planejados: linhasPlanejadas, previsao,
    custos: (custos ?? []) as CustoLinha[], itens,
    especies: (especies ?? []).map((l) => ({ id: l.id, nome: l.empresa_id ? `${l.nome} (sua)` : l.nome, padrao: !l.empresa_id })),
  };
});

// Curvas das espécies usadas (peso esperado e ração por semana de cultivo). Lote sem espécie usa a curva de
// referência do sistema (a do tambaqui, cadastrada sem empresa).
export async function curvasDasEspecies(ids: string[]) {
  const supabase = await createClient();
  const unicos = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, CurvaSemana[]>();
  const { data: referencia } = await supabase.from("especies").select("id").is("empresa_id", null).eq("nome", "Tambaqui").maybeSingle();
  if (referencia) unicos.push(referencia.id);
  if (unicos.length === 0) return mapa;
  const { data } = await supabase.from("curvas_crescimento").select("especie_id, semana, peso_g, consumo_g_peixe_dia, taxa_alimentacao_pct")
    .in("especie_id", [...new Set(unicos)]).order("semana");
  const n = (v: number | string | null) => (v === null ? null : Number(v));
  for (const c of data ?? []) {
    const lista = mapa.get(c.especie_id) ?? [];
    lista.push({ semana: c.semana, pesoG: n(c.peso_g), consumo: n(c.consumo_g_peixe_dia), taxa: n(c.taxa_alimentacao_pct) });
    mapa.set(c.especie_id, lista);
  }
  if (referencia && mapa.has(referencia.id)) mapa.set("", mapa.get(referencia.id)!);
  return mapa;
}

// Estudo de cada lote do plano (reais, planejados e sugeridos), com a curva da espécie de cada um
export async function estudosDoPlano({ parametros: p, previsao, itens }: { parametros: Parametros; previsao: ReturnType<typeof prever>; itens: ItemCusto[] }) {
  const curvas = await curvasDasEspecies([...previsao.lotes.map((l) => l.especieId ?? ""), p.especieId ?? ""]);
  const estudos = new Map<string, Estudo>();
  for (const l of previsao.lotes) {
    const curva = curvas.get(l.especieId ?? p.especieId ?? "") ?? curvas.get("") ?? [];
    estudos.set(l.id, estudar(p, l.povoamento, l.peixes, itens, curva, l.origem === "real" ? l.previsaoDespesca : null));
  }
  return estudos;
}
