"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerDecimal, lerInteiro } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_EVENTO } from "@/lib/rotulos";
import { validarMedicacao } from "@/lib/apontamento-campo";

function revalidar() {
  revalidatePath("/sanidade");
  revalidatePath("/estoque");
  revalidatePath("/painel");
  revalidatePath("/despescas");
  revalidatePath("/lotes", "layout");
}

export async function registrarEvento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const lote = String(form.get("lote_id") ?? "");
  const tipo = String(form.get("tipo") ?? "");
  const data = String(form.get("data") ?? "");
  const status = form.get("status") === "planejado" ? "planejado" : "realizado";
  const carencia = lerInteiro(form.get("carencia") || "0");
  if (!lote) return falha("Escolha o lote.");
  if (!(tipo in TIPOS_EVENTO)) return falha("Escolha o tipo.");
  if (!data) return falha("Informe a data.");
  if (carencia === null || carencia < 0 || carencia > 365) return falha("Carência em dias, entre 0 e 365.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("eventos_sanitarios").insert({
    empresa_id: atual.id,
    lote_id: lote,
    viveiro_id: String(form.get("viveiro_id") ?? "") || null,
    data,
    tipo,
    status,
    dose: String(form.get("dose") ?? "").trim() || null,
    via: String(form.get("via") ?? "").trim() || null,
    carencia_dias: carencia,
    responsavel: String(form.get("responsavel") ?? "").trim() || null,
    observacoes: String(form.get("observacoes") ?? "").trim() || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(status === "planejado" ? "Manejo programado." : "Manejo registrado.");
}

// Medicação do cadastro aplicada num viveiro (o mesmo registro que o apontamento diário faz)
export async function registrarMedicacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const viveiro = String(form.get("viveiro_id") ?? "");
  const data = String(form.get("data") ?? "");
  if (!viveiro) return falha("Escolha o viveiro.");
  if (!data) return falha("Informe a data.");
  const opcional = (k: string) => (String(form.get(k) ?? "").trim() ? (lerDecimal(form.get(k)) ?? NaN) : undefined);
  const med = validarMedicacao({
    medicamento_id: String(form.get("medicamento_id") ?? ""),
    dias: opcional("dias") ?? 1,
    dose_por_unidade: opcional("dose"),
    base_dose: opcional("base"),
    quantidade: opcional("quantidade"),
  });
  if ("erro" in med) return falha(med.erro);
  if (!med.ok) return falha("Escolha o medicamento.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const m = med.ok;
  const { error } = await supabase.rpc("registrar_medicacao", {
    p_empresa: atual.id, p_viveiro: viveiro, p_data: data, p_medicamento: m.medicamento_id, p_dias: m.dias,
    p_dose_por_unidade: m.dose_por_unidade, p_base: m.base_dose, p_quantidade: m.quantidade,
    p_observacoes: String(form.get("observacoes") ?? ""), p_lancamento: null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Medicação registrada.");
}

export async function concluirEvento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("evento_id") ?? "");
  const data = String(form.get("data") ?? "");
  if (!id || !data) return falha("Informe a data em que foi feito.");
  const supabase = await createClient();
  const { error } = await supabase.from("eventos_sanitarios").update({ status: "realizado", data }).eq("id", id).eq("status", "planejado");
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Marcado como feito.");
}

export async function cancelarEvento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.from("eventos_sanitarios").update({ status: "cancelado" }).eq("id", String(form.get("evento_id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Cancelado.");
}
