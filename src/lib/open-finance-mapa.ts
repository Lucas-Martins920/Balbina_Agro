// Tradução dos dados do agregador Open Finance (Pluggy) para o formato do extrato do ERP.
// Sem dependência de servidor, para poder testar.
import type { LinhaExtrato } from "./ofx.ts";

export type TransacaoPluggy = {
  id: string;
  description: string;
  amount: number;
  date: string; // ISO 8601 em UTC
  type: "DEBIT" | "CREDIT";
  status?: "PENDING" | "POSTED";
  paymentData?: {
    payer?: Participante | null;
    receiver?: Participante | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
};

type Participante = { name?: string | null; documentNumber?: { type?: string; value?: string | null } | null };

export type ContaPluggy = {
  id: string;
  type: "BANK" | "CREDIT";
  subtype: "CHECKING_ACCOUNT" | "SAVINGS_ACCOUNT" | "CREDIT_CARD";
  name: string;
  marketingName?: string | null;
  number: string;
  balance: number;
  bankData?: { transferNumber?: string | null } | null;
};

// Data do lançamento no fuso da piscicultura. Bancos do Open Finance mandam só a data (meia-noite UTC);
// nesse caso a data vale como está, senão converte para o horário de Brasília.
export function dataLocal(iso: string): string {
  if (/T00:00:00(\.0+)?Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

// Só lançamentos já compensados: os pendentes ainda podem mudar de valor ou sumir.
// O sinal vem do tipo (o valor da Pluggy é positivo em cartão e pode vir sem sinal).
export function linhaDaTransacao(t: TransacaoPluggy): LinhaExtrato | null {
  if (t.status === "PENDING") return null;
  const valor = Math.round(Math.abs(t.amount) * 100);
  if (!valor) return null;
  const outro = t.type === "CREDIT" ? t.paymentData?.payer : t.paymentData?.receiver;
  const doc = soDigitos(outro?.documentNumber?.value);
  return {
    id_externo: t.id,
    data: dataLocal(t.date),
    descricao: t.description?.trim() || "Sem descrição",
    valor_cents: t.type === "CREDIT" ? valor : -valor,
    cpf_cnpj: doc.length === 11 || doc.length === 14 ? doc : null,
    nome: outro?.name?.trim() || t.merchant?.businessName?.trim() || t.merchant?.name?.trim() || null,
  };
}

export function tipoContaDe(c: Pick<ContaPluggy, "type" | "subtype">): "corrente" | "poupanca" | null {
  if (c.type !== "BANK") return null; // cartão de crédito fica para depois (tem fatura e fechamento)
  return c.subtype === "SAVINGS_ACCOUNT" ? "poupanca" : "corrente";
}

// A mesma conta já cadastrada à mão: compara o número sem dígito verificador nem zeros à esquerda.
export function mesmaConta(numeroBanco: string, conta: string | null, dv: string | null): boolean {
  const banco = soDigitos(numeroBanco).replace(/^0+/, "");
  const nossa = soDigitos(conta).replace(/^0+/, "");
  if (!banco || !nossa) return false;
  return banco === nossa || banco === nossa + soDigitos(dv) || banco.slice(0, -1) === nossa;
}

// Saldo no início do período, para a conta nova bater com o banco: saldo de hoje menos o que entrou desde então.
export function saldoInicial(saldoHojeReais: number, linhas: Pick<LinhaExtrato, "valor_cents">[]): number {
  return Math.round(saldoHojeReais * 100) - linhas.reduce((s, l) => s + l.valor_cents, 0);
}

// Webhooks da Pluggy que pedem uma nova leitura do extrato.
export function webhookPedeSincronizar(evento: { event?: unknown; itemId?: unknown }): string | null {
  const gatilhos = ["item/updated", "transactions/created", "transactions/updated"];
  return typeof evento.itemId === "string" && gatilhos.includes(String(evento.event)) ? evento.itemId : null;
}

export type StatusConexao = "ativa" | "atualizando" | "precisa_login" | "erro";

export function statusDoItem(status: string | undefined): StatusConexao {
  switch (status) {
    case "UPDATED": return "ativa";
    case "UPDATING": return "atualizando";
    case "LOGIN_ERROR":
    case "WAITING_USER_INPUT":
    case "WAITING_USER_ACTION": return "precisa_login";
    default: return "erro";
  }
}

// O "next" da v2 é um link com o cursor no parâmetro after; null na última página
export function cursorSeguinte(next: string | null | undefined) {
  if (!next) return null;
  return new URL(next, "https://api.pluggy.ai").searchParams.get("after");
}
