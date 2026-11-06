// Converte as respostas da API do NIBO (api.nibo.com.br/empresas/v1) no pacote de importação.
// Os nomes dos campos seguem nibo.readme.io; os valores de "type" não são documentados, por isso
// o sentido das categorias vem primeiro do uso (agendamento de débito = saída, de crédito = entrada).
import {
  centavos, dataIso, documento, grupoPeloNome, tipoContaPeloNome,
  type BaixaImportada, type CategoriaImportada, type ContaImportada, type ContatoImportado, type Pacote, type Sentido, type TipoContato,
  type TituloImportado, type TransferenciaImportada,
} from "./importacao.ts";
import { semAcento } from "./formato.ts";

type Ref = { id?: string; name?: string };
export type NiboCategoria = { id: string; name: string; type?: string; group?: Ref; subgroupId?: string; subgroupName?: string };
export type NiboCentro = { costCenterId: string; description: string };
export type NiboConta = {
  id: string; name: string; type?: string; openBalance?: number; dateOfOpenBalance?: string; isArchived?: boolean;
  bankNumber?: number | string; bankAgency?: string; bankAccount?: string; bankAccountVerificationNumber?: number | string;
};
export type NiboPessoa = {
  id: string; name: string; email?: string; phone?: string; isArchived?: boolean; isDeleted?: boolean;
  document?: { number?: string; type?: string };
  communication?: { email?: string; phone?: string; cellPhone?: string };
  address?: { line1?: string; line2?: string; number?: string | number; district?: string; city?: string; state?: string; zipCode?: string };
};
type NiboRateio = { categoryId?: string; id?: string; categoryName?: string; value?: number; parent?: string };
type NiboRateioCc = { costCenterId?: string; costCenterDescription?: string; value?: number; percent?: number };
export type NiboAgendamento = {
  scheduleId: string; dueDate?: string; accrualDate?: string; value?: number; description?: string; reference?: string;
  isPaid?: boolean; paidValue?: number; DeleteDate?: string | null; deleteDate?: string | null;
  stakeholder?: { id?: string; name?: string; cpfCnpj?: string; type?: string };
  categories?: NiboRateio[]; costCenters?: NiboRateioCc[];
};
export type NiboLancamento = {
  entryId: string; scheduleId?: string; date?: string; accrualDate?: string; value?: number; description?: string; reference?: string;
  isTransfer?: boolean; account?: Ref; stakeholder?: Ref; categories?: NiboRateio[]; category?: Ref;
  costCenters?: NiboRateioCc[]; costCenter?: { costCenterId?: string; description?: string };
};

// Saldo atual de cada conta (accounts/views/balance)
export type NiboSaldo = { accountId: string; accountName?: string; balance?: number };
// Linha do extrato de uma conta (accounts/{id}/views/statement): é o razão da conta no NIBO
export type NiboExtrato = {
  entryId: string; scheduleId?: string; stakeholderId?: string; stakeholderName?: string; description?: string;
  value?: number; date?: string; createDate?: string; currentBalance?: number; isTransfer?: boolean; type?: string;
  isReconciliated?: boolean;
};
// Lançamento do banco ainda não conciliado no NIBO (accounts/{id}/reconciliation)
export type NiboPendente = { accountEntry?: { accountId?: string; id?: string; value?: number; date?: string; description?: string } };

export type DadosNibo = {
  categorias: NiboCategoria[]; centros: NiboCentro[]; contas: NiboConta[];
  clientes: NiboPessoa[]; fornecedores: NiboPessoa[];
  debitos: NiboAgendamento[]; creditos: NiboAgendamento[];
  pagamentos: NiboLancamento[]; recebimentos: NiboLancamento[];
  // a partir daqui, só quando a leitura traz extrato e saldos (importação completa)
  desde?: string;
  saldos?: NiboSaldo[];
  extratos?: Record<string, NiboExtrato[]>;
  pendentes?: Record<string, NiboPendente[]>;
  avisos?: string[];
  diag?: Record<string, DiagnosticoConta>;
};

// O que o NIBO devolveu para cada conta, para entender uma diferença de saldo sem acesso ao NIBO
export type DiagnosticoConta = {
  saldo_informado: boolean; extrato_linhas: number; extrato_chaves?: string[]; extrato_campos?: string[]; extrato_erro?: string;
  pendentes?: number; pendentes_erro?: string;
  // como as linhas do extrato se parecem: quantas aparecem nos pagamentos/recebimentos, quantas são
  // transferência, negativas ou conciliadas, que "type" vêm e o saldo corrente da última linha
  extrato_nas_listas?: number; extrato_transferencias?: number; extrato_negativas?: number;
  extrato_conciliadas?: number; extrato_tipos?: string[]; extrato_ultimo_saldo?: number;
  listas_linhas?: number;
};

// Completa o diagnóstico de cada conta com o perfil das linhas do extrato.
export function diagnosticarNibo(d: DadosNibo): void {
  const ids = new Set([...d.pagamentos, ...d.recebimentos].map((l) => l.entryId));
  for (const c of d.contas) {
    const diag = (d.diag ??= {})[c.id] ??= { saldo_informado: (d.saldos ?? []).some((x) => x.accountId === c.id), extrato_linhas: 0 };
    const linhas = d.extratos?.[c.id] ?? [];
    diag.listas_linhas = [...d.pagamentos, ...d.recebimentos].filter((l) => l.account?.id === c.id).length;
    if (!linhas.length) continue;
    diag.extrato_nas_listas = linhas.filter((e) => ids.has(e.entryId)).length;
    diag.extrato_transferencias = linhas.filter((e) => e.isTransfer).length;
    diag.extrato_negativas = linhas.filter((e) => (e.value ?? 0) < 0).length;
    diag.extrato_conciliadas = linhas.filter(conciliadoNoNibo).length;
    diag.extrato_tipos = [...new Set(linhas.map((e) => String(e.type ?? "")))].slice(0, 10);
    const ultima = [...linhas].filter((e) => e.currentBalance != null)
      .sort((a, b) => `${dataIso(a.date)}${a.createDate ?? ""}`.localeCompare(`${dataIso(b.date)}${b.createDate ?? ""}`)).at(-1);
    if (ultima) diag.extrato_ultimo_saldo = centavos(ultima.currentBalance!);
  }
}

// Sinal de uma linha do extrato: pela lista em que o lançamento aparece (pagamentos saem,
// recebimentos entram), depois pelo sinal do valor e por último pelo "type".
export function sinalExtrato(e: NiboExtrato, saidas: Set<string>, entradas: Set<string>): 1 | -1 {
  if (saidas.has(e.entryId)) return -1;
  if (entradas.has(e.entryId)) return 1;
  if ((e.value ?? 0) < 0) return -1;
  return /debit|debito|saida|pagamento|payment|out/.test(semAcento(e.type ?? "")) ? -1 : 1;
}

function idsPorSentido(d: DadosNibo) {
  return { saidas: new Set(d.pagamentos.map((l) => l.entryId)), entradas: new Set(d.recebimentos.map((l) => l.entryId)) };
}

// Valor de cada linha do extrato em centavos, com sinal (positivo entra, negativo sai)
export function extratoComSinal(d: DadosNibo): Record<string, { e: NiboExtrato; data: string; valor: number }[]> {
  const { saidas, entradas } = idsPorSentido(d);
  const saida: Record<string, { e: NiboExtrato; data: string; valor: number }[]> = {};
  for (const [conta, linhas] of Object.entries(d.extratos ?? {})) {
    saida[conta] = linhas.flatMap((e) => {
      const data = dataIso(e.date);
      const valor = Math.abs(centavos(e.value ?? 0)) * sinalExtrato(e, saidas, entradas);
      return data && valor && (!d.desde || data >= d.desde) ? [{ e, data, valor }] : [];
    });
  }
  return saida;
}

// Movimentos de cada conta no NIBO desde "desde", em centavos com sinal, pelos pagamentos (saem) e
// recebimentos (entram) lançados nela, transferências incluídas: é a mesma fonte que a importação usa.
// O extrato da conta fica só para comparar (o sinal das linhas dele não é confiável).
export function movimentosNibo(d: DadosNibo): Record<string, { fonte: "pagamentos e recebimentos"; linhas: { data: string; valor: number }[]; extrato_cents?: number }> {
  const extrato = extratoComSinal(d);
  const listas: Record<string, { data: string; valor: number }[]> = {};
  for (const [lista, sinal] of [[d.pagamentos, -1], [d.recebimentos, 1]] as const) {
    for (const l of lista) {
      const data = dataIso(l.date);
      const valor = Math.abs(centavos(l.value ?? 0));
      const conta = l.account?.id;
      if (!conta || !data || !valor || (d.desde && data < d.desde)) continue;
      (listas[conta] ??= []).push({ data, valor: valor * sinal });
    }
  }
  const saida: ReturnType<typeof movimentosNibo> = {};
  for (const c of d.contas) {
    saida[c.id] = {
      fonte: "pagamentos e recebimentos", linhas: listas[c.id] ?? [],
      extrato_cents: extrato[c.id]?.length ? extrato[c.id].reduce((t, l) => t + l.valor, 0) : undefined,
    };
  }
  return saida;
}

function sentidoPeloTipo(tipo: string | undefined): Sentido | undefined {
  const t = semAcento(tipo ?? "");
  if (/^(in|credit|credito|receita|entrada|income|revenue)/.test(t)) return "entrada";
  if (/^(out|debit|debito|despesa|saida|expense|custo)/.test(t)) return "saida";
  return undefined;
}

function pessoa(p: NiboPessoa, tipo: TipoContato): ContatoImportado | undefined {
  if (p.isDeleted || !p.name?.trim()) return undefined;
  const a = p.address ?? {};
  const endereco: Record<string, string> = {};
  if (a.line1) endereco.logradouro = a.line1;
  if (a.number != null && String(a.number) !== "0") endereco.numero = String(a.number);
  if (a.line2) endereco.complemento = a.line2;
  if (a.district) endereco.bairro = a.district;
  if (a.zipCode) endereco.cep = a.zipCode.replace(/\D/g, "");
  return {
    chave: `pessoa:${p.id}`, nome: p.name.trim(), tipos: [tipo], cpf_cnpj: documento(p.document?.number),
    email: p.email || p.communication?.email || undefined,
    telefone: p.phone || p.communication?.cellPhone || p.communication?.phone || undefined,
    cidade: a.city || undefined, uf: a.state && a.state.length === 2 ? a.state.toUpperCase() : undefined, endereco,
  };
}

// Rateio por categoria; centro de custo só quando o agendamento tem um único centro.
function rateio(itens: NiboRateio[] | undefined, centros: NiboRateioCc[] | undefined, total: number, cats: Map<string, NiboCategoria>) {
  const cc = (centros ?? []).filter((c) => c.costCenterDescription);
  const centro = cc.length === 1 ? cc[0].costCenterDescription : undefined;
  return (itens ?? [])
    .map((r) => {
      const cat = cats.get(r.categoryId ?? r.id ?? "");
      const valor = Math.abs(centavos(r.value ?? 0)) || ((itens ?? []).length === 1 ? total : 0);
      return {
        categoria: cat?.name ?? r.categoryName ?? "Importado sem categoria",
        categoria_pai: cat?.subgroupName ?? undefined,
        centro_custo: centro,
        valor_cents: valor,
      };
    })
    .filter((r) => r.valor_cents > 0);
}

export function pacoteNibo(d: DadosNibo): Pacote {
  const cats = new Map(d.categorias.map((c) => [c.id, c]));

  // sentido de cada categoria pelo uso; sem uso, pelo "type" ou pelo grupo
  const uso = new Map<string, Sentido>();
  for (const [lista, s] of [[d.debitos, "saida"], [d.creditos, "entrada"]] as const) {
    for (const a of lista) for (const r of a.categories ?? []) uso.set(r.categoryId ?? r.id ?? "", s);
  }
  for (const [lista, s] of [[d.pagamentos, "saida"], [d.recebimentos, "entrada"]] as const) {
    for (const l of lista) for (const r of l.categories ?? []) if (!uso.has(r.categoryId ?? r.id ?? "")) uso.set(r.categoryId ?? r.id ?? "", s);
  }

  const categorias: CategoriaImportada[] = [];
  const sentidoDe = (c: NiboCategoria): Sentido => {
    const grupo = grupoPeloNome(c.group?.name);
    return uso.get(c.id) ?? sentidoPeloTipo(c.type) ?? (grupo === "receita_operacional" ? "entrada" : "saida");
  };
  for (const c of d.categorias) {
    if (!c.name?.trim()) continue;
    const sentido = sentidoDe(c);
    const grupo = grupoPeloNome(c.group?.name);
    const pai = c.subgroupName?.trim() && semAcento(c.subgroupName) !== semAcento(c.name) ? c.subgroupName.trim() : undefined;
    if (pai) categorias.push({ nome: pai, sentido, grupo });
    categorias.push({ nome: c.name.trim(), sentido, grupo, pai });
  }

  // Saldo inicial: só trazemos os lançamentos a partir de "desde", então o saldo de abertura é o saldo
  // de hoje no NIBO menos o que se movimentou no período. Sem o saldo de hoje, fica a abertura do NIBO.
  // (Depois de importar, fixar_saldos_importacao acerta a abertura pelo que o Balbina de fato movimentou.)
  const movimentos = movimentosNibo(d);
  const saldoAtual = new Map((d.saldos ?? []).map((x) => [x.accountId, x.balance]));
  const contas: ContaImportada[] = d.contas.map((c) => {
    const atual = saldoAtual.get(c.id);
    const doPeriodo = d.saldos ? movimentos[c.id].linhas.reduce((t, l) => t + l.valor, 0) : undefined;
    const abertura = d.desde && atual != null && doPeriodo != null
      ? { saldo_inicial_cents: centavos(atual) - doPeriodo, saldo_inicial_data: d.desde }
      : { saldo_inicial_cents: c.openBalance != null ? Math.round(c.openBalance * 100) : undefined, saldo_inicial_data: dataIso(c.dateOfOpenBalance) };
    return {
      chave: c.id, nome: c.name.trim(), tipo: tipoContaPeloNome(c.type, c.name),
      banco_codigo: c.bankNumber ? String(c.bankNumber).padStart(3, "0") : undefined,
      agencia: c.bankAgency || undefined, conta: c.bankAccount || undefined,
      conta_dv: c.bankAccountVerificationNumber != null ? String(c.bankAccountVerificationNumber) : undefined,
      ...abertura, arquivada: !!c.isArchived,
    };
  });

  const contatos = [
    ...d.clientes.map((p) => pessoa(p, "cliente")),
    ...d.fornecedores.map((p) => pessoa(p, "fornecedor")),
  ].filter((c): c is ContatoImportado => !!c);

  // baixas: pagamentos e recebimentos ligados ao agendamento
  const baixasPorAgendamento = new Map<string, BaixaImportada[]>();
  const avulsos: { l: NiboLancamento; tipo: "pagar" | "receber" }[] = [];
  const transfSaidas: NiboLancamento[] = [];
  const transfEntradas: NiboLancamento[] = [];
  const agendados = new Set([...d.debitos, ...d.creditos].map((a) => a.scheduleId));
  for (const [lista, tipo] of [[d.pagamentos, "pagar"], [d.recebimentos, "receber"]] as const) {
    for (const l of lista) {
      if (l.isTransfer) { (tipo === "pagar" ? transfSaidas : transfEntradas).push(l); continue; }
      const data = dataIso(l.date);
      const valor = Math.abs(centavos(l.value ?? 0));
      if (!data || !valor) continue;
      if (l.scheduleId && agendados.has(l.scheduleId)) {
        const b = baixasPorAgendamento.get(l.scheduleId) ?? [];
        b.push({ chave: `lancamento:${l.entryId}`, conta_chave: l.account?.id, conta: l.account?.name, data, valor_cents: valor });
        baixasPorAgendamento.set(l.scheduleId, b);
      } else {
        avulsos.push({ l, tipo });
      }
    }
  }

  const titulos: TituloImportado[] = [];
  for (const [lista, tipo] of [[d.debitos, "pagar"], [d.creditos, "receber"]] as const) {
    for (const a of lista) {
      if (a.DeleteDate || a.deleteDate) continue;
      const vencimento = dataIso(a.dueDate);
      const valor = Math.abs(centavos(a.value ?? 0));
      if (!vencimento || !valor) continue;
      titulos.push({
        chave: `agendamento:${a.scheduleId}`, tipo, descricao: a.description?.trim() || a.stakeholder?.name || "",
        contato_chave: a.stakeholder?.id ? `pessoa:${a.stakeholder.id}` : undefined, contato: a.stakeholder?.name,
        vencimento, competencia: dataIso(a.accrualDate), valor_cents: valor, referencia: a.reference || undefined,
        rateio: rateio(a.categories, a.costCenters, valor, cats),
        baixas: baixasPorAgendamento.get(a.scheduleId) ?? [],
      });
    }
  }
  // transferência: a saída de uma conta casa com a entrada de mesmo valor e data em outra conta
  const transferencias: TransferenciaImportada[] = [];
  const porId = (a: NiboLancamento, b: NiboLancamento) => a.entryId.localeCompare(b.entryId);
  const livres = [...transfEntradas].sort(porId);
  for (const s of transfSaidas.sort(porId)) {
    const data = dataIso(s.date);
    const valor = Math.abs(centavos(s.value ?? 0));
    const i = livres.findIndex((e) => dataIso(e.date) === data && Math.abs(centavos(e.value ?? 0)) === valor && e.account?.id !== s.account?.id);
    if (i < 0 || !data || !valor) { avulsos.push({ l: s, tipo: "pagar" }); continue; }
    const e = livres.splice(i, 1)[0];
    transferencias.push({
      chave: `transferencia:${s.entryId}:${e.entryId}`, origem_chave: s.account?.id, origem: s.account?.name,
      destino_chave: e.account?.id, destino: e.account?.name, data, valor_cents: valor, descricao: s.description || undefined,
      lancamentos: [s.entryId, e.entryId],
    });
  }

  // transferência sem par (a outra conta não veio do NIBO): o dinheiro saiu ou entrou nesta conta mesmo
  for (const e of livres) avulsos.push({ l: e, tipo: "receber" });

  // lançamento feito direto no extrato, sem agendamento: vira título já quitado
  for (const { l, tipo } of avulsos) {
    const data = dataIso(l.date);
    const valor = Math.abs(centavos(l.value ?? 0));
    if (!data || !valor) continue;
    const itens = l.categories?.length ? l.categories : l.category?.id ? [{ categoryId: l.category.id, categoryName: l.category.name, value: l.value }] : [];
    const centros = l.costCenters?.length ? l.costCenters
      : l.costCenter?.description ? [{ costCenterDescription: l.costCenter.description }] : [];
    titulos.push({
      chave: `lancamento:${l.entryId}`, chaves_extras: l.scheduleId ? [`agendamento:${l.scheduleId}`] : undefined,
      tipo, descricao: l.description?.trim() || l.stakeholder?.name || (l.isTransfer ? "Transferência" : ""),
      contato_chave: l.stakeholder?.id ? `pessoa:${l.stakeholder.id}` : undefined, contato: l.stakeholder?.name,
      vencimento: data, competencia: dataIso(l.accrualDate), valor_cents: valor, referencia: l.reference || undefined,
      rateio: rateio(itens, centros, valor, cats),
      baixas: [{ chave: `lancamento:${l.entryId}`, conta_chave: l.account?.id, conta: l.account?.name, data, valor_cents: valor }],
    });
  }

  return {
    origem: "nibo",
    categorias,
    centros_custo: d.centros.filter((c) => c.description?.trim()).map((c) => ({ nome: c.description.trim() })),
    contas, contatos, titulos, transferencias,
  };
}

// O que a sincronização precisa saber do pacote: as chaves dos títulos, e conta, data e valor de cada
// baixa e transferência (o que mudou no NIBO sai do Balbina e entra de novo, certo).
export function chavesSincronizacao(p: Pacote, desde: string) {
  return {
    desde,
    titulos: (p.titulos ?? []).flatMap((t) => [t.chave, ...(t.chaves_extras ?? [])]),
    baixas: (p.titulos ?? []).flatMap((t) => (t.baixas ?? []).filter((b) => b.chave)
      .map((b) => ({ chave: b.chave, conta_chave: b.conta_chave, data: b.data, valor_cents: b.valor_cents }))),
    transferencias: (p.transferencias ?? []).map((t) => ({
      chave: t.chave, origem_chave: t.origem_chave, destino_chave: t.destino_chave, data: t.data, valor_cents: t.valor_cents,
    })),
  };
}

// Conciliação do NIBO por conta: o que já está conciliado lá entra conciliado aqui, ligado à baixa ou
// à transferência importada; o que o banco mandou e ainda não foi conciliado entra como pendente.
export type MovimentoConciliacao = {
  id_externo: string; data: string; descricao: string; valor_cents: number;
  baixa_chave?: string; lancamento?: string; transferencia?: boolean;
};
export type ConciliacaoConta = { conta_chave: string; conciliados: MovimentoConciliacao[]; pendentes: MovimentoConciliacao[] };

// O NIBO marca a linha conciliada; o nome do campo variou entre versões da API.
export function conciliadoNoNibo(e: NiboExtrato): boolean {
  const x = e as NiboExtrato & Record<string, unknown>;
  return [x.isReconciliated, x.isReconciled, x.reconciliated, x.reconciled, x.isConciliated, x.conciliated].some((v) => v === true);
}

export function conciliacaoNibo(d: DadosNibo): ConciliacaoConta[] {
  const extrato = extratoComSinal(d);
  const contas = new Set([...Object.keys(extrato), ...Object.keys(d.pendentes ?? {})]);
  return [...contas].map((conta) => ({
    conta_chave: conta,
    conciliados: (extrato[conta] ?? []).filter((l) => conciliadoNoNibo(l.e)).map(({ e, data, valor }) => ({
      id_externo: `nibo:${e.entryId}`, data, valor_cents: valor,
      descricao: e.description?.trim() || e.stakeholderName || (e.isTransfer ? "Transferência" : "Lançamento do NIBO"),
      // transferência sem par entrou como lançamento: tenta a baixa e depois a transferência
      baixa_chave: `lancamento:${e.entryId}`, ...(e.isTransfer ? { lancamento: e.entryId, transferencia: true } : {}),
    })),
    pendentes: (d.pendentes?.[conta] ?? []).flatMap((p) => {
      const a = p.accountEntry ?? {};
      const data = dataIso(a.date);
      const valor = centavos(a.value ?? 0);
      return a.id && data && valor ? [{ id_externo: `nibo-banco:${a.id}`, data, valor_cents: valor, descricao: a.description?.trim() || "Lançamento do banco" }] : [];
    }),
  })).filter((c) => c.conciliados.length || c.pendentes.length);
}

// Auditoria: saldo de hoje e total de cada dia, NIBO x Balbina, conta por conta.
export type AuditoriaConta = {
  conta: string; nibo_cents: number | null; balbina_cents: number; diferenca_cents: number | null;
  lancamentos_nibo: number; dias: { data: string; nibo_cents: number; balbina_cents: number }[]; total_dias_diferentes: number;
  // composição do saldo, para achar a diferença
  fonte?: string; abertura_cents?: number; nibo_periodo_cents?: number; balbina_importado_cents?: number;
  balbina_proprio_cents?: number; balbina_proprio_qtd?: number; nibo_extrato_cents?: number; diag?: DiagnosticoConta;
};
export function auditarNibo(
  d: DadosNibo,
  balbina: {
    chave: string; nome: string; saldo_cents: number; abertura_cents?: number;
    movimentos: { data: string; valor_cents: number; importado?: boolean }[];
  }[],
): AuditoriaConta[] {
  const movimentos = movimentosNibo(d);
  const saldo = new Map((d.saldos ?? []).map((x) => [x.accountId, x.balance]));
  return balbina.map((f) => {
    const porDia = new Map<string, { nibo_cents: number; balbina_cents: number }>();
    const dia = (data: string) => porDia.get(data) ?? (porDia.set(data, { nibo_cents: 0, balbina_cents: 0 }), porDia.get(data)!);
    const nibo_linhas = movimentos[f.chave]?.linhas ?? [];
    for (const l of nibo_linhas) dia(l.data).nibo_cents += l.valor;
    const doPeriodo = f.movimentos.filter((m) => !d.desde || m.data >= d.desde);
    for (const m of doPeriodo) dia(m.data).balbina_cents += m.valor_cents;
    const proprios = doPeriodo.filter((m) => m.importado === false);
    const diferentes = [...porDia.entries()].filter(([, v]) => v.nibo_cents !== v.balbina_cents)
      .map(([data, v]) => ({ data, ...v })).sort((a, b) => a.data.localeCompare(b.data));
    const nibo = saldo.has(f.chave) && saldo.get(f.chave) != null ? centavos(saldo.get(f.chave)) : null;
    return {
      conta: f.nome, nibo_cents: nibo, balbina_cents: f.saldo_cents, diferenca_cents: nibo == null ? null : f.saldo_cents - nibo,
      lancamentos_nibo: nibo_linhas.length, dias: diferentes.slice(0, 31), total_dias_diferentes: diferentes.length,
      fonte: movimentos[f.chave]?.fonte, abertura_cents: f.abertura_cents,
      nibo_periodo_cents: nibo_linhas.reduce((t, l) => t + l.valor, 0), nibo_extrato_cents: movimentos[f.chave]?.extrato_cents,
      balbina_importado_cents: doPeriodo.filter((m) => m.importado !== false).reduce((t, m) => t + m.valor_cents, 0),
      balbina_proprio_cents: proprios.reduce((t, m) => t + m.valor_cents, 0), balbina_proprio_qtd: proprios.length,
      diag: d.diag?.[f.chave],
    };
  });
}

const BASE = "https://api.nibo.com.br/empresas/v1";
const PAGINA = 500;

type Pagina<T> = { itens: T[]; total?: number; chaves?: string[] };

// O NIBO limita as consultas por minuto e responde 429 quando passa. As chamadas saem uma de cada
// vez, com um intervalo mínimo, e um 429 espera (Retry-After ou 2, 4, 8… s) e tenta de novo.
export const limiteNibo = { intervaloMs: 350, tentativas: 7, esperaMaximaMs: 30_000, prazoMs: 240_000 };
let fila: Promise<unknown> = Promise.resolve();
let ultimaChamada = 0;
let inicioLeitura = 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chamarNibo<T>(token: string, url: string, caminho: string): Promise<Pagina<T>> {
  const vez = fila.then(async () => {
    for (let tentativa = 1; ; tentativa++) {
      const espera = ultimaChamada + limiteNibo.intervaloMs - Date.now();
      if (espera > 0) await dormir(espera);
      ultimaChamada = Date.now();
      const r = await fetch(url, { headers: { apitoken: token, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (r.status === 429 || r.status === 503) {
        const pedido = Number(r.headers.get("retry-after"));
        const ms = Math.min(Number.isFinite(pedido) && pedido > 0 ? pedido * 1000 : 2000 * 2 ** (tentativa - 1), limiteNibo.esperaMaximaMs);
        if (tentativa >= limiteNibo.tentativas || (inicioLeitura && Date.now() + ms - inicioLeitura > limiteNibo.prazoMs)) {
          throw Object.assign(new Error("O NIBO limitou o número de consultas por minuto. Espere uns 5 minutos e rode de novo: o que já entrou não duplica."), { status: r.status });
        }
        await dormir(ms);
        continue;
      }
      if (r.status === 401 || r.status === 403) throw new Error("O NIBO recusou o token. Gere um novo em Configurações → API e tente de novo.");
      if (!r.ok) throw Object.assign(new Error(`O NIBO respondeu ${r.status} ao ler ${caminho}.`), { status: r.status });
      const corpo = (await r.json()) as Record<string, unknown> | T[];
      if (Array.isArray(corpo)) return { itens: corpo };
      // a lista costuma vir em "items"; se vier em outra propriedade, usa a primeira lista do corpo
      const lista = (Array.isArray(corpo.items) ? corpo.items : Object.values(corpo ?? {}).find(Array.isArray)) as T[] | undefined;
      return { itens: lista ?? [], total: typeof corpo.count === "number" ? corpo.count : undefined, chaves: Object.keys(corpo ?? {}) };
    }
  });
  fila = vez.catch(() => undefined);
  return vez;
}

// Erro que não deve virar aviso: token recusado ou limite de consultas esgotado
const erroFatal = (e: unknown) => {
  const status = (e as { status?: number }).status;
  return status == null || status === 429 || status === 503;
};

async function lerPagina<T>(token: string, caminho: string, ordem: string, skip: number, filtro?: string): Promise<Pagina<T>> {
  const params = [`$orderby=${encodeURIComponent(ordem)}`, `$top=${PAGINA}`, `$skip=${skip}`];
  if (filtro) params.push(`$filter=${encodeURIComponent(filtro)}`);
  return chamarNibo<T>(token, `${BASE}/${caminho}?${params.join("&")}`, caminho);
}

// Lê todas as páginas de uma consulta. Para quando o "count" do NIBO é alcançado ou a página vem
// vazia (não quando vem menor que o pedido: a API pode limitar o tamanho da página).
async function lerTudo<T>(token: string, caminho: string, ordem: string, filtro?: string): Promise<T[]> {
  const itens: T[] = [];
  for (let skip = 0; skip < 100_000; ) {
    const { itens: pagina, total } = await lerPagina<T>(token, caminho, ordem, skip, filtro);
    itens.push(...pagina);
    skip += pagina.length;
    if (pagina.length === 0 || (total != null ? itens.length >= total : pagina.length < PAGINA)) break;
  }
  return itens;
}

// Data inicial da importação: uma data real, de no máximo 10 anos atrás até hoje.
// Cada mês vira várias chamadas ao NIBO, então uma data como 0000-01-01 travaria o servidor.
export function desdeNiboValido(desde: string, hoje: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return false;
  const d = new Date(`${desde}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== desde) return false;
  const limite = `${Number(hoje.slice(0, 4)) - 10}${hoje.slice(4, 10)}`;
  return desde >= limite && desde <= hoje;
}

export function mesesEntre(desde: string, ate: string): { ano: number; mes: number }[] {
  const meses = [];
  let [ano, mes] = desde.split("-").map(Number);
  const [anoFim, mesFim] = ate.split("-").map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push({ ano, mes });
    if (++mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

// Lançamentos mês a mês (cada consulta fica pequena), a partir de "desde". Se o NIBO não aceitar
// o filtro por data, lê tudo e filtra aqui.
async function lerPorMes<T>(token: string, caminho: string, campo: string, desde: string, ate: string,
                            id: (x: T) => string, data: (x: T) => string | undefined): Promise<T[]> {
  let itens: T[] = [];
  try {
    const meses = mesesEntre(desde, ate);
    for (const { ano, mes } of meses) {
      itens.push(...await lerTudo<T>(token, caminho, campo, `year(${campo}) eq ${ano} and month(${campo}) eq ${mes}`));
    }
  } catch (e) {
    if ((e as { status?: number }).status !== 400) throw e;
    itens = await lerTudo<T>(token, caminho, campo);
  }
  const vistos = new Set<string>();
  return itens.filter((x) => {
    const d = data(x);
    if (!d || d < desde || vistos.has(id(x))) return false;
    vistos.add(id(x));
    return true;
  });
}

function somarMeses(iso: string, meses: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

// desde: primeira data (AAAA-MM-DD) de vencimento e de pagamento/recebimento que entra.
export async function lerNibo(token: string, desde: string): Promise<DadosNibo> {
  const hoje = new Date().toISOString().slice(0, 10);
  inicioLeitura = Date.now();
  const agendamento = (caminho: string) => lerPorMes<NiboAgendamento>(token, caminho, "dueDate", desde, somarMeses(hoje, 36),
    (a) => a.scheduleId, (a) => dataIso(a.dueDate));
  const lancamento = (caminho: string) => lerPorMes<NiboLancamento>(token, caminho, "date", desde, hoje,
    (l) => l.entryId, (l) => dataIso(l.date));
  // uma consulta de cada vez (limite de consultas do NIBO)
  const categorias = await lerTudo<NiboCategoria>(token, "categories", "name");
  const centros = await lerTudo<NiboCentro>(token, "costcenters", "description");
  const contas = await lerTudo<NiboConta>(token, "accounts", "name");
  const clientes = await lerTudo<NiboPessoa>(token, "customers", "name");
  const fornecedores = await lerTudo<NiboPessoa>(token, "suppliers", "name");
  const debitos = await agendamento("schedules/debit");
  const creditos = await agendamento("schedules/credit");
  const pagamentos = await lancamento("payments");
  const recebimentos = await lancamento("receipts");
  const { saldos, extratos, pendentes, avisos, diag } = await lerContasNibo(token, contas, desde, hoje);
  const dados: DadosNibo = { categorias, centros, contas, clientes, fornecedores, debitos, creditos, pagamentos, recebimentos, desde, saldos, extratos, pendentes, avisos, diag };
  diagnosticarNibo(dados);
  return dados;
}

// Uma chamada sem OData; se o "count" passar do que veio, pagina com $skip.
async function lerListaComChaves<T>(token: string, caminho: string, query = ""): Promise<{ itens: T[]; chaves?: string[] }> {
  const url = (extra: string) => `${BASE}/${caminho}${query || extra ? `?${[query, extra].filter(Boolean).join("&")}` : ""}`;
  const ler = (u: string) => chamarNibo<T>(token, u, caminho);
  const primeira = await ler(url(""));
  const itens = [...primeira.itens];
  // para também se o NIBO ignorar o $skip e devolver a mesma página
  let anterior = JSON.stringify(primeira.itens[0]);
  while (primeira.total != null && itens.length < primeira.total) {
    const { itens: mais } = await ler(url(`$skip=${itens.length}&$top=${PAGINA}`));
    if (mais.length === 0 || JSON.stringify(mais[0]) === anterior) break;
    anterior = JSON.stringify(mais[0]);
    itens.push(...mais);
  }
  return { itens, chaves: primeira.chaves };
}
const lerLista = async <T>(token: string, caminho: string, query = "") => (await lerListaComChaves<T>(token, caminho, query)).itens;

// Saldo atual, extrato desde "desde" e lançamentos do banco a conciliar, conta por conta.
// Uma conta que o NIBO não deixar ler fica de fora (com aviso) e mantém o saldo de abertura antigo.
async function lerContasNibo(token: string, contas: NiboConta[], desde: string, hoje: string) {
  const avisos: string[] = [];
  let saldos: NiboSaldo[] = [];
  try {
    saldos = await lerLista<NiboSaldo>(token, "accounts/views/balance");
  } catch (e) {
    if (erroFatal(e)) throw e;
    avisos.push("O NIBO não informou os saldos das contas: os saldos iniciais não foram recalculados.");
  }
  const extratos: Record<string, NiboExtrato[]> = {};
  const pendentes: Record<string, NiboPendente[]> = {};
  const diag: Record<string, DiagnosticoConta> = {};
  for (const c of contas) {
    diag[c.id] = { saldo_informado: saldos.some((x) => x.accountId === c.id), extrato_linhas: 0 };
    try {
      // o período inteiro numa consulta; o "count" manda paginar se vier mais
      const { itens: linhas, chaves } = await lerListaComChaves<NiboExtrato>(token, `accounts/${c.id}/views/statement`, `startDate=${desde}&endDate=${hoje}`);
      diag[c.id].extrato_linhas = linhas.length;
      diag[c.id].extrato_chaves = chaves;
      diag[c.id].extrato_campos = Object.keys(linhas[0] ?? {}).slice(0, 25);
      const vistos = new Set<string>();
      extratos[c.id] = linhas.filter((l) => l.entryId && !vistos.has(l.entryId) && vistos.add(l.entryId));
    } catch (e) {
      if (erroFatal(e)) throw e;
      avisos.push(`Extrato da conta "${c.name}" não veio do NIBO (${(e as Error).message})`);
      diag[c.id].extrato_erro = (e as Error).message;
    }
    try {
      pendentes[c.id] = await lerLista<NiboPendente>(token, `accounts/${c.id}/reconciliation`);
      diag[c.id].pendentes = pendentes[c.id].length;
    } catch (e) {
      if (erroFatal(e)) throw e;
      diag[c.id].pendentes_erro = (e as Error).message;
    }
  }
  return { saldos, extratos, pendentes, avisos, diag };
}
