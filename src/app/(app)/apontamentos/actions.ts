"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { avisosAgua, lerAguaForm } from "@/lib/agua";
import { lerChecklist, lerRacoes } from "@/lib/apontamento-racao";
import { formatarData, formatarNumero, hojeISO, lerDecimal, lerInteiro } from "@/lib/formato";
import { TURNOS } from "@/lib/rotulos";
import { createClient } from "@/lib/supabase/server";
import { validarMedicacao } from "@/lib/apontamento-campo";
import { lerCausasForm } from "@/lib/causas-morte";

function revalidar() {
  revalidatePath("/apontamentos");
  revalidatePath("/sanidade");
  revalidatePath("/estoque");
  revalidatePath("/lotes", "layout");
}

export async function registrarApontamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const viveiro = String(form.get("viveiro_id") ?? "");
  const data = String(form.get("data") ?? "");
  const turno = String(form.get("turno") ?? "");
  if (!viveiro) return falha("Escolha o viveiro.");
  if (!data) return falha("Informe a data.");
  const { atual } = await getEmpresaAtual();
  if (data > hojeISO(atual.fuso)) return falha("Não dá para apontar uma data futura.");
  if (!(turno in TURNOS)) return falha("Escolha o turno.");

  const numeros = {
    mortes: lerInteiro(form.get("mortes") || "0"),
    descartes: lerInteiro(form.get("descartes") || "0"),
  };
  if (numeros.mortes === null || numeros.mortes < 0 || numeros.descartes === null || numeros.descartes < 0) {
    return falha("Mortes e descartes precisam ser números inteiros.");
  }
  const causas = lerCausasForm(form, numeros.mortes + numeros.descartes);
  if ("erro" in causas) return falha(causas.erro);
  const racao = lerRacoes(form);
  if ("erro" in racao) return falha(racao.erro);
  // qualidade da água: em branco fica sem medida
  const agua = lerAguaForm(form);
  if ("erro" in agua) return falha(agua.erro);

  // Medicamento ou vitamina aplicado (opcional): campo vazio usa a dose do cadastro
  const medicamento = String(form.get("medicamento_id") ?? "");
  const opcional = (k: string) => (String(form.get(k) ?? "").trim() ? (lerDecimal(form.get(k)) ?? NaN) : undefined);
  const med = validarMedicacao(medicamento ? {
    medicamento_id: medicamento,
    dias: String(form.get("med_dias") ?? "").trim() ? (lerDecimal(form.get("med_dias")) ?? NaN) : 1,
    dose_por_unidade: opcional("med_dose"),
    base_dose: opcional("med_base"),
    quantidade: opcional("med_quantidade"),
  } : null);
  if ("erro" in med) return falha(med.erro);

  const supabase = await createClient();
  const { data: itensChecklist } = await supabase.from("checklist_itens").select("id, tipo, nome").eq("empresa_id", atual.id).eq("ativo", true);
  const checklist = lerChecklist(form, itensChecklist ?? []);
  if ("erro" in checklist) return falha(checklist.erro);

  const { data: lancamento, error } = await supabase.rpc("registrar_apontamento", {
    p_empresa: atual.id,
    p_lote: null,
    p_viveiro: viveiro,
    p_data: data,
    p_turno: turno,
    p_mortes: numeros.mortes,
    p_descartes: numeros.descartes,
    p_racao_kg: racao.ok.totalKg,
    p_agua: agua.ok,
    p_observacoes: String(form.get("observacoes") ?? ""),
    p_client_id: String(form.get("client_id") ?? "") || null,
    p_origem: "web",
  });
  if (error) {
    if (error.message.includes("baixas_cabem")) return falha("Mortes e descartes passam do número de peixes do viveiro.");
    if (error.message.includes("lancamento_turno_unico") || error.code === "23505") return falha("Já existe um lançamento nesse turno para este viveiro e data. Edite o existente ou exclua e lance de novo.");
    return falha(mensagemBanco(error));
  }
  if (Object.keys(causas.ok).length) {
    const { error: erroCausas } = await supabase.from("apontamento_lancamentos").update({ causas_morte: causas.ok }).eq("empresa_id", atual.id).eq("id", lancamento);
    if (erroCausas) {
      await supabase.from("apontamento_lancamentos").delete().eq("empresa_id", atual.id).eq("id", lancamento);
      revalidar();
      return falha(mensagemBanco(erroCausas));
    }
  }
  if (racao.ok.itens.length || checklist.ok.length) {
    const { error: erroComplemento } = await supabase.rpc("completar_lancamento", {
      p_lancamento: lancamento, p_racoes: racao.ok.itens, p_checklist: checklist.ok,
    });
    if (erroComplemento) {
      // sem a ração ou o checklist o lançamento fica pela metade: desfaz e devolve o erro
      await supabase.from("apontamento_lancamentos").delete().eq("empresa_id", atual.id).eq("id", lancamento);
      revalidar();
      return falha(mensagemBanco(erroComplemento));
    }
  }
  let textoMed = "";
  if (med.ok) {
    const m = med.ok;
    const { error: erroMed } = await supabase.rpc("registrar_medicacao", {
      p_empresa: atual.id, p_viveiro: viveiro, p_data: data, p_medicamento: m.medicamento_id, p_dias: m.dias,
      p_dose_por_unidade: m.dose_por_unidade, p_base: m.base_dose, p_quantidade: m.quantidade, p_observacoes: null, p_lancamento: lancamento,
    });
    revalidar();
    if (erroMed) return falha(`O apontamento foi salvo, mas a medicação não: ${mensagemBanco(erroMed)}. Lance a medicação na Sanidade.`);
    textoMed = " Medicação registrada na Sanidade.";
  }
  revalidar();
  const alerta = avisosAgua(agua.ok).map((a) => ` ${a.texto}`).join("");
  return sucesso(`Lançamento da ${TURNOS[turno].toLowerCase()} de ${formatarData(data)} salvo: ${formatarNumero(racao.ok.totalKg, 1)} kg de ração.${textoMed}${alerta}`);
}

// Exclui para a lixeira: o banco desfaz estoque e totais e confere quem pode (tratador só o que lançou hoje).
export async function excluirLancamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_lancamento", {
    p_lancamento: String(form.get("id") ?? ""),
    p_motivo: String(form.get("motivo") ?? "").trim().slice(0, 300) || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Lançamento excluído. Ração e medicação voltaram ao estoque; ele fica na lixeira.");
}

// Edita os campos do lançamento: o banco recalcula estoque, totais e refaz ração/checklist.
// Data e viveiro não mudam (para isso: exclua e lance de novo). Medicação editada na Sanidade.
export async function editarLancamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const turno = String(form.get("turno") ?? "");
  if (!id) return falha("Lançamento não encontrado.");
  if (!(turno in TURNOS)) return falha("Escolha o turno.");

  const { atual } = await getEmpresaAtual();

  const numeros = {
    mortes: lerInteiro(form.get("mortes") || "0"),
    descartes: lerInteiro(form.get("descartes") || "0"),
  };
  if (numeros.mortes === null || numeros.mortes < 0 || numeros.descartes === null || numeros.descartes < 0) {
    return falha("Mortes e descartes precisam ser números inteiros.");
  }
  const causas = lerCausasForm(form, numeros.mortes + numeros.descartes);
  if ("erro" in causas) return falha(causas.erro);
  const racao = lerRacoes(form);
  if ("erro" in racao) return falha(racao.erro);
  const agua = lerAguaForm(form);
  if ("erro" in agua) return falha(agua.erro);

  const supabase = await createClient();
  const { data: itensChecklist } = await supabase.from("checklist_itens").select("id, tipo, nome").eq("empresa_id", atual.id).eq("ativo", true);
  const checklist = lerChecklist(form, itensChecklist ?? []);
  if ("erro" in checklist) return falha(checklist.erro);

  const { error } = await supabase.rpc("editar_lancamento", {
    p_lancamento: id,
    p_turno: turno,
    p_mortes: numeros.mortes,
    p_descartes: numeros.descartes,
    p_racao_kg: racao.ok.totalKg,
    p_agua: agua.ok,
    p_observacoes: String(form.get("observacoes") ?? ""),
    p_causas: causas.ok,
    p_racoes: racao.ok.itens,
    p_checklist: checklist.ok,
  });
  if (error) {
    if (error.message.includes("baixas_cabem")) return falha("Mortes e descartes passam do número de peixes do viveiro.");
    return falha(mensagemBanco(error));
  }
  revalidar();
  return sucesso("Lançamento editado.");
}

export async function restaurarLancamento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurar_lancamento", { p_lixeira: String(form.get("id") ?? "") });
  if (error) {
    if (error.message.includes("baixas_cabem")) return falha("Não dá para restaurar: as mortes e descartes passam dos peixes que o viveiro tem hoje.");
    return falha(mensagemBanco(error));
  }
  revalidar();
  return sucesso("Lançamento restaurado.");
}

const APLICA_EM: Record<string, string> = { todos: "todos", alevinagem_recria: "alevinagem_recria", engorda: "engorda" };

export async function criarItemChecklist(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = String(form.get("nome") ?? "").trim();
  const tipo = form.get("tipo") === "numero" ? "numero" : "sim_nao";
  const aplica = APLICA_EM[String(form.get("aplica_em") ?? "")] ?? "todos";
  if (!nome) return falha("Informe o item.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: ultimo } = await supabase.from("checklist_itens").select("ordem").eq("empresa_id", atual.id)
    .order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("checklist_itens").insert({
    empresa_id: atual.id, nome, tipo, aplica_em: aplica, ordem: (ultimo?.ordem ?? 0) + 10,
    unidade: tipo === "numero" ? String(form.get("unidade") ?? "").trim() || null : null,
  });
  if (error) return falha(error.code === "23505" ? "Já existe um item com esse nome." : mensagemBanco(error));
  revalidatePath("/apontamentos", "layout");
  return sucesso(`${nome} entrou no checklist.`);
}

export async function alternarItemChecklist(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_itens").update({ ativo: form.get("ativo") === "1" })
    .eq("empresa_id", atual.id).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/apontamentos", "layout");
  return sucesso("Salvo.");
}

export async function excluirItemChecklist(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("checklist_itens").delete().eq("empresa_id", atual.id).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(error.code === "23503" ? "Esse item já tem respostas em apontamentos. Desative em vez de excluir." : mensagemBanco(error));
  revalidatePath("/apontamentos", "layout");
  return sucesso("Excluído.");
}
