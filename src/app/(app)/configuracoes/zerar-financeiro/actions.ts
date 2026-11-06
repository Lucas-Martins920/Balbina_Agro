"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// Chamada depois de a tela pedir o código do autenticador (sessão aal2 com TOTP de agora).
// O banco confere de novo: master, código digitado há no máximo 5 minutos e nome da empresa.
export async function zerarFinanceiro(confirmacao: string): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("zerar_financeiro", { p_empresa: atual.id, p_confirmacao: confirmacao });
  if (error) return falha(mensagemBanco(error));
  const r = (data ?? {}) as Record<string, number>;
  revalidatePath("/", "layout");
  return sucesso(
    `Financeiro zerado: ${r.titulos ?? 0} títulos, ${r.baixas ?? 0} baixas, ${r.transferencias ?? 0} transferências e ` +
      `${r.movimentos_extrato ?? 0} lançamentos do extrato apagados. Todas as contas estão com saldo zero.`,
  );
}
