// Previsões da piscicultura sem IA: contas sobre o que já é lançado (apontamento, biometria, curva da espécie,
// estoque, fluxo e custo do kg). Tudo puro, para testar sem banco. Nada aqui decide sozinho: vira sugestão
// com o motivo.
import type { SemanaFluxo } from "./fluxo.ts";
import { idadeEquivalente, pesoEsperado, semanaCultivo, type PontoCurva } from "./crescimento.ts";
import { somarDias } from "./formato.ts";
import { DIAS_MINIMOS, type SemanaLote } from "./zootecnico.ts";

type Num = number | string | null | undefined;
const num = (v: Num) => (v === null || v === undefined || v === "" ? null : Number(v));
const media = (v: (number | null)[]) => {
  const ok = v.filter((x): x is number => x !== null && Number.isFinite(x));
  return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : null;
};
const arred = (v: number, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

// ---------- Crescimento projetado do lote ----------

// Curva da espécie com a taxa de alimentação da semana (% do peso vivo por dia)
export type CurvaPadrao = PontoCurva & { taxa_alimentacao_pct?: Num };

export type PontoProjecao = {
  semana: number; data: string; pesoG: number; peixes: number; biomassaKg: number;
  // ganho de biomassa na semana e ração prevista para ela (biomassa × taxa da curva × 7)
  ganhoKg: number; racaoKg: number | null;
};
export type Projecao = {
  // quanto o lote cresce do previsto pela curva (1 = igual), medido nas biometrias
  fator: number;
  base: "lote" | "padrao";
  pontos: PontoProjecao[];
  // quando o peso médio chega ao peso de despesca (null se a curva não chega lá em 2 anos)
  despesca: { data: string; semana: number; pesoG: number } | null;
};

// Mortalidade semanal usada na projeção: média das últimas semanas completas, com teto
export const SEMANAS_MORTALIDADE = 4;
export const MORTALIDADE_SEMANA_MAX = 5;
const HORIZONTE_DESPESCA = 104;

export function mortalidadeSemanal(semanas: SemanaLote[]): number {
  const completas = [...semanas].sort((a, b) => a.semana - b.semana)
    .filter((s) => s.dias >= DIAS_MINIMOS && (num(s.peixes_medios) ?? 0) > 0).slice(-SEMANAS_MORTALIDADE);
  const pct = media(completas.map((s) => ((num(s.baixas) ?? 0) / num(s.peixes_medios)!) * 100 * (7 / s.dias)));
  return Math.min(MORTALIDADE_SEMANA_MAX, pct ?? 0);
}

// Taxa de alimentação da curva no peso (a da semana da curva em que a espécie tem esse peso)
export function taxaNaCurva(curva: CurvaPadrao[], pesoG: number): number | null {
  const idade = idadeEquivalente(curva, pesoG);
  if (idade === null) return null;
  const semana = Math.floor(idade / 7) + 1;
  const comTaxa = curva.filter((c) => num(c.taxa_alimentacao_pct) !== null).sort((a, b) => a.semana - b.semana);
  const ponto = [...comTaxa].reverse().find((c) => c.semana <= semana) ?? comTaxa[0];
  return ponto ? num(ponto.taxa_alimentacao_pct) : null;
}

// Próximas semanas do lote: o peso segue a curva da espécie a partir do peso de hoje, no ritmo que o lote
// mostrou nas biometrias (fator); os peixes caem pela mortalidade recente.
export function projetarLote({ curva, hoje, povoamento, pesoAtualG, peixes, fator = 1, base = "padrao", mortalidadeSemanaPct = 0, pesoAlvoG = null, semanasAFrente = 12 }: {
  curva: CurvaPadrao[]; hoje: string; povoamento: string; pesoAtualG: Num; peixes: number;
  fator?: number; base?: Projecao["base"]; mortalidadeSemanaPct?: number; pesoAlvoG?: Num; semanasAFrente?: number;
}): Projecao {
  const peso0 = num(pesoAtualG);
  const vazia: Projecao = { fator: arred(fator, 4), base, pontos: [], despesca: null };
  if (peso0 === null || !curva.length) return vazia;
  const alvo = num(pesoAlvoG);
  const sobrevive = 1 - Math.min(MORTALIDADE_SEMANA_MAX, Math.max(0, mortalidadeSemanaPct)) / 100;

  const pontos: PontoProjecao[] = [];
  let despesca: Projecao["despesca"] = alvo !== null && peso0 >= alvo ? { data: hoje, semana: semanaCultivo(povoamento, hoje), pesoG: peso0 } : null;
  let biomassaAnterior = (peixes * peso0) / 1000;
  for (let k = 1; k <= Math.max(semanasAFrente, alvo !== null && !despesca ? HORIZONTE_DESPESCA : 0); k++) {
    const curvaK = pesoEsperado(curva, peso0, 7 * k) ?? peso0;
    const pesoG = arred(peso0 + (curvaK - peso0) * fator, 1);
    const data = somarDias(hoje, 7 * k);
    const semana = semanaCultivo(povoamento, data);
    if (alvo !== null && !despesca && pesoG >= alvo) despesca = { data, semana, pesoG };
    if (k > semanasAFrente) {
      if (despesca) break;
      continue;
    }
    const vivos = Math.round(peixes * sobrevive ** k);
    const biomassaKg = arred((vivos * pesoG) / 1000, 1);
    const taxa = taxaNaCurva(curva, pesoG);
    pontos.push({
      semana, data, pesoG, peixes: vivos, biomassaKg,
      ganhoKg: arred(biomassaKg - biomassaAnterior, 1),
      racaoKg: taxa === null ? null : arred((biomassaKg * taxa * 7) / 100, 1),
    });
    biomassaAnterior = biomassaKg;
  }
  return { fator: arred(fator, 4), base, pontos, despesca };
}

// ---------- Alertas por desvio de tendência ----------

export type DiaLote = {
  lote_id: string; lote_codigo: string; data: string; semana: number;
  consumo_g_peixe_dia: Num; mortalidade_dia_pct: Num;
  // menor oxigênio dissolvido medido no dia (só quando a piscicultura mede a água no apontamento)
  oxigenio_min_mg_l?: Num;
};
export type TipoSinal = "racao" | "mortalidade" | "oxigenio";
export type Sinal = { tipo: TipoSinal; texto: string };
export type AlertaTendencia = {
  lote_id: string; lote_codigo: string; nivel: "critico" | "atencao"; titulo: string; detalhe: string; sinais: Sinal[]; data: string;
};

// Últimos 3 dias contra os 7 anteriores. Peixe estressado (água ruim, doença, manejo) come menos antes de
// morrer: queda da ração aceita, salto de mortalidade e oxigênio da madrugada caindo são os sinais precoces.
// Um sinal sozinho é atenção; dois juntos no mesmo lote, crítico. Valores instantâneos da água (oxigênio abaixo
// de 4 mg/L, amônia, pH) já são alertas próprios do painel.
export const LIMITES = {
  diasRecentes: 3,
  diasBase: 7,
  quedaRacaoPct: 15,
  mortalidadeMinPct: 0.05,
  mortalidadeVezes: 2,
  quedaOxigenio: 1,
  oxigenioAtencao: 5,
};

const fmt = (v: number, casas = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function sinaisDoLote(dias: DiaLote[]): Sinal[] {
  const L = LIMITES;
  const recentes = dias.slice(-L.diasRecentes);
  const base = dias.slice(-(L.diasRecentes + L.diasBase), -L.diasRecentes);
  const m = (d: DiaLote[], f: (x: DiaLote) => Num) => media(d.map((x) => num(f(x))));
  const sinais: Sinal[] = [];

  const racaoBase = m(base, (d) => d.consumo_g_peixe_dia), racaoRec = m(recentes, (d) => d.consumo_g_peixe_dia);
  if (racaoBase !== null && racaoRec !== null && racaoBase > 0) {
    const queda = ((racaoBase - racaoRec) / racaoBase) * 100;
    if (queda >= L.quedaRacaoPct) sinais.push({ tipo: "racao", texto: `ração aceita caiu ${fmt(queda, 0)}% (${fmt(racaoBase)} → ${fmt(racaoRec)} g por peixe)` });
  }
  const mortBase = m(base, (d) => d.mortalidade_dia_pct) ?? 0, mortRec = m(recentes, (d) => d.mortalidade_dia_pct);
  if (mortRec !== null && mortRec >= L.mortalidadeMinPct && mortRec >= mortBase * L.mortalidadeVezes) {
    sinais.push({
      tipo: "mortalidade",
      texto: mortBase > 0
        ? `mortalidade ${fmt(mortRec / mortBase)} vezes a normal (${fmt(mortRec, 2)}% ao dia)`
        : `mortalidade de ${fmt(mortRec, 2)}% ao dia`,
    });
  }
  const oxBase = m(base, (d) => d.oxigenio_min_mg_l), oxRec = m(recentes, (d) => d.oxigenio_min_mg_l);
  if (oxBase !== null && oxRec !== null && oxBase - oxRec >= L.quedaOxigenio && oxRec < L.oxigenioAtencao) {
    sinais.push({ tipo: "oxigenio", texto: `oxigênio mínimo caindo (${fmt(oxBase)} → ${fmt(oxRec)} mg/L)` });
  }
  return sinais;
}

export function alertasTendencia(dias: DiaLote[]): AlertaTendencia[] {
  const porLote = new Map<string, DiaLote[]>();
  for (const d of dias) porLote.set(d.lote_id, [...(porLote.get(d.lote_id) ?? []), d]);
  const alertas: AlertaTendencia[] = [];
  for (const [loteId, lista] of porLote) {
    const ordenados = [...lista].sort((a, b) => a.data.localeCompare(b.data));
    if (ordenados.length < LIMITES.diasRecentes + LIMITES.diasBase) continue;
    const sinais = sinaisDoLote(ordenados);
    if (!sinais.length) continue;
    const ultimo = ordenados.at(-1)!;
    const critico = sinais.length >= 2;
    alertas.push({
      lote_id: loteId,
      lote_codigo: ultimo.lote_codigo,
      nivel: critico ? "critico" : "atencao",
      titulo: `Lote ${ultimo.lote_codigo}: ${critico ? "vários sinais fora do normal" : "sinal fora do normal"}`,
      detalhe: sinais.map((s) => s.texto).join(" · "),
      sinais,
      data: ultimo.data,
    });
  }
  return alertas.sort((a, b) => (a.nivel === b.nivel ? a.lote_codigo.localeCompare(b.lote_codigo, "pt-BR") : a.nivel === "critico" ? -1 : 1));
}

// ---------- Cobertura de ração e insumos ----------

export type ItemEstoque = { produto_id: string; nome: string; unidade: string; saldo: Num };
export type Cobertura = { produto_id: string; nome: string; unidade: string; saldo: number; consumoDia: number; dias: number | null; nivel: "critico" | "atencao" | null };
export const COBERTURA_CRITICA = 7;
export const COBERTURA_ATENCAO = 15;

// Dias que o saldo dura no consumo médio do período (saídas por consumo do lote ou pela fábrica de ração).
export function coberturaRacao(itens: ItemEstoque[], consumos: { produto_id: string; quantidade: Num }[], diasPeriodo: number): Cobertura[] {
  const saida = new Map<string, number>();
  for (const c of consumos) {
    const q = num(c.quantidade) ?? 0;
    if (q < 0) saida.set(c.produto_id, (saida.get(c.produto_id) ?? 0) - q);
  }
  return itens
    .map((i) => {
      const saldo = Math.max(0, num(i.saldo) ?? 0);
      const consumoDia = arred((saida.get(i.produto_id) ?? 0) / diasPeriodo, 3);
      const dias = consumoDia > 0 ? arred(saldo / consumoDia, 1) : null;
      const nivel = dias === null ? null : dias < COBERTURA_CRITICA ? "critico" : dias < COBERTURA_ATENCAO ? "atencao" : null;
      return { produto_id: i.produto_id, nome: i.nome, unidade: i.unidade, saldo, consumoDia, dias, nivel } as Cobertura;
    })
    .sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
}

// ---------- Caixa ----------

export function primeiroSaldoNegativo(semanas: SemanaFluxo[]) {
  return semanas.find((s) => s.saldo < 0) ?? null;
}

// ---------- Margem da semana e ponto de despesca ----------

export type CustoMes = {
  mes: string; custo_total_cents: Num; alevinos_cents: Num; indiretos_rateados_cents: Num; racao_cents: Num; racao_kg: Num;
};

const diasDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

// Custo que some se o lote sair, fora a ração: o mês sem a ração (projetada à parte, cresce com a biomassa),
// sem os alevinos (já pagos) e sem os indiretos (continuam com ou sem o lote), levado para 7 dias.
export function custoSemanalVariavel(c: CustoMes) {
  const variavel = (num(c.custo_total_cents) ?? 0) - (num(c.alevinos_cents) ?? 0) - (num(c.indiretos_rateados_cents) ?? 0) - (num(c.racao_cents) ?? 0);
  return Math.round((Math.max(0, variavel) * 7) / diasDoMes(c.mes));
}

// Preço médio do kg da ração que o lote comeu no mês (centavos)
export function precoRacaoKg(c: CustoMes) {
  const kg = num(c.racao_kg), cents = num(c.racao_cents);
  return kg && cents !== null ? Math.round(cents / kg) : null;
}

// Margem de cada semana a mais no viveiro: o kg de peixe que o lote ganha vale o preço de venda; custa a ração
// da semana e os outros custos variáveis. Quando a margem fica negativa, o peixe passa a ganhar menos do que
// custa: é a hora de avaliar a despesca (o crescimento do tambaqui desacelera depois de 1,5 a 2 kg).
export function margemProjetada(pontos: PontoProjecao[], { precoKgCents, precoRacaoKgCents, outrosSemanaCents }: {
  precoKgCents: number; precoRacaoKgCents: number | null; outrosSemanaCents: number;
}) {
  const semanas = pontos.map((p) => {
    const racao = p.racaoKg === null || precoRacaoKgCents === null ? 0 : p.racaoKg * precoRacaoKgCents;
    return { semana: p.semana, data: p.data, margemCents: Math.round(p.ganhoKg * precoKgCents - racao - outrosSemanaCents) };
  });
  return { semanas, semanaNegativa: semanas.find((s) => s.margemCents < 0)?.semana ?? null };
}
