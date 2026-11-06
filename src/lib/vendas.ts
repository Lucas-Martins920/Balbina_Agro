// Condições de pagamento oferecidas no pedido (dias a partir da data do pedido)
export const CONDICOES: Record<string, { nome: string; parcelas: { dias: number; pct: number }[] }> = {
  avista: { nome: "À vista", parcelas: [{ dias: 0, pct: 100 }] },
  d7: { nome: "7 dias", parcelas: [{ dias: 7, pct: 100 }] },
  d14: { nome: "14 dias", parcelas: [{ dias: 14, pct: 100 }] },
  d28: { nome: "28 dias", parcelas: [{ dias: 28, pct: 100 }] },
  d30: { nome: "30 dias", parcelas: [{ dias: 30, pct: 100 }] },
  d14_28: { nome: "14/28 dias", parcelas: [{ dias: 14, pct: 50 }, { dias: 28, pct: 50 }] },
  d30_60: { nome: "30/60 dias", parcelas: [{ dias: 30, pct: 50 }, { dias: 60, pct: 50 }] },
};

export const STATUS_PEDIDO: Record<string, string> = {
  rascunho: "Rascunho", aberto: "Aberto", separado: "Separado", faturado: "Faturado", entregue: "Entregue", cancelado: "Cancelado",
};

// Tom da etiqueta de situação do pedido (ver Etiqueta em components/ui)
export const TOM_STATUS_PEDIDO: Record<string, "neutro" | "positivo" | "perigo" | "alerta" | "info"> = {
  rascunho: "neutro", aberto: "alerta", separado: "alerta", faturado: "info", entregue: "positivo", cancelado: "neutro",
};

export type ItemVendido = {
  mes: string; cliente_id: string; cliente: string; produto: string; classe: string | null; kg: number; total_cents: number;
  cidade?: string | null; uf?: string | null;
};
type Soma = { chave: string; nome: string; kg: number; total: number; precoKg: number | null; participacao: number };

// Agrupa as vendas por uma chave, do maior faturamento para o menor, com preço médio do kg (centavos) e % do total
function agrupar(itens: ItemVendido[], chave: (i: ItemVendido) => string, nome: (i: ItemVendido) => string): Soma[] {
  const m = new Map<string, Soma>();
  for (const i of itens) {
    const k = chave(i);
    const s = m.get(k) ?? { chave: k, nome: nome(i), kg: 0, total: 0, precoKg: null, participacao: 0 };
    s.kg += Number(i.kg);
    s.total += Number(i.total_cents);
    m.set(k, s);
  }
  const geral = itens.reduce((t, i) => t + Number(i.total_cents), 0);
  return [...m.values()]
    .map((s) => ({ ...s, precoKg: s.kg ? s.total / s.kg : null, participacao: geral ? (s.total / geral) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}

export function resumoVendas(itens: ItemVendido[]) {
  return {
    total: itens.reduce((t, i) => t + Number(i.total_cents), 0),
    kg: itens.reduce((t, i) => t + Number(i.kg), 0),
    clientes: agrupar(itens, (i) => i.cliente_id, (i) => i.cliente),
    produtos: agrupar(itens, (i) => i.produto, (i) => i.produto),
    classes: agrupar(itens, (i) => i.classe ?? "", (i) => i.classe ?? "Sem classe"),
    meses: agrupar(itens, (i) => i.mes.slice(0, 7), (i) => i.mes.slice(0, 7)).sort((a, b) => a.chave.localeCompare(b.chave)),
    cidades: agrupar(itens, (i) => chaveCidade(i) ?? "", (i) => chaveCidade(i) ?? "Não informada"),
    estados: agrupar(itens, (i) => uf(i) ?? "", (i) => uf(i) ?? "Não informado"),
  };
}

const uf = (i: { uf?: string | null }) => i.uf?.trim().toUpperCase() || null;
// "manaus " e "Manaus" contam juntas; a grafia mostrada é a primeira que aparecer
function chaveCidade(i: ItemVendido) {
  const cidade = i.cidade?.trim();
  if (!cidade) return null;
  const nome = cidade.toLocaleLowerCase("pt-BR").replace(/(^|\s)\p{L}/gu, (l) => l.toLocaleUpperCase("pt-BR"));
  return uf(i) ? `${nome}/${uf(i)}` : nome;
}

// Curva ABC sobre uma lista já ordenada do maior para o menor faturamento:
// entra em A quem começa antes de 80% do acumulado, em B antes de 95%, o resto é C.
export function curvaAbc<T extends { participacao: number }>(linhas: T[]) {
  let acumulado = 0;
  return linhas.map((l) => {
    const abc = acumulado < 80 ? "A" : acumulado < 95 ? "B" : "C";
    acumulado += l.participacao;
    return { ...l, abc: abc as "A" | "B" | "C", acumulado: Math.round(acumulado * 100) / 100 };
  });
}

export type CompraCliente = { cliente_id: string; ultima_compra: string; pedidos: number; total_cents: number | string };
export type ClienteContato = { id: string; nome: string; cidade: string | null; uf: string | null; telefone: string | null };

// Clientes que já compraram e estão há mais de `dias` sem comprar (view clientes_compras), do sumido há mais tempo para o mais recente
export function clientesSemComprar(compras: CompraCliente[], clientes: ClienteContato[], hoje: string, dias: number) {
  const porCliente = new Map(compras.map((c) => [c.cliente_id, c]));
  const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
  return clientes
    .flatMap((c) => {
      const h = porCliente.get(c.id);
      if (!h) return [];
      const parado = dia(hoje) - dia(h.ultima_compra);
      return parado > dias ? [{ ...c, ultimaCompra: h.ultima_compra, pedidos: Number(h.pedidos), total: Number(h.total_cents), dias: parado }] : [];
    })
    .sort((a, b) => b.dias - a.dias || a.nome.localeCompare(b.nome));
}

export type PrecoTabela = { produto_id: string; cliente_id: string | null; lista_id: string; preco_cents: number | string; vigencia: string };
export type ListaPreco = { id: string; nome: string; padrao: boolean; ajuste_pct: number | string; ativa: boolean };

// vigência vem do Postgres como "[2026-10-01,)" ou "[2026-10-01,2026-11-01)"
export function vigenteEm(vigencia: string, dia: string) {
  const [ini, fim] = vigencia.replace(/[[\]()]/g, "").split(",");
  return ini <= dia && (!fim || dia < fim);
}

// Ajuste em % da tabela sobre o preço da padrão (-10 = 10% abaixo).
// Conta em inteiros (o ajuste tem 2 casas) para arredondar igual ao numeric de preco_vigente.
export function aplicarAjuste(preco: number, ajustePct: number | string) {
  return Math.round((preco * (10000 + Math.round(Number(ajustePct) * 100))) / 10000);
}

// Preço que vale no dia, com a mesma regra de preco_vigente no banco:
// especial do cliente > preço próprio da tabela (a escolhida na venda ou a do cliente) > padrão com o ajuste da tabela.
export function precoVigente(precos: PrecoTabela[], dia: string, listas: ListaPreco[]) {
  const vigentes = precos.filter((p) => vigenteEm(p.vigencia, dia));
  const padrao = listas.find((l) => l.padrao)?.id;
  const porLista = new Map(listas.map((l) => [l.id, l]));
  const especial = new Map(vigentes.filter((p) => p.cliente_id).map((p) => [`${p.produto_id}|${p.cliente_id}`, Number(p.preco_cents)]));
  const daLista = new Map(vigentes.filter((p) => !p.cliente_id).map((p) => [`${p.produto_id}|${p.lista_id}`, Number(p.preco_cents)]));
  return (produto: string, cliente?: string | null, lista?: string | null): number | null => {
    const doCliente = cliente ? especial.get(`${produto}|${cliente}`) : undefined;
    if (doCliente !== undefined) return doCliente;
    const tabela = lista ? porLista.get(lista) : undefined;
    const ativa = tabela && tabela.ativa && !tabela.padrao ? tabela : undefined;
    const proprio = ativa ? daLista.get(`${produto}|${ativa.id}`) : undefined;
    if (proprio !== undefined) return proprio;
    const geral = padrao ? daLista.get(`${produto}|${padrao}`) : undefined;
    if (geral === undefined) return null;
    return ativa ? aplicarAjuste(geral, ativa.ajuste_pct) : geral;
  };
}

export const FORMAS_PDV = { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão" } as const;
export type FormaPdv = keyof typeof FORMAS_PDV;
export type PagamentoPdv = { forma: FormaPdv; valor_cents: number };

// Quanto falta e quanto volta de troco. Só dinheiro pode passar do total.
export function fecharPagamento(total: number, pagamentos: PagamentoPdv[]) {
  const pago = pagamentos.reduce((s, p) => s + p.valor_cents, 0);
  const dinheiro = pagamentos.filter((p) => p.forma === "dinheiro").reduce((s, p) => s + p.valor_cents, 0);
  const falta = Math.max(total - pago, 0);
  const troco = Math.max(pago - total, 0);
  const erro = troco > dinheiro ? "Só pagamento em dinheiro pode ter troco." : null;
  return { pago, falta, troco: erro ? 0 : troco, erro, pronto: total > 0 && falta === 0 && !erro };
}

// Notas que o cliente costuma entregar, acima do total (para os botões de valor rápido do PDV)
export function notasSugeridas(total: number) {
  const notas = [500, 1000, 2000, 5000, 10000, 20000];
  const sugestoes = new Set<number>([total]);
  for (const n of notas) {
    const v = Math.ceil(total / n) * n;
    if (v > total) sugestoes.add(v);
    if (sugestoes.size >= 4) break;
  }
  return [...sugestoes].sort((a, b) => a - b);
}

// Link do WhatsApp com o telefone em formato internacional (assume Brasil se vier sem DDI)
export function linkWhatsapp(telefone: string | null | undefined, texto: string) {
  let fone = (telefone ?? "").replace(/\D/g, "");
  if (fone.length === 10 || fone.length === 11) fone = `55${fone}`;
  return `https://wa.me/${fone}?text=${encodeURIComponent(texto)}`;
}
