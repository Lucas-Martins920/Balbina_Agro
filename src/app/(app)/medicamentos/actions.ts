"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerDecimal, lerInteiro } from "@/lib/formato";
import { TIPOS_MEDICAMENTO, UNIDADES_DOSE, VIAS_MEDICAMENTO } from "@/lib/rotulos";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/medicamentos");
  revalidatePath("/apontamentos");
  revalidatePath("/sanidade");
}

export async function salvarMedicamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  if (!nome) return falha("Informe o nome.");
  if (!(t("tipo") in TIPOS_MEDICAMENTO)) return falha("Escolha o tipo.");
  if (!(t("via") in VIAS_MEDICAMENTO)) return falha("Escolha como aplica.");
  if (!(t("unidade_dose") in UNIDADES_DOSE)) return falha("Escolha a unidade da dose.");
  const dose = t("dose_por_unidade") ? lerDecimal(t("dose_por_unidade")) : null;
  if (t("dose_por_unidade") && !(dose && dose > 0)) return falha("Dose por litro precisa ser maior que zero.");
  const carencia = lerInteiro(t("carencia_dias") || "0");
  if (carencia === null || carencia < 0 || carencia > 365) return falha("Carência em dias, entre 0 e 365.");
  const fator = t("dose_por_unidade_estoque") ? lerDecimal(t("dose_por_unidade_estoque")) : null;
  if (t("dose_por_unidade_estoque") && !(fator && fator > 0)) return falha("Informe quanto da dose há em 1 unidade do produto.");

  const dados = {
    nome,
    tipo: t("tipo"),
    principio_ativo: t("principio_ativo") || null,
    dose_por_unidade: dose,
    unidade_dose: t("unidade_dose"),
    via: t("via"),
    carencia_dias: carencia,
    produto_id: t("produto_id") || null,
    dose_por_unidade_estoque: fator,
    observacoes: t("observacoes") || null,
    ativo: form.get("ativo") === "on",
  };

  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("medicamentos").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(error.code === "23505" ? "Já existe um medicamento com esse nome." : mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar medicamentos.");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("medicamentos").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(error.code === "23505" ? "Já existe um medicamento com esse nome." : mensagemBanco(error));
  }
  revalidar();
  return sucesso(id ? `${nome} atualizado.` : `${nome} cadastrado.`);
}

export async function excluirMedicamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("medicamentos").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para excluir medicamentos.");
  revalidar();
  return sucesso("Medicamento excluído.");
}
