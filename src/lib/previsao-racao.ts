// Previsão de ração por lote (15, 30 e 45 dias), ração atual e próxima, transição de fase, cobertura do estoque e
// reserva de sacos. Contas puras (sem banco), para a ficha do lote, a tela do estoque de ração e a IA usarem os
// mesmos números. Cada valor diz de onde veio: medido (pesado/lançado), calculado (conta sobre o medido),
// previsão (projeção), recomendação (sugestão do sistema) ou ausente (falta dado — nada é inventado).
//
// Regras:
// - Peso de hoje: última biometria + ganho médio diário (GMD) entre as duas últimas biometrias. Com uma só
//   biometria, o GMD sai da curva da espécie (previsão); sem curva, o peso fica parado (confiança baixa).
// - Consumo do dia: biomassa × taxa da tabela de arraçoamento da espécie na faixa de peso (interpolada do início
//   ao fim da faixa). Com 7+ dias de trato lançado, a taxa é ajustada pelo apetite real (entre 0,5 e 1,5×).
// - Espécie sem tabela: nada de tabela de outra espécie. Usa só o consumo real lançado (se houver) e avisa que
//   não há dados técnicos para a espécie.
// - Transição: primeiro dia em que o peso previsto entra numa faixa com outra proteína ou outro grânulo.
import { diasEntre, pesoEsperado, type PontoCurva } from "./crescimento.ts";

export type Origem = "medido" | "calculado" | "previsao" | "recomendacao" | "ausente";
export type Valor<T> = { valor: T | null; origem: Origem; nota?: string };
export type Confianca = "alta" | "media" | "baixa" | "indisponivel";

export type FaixaArracoamento = {
  fase: string; peso_min_g: number; peso_max_g: number; proteina_pct: number | null; granulo: string | null;
  taxa_inicio_pct: number; taxa_fim_pct: number; refeicoes: number; fonte: string | null;
};
export type RacaoFicha = {
  id: string; nome: string; proteina_pct: number | null; granulometria: string | null; saco_kg: number | null;
  fase_recomendada: string | null;
};
export type EntradaSaldo = { racao_id: string; numero: number; saldo_kg: number; dias_para_vencer: number | null };

export type DadosLote = {
  hoje: string;
  especie: string | null;
  tabela: FaixaArracoamento[];             // da espécie do lote; vazia = sem dados técnicos
  curva: PontoCurva[];                     // curva de crescimento da espécie (pode ser vazia)
  peixes: number | null;                   // população viva hoje
  biometrias: { data: string; peso_medio_g: number }[];
  tratoKgPorDia: { data: string; kg: number }[];   // ração dada nos últimos dias (apontamento)
  racaoUsadaId: string | null;             // ração mais usada no trato dos últimos dias
  racoes: RacaoFicha[];
  saldos: EntradaSaldo[];                  // entradas com saldo, só dentro da validade
  agua?: { oxigenioMin: number | null; temperaturaMedia: number | null };
  mortalidadeDiaPct?: number | null;
};

export const HORIZONTES = [15, 30, 45] as const;
export const DIAS_SIMULACAO = 45;
const DIAS_TRATO_MINIMO = 7;
const BIOMETRIA_VELHA = 20;
const BIOMETRIA_MUITO_VELHA = 35;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const somaDias = (iso: string, dias: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + dias)).toISOString().slice(0, 10);
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, "");

export function faixaDoPeso(tabela: FaixaArracoamento[], pesoG: number): FaixaArracoamento | null {
  if (!tabela.length) return null;
  const t = [...tabela].sort((a, b) => a.peso_min_g - b.peso_min_g);
  return t.find((f) => pesoG >= f.peso_min_g && pesoG < f.peso_max_g) ?? (pesoG < t[0].peso_min_g ? t[0] : t[t.length - 1]);
}

// Taxa (% da biomassa por dia) interpolada do início ao fim da faixa
export function taxaDoPeso(tabela: FaixaArracoamento[], pesoG: number): number | null {
  const f = faixaDoPeso(tabela, pesoG);
  if (!f) return null;
  const pos = Math.min(Math.max((pesoG - f.peso_min_g) / (f.peso_max_g - f.peso_min_g), 0), 1);
  return f.taxa_inicio_pct + (f.taxa_fim_pct - f.taxa_inicio_pct) * pos;
}

const mesmaRacaoDaFaixa = (a: FaixaArracoamento | null, b: FaixaArracoamento | null) =>
  !!a && !!b && a.proteina_pct === b.proteina_pct && norm(a.granulo) === norm(b.granulo);

// Ração do cadastro que atende a faixa: mesma proteína e grânulo; senão, a fase recomendada com o nome da fase
export function racaoDaFaixa(racoes: RacaoFicha[], f: FaixaArracoamento | null): RacaoFicha | null {
  if (!f) return null;
  return racoes.find((r) => r.proteina_pct !== null && Number(r.proteina_pct) === f.proteina_pct && norm(r.granulometria) === norm(f.granulo))
    ?? racoes.find((r) => norm(r.fase_recomendada) === norm(f.fase))
    ?? null;
}

export const descricaoFaixa = (f: FaixaArracoamento) =>
  [f.proteina_pct !== null ? `PB ${String(f.proteina_pct).replace(".", ",")}%` : null, f.granulo].filter(Boolean).join(" · ");

export type Horizonte = { dias: number; kg: number; sacos: number | null; kgAtual: number; kgProxima: number };

export type PrevisaoLote = {
  confianca: Confianca;
  motivos: string[];
  semDadosTecnicos: boolean;
  pesoUltimaBiometria: Valor<number>;
  dataUltimaBiometria: string | null;
  diasDesdeBiometria: number | null;
  pesoHoje: Valor<number>;
  peixes: Valor<number>;
  biomassaKg: Valor<number>;
  ganhoG: Valor<number>;            // entre as duas últimas biometrias
  gmdG: Valor<number>;
  faixaAtual: FaixaArracoamento | null;
  proximaFaixa: FaixaArracoamento | null;
  taxaPct: Valor<number>;
  consumoRealDiaKg: Valor<number>;
  consumoDiaKg: Valor<number>;      // previsto para hoje
  ajusteApetite: Valor<number>;
  racaoAtual: Valor<RacaoFicha>;
  proximaRacao: Valor<RacaoFicha>;
  proximaRecomendada: string | null; // "PB 28% · 8 mm" quando falta cadastrar
  transicao: Valor<string>;         // data provável da troca de ração
  horizontes: Horizonte[];
  consumoPorDia: { atual: number[]; proxima: number[] }; // kg por dia, DIAS_SIMULACAO dias a partir de amanhã
  estoqueAtualKg: Valor<number>;
  coberturaDias: Valor<number>;
  dataFalta: Valor<string>;
  sobra: Valor<number>;
};

export function preverLote(d: DadosLote): PrevisaoLote {
  const motivos: string[] = [];
  const bios = [...d.biometrias].filter((b) => b.peso_medio_g > 0).sort((a, b) => a.data.localeCompare(b.data));
  const ultima = bios.at(-1) ?? null;
  const anterior = bios.length > 1 ? bios.at(-2)! : null;
  const semDadosTecnicos = d.tabela.length === 0;
  const ausente = <T,>(nota: string): Valor<T> => ({ valor: null, origem: "ausente", nota });

  const diasDesde = ultima ? diasEntre(ultima.data, d.hoje) : null;
  // GMD entre as duas últimas biometrias; senão pela curva da espécie
  let gmd: Valor<number> = ausente("precisa de duas biometrias ou da curva da espécie");
  let ganho: Valor<number> = ausente("precisa de duas biometrias");
  if (ultima && anterior) {
    const dias = diasEntre(anterior.data, ultima.data);
    if (dias > 0) {
      ganho = { valor: r1(ultima.peso_medio_g - anterior.peso_medio_g), origem: "calculado", nota: `${dias} dias entre as biometrias` };
      gmd = { valor: r2((ultima.peso_medio_g - anterior.peso_medio_g) / dias), origem: "calculado", nota: "entre as duas últimas biometrias" };
    }
  }
  const usaCurva = gmd.valor === null && d.curva.length > 0 && ultima !== null;
  if (usaCurva) {
    const p15 = pesoEsperado(d.curva, ultima!.peso_medio_g, 15);
    if (p15 !== null) gmd = { valor: r2((p15 - ultima!.peso_medio_g) / 15), origem: "previsao", nota: "pela curva de crescimento da espécie" };
  }
  const pesoEm = (dias: number): number | null => {
    if (!ultima) return null;
    if (gmd.origem === "calculado" && gmd.valor !== null) return Math.max(ultima.peso_medio_g + Math.max(gmd.valor, 0) * dias, ultima.peso_medio_g);
    if (usaCurva) return pesoEsperado(d.curva, ultima.peso_medio_g, dias);
    return ultima.peso_medio_g;
  };

  const pesoHojeN = ultima ? pesoEm(diasDesde!) : null;
  const pesoHoje: Valor<number> = pesoHojeN === null ? ausente("sem biometria")
    : diasDesde === 0 ? { valor: r1(pesoHojeN), origem: "medido", nota: "biometria de hoje" }
      : { valor: r1(pesoHojeN), origem: gmd.valor === null ? "calculado" : "previsao", nota: gmd.valor === null ? "peso da última biometria, sem ganho estimado" : `última biometria + ${diasDesde} dias de ganho` };
  const peixes: Valor<number> = d.peixes && d.peixes > 0 ? { valor: d.peixes, origem: "calculado", nota: "povoados menos as baixas lançadas" } : ausente("sem peixes no viveiro");
  const biomassaKg: Valor<number> = pesoHojeN !== null && peixes.valor !== null
    ? { valor: r1((peixes.valor * pesoHojeN) / 1000), origem: pesoHoje.origem === "medido" ? "calculado" : "previsao" } : ausente("precisa de peso e população");

  // consumo real: média dos dias com trato lançado
  const trato = d.tratoKgPorDia.filter((t) => t.kg > 0);
  const consumoRealDiaKg: Valor<number> = trato.length
    ? { valor: r1(trato.reduce((s, t) => s + t.kg, 0) / trato.length), origem: "medido", nota: `média de ${trato.length} dias de trato lançado` }
    : ausente("nenhum trato lançado nos últimos dias");

  const faixaAtual = pesoHojeN === null ? null : faixaDoPeso(d.tabela, pesoHojeN);
  const taxaHoje = pesoHojeN === null ? null : taxaDoPeso(d.tabela, pesoHojeN);
  const taxaPct: Valor<number> = taxaHoje === null
    ? ausente(semDadosTecnicos ? "espécie sem tabela de arraçoamento" : "sem peso")
    : { valor: r2(taxaHoje), origem: "calculado", nota: faixaAtual?.fonte ? `tabela: ${faixaAtual.fonte}` : "tabela de arraçoamento" };

  // ajuste pelo apetite real (ração dada ÷ ração da tabela), só com dias suficientes de trato
  let ajuste = 1;
  let ajusteApetite: Valor<number> = ausente(`precisa de ${DIAS_TRATO_MINIMO} dias de trato lançado`);
  if (taxaHoje !== null && biomassaKg.valor && trato.length >= DIAS_TRATO_MINIMO && consumoRealDiaKg.valor) {
    const tabelaKg = (biomassaKg.valor * taxaHoje) / 100;
    if (tabelaKg > 0) {
      ajuste = Math.min(Math.max(consumoRealDiaKg.valor / tabelaKg, 0.5), 1.5);
      ajusteApetite = { valor: r2(ajuste), origem: "calculado", nota: "ração dada ÷ ração da tabela" };
      if (Math.abs(ajuste - 1) > 0.2) motivos.push(`o trato real está ${ajuste > 1 ? "acima" : "abaixo"} da tabela (${Math.round(ajuste * 100)}%)`);
    }
  }

  // simulação dia a dia
  const mort = Math.max(d.mortalidadeDiaPct ?? 0, 0) / 100;
  const atual: number[] = [];
  const proxima: number[] = [];
  let transicaoDia: number | null = null;
  let proximaFaixa: FaixaArracoamento | null = null;
  const podeSimular = pesoHojeN !== null && peixes.valor !== null && (taxaHoje !== null || consumoRealDiaKg.valor !== null);
  if (podeSimular) {
    for (let i = 1; i <= DIAS_SIMULACAO; i++) {
      const peso = pesoEm(diasDesde! + i)!;
      const vivos = peixes.valor! * Math.pow(1 - mort, i);
      let kg: number;
      if (taxaHoje !== null) {
        kg = ((vivos * peso) / 1000) * (taxaDoPeso(d.tabela, peso)! / 100) * ajuste;
        const f = faixaDoPeso(d.tabela, peso);
        if (transicaoDia === null && !mesmaRacaoDaFaixa(f, faixaAtual)) { transicaoDia = i; proximaFaixa = f; }
      } else {
        kg = consumoRealDiaKg.valor!;   // sem tabela: repete o consumo real
      }
      (transicaoDia !== null ? proxima : atual).push(kg);
      if (transicaoDia === null) proxima.push(0); else atual.push(0);
    }
  }
  if (!proximaFaixa && faixaAtual) {
    const ordem = [...d.tabela].sort((a, b) => a.peso_min_g - b.peso_min_g);
    proximaFaixa = ordem.find((f) => f.peso_min_g >= faixaAtual.peso_max_g && !mesmaRacaoDaFaixa(f, faixaAtual)) ?? null;
  }

  const consumoDiaKg: Valor<number> = !podeSimular ? ausente(pesoHojeN === null ? "sem biometria" : peixes.valor === null ? "sem população" : "espécie sem tabela e sem trato lançado")
    : taxaHoje !== null ? { valor: r1(((peixes.valor! * pesoHojeN!) / 1000) * (taxaHoje / 100) * ajuste), origem: "previsao", nota: ajuste !== 1 ? "tabela ajustada pelo apetite real" : "biomassa × taxa da tabela" }
      : { valor: consumoRealDiaKg.valor, origem: "previsao", nota: "repete o consumo real (espécie sem tabela)" };

  // ração atual e próxima
  const usada = d.racaoUsadaId ? d.racoes.find((r) => r.id === d.racaoUsadaId) ?? null : null;
  const daFaixa = racaoDaFaixa(d.racoes, faixaAtual);
  const racaoAtual: Valor<RacaoFicha> = usada ? { valor: usada, origem: "medido", nota: "a mais usada no trato dos últimos dias" }
    : daFaixa ? { valor: daFaixa, origem: "recomendacao", nota: "pela faixa de peso da tabela" }
      : ausente(faixaAtual ? `nenhuma ração do cadastro com ${descricaoFaixa(faixaAtual)}` : "sem trato lançado e sem faixa da tabela");
  const prox = racaoDaFaixa(d.racoes, proximaFaixa);
  const proximaRacao: Valor<RacaoFicha> = prox ? { valor: prox, origem: "recomendacao", nota: `faixa ${proximaFaixa!.fase}` }
    : ausente(proximaFaixa ? `cadastre uma ração com ${descricaoFaixa(proximaFaixa)}` : semDadosTecnicos ? "espécie sem tabela de arraçoamento" : "sem próxima fase no horizonte");
  if (usada && daFaixa && usada.id !== daFaixa.id) motivos.push(`a ração usada (${usada.nome}) não é a da faixa de peso (${daFaixa.nome})`);

  const transicao: Valor<string> = transicaoDia !== null
    ? { valor: somaDias(d.hoje, transicaoDia), origem: "previsao", nota: `peso previsto entra na faixa ${proximaFaixa!.fase}` }
    : ausente(semDadosTecnicos ? "espécie sem tabela de arraçoamento" : podeSimular ? `sem troca nos próximos ${DIAS_SIMULACAO} dias` : "sem previsão");

  const saco = racaoAtual.valor?.saco_kg ? Number(racaoAtual.valor.saco_kg) : null;
  const sacoProx = proximaRacao.valor?.saco_kg ? Number(proximaRacao.valor.saco_kg) : null;
  const horizontes: Horizonte[] = podeSimular ? HORIZONTES.map((dias) => {
    const kgAtual = atual.slice(0, dias).reduce((s, v) => s + v, 0);
    const kgProxima = proxima.slice(0, dias).reduce((s, v) => s + v, 0);
    const sacos = (kgAtual > 0 && !saco) || (kgProxima > 0 && !(sacoProx ?? saco)) ? null
      : r1((saco ? kgAtual / saco : 0) + ((sacoProx ?? saco) ? kgProxima / (sacoProx ?? saco)! : 0));
    return { dias, kg: r1(kgAtual + kgProxima), sacos, kgAtual: r1(kgAtual), kgProxima: r1(kgProxima) };
  }) : [];

  // cobertura do estoque da ração atual (só entradas dentro da validade, consumidas pelo FEFO)
  const estoque = racaoAtual.valor ? d.saldos.filter((s) => s.racao_id === racaoAtual.valor!.id) : [];
  const estoqueKg = estoque.reduce((s, e) => s + e.saldo_kg, 0);
  const estoqueAtualKg: Valor<number> = racaoAtual.valor ? { valor: r1(estoqueKg), origem: "medido", nota: "entradas dentro da validade" } : ausente("sem ração atual");
  let coberturaDias: Valor<number> = ausente("precisa de ração atual e consumo previsto");
  let dataFalta: Valor<string> = ausente("precisa de ração atual e consumo previsto");
  if (racaoAtual.valor && podeSimular) {
    let resta = estoqueKg;
    let dia = 0;
    let fim: "falta" | "troca" | "horizonte" = "horizonte";
    for (; dia < DIAS_SIMULACAO; dia++) {
      if (transicaoDia !== null && dia + 1 >= transicaoDia) { fim = "troca"; break; }
      if (resta < atual[dia]) { fim = "falta"; break; }
      resta -= atual[dia];
    }
    coberturaDias = { valor: dia, origem: "previsao", nota: fim === "troca" ? "dura até a troca de ração" : fim === "horizonte" ? `dura mais de ${DIAS_SIMULACAO} dias` : "pelo consumo previsto" };
    dataFalta = fim === "falta" ? { valor: somaDias(d.hoje, dia + 1), origem: "previsao", nota: "estoque da ração atual acaba" }
      : { valor: null, origem: "previsao", nota: fim === "troca" ? "não falta antes da troca de ração" : `não falta nos próximos ${DIAS_SIMULACAO} dias` };
  }

  // confiança
  let confianca: Confianca = "alta";
  const baixar = (para: Confianca, motivo: string) => {
    const ordem: Confianca[] = ["alta", "media", "baixa", "indisponivel"];
    if (ordem.indexOf(para) > ordem.indexOf(confianca)) confianca = para;
    motivos.push(motivo);
  };
  if (!ultima) baixar("indisponivel", "sem biometria do lote");
  else if (peixes.valor === null) baixar("indisponivel", "sem população no viveiro");
  else if (!podeSimular) baixar("indisponivel", "espécie sem tabela de arraçoamento e sem trato lançado");
  if (semDadosTecnicos) baixar("baixa", `não há dados técnicos de arraçoamento para ${d.especie ?? "a espécie"}`);
  if (diasDesde !== null && diasDesde > BIOMETRIA_MUITO_VELHA) baixar("baixa", `última biometria há ${diasDesde} dias`);
  else if (diasDesde !== null && diasDesde > BIOMETRIA_VELHA) baixar("media", `última biometria há ${diasDesde} dias`);
  if (ultima && gmd.origem !== "calculado") baixar(gmd.valor === null ? "baixa" : "media", gmd.valor === null ? "sem ganho de peso estimado (uma biometria e sem curva)" : "ganho de peso pela curva (só uma biometria)");
  const ox = d.agua?.oxigenioMin ?? null;
  const temp = d.agua?.temperaturaMedia ?? null;
  if ((ox !== null && ox < 3) || (temp !== null && (temp < 24 || temp > 34))) baixar("media", "água fora da faixa ideal (o apetite cai)");

  return {
    confianca, motivos, semDadosTecnicos,
    pesoUltimaBiometria: ultima ? { valor: ultima.peso_medio_g, origem: "medido" } : ausente("sem biometria"),
    dataUltimaBiometria: ultima?.data ?? null, diasDesdeBiometria: diasDesde,
    pesoHoje, peixes, biomassaKg, ganhoG: ganho, gmdG: gmd, faixaAtual, proximaFaixa, taxaPct, consumoRealDiaKg, consumoDiaKg,
    ajusteApetite, racaoAtual, proximaRacao,
    proximaRecomendada: !prox && proximaFaixa ? descricaoFaixa(proximaFaixa) : null,
    transicao, horizontes, consumoPorDia: { atual, proxima }, estoqueAtualKg, coberturaDias, dataFalta,
    sobra: ausente("a sobra de ração não é lançada no apontamento"),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Reserva: até N sacos à frente, divididos entre as rações pelo consumo previsto na janela (prazo do fornecedor
// + 15 dias). Nunca reserva mais de uma ração do que ela vai consumir na janela (evita sobra de ração de alevino
// que logo deixa de ser usada) e só conta o estoque que será usado antes de vencer.
// ---------------------------------------------------------------------------------------------------------------
export type ConsumoRacao = { racao: RacaoFicha; consumo: number[] };   // kg por dia a partir de amanhã
export type ReservaRacao = {
  racao: RacaoFicha;
  janelaDias: number;
  consumoJanelaKg: number;
  consumoPrazoKg: number;
  reservaSacos: number | null;
  reservaKg: number;
  estoqueKg: number;
  estoqueSacos: number | null;
  venceAntesKg: number;
  comprarKg: number;
  comprarSacos: number | null;
  nota: string | null;
};

export function janelaReserva(prazoEntregaDias: number) {
  return Math.min(Math.max(prazoEntregaDias, 0) + 15, DIAS_SIMULACAO);
}

// Estoque que será usado antes de vencer: consome as entradas pelo FEFO no ritmo previsto
export function estoqueUtil(entradas: EntradaSaldo[], consumo: number[]) {
  const fila = [...entradas].sort((a, b) => (a.dias_para_vencer ?? Infinity) - (b.dias_para_vencer ?? Infinity) || a.numero - b.numero)
    .map((e) => ({ ...e, resta: e.saldo_kg }));
  let venceAntes = 0;
  for (let dia = 1; dia <= consumo.length; dia++) {
    for (const e of fila) {
      if (e.resta > 0 && e.dias_para_vencer !== null && e.dias_para_vencer < dia) { venceAntes += e.resta; e.resta = 0; }
    }
    let uso = consumo[dia - 1];
    for (const e of fila) {
      if (uso <= 0) break;
      const tira = Math.min(e.resta, uso);
      e.resta -= tira; uso -= tira;
    }
  }
  const total = entradas.reduce((s, e) => s + e.saldo_kg, 0);
  return { totalKg: total, venceAntesKg: r1(venceAntes), utilKg: r1(total - venceAntes) };
}

export function planejarReserva(itens: ConsumoRacao[], entradas: EntradaSaldo[], p: { reservaSacos: number; prazoEntregaDias: number }): ReservaRacao[] {
  const janela = janelaReserva(p.prazoEntregaDias);
  const base = itens.map((i) => {
    const saco = i.racao.saco_kg ? Number(i.racao.saco_kg) : null;
    const consumoJanela = i.consumo.slice(0, janela).reduce((s, v) => s + v, 0);
    return { ...i, saco, consumoJanela, precisaSacos: saco ? Math.ceil(consumoJanela / saco - 1e-9) : 0 };
  });
  // divide os N sacos pela necessidade da janela, sem passar do que cada ração consome
  const totalPreciso = base.reduce((s, b) => s + b.precisaSacos, 0);
  const sacos = new Map<string, number>();
  if (totalPreciso <= p.reservaSacos) for (const b of base) sacos.set(b.racao.id, b.precisaSacos);
  else {
    const partes = base.map((b) => ({ id: b.racao.id, exato: (p.reservaSacos * b.precisaSacos) / totalPreciso, max: b.precisaSacos }));
    let usados = 0;
    for (const x of partes) { const v = Math.min(Math.floor(x.exato), x.max); sacos.set(x.id, v); usados += v; }
    for (const x of [...partes].sort((a, b) => (b.exato % 1) - (a.exato % 1))) {
      if (usados >= p.reservaSacos) break;
      if (sacos.get(x.id)! < x.max) { sacos.set(x.id, sacos.get(x.id)! + 1); usados++; }
    }
  }
  return base.map((b) => {
    const consumoPrazo = b.consumo.slice(0, Math.max(p.prazoEntregaDias, 0)).reduce((s, v) => s + v, 0);
    const est = estoqueUtil(entradas.filter((e) => e.racao_id === b.racao.id), b.consumo);
    const reservaSacos = b.saco ? sacos.get(b.racao.id) ?? 0 : null;
    const reservaKg = b.saco ? reservaSacos! * b.saco : 0;
    const comprarKg = Math.max(consumoPrazo + reservaKg - est.utilKg, 0);
    return {
      racao: b.racao, janelaDias: janela, consumoJanelaKg: r1(b.consumoJanela), consumoPrazoKg: r1(consumoPrazo),
      reservaSacos, reservaKg: r1(reservaKg), estoqueKg: r1(est.totalKg), estoqueSacos: b.saco ? r1(est.totalKg / b.saco) : null,
      venceAntesKg: est.venceAntesKg, comprarKg: r1(comprarKg),
      comprarSacos: b.saco ? Math.ceil(comprarKg / b.saco - 1e-9) : null,
      nota: b.saco ? null : "cadastre o peso do saco para contar em sacos",
    };
  });
}

// Soma o consumo por dia de vários lotes por ração (para a reserva da empresa)
export function consumoPorRacao(previsoes: PrevisaoLote[]): ConsumoRacao[] {
  const m = new Map<string, ConsumoRacao>();
  const somar = (r: RacaoFicha | null, dias: number[]) => {
    if (!r || !dias.some((v) => v > 0)) return;
    const atual = m.get(r.id) ?? { racao: r, consumo: Array(DIAS_SIMULACAO).fill(0) };
    dias.forEach((v, i) => { atual.consumo[i] += v; });
    m.set(r.id, atual);
  };
  for (const p of previsoes) {
    somar(p.racaoAtual.valor, p.consumoPorDia.atual);
    somar(p.proximaRacao.valor, p.consumoPorDia.proxima);
  }
  return [...m.values()];
}

// Tamanho sugerido da amostra da biometria (padrão: 2% do lote, entre 30 e 100 peixes; 2.500 peixes → 50)
export function amostraBiometria(peixes: number | null, p: { amostra_pct: number; amostra_min: number; amostra_max: number } = PARAMETROS_PADRAO) {
  if (!peixes || peixes <= 0) return p.amostra_min;
  return Math.min(Math.max(Math.round((peixes * p.amostra_pct) / 100), p.amostra_min), p.amostra_max, peixes);
}

export const PARAMETROS_PADRAO = { reserva_sacos: 10, prazo_entrega_dias: 7, amostra_pct: 2, amostra_min: 30, amostra_max: 100 };

// Quando cada entrada deve ser usada no ritmo previsto (FEFO): dia em que começa e em que acaba (null = depois do
// horizonte) e quanto dela vence antes de ser usado. Para a coluna de cobertura e o alerta de validade.
export type UsoEntrada = { numero: number; comecaDia: number | null; acabaDia: number | null; venceAntesKg: number };
export function filaDeConsumo(entradas: EntradaSaldo[], consumo: number[]): UsoEntrada[] {
  const fila = [...entradas].sort((a, b) => (a.dias_para_vencer ?? -Infinity) - (b.dias_para_vencer ?? -Infinity) || a.numero - b.numero)
    .map((e) => ({ numero: e.numero, resta: e.saldo_kg, validade: e.dias_para_vencer, comecaDia: null as number | null, acabaDia: null as number | null, venceAntesKg: 0 }));
  for (let dia = 1; dia <= consumo.length; dia++) {
    for (const e of fila) {
      if (e.resta > 1e-9 && e.validade !== null && e.validade < dia) { e.venceAntesKg += e.resta; e.resta = 0; }
    }
    let uso = consumo[dia - 1];
    for (const e of fila) {
      if (uso <= 1e-9) break;
      if (e.resta <= 1e-9) continue;
      if (e.comecaDia === null) e.comecaDia = dia;
      const tira = Math.min(e.resta, uso);
      e.resta -= tira; uso -= tira;
      if (e.resta <= 1e-9 && e.acabaDia === null) e.acabaDia = dia;
    }
  }
  return fila.map((e) => ({ numero: e.numero, comecaDia: e.comecaDia, acabaDia: e.acabaDia, venceAntesKg: r1(e.venceAntesKg) }));
}
