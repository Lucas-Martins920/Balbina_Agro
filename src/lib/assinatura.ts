import "server-only";
import { cache } from "react";
import { asaas, type Credencial } from "@/lib/asaas";
import { ambienteAsaas } from "@/lib/asaas-mapa";
import type { Assinatura } from "@/lib/assinatura-mapa";
import { createClient } from "@/lib/supabase/server";

// Situação da assinatura da empresa. Sem linha (não deveria acontecer), trata como bloqueada.
export const getAssinatura = cache(async (empresa: string): Promise<Assinatura> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("minha_assinatura", { p_empresa: empresa });
  return (data as Assinatura | null) ?? {
    status: "atrasada", liberada: false, teste_ate: null, pago_ate: null, plano_id: null, fatura_url: null, tem_assinatura: false,
  };
});

// Asaas da conta do Balbina, que cobra as pisciculturas pelo uso do sistema. Fica separado do Asaas
// de cada piscicultura (ASAAS_*): o perfil de cobrança de uma piscicultura nunca consegue apontar para esta chave.
export function balbinaAsaasConfigurado() {
  return Boolean(process.env.BALBINA_ASAAS_API_KEY);
}

export function credencialBalbina(): Credencial {
  const chave = process.env.BALBINA_ASAAS_API_KEY;
  if (!chave) throw new Error("A conta Asaas do Balbina ainda não está configurada (BALBINA_ASAAS_API_KEY).");
  return { chave, ambiente: ambienteAsaas(process.env.BALBINA_ASAAS_AMBIENTE) };
}

export async function balbinaAsaas<T>(caminho: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  return asaas<T>(credencialBalbina(), caminho, init);
}
