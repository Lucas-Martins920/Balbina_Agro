import "server-only";
// Carrega do banco o que a previsão de ração precisa (lotes ativos, biometrias, trato, água, tabela e curva da
// espécie, fichas e saldos das rações, parâmetros da empresa) e devolve a previsão por lote e a reserva da
// empresa. Só lê dados da empresa atual (RLS do Supabase com a sessão do usuário).
import { somarDias } from "@/lib/formato";
import {
  consumoPorRacao, DIAS_SIMULACAO, PARAMETROS_PADRAO, planejarReserva, preverLote,
  type EntradaSaldo, type FaixaArracoamento, type PrevisaoLote, type RacaoFicha, type ReservaRacao,
} from "@/lib/previsao-racao";
import { lerTodas } from "@/lib/supabase/todas";
import type { createClient } from "@/lib/supabase/server";

type Cliente = Awaited<ReturnType<typeof createClient>>;
export const DIAS_TRATO = 14;

export type PrevisaoDoLote = { lote_id: string; codigo: string; especie: string | null; previsao: PrevisaoLote };
export type PlanoRacao = {
  hoje: string;
  parametros: typeof PARAMETROS_PADRAO;
  lotes: PrevisaoDoLote[];
  reserva: ReservaRacao[];
  racoes: RacaoFicha[];
  saldos: EntradaSaldo[];
};

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function carregarPlanoRacao(supabase: Cliente, empresaId: string, hoje: string, loteId?: string): Promise<PlanoRacao> {
  const desde = somarDias(hoje, -DIAS_TRATO);
  let qLotes = supabase.from("lotes").select("id, codigo, especie_id, especies(nome)").eq("empresa_id", empresaId).neq("fase", "encerrado");
  if (loteId) qLotes = qLotes.eq("id", loteId);
  const [{ data: lotes }, { data: produtos }, { data: saldos }, { data: param }] = await Promise.all([
    qLotes.limit(500),
    supabase.from("produtos").select("id, nome, proteina_pct, granulometria, saco_kg, fase_recomendada")
      .eq("empresa_id", empresaId).eq("tipo", "racao").eq("ativo", true).order("nome").limit(500),
    supabase.from("racao_saldos").select("produto_id, numero, saldo_kg, dias_para_vencer, vencida")
      .eq("empresa_id", empresaId).gt("saldo_kg", 0).limit(2000),
    supabase.from("racao_parametros").select("reserva_sacos, prazo_entrega_dias, amostra_pct, amostra_min, amostra_max")
      .eq("empresa_id", empresaId).maybeSingle(),
  ]);
  const parametros = param
    ? { reserva_sacos: Number(param.reserva_sacos), prazo_entrega_dias: Number(param.prazo_entrega_dias), amostra_pct: Number(param.amostra_pct),
        amostra_min: Number(param.amostra_min), amostra_max: Number(param.amostra_max) }
    : PARAMETROS_PADRAO;
  const racoes: RacaoFicha[] = (produtos ?? []).map((p) => ({
    id: p.id, nome: p.nome, proteina_pct: n(p.proteina_pct), granulometria: p.granulometria, saco_kg: n(p.saco_kg), fase_recomendada: p.fase_recomendada,
  }));
  const entradas: EntradaSaldo[] = (saldos ?? []).filter((s) => !s.vencida)
    .map((s) => ({ racao_id: s.produto_id, numero: s.numero, saldo_kg: Number(s.saldo_kg), dias_para_vencer: n(s.dias_para_vencer) }));

  const ativos = lotes ?? [];
  const ids = ativos.map((l) => l.id);
  const especies = [...new Set(ativos.map((l) => l.especie_id).filter(Boolean))] as string[];
  const vazio = { data: [] as never[] };
  const [{ data: alocs }, { data: bios }, { data: dias }, { data: consumos }, { data: tabela }, { data: curvas }] = await Promise.all([
    ids.length ? supabase.from("alocacoes_atuais").select("lote_id, peixes_atuais").in("lote_id", ids).limit(2000) : vazio,
    ids.length ? lerTodas(() => supabase.from("biometrias").select("id, lote_id, data, peso_medio_g").in("lote_id", ids).order("lote_id").order("data").order("id")) : vazio,
    ids.length ? lerTodas(() => supabase.from("apontamentos_diarios").select("id, lote_id, data, racao_kg, oxigenio_min_mg_l, temp_min_c, temp_max_c, mortes, descartes, peixes_inicio_dia")
      .in("lote_id", ids).gte("data", desde).order("id")) : vazio,
    ids.length ? lerTodas(() => supabase.from("movimentos_estoque").select("id, lote_id, produto_id, quantidade").eq("empresa_id", empresaId)
      .eq("tipo", "consumo_lote").in("lote_id", ids).gte("data", somarDias(hoje, -7)).order("id")) : vazio,
    especies.length ? supabase.from("tabela_arracoamento").select("especie_id, fase, peso_min_g, peso_max_g, proteina_pct, granulo, taxa_inicio_pct, taxa_fim_pct, refeicoes, fonte")
      .in("especie_id", especies).order("peso_min_g").limit(500) : vazio,
    especies.length ? supabase.from("curvas_crescimento").select("especie_id, semana, peso_g").in("especie_id", especies).order("semana").limit(2000) : vazio,
  ]);

  const porLote = <T extends { lote_id: string | null }>(linhas: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const x of linhas ?? []) if (x.lote_id) m.set(x.lote_id, [...(m.get(x.lote_id) ?? []), x]);
    return m;
  };
  const alocDe = porLote(alocs), bioDe = porLote(bios), diaDe = porLote(dias), consumoDe = porLote(consumos);
  const tabelaDe = new Map<string, FaixaArracoamento[]>();
  for (const t of tabela ?? []) {
    tabelaDe.set(t.especie_id, [...(tabelaDe.get(t.especie_id) ?? []), {
      fase: t.fase, peso_min_g: Number(t.peso_min_g), peso_max_g: Number(t.peso_max_g), proteina_pct: n(t.proteina_pct), granulo: t.granulo,
      taxa_inicio_pct: Number(t.taxa_inicio_pct), taxa_fim_pct: Number(t.taxa_fim_pct), refeicoes: Number(t.refeicoes), fonte: t.fonte,
    }]);
  }
  const curvaDe = new Map<string, { semana: number; peso_g: number }[]>();
  for (const c of curvas ?? []) curvaDe.set(c.especie_id, [...(curvaDe.get(c.especie_id) ?? []), { semana: Number(c.semana), peso_g: Number(c.peso_g) }]);

  const previsoes: PrevisaoDoLote[] = ativos.map((l) => {
    const especie = (l.especies as unknown as { nome: string } | null)?.nome ?? null;
    const peixes = (alocDe.get(l.id) ?? []).reduce((s, a) => s + Number(a.peixes_atuais ?? 0), 0);
    const diasLote = diaDe.get(l.id) ?? [];
    const tratoPorDia = new Map<string, number>();
    for (const d of diasLote) tratoPorDia.set(d.data, (tratoPorDia.get(d.data) ?? 0) + Number(d.racao_kg ?? 0));
    const ultimos = [...diasLote].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 7);
    const media = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const oxs = ultimos.map((d) => n(d.oxigenio_min_mg_l)).filter((x): x is number => x !== null);
    const temps = ultimos.map((d) => { const a = n(d.temp_min_c), b = n(d.temp_max_c); return a !== null && b !== null ? (a + b) / 2 : a ?? b; });
    const inicio = diasLote.reduce((s, d) => s + Number(d.peixes_inicio_dia ?? 0), 0);
    const baixas = diasLote.reduce((s, d) => s + Number(d.mortes ?? 0) + Number(d.descartes ?? 0), 0);
    const usado = new Map<string, number>();
    for (const c of consumoDe.get(l.id) ?? []) usado.set(c.produto_id, (usado.get(c.produto_id) ?? 0) - Number(c.quantidade));
    const racaoUsadaId = [...usado.entries()].filter(([, kg]) => kg > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const previsao = preverLote({
      hoje, especie, tabela: tabelaDe.get(l.especie_id) ?? [], curva: curvaDe.get(l.especie_id) ?? [],
      peixes: peixes > 0 ? peixes : null,
      biometrias: (bioDe.get(l.id) ?? []).map((b) => ({ data: b.data, peso_medio_g: Number(b.peso_medio_g) })),
      tratoKgPorDia: [...tratoPorDia.entries()].map(([data, kg]) => ({ data, kg })),
      racaoUsadaId, racoes, saldos: entradas,
      agua: { oxigenioMin: oxs.length ? Math.min(...oxs) : null, temperaturaMedia: media(temps) },
      mortalidadeDiaPct: inicio > 0 ? (baixas / inicio) * 100 : null,
    });
    return { lote_id: l.id, codigo: l.codigo, especie, previsao };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));

  const reserva = planejarReserva(consumoPorRacao(previsoes.map((p) => p.previsao)), entradas,
    { reservaSacos: parametros.reserva_sacos, prazoEntregaDias: parametros.prazo_entrega_dias });
  return { hoje, parametros, lotes: previsoes, reserva, racoes, saldos: entradas };
}

export { DIAS_SIMULACAO };
