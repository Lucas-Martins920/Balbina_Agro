"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerDecimal, lerInteiro } from "@/lib/formato";
import { FINALIDADES_VIVEIRO, SISTEMAS_VIVEIRO } from "@/lib/rotulos";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/piscicultura");
  revalidatePath("/lotes");
  revalidatePath("/centros-de-custo");
}

// Medida opcional do viveiro: vazio fica sem valor; o que vier tem de ser positivo
function lerMedida(form: FormData, campo: string): number | null | undefined {
  const bruto = String(form.get(campo) ?? "").trim();
  if (!bruto) return null;
  const n = lerDecimal(bruto);
  return n !== null && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

export async function salvarSetor(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  const uf = t("uf").toUpperCase();
  if (!nome) return falha("Informe o nome do setor.");
  if (uf && !/^[A-Z]{2}$/.test(uf)) return falha("UF com duas letras.");
  const dados = {
    nome,
    licenca_ambiental: t("licenca_ambiental") || null,
    endereco: { logradouro: t("logradouro"), cidade: t("cidade"), uf },
    ativo: form.get("ativo") === "on",
  };
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("setores").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar a piscicultura.");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("setores").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(mensagemBanco(error));
  }
  revalidar();
  return sucesso(id ? `Setor ${nome} atualizado.` : `Setor ${nome} criado.`);
}

export async function excluirSetor(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("setores").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) {
    if (error.code === "23503") return falha("Este setor ainda tem viveiros. Exclua ou mude os viveiros de setor antes.");
    return falha(mensagemBanco(error));
  }
  if (!count) return falha("Seu usuário não tem permissão para excluir setores.");
  revalidar();
  return sucesso("Setor excluído.");
}

export async function salvarViveiro(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const setor = t("setor_id");
  const nome = t("nome");
  const capacidade = lerInteiro(form.get("capacidade_peixes"));
  const finalidade = t("finalidade");
  const sistema = t("sistema");
  const area = lerMedida(form, "area_m2");
  const volume = lerMedida(form, "volume_m3");
  const profundidade = lerMedida(form, "profundidade_m");
  if (!setor) return falha("Escolha o setor.");
  if (!nome) return falha("Informe o nome do viveiro.");
  if (!capacidade || capacidade <= 0) return falha("Informe a capacidade em número de peixes.");
  if (!(finalidade in FINALIDADES_VIVEIRO) || !(sistema in SISTEMAS_VIVEIRO)) return falha("Escolha a finalidade e o sistema.");
  if (area === undefined) return falha("Informe a área em m², maior que zero, ou deixe em branco.");
  if (volume === undefined) return falha("Informe o volume em m³, maior que zero, ou deixe em branco.");
  if (profundidade === undefined || (profundidade !== null && profundidade > 20)) return falha("Informe a profundidade em metros, entre 0 e 20, ou deixe em branco.");

  const supabase = await createClient();
  const dados = {
    setor_id: setor, nome, finalidade, sistema, capacidade_peixes: capacidade,
    area_m2: area, volume_m3: volume, profundidade_m: profundidade,
    aeracao: form.get("aeracao") === "on", ativo: form.get("ativo") === "on",
  };
  if (id) {
    const { data: ocupacao } = await supabase.from("alocacoes_atuais").select("peixes_atuais").eq("viveiro_id", id);
    const peixes = (ocupacao ?? []).reduce((s, o) => s + Number(o.peixes_atuais ?? 0), 0);
    if (peixes > capacidade) return falha(`O viveiro tem ${peixes} peixes hoje; a capacidade não pode ficar abaixo disso.`);
    const { error, count } = await supabase.from("viveiros").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar a piscicultura.");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("viveiros").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(mensagemBanco(error));
  }
  revalidar();
  return sucesso(id ? `Viveiro ${nome} atualizado.` : `Viveiro ${nome} criado.`);
}

export async function excluirViveiro(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("viveiros").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) {
    if (error.code === "23503") return falha("Este viveiro já teve lotes ou apontamentos. Desative em vez de excluir.");
    return falha(mensagemBanco(error));
  }
  if (!count) return falha("Seu usuário não tem permissão para excluir viveiros.");
  revalidar();
  return sucesso("Viveiro excluído.");
}

// Classes do pescado por peso do peixe: a despesca separa por elas e cada uma vira um estoque próprio.
// Classe não se exclui (o produto de estoque dela fica no histórico): deixa de ser comercializável.
export async function salvarClasse(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  const min = lerMedida(form, "peso_min_g");
  const max = lerMedida(form, "peso_max_g");
  const ordem = lerInteiro(form.get("ordem")) ?? 0;
  if (!nome) return falha("Informe o nome da classe.");
  if (/^peixe\b/i.test(nome)) return falha("Use só o tamanho no nome (ex.: Grande); o sistema já chama o produto de Peixe grande.");
  if (min === undefined || max === undefined) return falha("Informe os pesos em gramas, maiores que zero, ou deixe em branco.");
  if (min !== null && max !== null && max <= min) return falha("O peso máximo tem de ser maior que o mínimo.");
  const dados = { nome, peso_min_g: min, peso_max_g: max, ordem, comercializavel: form.get("comercializavel") === "on" };

  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("classes_peixe").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(error.code === "23505" ? `Já existe a classe ${nome}.` : mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar as classes (Estoque ou Configurações).");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("classes_peixe").insert({ ...dados, empresa_id: atual.id });
    if (error) {
      if (error.code === "23505") return falha(`Já existe a classe ${nome}.`);
      if (error.code === "42501") return falha("Seu usuário não tem permissão para criar classes (Estoque ou Configurações).");
      return falha(mensagemBanco(error));
    }
  }
  revalidatePath("/piscicultura");
  revalidatePath("/despescas");
  revalidatePath("/produtos");
  return sucesso(id ? `Classe ${nome} atualizada.` : `Classe ${nome} criada${dados.comercializavel ? ", com os produtos de venda (kg e caixa)" : ""}.`);
}

