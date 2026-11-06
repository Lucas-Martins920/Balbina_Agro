import { formatarData } from "./formato.ts";
// Regras da assinatura do Balbina (o SaaS) que não dependem de rede, para dar para testar.

export type Ciclo = "mensal" | "anual";
export type Plano = { id: string; nome: string; descricao: string | null; valor_cents: number; ciclo: Ciclo; nivel?: string };

export type Assinatura = {
  status: "teste" | "aguardando" | "ativa" | "atrasada" | "cancelada" | "cortesia";
  liberada: boolean;
  teste_ate: string | null;
  pago_ate: string | null;
  plano_id: string | null;
  nivel?: string; // nível que vale hoje (no teste grátis, o Gestão)
  fatura_url: string | null;
  tem_assinatura: boolean;
};

const CICLO_ASAAS: Record<Ciclo, string> = { mensal: "MONTHLY", anual: "YEARLY" };

// O teste grátis não se perde: a primeira mensalidade vence no último dia do teste.
export function primeiroVencimento(hoje: string, testeAte: string | null) {
  return testeAte && testeAte > hoje ? testeAte : hoje;
}

export function montarAssinatura(p: { cliente: string; empresaId: string; plano: Plano; vencimento: string }) {
  return {
    customer: p.cliente,
    billingType: "UNDEFINED", // a piscicultura escolhe Pix, boleto ou cartão na fatura do Asaas
    value: p.plano.valor_cents / 100,
    nextDueDate: p.vencimento,
    cycle: CICLO_ASAAS[p.plano.ciclo],
    description: `Balbina ERP - plano ${p.plano.nome}`,
    externalReference: p.empresaId,
  };
}

type Evento = {
  id?: string;
  event?: string;
  payment?: { id?: string; subscription?: string | null; dueDate?: string; invoiceUrl?: string | null };
  subscription?: { id?: string };
};

export type EventoAssinatura = { assinatura: string; evento: string; vencimento: string | null; fatura_url: string | null };

// Só interessam cobranças de assinatura e o fim da assinatura; o resto do Asaas é ignorado.
export function lerEventoAssinatura(evento: Evento): EventoAssinatura | null {
  const nome = evento.event ?? "";
  if (nome.startsWith("SUBSCRIPTION_")) {
    const id = evento.subscription?.id;
    return id ? { assinatura: id, evento: nome, vencimento: null, fatura_url: null } : null;
  }
  const p = evento.payment;
  if (!p?.subscription) return null;
  return { assinatura: p.subscription, evento: nome, vencimento: p.dueDate ?? null, fatura_url: p.invoiceUrl ?? null };
}

// O aviso do webhook só diz o que mudou; o que vale é a situação lida na API do Asaas (GET /payments/{id}
// e GET /subscriptions/{id}). Assim um token vazado não libera acesso, e aviso fora de ordem não estraga nada.
export type PagamentoAsaas = { id?: string; status?: string; subscription?: string | null; dueDate?: string; invoiceUrl?: string | null; deleted?: boolean };

const EVENTO_DA_SITUACAO: Record<string, string> = {
  RECEIVED: "PAYMENT_RECEIVED", CONFIRMED: "PAYMENT_RECEIVED", RECEIVED_IN_CASH: "PAYMENT_RECEIVED",
  OVERDUE: "PAYMENT_OVERDUE",
  PENDING: "PAYMENT_UPDATED", AWAITING_RISK_ANALYSIS: "PAYMENT_UPDATED",
  REFUNDED: "PAYMENT_REFUNDED", REFUND_REQUESTED: "PAYMENT_REFUNDED", REFUND_IN_PROGRESS: "PAYMENT_REFUNDED",
  CHARGEBACK_REQUESTED: "PAYMENT_REFUNDED", CHARGEBACK_DISPUTE: "PAYMENT_REFUNDED", AWAITING_CHARGEBACK_REVERSAL: "PAYMENT_REFUNDED",
};

export function eventoDoPagamento(p: PagamentoAsaas): EventoAssinatura | null {
  const evento = EVENTO_DA_SITUACAO[p.status ?? ""];
  if (!evento || p.deleted || !p.subscription) return null;
  return { assinatura: p.subscription, evento, vencimento: p.dueDate ?? null, fatura_url: p.invoiceUrl ?? null };
}

export function eventoDaAssinatura(s: { id?: string; status?: string; deleted?: boolean }): EventoAssinatura | null {
  if (!s.id || !(s.deleted || s.status === "INACTIVE" || s.status === "EXPIRED")) return null;
  return { assinatura: s.id, evento: "SUBSCRIPTION_INACTIVATED", vencimento: null, fatura_url: null };
}

// Texto curto para o aviso no topo do app e para a tela de assinatura.
export function situacao(a: Assinatura, hoje: string): string {
  const dias = (ate: string) => Math.round((Date.parse(ate) - Date.parse(hoje)) / 86_400_000);
  if (a.status === "cortesia") return "Acesso de cortesia.";
  if (a.status === "ativa" && a.pago_ate) return `Assinatura em dia até ${formatarData(a.pago_ate)}.`;
  if (a.teste_ate && a.teste_ate >= hoje) {
    const n = dias(a.teste_ate);
    return n === 0 ? "O teste grátis termina hoje." : `Teste grátis: falta${n > 1 ? "m" : ""} ${n} dia${n > 1 ? "s" : ""}.`;
  }
  if (a.status === "cancelada") return a.liberada && a.pago_ate ? `Assinatura cancelada. O acesso vai até ${formatarData(a.pago_ate)}.` : "Assinatura cancelada.";
  if (a.liberada) return "Mensalidade em atraso. Pague para não perder o acesso.";
  return a.teste_ate && !a.tem_assinatura ? "O teste grátis terminou." : "Acesso suspenso por falta de pagamento.";
}


// Níveis do Balbina (Basic, Vendas, Fiscal, Gestão). `modulos` com "*" libera tudo; a lista vem de niveis_plano.
export type NivelPlano = { id: string; nome: string; descricao: string | null; ordem: number; modulos: string[] };

// O menor plano que libera o módulo, para o convite de upgrade.
export function nivelQueLibera(niveis: NivelPlano[], modulo: string): NivelPlano | undefined {
  return [...niveis].sort((a, b) => a.ordem - b.ordem).find((n) => n.modulos.includes("*") || n.modulos.includes(modulo));
}

// Texto do convite no menu: o que o próximo plano acrescenta.
export const CONVITE_UPGRADE: Record<string, string> = {
  basic: "Financeiro, vendas, PDV e notas fiscais nos planos acima.",
  vendas: "Cobrança por boleto e Pix e notas fiscais no Fiscal.",
  fiscal: "Conciliação bancária, planejamento e custo do kg no Gestão.",
};
