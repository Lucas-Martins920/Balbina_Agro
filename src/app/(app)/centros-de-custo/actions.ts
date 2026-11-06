"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// Setor, viveiro e lote têm centro de custo automático, editado nas telas deles.
const TIPOS_MANUAIS = ["geral", "fabrica_racao", "comercial", "administrativo"];

export async function salvarCentroCusto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  const tipo = t("tipo") || "geral";
  const parent = t("parent_id");
  if (!nome) return falha("Informe o nome do centro de custo.");
  if (!TIPOS_MANUAIS.includes(tipo)) return falha("Escolha o tipo.");
  if (parent && parent === id) return falha("Um centro de custo não pode ficar dentro dele mesmo.");

  const supabase = await createClient();
  const dados = { nome, tipo, parent_id: parent || null, ativo: form.get("ativo") === "on", updated_at: new Date().toISOString() };
  if (id) {
    const { error, count } = await supabase.from("centros_custo").update(dados, { count: "exact" }).eq("id", id).in("tipo", TIPOS_MANUAIS);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha("Este centro de custo não pode ser editado aqui ou seu usuário não tem permissão.");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("centros_custo").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(mensagemBanco(error));
  }
  revalidatePath("/centros-de-custo");
  return sucesso(id ? `Centro de custo ${nome} atualizado.` : `Centro de custo ${nome} criado.`);
}

export async function excluirCentroCusto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("centros_custo").delete({ count: "exact" }).eq("id", id).in("tipo", TIPOS_MANUAIS);
  if (error) {
    if (error.code === "23503") return falha("Este centro de custo tem lançamentos ou outros centros dentro dele. Desative em vez de excluir.");
    return falha(mensagemBanco(error));
  }
  if (!count) return falha("Este centro de custo não pode ser excluído aqui ou seu usuário não tem permissão.");
  revalidatePath("/centros-de-custo");
  return sucesso("Centro de custo excluído.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grava a ordem de um grupo de irmãos (arrastar na lista). O banco confere permissão e nível.
export async function reordenarCentrosCusto(ids: string[]): Promise<{ erro?: string }> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000 || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return { erro: "Lista de centros de custo inválida." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reordenar_centros_custo", { p_ids: ids });
  if (error) return { erro: mensagemBanco(error) };
  if (data !== ids.length) return { erro: "Seu usuário não tem permissão para mudar a ordem dos centros de custo." };
  revalidatePath("/centros-de-custo");
  return {};
}

// Centros de custo padrão da piscicultura de engorda: deixa só os padrão e a estrutura da piscicultura (setores, viveiros,
// lotes). Os outros são apagados, ou desativados quando têm lançamentos. O banco confere permissão.
export async function aplicarCentrosPadrao(): Promise<{ erro?: string; mensagem?: string }> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurar_centros_custo", { p_empresa: atual.id });
  if (error) return { erro: mensagemBanco(error) };
  const { criados = 0, apagados = 0, desativados = 0 } = (data ?? {}) as { criados?: number; apagados?: number; desativados?: number };
  revalidatePath("/centros-de-custo");
  if (!criados && !apagados && !desativados) return { mensagem: "Já estava só com os centros padrão. Nada mudou." };
  const n = (q: number, um: string, varios: string) => (q ? `${q} ${q === 1 ? um : varios}` : "");
  const partes = [n(criados, "criado", "criados"), n(apagados, "apagado", "apagados"),
    n(desativados, "desativado por ter lançamentos", "desativados por terem lançamentos")].filter(Boolean);
  return { mensagem: `Ficaram só os centros padrão: ${partes.join(", ")}.` };
}
