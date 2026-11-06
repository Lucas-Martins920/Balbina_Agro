import { idadeEquivalente, pesoEsperado } from "./crescimento.ts";
import { somarDias } from "./formato.ts";

// Motor do planejamento de lotes (Gestão > Planejamento). Funções puras, sem banco, testadas em planejamento.test.ts.
//
// Modelo: o lote é povoado com alevinos (ou juvenis) no viveiro de alevinagem, passa para a recria e depois para o
// viveiro de engorda, onde fica até a despesca. Cada fase pode ter 0 semanas (povoar juvenis direto na engorda, por
// exemplo). Cada viveiro, depois de esvaziado, pede o vazio sanitário (secar o fundo, calagem, encher de novo) antes de
// receber o próximo lote. Com isso a previsão diz quando transferir, quando cada viveiro libera, até quando povoar o
// lote que vai renovar cada viveiro de engorda e qual a próxima data possível para um lote novo.

export type Finalidade = "alevinagem" | "recria" | "engorda" | "alevinagem_recria";
export type Etapa = "alevinagem" | "recria" | "engorda";
export type Origem = "real" | "planejado" | "sugerido";

export type Parametros = {
  semanasAlevinagem: number;
  semanasRecria: number;
  semanasCultivo: number; // do povoamento à despesca total
  vazioAlevinagem: number;
  vazioRecria: number;
  vazioEngorda: number;
  intervaloSemanas: number;
  peixesPorLote: number | null;
  metaPeixes: number | null; // peixes em engorda que a piscicultura quer manter
  especieId: string | null;
  horizonteMeses: number;
  pesoPovoamentoG: number; // peso médio dos alevinos ou juvenis no povoamento: de onde a curva parte
  precoKg: number | null; // centavos por kg de peixe vendido
  racaoAlevinagemKg: number | null; // centavos por kg de ração em cada fase
  racaoRecriaKg: number | null;
  racaoEngordaKg: number | null;
  mortalidadeRecria: number; // % na alevinagem e na recria
  mortalidadeEngorda: number; // % na engorda
  perdaDespesca: number; // % do peixe despescado que não é vendido (fora do padrão, machucado)
};

// O manejo (semanas em cada fase, ciclo até a despesca, vazio de cada viveiro e cadência) é sempre o que a piscicultura
// cadastrar: não há prazo pré-preenchido, porque cada uma tem a sua realidade (sistema, densidade, aeração, mercado).
// Sem os parâmetros salvos o planejamento não projeta nada e pede o cadastro. Só as premissas do estudo de viabilidade
// nascem preenchidas, com os mesmos padrões do banco (planejamento_parametros).
export const PREMISSAS_INICIAIS = {
  horizonteMeses: 24,
  mortalidadeRecria: 15,
  mortalidadeEngorda: 5,
  perdaDespesca: 3,
  pesoPovoamentoG: 1,
};

// Referência técnica do tambaqui, mostrada só como dica ao lado dos campos (nunca pré-preenche). Fontes:
// Corrêa et al., "Criação de tambaquis", Embrapa Amazônia Oriental, 2018 (alevinos de 0,5 g chegam a 5 a 7 g em
// cerca de 30 dias) e Izel et al., Circular Técnica 39, Embrapa Amazônia Ocidental, 2013 (engorda em viveiro escavado
// com aeração de juvenis de 160 g a 2,62 kg em 10 meses). As semanas entre esses pontos saem da curva de referência.
export const REFERENCIA_MERCADO = {
  fonte: "Embrapa (Corrêa et al., 2018; Izel et al., 2013) e a curva de referência do tambaqui",
  alevinagem: "Referência: de 4 a 6 semanas, até os alevinos passarem de 5 g. Use 0 se o lote já chega como juvenil.",
  recria: "Referência: até os juvenis chegarem perto de 150 g, cerca de 16 semanas desde o alevino de 0,5 g. Use 0 se o lote vai da alevinagem direto para a engorda.",
  cultivo: "Referência: com aeração, de 160 g a 2,6 kg em cerca de 10 meses na engorda; peixe de 1,5 kg sai com uns 8 meses de cultivo.",
  vazio: "na prática, de 15 a 30 dias no viveiro escavado para secar o fundo, fazer a calagem e encher; tanque-rede pede só a limpeza",
};

export type Viveiro = { id: string; nome: string; finalidade: Finalidade; capacidade: number };

export type LoteEntrada = {
  id: string;
  codigo: string;
  origem: Origem;
  povoamento: string; // ISO
  peixes: number;
  especieId: string | null;
  fase?: string; // só nos reais
  previsaoDespesca?: string | null;
  viveirosAtuais?: string[]; // reais: onde o lote está hoje
  // planejados: viveiro escolhido para cada etapa (null = automático)
  viveiroAlevinagem?: string | null;
  viveiroRecria?: string | null;
  viveiroEngorda?: string | null;
};

export type Ocupacao = {
  viveiroId: string;
  loteId: string;
  codigo: string;
  origem: Origem;
  etapa: Etapa;
  inicio: string;
  fim: string; // dia em que o lote sai
  livre: string; // fim + vazio sanitário
};

export type Evento = {
  data: string;
  tipo: "povoamento" | "transferencia_recria" | "transferencia_engorda" | "despesca" | "viveiro_livre";
  codigo: string;
  origem: Origem;
  texto: string;
};

export type Conflito = { codigo: string; origem: Origem; texto: string };

export type LoteProjetado = LoteEntrada & {
  inicioRecria: string;
  inicioEngorda: string;
  despesca: string;
  etapas: { etapa: Etapa; viveiroId: string | null; inicio: string; fim: string }[];
};

// ---------------------------------------------------------------------------
// Datas como número de dias (UTC), para somar sem fuso
// ---------------------------------------------------------------------------

export function dia(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}
export function iso(n: number) {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}
export function somarMeses(data: string, meses: number) {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, 28))).toISOString().slice(0, 10);
}

export function papelViveiro(f: Finalidade): Etapa[] {
  if (f === "alevinagem") return ["alevinagem"];
  if (f === "recria") return ["recria"];
  if (f === "alevinagem_recria") return ["alevinagem", "recria"];
  return ["engorda"];
}

export function vazioDoViveiro(p: Parametros, f: Finalidade) {
  return f === "engorda" ? p.vazioEngorda : f === "recria" ? p.vazioRecria : p.vazioAlevinagem;
}

// Fases que o lote atravessa com o manejo informado: a engorda sempre; alevinagem e recria só com semanas
export function etapasDoCiclo(p: Parametros): Etapa[] {
  return (["alevinagem", "recria", "engorda"] as Etapa[]).filter((e) => e === "engorda" || (e === "alevinagem" ? p.semanasAlevinagem : p.semanasRecria) > 0);
}

// Datas de um lote a partir do povoamento e dos parâmetros
export function datasDoLote(p: Parametros, povoamento: string, previsaoDespesca?: string | null) {
  const inicioRecria = somarDias(povoamento, p.semanasAlevinagem * 7);
  const inicioEngorda = somarDias(povoamento, (p.semanasAlevinagem + p.semanasRecria) * 7);
  const despesca = previsaoDespesca && previsaoDespesca > inicioEngorda ? previsaoDespesca : somarDias(povoamento, p.semanasCultivo * 7);
  return { inicioRecria, inicioEngorda, despesca };
}

// ---------------------------------------------------------------------------
// Ocupação dos viveiros
// ---------------------------------------------------------------------------

export class Agenda {
  ocupacoes: Ocupacao[] = [];
  private p: Parametros;
  readonly viveiros: Viveiro[];
  constructor(p: Parametros, viveiros: Viveiro[]) {
    this.p = p;
    this.viveiros = viveiros;
  }

  viveiro(id: string) {
    return this.viveiros.find((g) => g.id === id);
  }

  // Livre de [inicio, fim) respeitando o vazio sanitário antes e depois de cada ocupação
  livre(viveiroId: string, inicio: string, fim: string, ignorarLote?: string) {
    const g = this.viveiro(viveiroId);
    if (!g) return false;
    const vazio = vazioDoViveiro(this.p, g.finalidade);
    return this.ocupacoes.every(
      (o) => o.viveiroId !== viveiroId || o.loteId === ignorarLote || dia(o.fim) + vazio <= dia(inicio) || dia(fim) + vazio <= dia(o.inicio),
    );
  }

  // Data em que o viveiro fica disponível depois de `apos` (última saída + vazio)
  disponivelEm(viveiroId: string, apos: string) {
    let d = apos;
    for (const o of this.ocupacoes.filter((x) => x.viveiroId === viveiroId)) if (o.livre > d && o.inicio <= d) d = o.livre;
    return d;
  }

  ocupar(viveiroId: string, lote: LoteEntrada, etapa: Etapa, inicio: string, fim: string) {
    const g = this.viveiro(viveiroId)!;
    this.ocupacoes.push({
      viveiroId, loteId: lote.id, codigo: lote.codigo, origem: lote.origem, etapa, inicio, fim,
      livre: somarDias(fim, vazioDoViveiro(this.p, g.finalidade)),
    });
  }

  // Viveiros que servem para a etapa e estão livres, os que cabem o lote primeiro
  candidatos(etapa: Etapa, inicio: string, fim: string, peixes: number) {
    return this.viveiros
      .filter((g) => papelViveiro(g.finalidade).includes(etapa) && this.livre(g.id, inicio, fim))
      .sort((a, b) => Number(b.capacidade >= peixes) - Number(a.capacidade >= peixes) || a.capacidade - b.capacidade || a.nome.localeCompare(b.nome));
  }
}

export const NOME_ETAPA: Record<Etapa, string> = { alevinagem: "Alevinagem", recria: "Recria", engorda: "Engorda" };
export const NOME_FINALIDADE: Record<Finalidade, string> = {
  alevinagem: "Alevinagem", alevinagem_recria: "Alevinagem e recria", recria: "Recria", engorda: "Engorda",
};

function formatarDia(d: string) {
  return d.split("-").reverse().join("/");
}

// Monta as etapas de um lote, ocupando os viveiros na agenda. Devolve conflitos quando falta viveiro.
function encaixar(agenda: Agenda, p: Parametros, lote: LoteEntrada, hoje: string, conflitos: Conflito[]): LoteProjetado {
  const { inicioRecria, inicioEngorda, despesca } = datasDoLote(p, lote.povoamento, lote.previsaoDespesca);
  type Trecho = { etapa: Etapa; inicio: string; fim: string; fixo: string | null };
  const trechos = ([
    { etapa: "alevinagem", inicio: lote.povoamento, fim: inicioRecria, fixo: lote.viveiroAlevinagem ?? null },
    { etapa: "recria", inicio: inicioRecria, fim: inicioEngorda, fixo: lote.viveiroRecria ?? null },
    { etapa: "engorda", inicio: inicioEngorda, fim: despesca, fixo: lote.viveiroEngorda ?? null },
  ] as Trecho[]).filter((t) => t.fim > t.inicio);

  // Lote real: as etapas que já passaram saem; a de hoje fica no viveiro onde ele está, mesmo se atrasada
  if (lote.origem === "real") {
    const atuais = (lote.viveirosAtuais ?? []).map((id) => agenda.viveiro(id)).filter((g): g is Viveiro => !!g);
    const atual: Etapa =
      lote.fase === "engorda" || atuais.some((g) => g.finalidade === "engorda") ? "engorda"
      : lote.fase === "recria" || atuais.some((g) => g.finalidade === "recria") ? "recria"
      : "alevinagem";
    const ordem: Etapa[] = ["alevinagem", "recria", "engorda"];
    for (const t of trechos) {
      if (ordem.indexOf(t.etapa) < ordem.indexOf(atual)) t.fim = t.inicio;
      if (t.etapa !== atual) continue;
      if (t.inicio > hoje) t.inicio = hoje;
      if (t.fim <= hoje) t.fim = somarDias(hoje, 1);
      t.fixo = (atuais.find((g) => papelViveiro(g.finalidade).includes(atual)) ?? atuais[0])?.id ?? null;
    }
    // a etapa seguinte começa quando a de hoje termina
    const i = trechos.findIndex((t) => t.etapa === atual);
    if (i >= 0) for (let j = i + 1; j < trechos.length; j++) if (trechos[j].inicio < trechos[j - 1].fim) trechos[j].inicio = trechos[j - 1].fim;
  }

  const etapas: LoteProjetado["etapas"] = [];
  let anterior: string | null = null;
  for (const t of trechos.filter((x) => x.fim > x.inicio)) {
    let escolhido: string | null = null;
    // viveiro de alevinagem e recria: o lote fica nele as duas etapas
    if (t.etapa === "recria" && anterior && agenda.viveiro(anterior)?.finalidade === "alevinagem_recria" && (!t.fixo || t.fixo === anterior)) {
      etapas[etapas.length - 1].fim = t.fim;
      const ult = agenda.ocupacoes.filter((o) => o.loteId === lote.id).at(-1)!;
      ult.fim = t.fim;
      ult.livre = somarDias(t.fim, vazioDoViveiro(p, "alevinagem_recria"));
      continue;
    }
    if (t.fixo) {
      escolhido = t.fixo;
      if (!agenda.livre(t.fixo, t.inicio, t.fim) && t.inicio >= hoje) {
        conflitos.push({ codigo: lote.codigo, origem: lote.origem, texto: `${agenda.viveiro(t.fixo)?.nome ?? "Viveiro"} não estará livre (com o vazio sanitário) para a ${NOME_ETAPA[t.etapa].toLowerCase()} em ${formatarDia(t.inicio)}.` });
      }
    } else if (t.fim > hoje) {
      escolhido = agenda.candidatos(t.etapa, t.inicio, t.fim, lote.peixes)[0]?.id ?? null;
      if (!escolhido) {
        const tem = agenda.viveiros.some((g) => papelViveiro(g.finalidade).includes(t.etapa));
        conflitos.push({
          codigo: lote.codigo, origem: lote.origem,
          texto: tem
            ? `Nenhum viveiro de ${NOME_ETAPA[t.etapa].toLowerCase()} livre em ${formatarDia(t.inicio)} contando o vazio sanitário.`
            : `A piscicultura não tem viveiro cadastrado com a finalidade ${NOME_ETAPA[t.etapa].toLowerCase()}.`,
        });
      } else if ((agenda.viveiro(escolhido)?.capacidade ?? 0) < lote.peixes) {
        conflitos.push({ codigo: lote.codigo, origem: lote.origem, texto: `${lote.peixes.toLocaleString("pt-BR")} peixes passam da capacidade de ${agenda.viveiro(escolhido)?.nome}.` });
      }
    }
    if (escolhido) agenda.ocupar(escolhido, lote, t.etapa, t.inicio, t.fim);
    etapas.push({ etapa: t.etapa, viveiroId: escolhido, inicio: t.inicio, fim: t.fim });
    anterior = escolhido;
  }
  return { ...lote, inicioRecria, inicioEngorda, despesca, etapas };
}

// Primeira data a partir de `desde` em que um lote novo cabe do povoamento à despesca
export function proximaJanela(agenda: Agenda, p: Parametros, desde: string, peixes: number, limiteDias = 730) {
  for (let i = 0; i <= limiteDias; i++) {
    const d = somarDias(desde, i);
    const { inicioRecria, inicioEngorda, despesca } = datasDoLote(p, d);
    let alevinagem: Viveiro | null = null;
    let recria: Viveiro | null = null;
    if (p.semanasAlevinagem > 0) {
      alevinagem = agenda.candidatos("alevinagem", d, inicioRecria, peixes)[0] ?? null;
      if (!alevinagem) continue;
    }
    if (p.semanasRecria > 0) {
      const junto = alevinagem?.finalidade === "alevinagem_recria";
      recria = junto ? alevinagem : agenda.candidatos("recria", inicioRecria, inicioEngorda, peixes)[0] ?? null;
      if (!recria) continue;
      if (junto && !agenda.livre(alevinagem!.id, d, inicioEngorda)) continue;
    }
    const engorda = agenda.candidatos("engorda", inicioEngorda, despesca, peixes)[0];
    if (!engorda) continue;
    return { data: d, alevinagem, recria, engorda };
  }
  return null;
}

export type Previsao = {
  lotes: LoteProjetado[];
  ocupacoes: Ocupacao[];
  eventos: Evento[];
  conflitos: Conflito[];
  renovacao: Renovacao[];
  inicio: string;
  fim: string;
};

export type Renovacao = {
  viveiro: Viveiro;
  atual: Ocupacao | null; // quem está (ou entra primeiro) no viveiro
  livreEm: string; // pronto para receber, já com o vazio
  povoarAte: string; // último dia para povoar os alevinos que vão para esse viveiro sem deixá-lo parado
  proximo: Ocupacao | null; // lote (planejado ou sugerido) que vai ocupar depois
  diasParado: number | null;
};

// O viveiro de engorda está atrasado quando a data de povoar a reposição passou e nenhum lote entra antes
// de ele liberar; urgente quando faltam até 30 dias e ainda não há reposição prevista.
export function situacaoRenovacao(r: Renovacao, hoje: string): "atrasada" | "urgente" | "em_dia" {
  if (r.povoarAte < hoje && (!r.proximo || r.proximo.inicio > r.livreEm)) return "atrasada";
  if (!r.proximo && dia(r.povoarAte) - dia(hoje) <= 30) return "urgente";
  return "em_dia";
}

export function prever(p: Parametros, viveiros: Viveiro[], reais: LoteEntrada[], planejados: LoteEntrada[], hoje: string, sugerir = true): Previsao {
  const agenda = new Agenda(p, viveiros);
  const conflitos: Conflito[] = [];
  const fim = somarMeses(hoje, p.horizonteMeses);
  const lotes: LoteProjetado[] = [];
  for (const l of [...reais].sort((a, b) => a.povoamento.localeCompare(b.povoamento))) lotes.push(encaixar(agenda, p, l, hoje, conflitos));
  for (const l of [...planejados].sort((a, b) => a.povoamento.localeCompare(b.povoamento))) lotes.push(encaixar(agenda, p, l, hoje, conflitos));

  // Sugestões na cadência da piscicultura, a partir do último lote povoado ou planejado. Só quando há viveiro para
  // a primeira fase do ciclo (a alevinagem, ou a recria ou a engorda quando o lote chega como juvenil).
  const primeira = etapasDoCiclo(p)[0];
  if (sugerir && viveiros.some((g) => papelViveiro(g.finalidade).includes(primeira))) {
    const ultimo = [...reais, ...planejados].map((l) => l.povoamento).sort().at(-1);
    let desde = ultimo ? somarDias(ultimo, p.intervaloSemanas * 7) : hoje;
    if (desde < hoje) desde = hoje;
    let n = 1;
    const capacidade = (e: Etapa) => Math.max(0, ...viveiros.filter((g) => papelViveiro(g.finalidade).includes(e)).map((g) => g.capacidade));
    const peixesBase = p.peixesPorLote ?? Math.min(capacidade(primeira) || Infinity, capacidade("engorda") || Infinity);
    while (desde <= fim && n <= 24) {
      const janela = proximaJanela(agenda, p, desde, peixesBase);
      if (!janela || janela.data > fim) break;
      const lote: LoteEntrada = {
        id: `sugerido-${n}`, codigo: `Sugestão ${n}`, origem: "sugerido", povoamento: janela.data,
        peixes: p.peixesPorLote ?? Math.min((janela.alevinagem ?? janela.recria ?? janela.engorda).capacidade, janela.engorda.capacidade),
        especieId: p.especieId,
        viveiroAlevinagem: janela.alevinagem?.id ?? null,
        viveiroRecria: janela.recria && janela.recria.id !== janela.alevinagem?.id ? janela.recria.id : null,
        viveiroEngorda: janela.engorda.id,
      };
      lotes.push(encaixar(agenda, p, lote, hoje, conflitos));
      desde = somarDias(janela.data, p.intervaloSemanas * 7);
      n++;
    }
  }

  const eventos: Evento[] = [];
  const nome = (id: string | null) => (id ? agenda.viveiro(id)?.nome ?? "?" : "viveiro a definir");
  for (const l of lotes) {
    const et = (e: Etapa) => l.etapas.find((x) => x.etapa === e);
    const al = et("alevinagem"), re = et("recria"), en = et("engorda");
    const primeiro = l.etapas[0];
    if (l.origem !== "real" && primeiro) {
      const quem = primeiro.etapa === "alevinagem" ? "alevinos" : "juvenis";
      eventos.push({ data: l.povoamento, tipo: "povoamento", codigo: l.codigo, origem: l.origem, texto: `Povoar ${l.peixes.toLocaleString("pt-BR")} ${quem} no ${nome(primeiro.viveiroId)}` });
    }
    if (re && al && re.viveiroId !== al.viveiroId) eventos.push({ data: re.inicio, tipo: "transferencia_recria", codigo: l.codigo, origem: l.origem, texto: `Transferir do ${nome(al.viveiroId)} para o ${nome(re.viveiroId)}` });
    const antes = re ?? al;
    if (en && antes && en.inicio > antes.inicio) eventos.push({ data: en.inicio, tipo: "transferencia_engorda", codigo: l.codigo, origem: l.origem, texto: `Transferir do ${nome(antes.viveiroId)} para o ${nome(en.viveiroId)}` });
    eventos.push({ data: l.despesca, tipo: "despesca", codigo: l.codigo, origem: l.origem, texto: `Despesca com ${Math.round((dia(l.despesca) - dia(l.povoamento)) / 7)} semanas de cultivo (${nome(en?.viveiroId ?? null)})` });
  }
  for (const o of agenda.ocupacoes) {
    const g = agenda.viveiro(o.viveiroId)!;
    eventos.push({ data: o.livre, tipo: "viveiro_livre", codigo: o.codigo, origem: o.origem, texto: `${g.nome} pronto para outro lote (${vazioDoViveiro(p, g.finalidade)} dias de vazio depois da saída do ${o.codigo})` });
  }
  const visiveis = eventos.filter((e) => e.data >= hoje && e.data <= fim).sort((a, b) => a.data.localeCompare(b.data) || a.codigo.localeCompare(b.codigo));

  // Renovação: para cada viveiro de engorda, quando libera e até quando povoar o lote que vai substituir
  const renovacao: Renovacao[] = viveiros.filter((g) => g.finalidade === "engorda").map((g) => {
    const doViveiro = agenda.ocupacoes.filter((o) => o.viveiroId === g.id).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const doLote = doViveiro.filter((o) => o.origem === "real");
    const atual = doLote.find((o) => o.fim > hoje) ?? null;
    const saida = atual?.livre ?? doLote.filter((o) => o.fim <= hoje).at(-1)?.livre ?? hoje;
    const livreEm = saida > hoje ? saida : hoje;
    const proximo = doViveiro.find((o) => o.origem !== "real" && o.inicio >= (atual?.fim ?? hoje)) ?? null;
    return {
      viveiro: g, atual, livreEm,
      povoarAte: somarDias(livreEm, -(p.semanasAlevinagem + p.semanasRecria) * 7),
      proximo,
      diasParado: proximo ? Math.max(0, dia(proximo.inicio) - dia(livreEm)) : null,
    };
  });

  return { lotes, ocupacoes: agenda.ocupacoes, eventos: visiveis, conflitos, renovacao, inicio: hoje, fim };
}

// ---------------------------------------------------------------------------
// Sugestão pela meta de peixes em engorda
// ---------------------------------------------------------------------------

export type SugestaoMeta = {
  lotesNaEngorda: number; // lotes na engorda ao mesmo tempo, um por viveiro de engorda
  viveiros: string[];
  peixesNaEngorda: number; // por lote, ao chegar na engorda
  peixesPorLote: number; // alevinos a povoar por lote, já com a mortalidade da alevinagem e da recria
  intervaloSemanas: number;
  alcancavel: number;
  avisos: string[];
};

// Quantos lotes, de quantos peixes e de quanto em quanto tempo povoar para manter a meta de peixes em engorda com os
// viveiros cadastrados. Cada lote ocupa um viveiro de engorda (o mesmo modelo da previsão); com N lotes revezando,
// um viveiro renova a cada (tempo na engorda + vazio) / N. É sugestão: a piscicultura aplica ou ajusta.
export function sugerirPelaMeta(p: Parametros, viveiros: Viveiro[]): SugestaoMeta {
  const meta = p.metaPeixes ?? 0;
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const avisos: string[] = [];
  const engorda = viveiros.filter((g) => papelViveiro(g.finalidade).includes("engorda")).sort((a, b) => b.capacidade - a.capacidade || a.nome.localeCompare(b.nome));
  const crescimento = p.semanasAlevinagem + p.semanasRecria;

  let n = engorda.length;
  for (let i = 1; i <= engorda.length; i++) {
    if (Math.ceil(meta / i) <= engorda[i - 1].capacidade) {
      n = i;
      break;
    }
  }
  const usados = engorda.slice(0, n);
  const menor = usados.length ? Math.min(...usados.map((g) => g.capacidade)) : 0;
  const peixesNaEngorda = Math.min(Math.ceil(meta / Math.max(n, 1)), menor);
  const alcancavel = Math.min(meta, peixesNaEngorda * n);
  if (!engorda.length) avisos.push("Cadastre os viveiros de engorda para calcular a sugestão.");
  else if (alcancavel < meta) avisos.push(`Os viveiros de engorda cadastrados comportam até ${fmt(alcancavel)} peixes com um lote por viveiro; a meta de ${fmt(meta)} pede mais viveiros.`);

  // a mortalidade da alevinagem e da recria só conta quando o lote passa por elas
  const mortalidade = crescimento > 0 ? Math.min(p.mortalidadeRecria, 99) / 100 : 0;
  const peixesPorLote = Math.ceil(peixesNaEngorda / (1 - mortalidade));

  let intervaloSemanas = Math.max(1, Math.floor(((p.semanasCultivo - crescimento) * 7 + p.vazioEngorda) / Math.max(n, 1) / 7));
  // Os viveiros das fases anteriores também precisam do vazio entre um lote e outro
  for (const [etapa, semanas, vazio] of [["alevinagem", p.semanasAlevinagem, p.vazioAlevinagem], ["recria", p.semanasRecria, p.vazioRecria]] as const) {
    if (semanas <= 0) continue;
    const daFase = viveiros.filter((g) => papelViveiro(g.finalidade).includes(etapa));
    const nome = NOME_ETAPA[etapa].toLowerCase();
    if (!daFase.length) {
      avisos.push(`Cadastre um viveiro de ${nome} para receber os lotes.`);
      continue;
    }
    const maior = Math.max(...daFase.map((g) => g.capacidade));
    if (etapa === "alevinagem" && peixesPorLote > maior) avisos.push(`Cada lote pede ${fmt(peixesPorLote)} alevinos e o maior viveiro de alevinagem comporta ${fmt(maior)}.`);
    const minimo = Math.ceil((semanas * 7 + vazio) / 7 / daFase.length);
    if (intervaloSemanas < minimo) {
      avisos.push(`Pelo ciclo da engorda o ideal seria um lote a cada ${intervaloSemanas} semanas, mas a ${nome} com o vazio só libera a cada ${minimo}; algum viveiro de engorda vai ficar parado entre lotes.`);
      intervaloSemanas = minimo;
    }
  }
  return { lotesNaEngorda: n, viveiros: usados.map((g) => g.nome), peixesNaEngorda, peixesPorLote, intervaloSemanas, alcancavel, avisos };
}

// ---------------------------------------------------------------------------
// Estudo de viabilidade
// ---------------------------------------------------------------------------

export type Categoria = "alevino" | "vacina" | "medicamento" | "racao" | "mao_obra" | "energia" | "embalagem" | "transporte" | "manutencao" | "outros";
export type FaseCusto = Etapa | "ciclo";
export type BaseCusto = "peixe" | "lote" | "mes" | "kg";

export type ItemCusto = {
  id: string;
  descricao: string;
  categoria: Categoria;
  fase: FaseCusto;
  base: BaseCusto;
  valor: number; // centavos
  semana: number | null; // semana de cultivo, para custo por peixe ou por lote
  vigenteDesde: string | null;
};

// Curva da espécie por semana de cultivo (curvas_crescimento): peso esperado e ração (g por peixe por dia ou % da biomassa)
export type CurvaSemana = { semana: number; pesoG: number | null; consumo: number | null; taxa: number | null };

export type Semana = {
  semana: number;
  data: string;
  fase: Etapa;
  peixes: number; // vivos no fim da semana
  pesoG: number;
  biomassaKg: number;
  racaoKg: number;
  kg: number; // kg vendáveis despescados na semana
  receita: number;
  custos: Partial<Record<Categoria, number>>;
};

export type Estudo = {
  semanas: Semana[];
  receita: number;
  kgDespescados: number; // vendáveis, já sem a perda da despesca
  peixesDespescados: number;
  pesoFinalG: number | null;
  racaoKg: number;
  conversao: number | null; // kg de ração por kg de biomassa ganha
  custos: Record<Categoria, number>;
  custoTotal: number;
  custoAteEngorda: number; // investimento até o lote entrar na engorda
  resultado: number;
  custoKg: number | null; // centavos por kg vendável: também o preço mínimo para o lote empatar
  payback: string | null; // data em que o caixa acumulado do lote volta a zero
  piorCaixa: number; // maior necessidade de capital
  faltando: string[]; // premissas sem valor
};

export const CATEGORIAS: Record<Categoria, string> = {
  alevino: "Alevinos", racao: "Ração", vacina: "Vacinas", medicamento: "Medicamentos e calagem", mao_obra: "Mão de obra",
  energia: "Energia e aeração", embalagem: "Gelo e embalagens", transporte: "Transporte", manutencao: "Manutenção", outros: "Outros",
};

const SEMANAS_MES = 52 / 12;

// Entre itens iguais (mesma descrição, categoria, fase e base) vale o de vigência mais recente até a data.
export function itensVigentes(itens: ItemCusto[], data: string) {
  const grupos = new Map<string, ItemCusto>();
  for (const i of itens) {
    if (i.vigenteDesde && i.vigenteDesde > data) continue;
    const chave = `${i.descricao.trim().toLowerCase()}|${i.categoria}|${i.fase}|${i.base}`;
    const atual = grupos.get(chave);
    if (!atual || (i.vigenteDesde ?? "") > (atual.vigenteDesde ?? "")) grupos.set(chave, i);
  }
  return [...grupos.values()];
}

// Simula o lote semana a semana, do povoamento à despesca total: mortalidade de cada fase, peso pela curva da espécie
// (partindo do peso do povoamento), ração pela curva (g por peixe por dia, ou % da biomassa), custos cadastrados e a
// venda do peixe na despesca. O custo do kg é o custo total sobre os kg vendáveis.
export function estudar(
  p: Parametros, povoamento: string, peixes: number, itens: ItemCusto[], curva: CurvaSemana[] = [], previsaoDespesca?: string | null,
): Estudo {
  const { despesca } = datasDoLote(p, povoamento, previsaoDespesca);
  const semAlev = p.semanasAlevinagem;
  const semRecria = p.semanasAlevinagem + p.semanasRecria;
  const total = Math.max(semRecria + 1, Math.round((dia(despesca) - dia(povoamento)) / 7));
  const pesos = curva.filter((c) => c.pesoG !== null).map((c) => ({ semana: c.semana, peso_g: c.pesoG }));
  const porSemana = new Map(curva.map((c) => [c.semana, c]));
  const ultimaDaCurva = curva.reduce((m, c) => Math.max(m, c.semana), 0);
  const idade0 = pesos.length ? idadeEquivalente(pesos, p.pesoPovoamentoG) ?? 0 : 0;
  const pesoEm = (dias: number) => (pesos.length ? pesoEsperado(pesos, p.pesoPovoamentoG, dias) ?? p.pesoPovoamentoG : p.pesoPovoamentoG);
  const custos = Object.fromEntries(Object.keys(CATEGORIAS).map((c) => [c, 0])) as Record<Categoria, number>;
  const semanas: Semana[] = [];
  let receita = 0, kgDespescados = 0, racaoTotal = 0, custoAteEngorda = 0, caixa = 0, piorCaixa = 0;
  let payback: string | null = null;
  const faltando = new Set<string>();
  if (!pesos.length) faltando.add("curva de crescimento da espécie");

  const mortR = semRecria > 0 ? p.mortalidadeRecria / 100 : 0;
  const mortE = p.mortalidadeEngorda / 100;
  const peixesFimRecria = peixes * (1 - mortR);
  const semanasEngorda = Math.max(1, total - semRecria);
  // semana em que cada fase começa (uma fase sem semanas "começa" na seguinte)
  const inicioFase: Record<FaseCusto, number> = { ciclo: 1, alevinagem: 1, recria: semAlev + 1, engorda: semRecria + 1 };

  for (let s = 1; s <= total; s++) {
    const data = somarDias(povoamento, (s - 1) * 7);
    const fase: Etapa = s <= semAlev ? "alevinagem" : s <= semRecria ? "recria" : "engorda";
    const vivos = fase === "engorda"
      ? peixesFimRecria * (1 - (mortE * (s - semRecria)) / semanasEngorda)
      : peixes * (1 - (mortR * s) / semRecria);
    const vivosInicio = s === 1 ? peixes : semanas[s - 2].peixes;
    const pesoInicio = pesoEm((s - 1) * 7);
    const pesoFim = pesoEm(s * 7);
    // ração da semana: consumo da curva na idade equivalente do lote, sobre os peixes médios da semana
    const linhaCurva = porSemana.get(Math.min(Math.floor((idade0 + (s - 1) * 7) / 7) + 1, ultimaDaCurva || 1));
    const peixesMedios = (vivosInicio + vivos) / 2;
    const pesoMedio = (pesoInicio + pesoFim) / 2;
    const gramasDia = linhaCurva?.consumo ?? (linhaCurva?.taxa !== null && linhaCurva?.taxa !== undefined ? (pesoMedio * linhaCurva.taxa) / 100 : 0);
    const racaoKg = (peixesMedios * gramasDia * 7) / 1000;
    racaoTotal += racaoKg;
    const precoRacao = fase === "alevinagem" ? p.racaoAlevinagemKg : fase === "recria" ? p.racaoRecriaKg : p.racaoEngordaKg;
    if (precoRacao === null && racaoKg > 0) faltando.add(`preço da ração de ${NOME_ETAPA[fase].toLowerCase()}`);
    const linha: Semana = { semana: s, data, fase, peixes: vivos, pesoG: pesoFim, biomassaKg: (vivos * pesoFim) / 1000, racaoKg, kg: 0, receita: 0, custos: {} };
    const somar = (c: Categoria, v: number) => {
      if (!v) return;
      linha.custos[c] = (linha.custos[c] ?? 0) + v;
    };
    somar("racao", Math.round(racaoKg * (precoRacao ?? 0)));

    // despesca total na última semana: o peixe vendável sai pelo preço do kg
    if (s === total) {
      linha.kg = linha.biomassaKg * (1 - p.perdaDespesca / 100);
      kgDespescados = linha.kg;
      if (p.precoKg === null) faltando.add("preço do kg do peixe");
      linha.receita = Math.round(linha.kg * (p.precoKg ?? 0));
      receita = linha.receita;
    }

    for (const i of itensVigentes(itens, data)) {
      if (i.base === "peixe" || i.base === "lote") {
        if (s !== (i.semana ?? inicioFase[i.fase])) continue;
        somar(i.categoria, i.base === "lote" ? i.valor : i.valor * (s === 1 ? peixes : Math.round(vivosInicio)));
      } else if (i.base === "mes") {
        if (i.fase === "ciclo" || i.fase === fase) somar(i.categoria, Math.round(i.valor / SEMANAS_MES));
      } else if (i.base === "kg" && linha.kg > 0) {
        somar(i.categoria, Math.round(i.valor * linha.kg));
      }
    }

    const gasto = Object.values(linha.custos).reduce((a, b) => a + (b ?? 0), 0);
    for (const [c, v] of Object.entries(linha.custos)) custos[c as Categoria] += v ?? 0;
    if (fase !== "engorda") custoAteEngorda += gasto;
    caixa += linha.receita - gasto;
    if (caixa < piorCaixa) piorCaixa = caixa;
    if (payback === null && caixa >= 0 && piorCaixa < 0) payback = data;
    semanas.push(linha);
  }
  if (!itens.some((i) => i.categoria === "alevino")) faltando.add("custo do alevino");

  const ultima = semanas.at(-1);
  const ganhoKg = (ultima?.biomassaKg ?? 0) - (peixes * p.pesoPovoamentoG) / 1000;
  const custoTotal = Object.values(custos).reduce((a, b) => a + b, 0);
  return {
    semanas, receita, kgDespescados,
    peixesDespescados: ultima?.peixes ?? 0,
    pesoFinalG: pesos.length ? ultima?.pesoG ?? null : null,
    racaoKg: racaoTotal,
    conversao: ganhoKg > 0 && racaoTotal > 0 ? racaoTotal / ganhoKg : null,
    custos, custoTotal, custoAteEngorda,
    resultado: receita - custoTotal,
    custoKg: kgDespescados > 0 ? custoTotal / kgDespescados : null,
    payback, piorCaixa, faltando: [...faltando],
  };
}

// Fluxo mensal (a partir de `desde`) somando as semanas de vários estudos
export function fluxoMensal(estudos: Estudo[], desde: string, ate: string) {
  const meses = new Map<string, { entradas: number; saidas: number; kg: number }>();
  for (let m = desde.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(`${m}-01`, 1).slice(0, 7)) meses.set(m, { entradas: 0, saidas: 0, kg: 0 });
  for (const e of estudos) {
    for (const s of e.semanas) {
      if (s.data < desde || s.data > ate) continue;
      const v = meses.get(s.data.slice(0, 7));
      if (!v) continue;
      v.entradas += s.receita;
      v.kg += s.kg;
      v.saidas += Object.values(s.custos).reduce((a, b) => a + (b ?? 0), 0);
    }
  }
  return [...meses.entries()].map(([mes, v]) => ({ mes, ...v }));
}

// Peixes em cada etapa no dia 15 de cada mês, somando lotes reais, planejados e sugeridos
export function peixesPorMes(lotes: LoteProjetado[], desde: string, ate: string) {
  const meses: { mes: string; alevinagem: number; recria: number; engorda: number }[] = [];
  for (let m = desde.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(`${m}-01`, 1).slice(0, 7)) {
    const data = `${m}-15`;
    const linha = { mes: m, alevinagem: 0, recria: 0, engorda: 0 };
    for (const l of lotes) {
      const e = l.etapas.find((x) => x.inicio <= data && data < x.fim);
      if (e) linha[e.etapa] += l.peixes;
    }
    meses.push(linha);
  }
  return meses;
}
