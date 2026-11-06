"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { ultimosMeses } from "@/lib/relatorios";
import { createClient } from "@/lib/supabase/server";

// Recalcula os meses em ordem: o custo da recria de um mês entra na amortização dos seguintes.
export async function recalcularCustos(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ate = String(form.get("ate") ?? "");
  const n = Number(form.get("meses") ?? 12);
  if (!/^\d{4}-\d{2}$/.test(ate)) return falha("Escolha o mês.");
  if (![1, 3, 6, 12, 24].includes(n)) return falha("Período inválido.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  let lotes = 0;
  for (const mes of ultimosMeses(ate, n)) {
    const { data, error } = await supabase.rpc("calcular_custos_mes", { p_empresa: atual.id, p_mes: mes });
    if (error) return falha(mensagemBanco(error));
    lotes += Number(data);
  }
  revalidatePath("/custo-do-kg");
  return sucesso(`${n} mês(es) recalculado(s), ${lotes} lote-mês com produção ou recria.`);
}
