// Indicadores zootécnicos do lote de peixe (BI por lote e espécie), calculados sobre a view indicadores_lote_semana.
// O padrão de cada semana já vem da view: é a curva da espécie a partir do peso do povoamento. Sem tabela derivada:
// tudo sai do apontamento (ração, baixas), da biometria (peso) e da despesca (kg retirados).

import { diasEntre } from "./crescimento.ts";
import { formatarNumero } from "./formato.ts";
import { textoPeso } from "./pescado.ts";

type Num = number | string | null;

// Uma linha de indicadores_lote_semana
export type SemanaLote = {
  semana: number; dias: number; inicio?: string; fim?: string;
  peixes_medios: Num; racao_kg: Num; consumo_g_peixe_dia: Num; baixas: Num;
  mortalidade_acum_pct: Num; sobrevivencia_pct: Num; peso_medio_g: Num; biomassa_kg: Num;
  racao_acum_kg: Num; kg_despescados_acum: Num; conversao_alimentar: Num;
  padrao_peso_g: Num; padrao_consumo_g: Num; padrao_sobrevivencia_pct: Num; padrao_taxa_pct: Num;
};

export type ResumoZootecnico = {
  semanaAtual: number | null;
  // peso médio estimado no fim da última semana (última biometria levada pela curva) e o da curva
  pesoAtual: number | null;
  padraoPeso: number | null;
  desvioPesoPct: number | null;
  // ganho de peso diário desde o povoamento, real e o que a curva previa no mesmo período
  gpd: number | null;
  padraoGpd: number | null;
  biomassaKg: number | null;
  sobrevivencia: number | null;
  padraoSobrevivencia: number | null;
  mortalidadeAcum: number | null;
  // conversão alimentar acumulada: kg de ração por kg de peixe ganho (o despescado entra no ganho)
  conversao: number | null;
  racaoAcumKg: number | null;
  kgDespescados: number | null;
  // última semana com dias suficientes
  consumo: number | null;
  padraoConsumo: number | null;
  taxaAlimentacao: number | null;
  padraoTaxa: number | null;
  uniformidade: number | null;
};

const num = (v: Num | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const media = (v: (number | null)[]) => {
  const ok = v.filter((x): x is number => x !== null && Number.isFinite(x));
  return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : null;
};

// Semana com menos de 3 dias apontados não entra no consumo nem na taxa: distorce a média
export const DIAS_MINIMOS = 3;

// Ração do dia como % do peso vivo: ração média por dia da semana sobre a biomassa
export function taxaSemana(s: SemanaLote): number | null {
  const racao = num(s.racao_kg), bio = num(s.biomassa_kg);
  return racao === null || !bio || !s.dias ? null : (racao / s.dias / bio) * 100;
}

export function resumoLote(semanas: SemanaLote[], lote: { povoamento?: string | null; pesoInicialG?: Num; uniformidade?: number | null }): ResumoZootecnico {
  const ordenadas = [...semanas].sort((a, b) => a.semana - b.semana);
  const ultima = ordenadas.at(-1);
  const completa = ordenadas.filter((s) => s.dias >= DIAS_MINIMOS).at(-1);
  const inicial = num(lote.pesoInicialG ?? null);
  const peso = num(ultima?.peso_medio_g ?? null), padraoPeso = num(ultima?.padrao_peso_g ?? null);
  // o peso da view é o do dia seguinte ao fim da semana
  const dias = lote.povoamento && ultima?.fim ? diasEntre(lote.povoamento, ultima.fim) + 1 : null;
  const gpd = (p: number | null) => (p === null || inicial === null || !dias ? null : (p - inicial) / dias);
  const mortalidade = num(ultima?.mortalidade_acum_pct ?? null);

  return {
    semanaAtual: ultima?.semana ?? null,
    pesoAtual: peso,
    padraoPeso,
    desvioPesoPct: peso !== null && padraoPeso ? (peso / padraoPeso - 1) * 100 : null,
    gpd: gpd(peso),
    padraoGpd: gpd(padraoPeso),
    biomassaKg: num(ultima?.biomassa_kg ?? null),
    sobrevivencia: num(ultima?.sobrevivencia_pct ?? null) ?? (mortalidade === null ? null : 100 - mortalidade),
    padraoSobrevivencia: num(ultima?.padrao_sobrevivencia_pct ?? null),
    mortalidadeAcum: mortalidade,
    conversao: num(ultima?.conversao_alimentar ?? null),
    racaoAcumKg: num(ultima?.racao_acum_kg ?? null),
    kgDespescados: num(ultima?.kg_despescados_acum ?? null),
    consumo: num(completa?.consumo_g_peixe_dia ?? null),
    padraoConsumo: num(completa?.padrao_consumo_g ?? null),
    taxaAlimentacao: completa ? taxaSemana(completa) : null,
    padraoTaxa: num(completa?.padrao_taxa_pct ?? null),
    uniformidade: lote.uniformidade ?? null,
  };
}

// Indicadores que dá para comparar entre lotes, semana a semana de cultivo
type Ponto = { semana: number; real: number | null; padrao: number | null };
type Indicador = {
  nome: string; unidade: string; casas: number;
  real: (s: SemanaLote) => number | null;
  padrao: (s: SemanaLote) => number | null;
};
const menos100 = (v: number | null) => (v === null ? null : 100 - v);

export const INDICADORES = {
  peso: {
    nome: "Peso médio (g)", unidade: "g", casas: 0,
    real: (s) => num(s.peso_medio_g), padrao: (s) => num(s.padrao_peso_g),
  },
  biomassa: {
    nome: "Biomassa (kg)", unidade: "kg", casas: 0,
    real: (s) => num(s.biomassa_kg), padrao: () => null,
  },
  sobrevivencia: {
    nome: "Sobrevivência", unidade: "%", casas: 1,
    real: (s) => num(s.sobrevivencia_pct), padrao: (s) => num(s.padrao_sobrevivencia_pct),
  },
  mortalidade: {
    nome: "Mortalidade acumulada", unidade: "%", casas: 2,
    real: (s) => num(s.mortalidade_acum_pct), padrao: (s) => menos100(num(s.padrao_sobrevivencia_pct)),
  },
  consumo: {
    nome: "Ração (g/peixe/dia)", unidade: "g", casas: 1,
    real: (s) => num(s.consumo_g_peixe_dia), padrao: (s) => num(s.padrao_consumo_g),
  },
  taxa: {
    nome: "Taxa de alimentação (% do peso vivo)", unidade: "%", casas: 2,
    real: (s) => taxaSemana(s), padrao: (s) => num(s.padrao_taxa_pct),
  },
  conversao: {
    nome: "Conversão alimentar (acumulada)", unidade: "", casas: 2,
    real: (s) => num(s.conversao_alimentar), padrao: () => null,
  },
} satisfies Record<string, Indicador>;
export type ChaveIndicador = keyof typeof INDICADORES;

export function serieIndicador(semanas: SemanaLote[], chave: ChaveIndicador): Ponto[] {
  const ind: Indicador = INDICADORES[chave];
  return [...semanas].sort((a, b) => a.semana - b.semana)
    .map((s) => ({ semana: s.semana, real: ind.real(s), padrao: ind.padrao(s) }));
}

export type ResumoEspecie = {
  especie: string; lotes: number; pesoMedio: number | null; gpdMedio: number | null; desvioPesoMedio: number | null;
  sobrevivenciaMedia: number | null; conversaoMedia: number | null;
};

// Média simples entre os lotes da espécie; quem não tem o número fica de fora daquela média
export function resumoPorEspecie(lotes: { especie: string; resumo: ResumoZootecnico }[]): ResumoEspecie[] {
  const grupos = new Map<string, ResumoZootecnico[]>();
  for (const l of lotes) grupos.set(l.especie, [...(grupos.get(l.especie) ?? []), l.resumo]);
  return [...grupos.entries()]
    .map(([especie, r]) => ({
      especie, lotes: r.length,
      pesoMedio: media(r.map((x) => x.pesoAtual)),
      gpdMedio: media(r.map((x) => x.gpd)),
      desvioPesoMedio: media(r.map((x) => x.desvioPesoPct)),
      sobrevivenciaMedia: media(r.map((x) => x.sobrevivencia)),
      conversaoMedia: media(r.map((x) => x.conversao)),
    }))
    .sort((a, b) => a.especie.localeCompare(b.especie, "pt-BR"));
}

// Cada semana do lote com real e padrão de todos os indicadores, para ler lado a lado (sem gráfico)
export type SemanaIndicadores = { semana: number; dias: number; valores: Record<ChaveIndicador, { real: number | null; padrao: number | null }> };

export function semanasPorIndicador(semanas: SemanaLote[]): SemanaIndicadores[] {
  const chaves = Object.keys(INDICADORES) as ChaveIndicador[];
  return [...semanas].sort((a, b) => a.semana - b.semana).map((s) => {
    const valores = Object.fromEntries(chaves.map((k) => {
      const ind: Indicador = INDICADORES[k];
      return [k, { real: ind.real(s), padrao: ind.padrao(s) }];
    })) as SemanaIndicadores["valores"];
    return { semana: s.semana, dias: s.dias, valores };
  });
}

// Classificação de cada indicador em relação ao padrão (ou à referência técnica da espécie)
export type Classificacao = "normal" | "acima" | "abaixo";

// "acima" e "abaixo" dizem se o lote está melhor ou pior que o esperado: em conversão alimentar e
// mortalidade, número maior é pior.
function classificar(real: number | null, padrao: number | null, folga: number, inverso = false): Classificacao | null {
  if (real === null || padrao === null) return null;
  if (real > padrao + folga) return inverso ? "abaixo" : "acima";
  if (real < padrao - folga) return inverso ? "acima" : "abaixo";
  return "normal";
}

const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = { normal: "dentro do esperado", acima: "acima do esperado", abaixo: "abaixo do esperado" };

// Referências técnicas publicadas (Embrapa) para o tambaqui e seus híbridos. Só o que tem fonte:
// o resto da comparação usa a curva da espécie cadastrada (que a piscicultura pode ajustar).
export type ReferenciaEspecie = {
  // conversão alimentar observada na engorda (kg de ração por kg de peixe ganho)
  conversao: number;
  // ganho de peso diário médio na engorda (g/dia)
  gpdEngorda: number;
  fonte: string;
};

const REF_TAMBAQUI: ReferenciaEspecie = {
  conversao: 2.09,
  gpdEngorda: 8.1,
  fonte: "Embrapa, Circular Técnica 39 (Izel et al., 2013): engorda em viveiro escavado com aeração, de 160 g a 2,62 kg em 10 meses, conversão 2,09",
};

// A chave é o nome exato da espécie no catálogo
export const REFERENCIAS_ESPECIE: Record<string, ReferenciaEspecie> = {
  Tambaqui: REF_TAMBAQUI,
  Tambatinga: REF_TAMBAQUI,
  Tambacu: REF_TAMBAQUI,
};

export function referenciaEspecie(nomeEspecie: string | null | undefined): ReferenciaEspecie | null {
  return (nomeEspecie ? REFERENCIAS_ESPECIE[nomeEspecie] : null) ?? null;
}

// Fontes citadas nas telas de indicadores
export const FONTES_REFERENCIA: { assunto: string; fonte: string }[] = [
  { assunto: "Curva de crescimento e tabela de arraçoamento do tambaqui", fonte: "Corrêa et al., Criação de tambaquis, Embrapa Amazônia Oriental, 2018 (Tabela 3)" },
  { assunto: "Engorda intensiva com aeração e conversão alimentar", fonte: "Izel et al., Produção intensiva de tambaqui em tanques escavados com aeração, Circular Técnica 39, Embrapa Amazônia Ocidental, 2013" },
  { assunto: "Qualidade da água (oxigênio, temperatura, pH, amônia)", fonte: "Corrêa et al., Embrapa Amazônia Oriental, 2018" },
];

// Uniformidade (peixes da amostra a até 10% da média) abaixo disto pede atenção na próxima transferência:
// regra prática do sistema, não uma referência publicada.
export const UNIFORMIDADE_BAIXA = 60;

// O resumo do lote escrito em frases curtas; `alerta` marca o que está pior que o esperado;
// `classificacao` diz se está normal, acima ou abaixo do esperado
export type Frase = { texto: string; alerta: boolean; classificacao?: Classificacao };

export function frasesLote(r: ResumoZootecnico, ref?: ReferenciaEspecie | null): Frase[] {
  const n = formatarNumero;
  if (r.semanaAtual === null) return [{ texto: "Ainda sem apontamento para calcular os indicadores.", alerta: false }];
  const frases: Frase[] = [];
  const g = textoPeso;

  if (r.pesoAtual !== null) {
    const cls = r.desvioPesoPct === null ? null : r.desvioPesoPct < -10 ? "abaixo" : r.desvioPesoPct > 10 ? "acima" : "normal";
    const padrao = r.padraoPeso === null ? "" : `; a curva da espécie espera ${g(r.padraoPeso)}`;
    frases.push({
      texto: `Na semana ${r.semanaAtual} de cultivo, peso médio de ${g(r.pesoAtual)}${padrao}${cls ? ` — ${ROTULO_CLASSIFICACAO[cls]}` : ""}.`,
      alerta: cls === "abaixo", classificacao: cls ?? undefined,
    });
  } else {
    frases.push({ texto: `Na semana ${r.semanaAtual} de cultivo, ainda sem peso: lance a biometria ou o peso do povoamento.`, alerta: false });
  }
  if (r.gpd !== null) {
    const cls = classificar(r.gpd, r.padraoGpd, Math.max(0.1, (r.padraoGpd ?? 0) * 0.1));
    const padrao = r.padraoGpd === null ? "" : ` (a curva previa ${n(r.padraoGpd, 1)} g/dia)`;
    frases.push({ texto: `Ganho de ${n(r.gpd, 1)} g por dia desde o povoamento${padrao}.`, alerta: cls === "abaixo", classificacao: cls ?? undefined });
  }
  if (r.biomassaKg !== null) {
    const despescado = r.kgDespescados ? `, mais ${n(r.kgDespescados, 0)} kg já despescados` : "";
    frases.push({ texto: `Biomassa estimada de ${n(r.biomassaKg, 0)} kg no viveiro${despescado}.`, alerta: false });
  }
  if (r.sobrevivencia !== null) {
    const cls = classificar(r.sobrevivencia, r.padraoSobrevivencia, 1);
    const padrao = r.padraoSobrevivencia === null ? "" : `; o padrão é ${n(r.padraoSobrevivencia, 1)}%`;
    frases.push({
      texto: `Sobrevivência de ${n(r.sobrevivencia, 1)}% (mortalidade acumulada de ${n(r.mortalidadeAcum, 2)}%)${padrao}${cls ? ` — ${ROTULO_CLASSIFICACAO[cls]}` : ""}.`,
      alerta: cls === "abaixo", classificacao: cls ?? undefined,
    });
  }
  if (r.conversao !== null && r.conversao > 0) {
    // conversão: quanto menos, melhor
    const cls = ref ? classificar(r.conversao, ref.conversao, ref.conversao * 0.1, true) : null;
    const refTexto = ref ? ` (referência Embrapa na engorda: ${n(ref.conversao, 2)})` : "";
    frases.push({
      texto: `Conversão alimentar de ${n(r.conversao, 2)} kg de ração por kg de peixe ganho${refTexto}${cls ? ` — ${ROTULO_CLASSIFICACAO[cls]}` : ""}.`,
      alerta: cls === "abaixo", classificacao: cls ?? undefined,
    });
  }
  if (r.taxaAlimentacao !== null) {
    const cls = classificar(r.taxaAlimentacao, r.padraoTaxa, Math.max(0.1, (r.padraoTaxa ?? 0) * 0.2));
    const padrao = r.padraoTaxa === null ? "" : `; a tabela pede ${n(r.padraoTaxa, 2)}%`;
    const texto = cls === "acima" ? "ração acima da tabela: confira a sobra de ração na água e a conversão"
      : cls === "abaixo" ? "ração abaixo da tabela: o peixe pode estar comendo menos (água, doença) ou a biomassa está superestimada"
      : null;
    frases.push({
      texto: `Ração da última semana: ${n(r.taxaAlimentacao, 2)}% do peso vivo por dia${padrao}${texto ? ` — ${texto}` : ""}.`,
      alerta: false, classificacao: cls ?? undefined,
    });
  }
  if (r.uniformidade !== null) {
    const baixa = r.uniformidade < UNIFORMIDADE_BAIXA;
    frases.push({
      texto: `Uniformidade da última biometria: ${n(r.uniformidade, 0)}% dos peixes a até 10% do peso médio${baixa ? " — lote desuniforme, vale separar por tamanho na próxima transferência" : ""}.`,
      alerta: baixa, classificacao: baixa ? "abaixo" : "normal",
    });
  }
  return frases;
}
