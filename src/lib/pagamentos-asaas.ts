import "server-only";
import { asaas, type Credencial } from "@/lib/asaas";

// C7: pagamento de boleto pela conta Asaas da piscicultura (Pague Contas: POST /v3/bill). Quem chama já passou
// pela aprovação no banco (aprovar_pagamentos). Situações do Asaas: PENDING, BANK_PROCESSING,
// AWAITING_CHECKOUT_RISK_ANALYSIS_REQUEST, PAID, FAILED, CANCELLED, REFUNDED.
export type BoletoAsaas = { id: string; status?: string; paymentDate?: string | null; scheduleDate?: string | null; failReasons?: string[] | string | null };

export async function pagarBoleto(credencial: Credencial, p: { linha: string; data: string; hoje: string; descricao: string; referencia: string }) {
  return asaas<BoletoAsaas>(credencial, "/bill", {
    method: "POST",
    body: {
      identificationField: p.linha,
      ...(p.data > p.hoje ? { scheduleDate: p.data } : {}),
      description: p.descricao.slice(0, 200),
      externalReference: p.referencia,
    },
    timeoutMs: 30000,
  });
}

export async function consultarBoleto(credencial: Credencial, id: string) {
  return asaas<BoletoAsaas>(credencial, `/bill/${encodeURIComponent(id)}`);
}

export function motivoFalha(b: BoletoAsaas): string | null {
  if (!b.failReasons) return null;
  return Array.isArray(b.failReasons) ? b.failReasons.join("; ") : String(b.failReasons);
}
