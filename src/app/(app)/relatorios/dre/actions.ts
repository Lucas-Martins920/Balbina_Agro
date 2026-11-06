"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

async function mudarMes(fn: "fechar_mes" | "reabrir_mes", form: FormData, ok: string): Promise<EstadoAcao> {
  const mes = String(form.get("mes") ?? "");
  if (!/^\d{4}-\d{2}$/.test(mes)) return falha("Escolha o mês.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_empresa: atual.id, p_mes: `${mes}-01` });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/relatorios/dre");
  return sucesso(ok);
}

export async function fecharMes(_: EstadoAcao, form: FormData) {
  return mudarMes("fechar_mes", form, "Mês fechado. Pagamentos, recebimentos e transferências desse mês não podem mais mudar.");
}

export async function reabrirMes(_: EstadoAcao, form: FormData) {
  return mudarMes("reabrir_mes", form, "Mês reaberto.");
}
