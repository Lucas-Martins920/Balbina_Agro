"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { COMPONENTES_CUSTO, GRUPOS_CATEGORIA } from "@/lib/titulos";

export async function salvarCategoria(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  const parent = t("parent_id");
  let grupo = t("grupo");
  let sentido = t("sentido");
  if (!nome) return falha("Informe o nome da categoria.");

  const supabase = await createClient();
  // Subcategoria herda grupo e sentido da categoria pai (o banco confere de novo)
  if (parent) {
    if (parent === id) return falha("Uma categoria não pode ficar dentro dela mesma.");
    const { data: pai } = await supabase.from("categorias").select("grupo, sentido").eq("id", parent).maybeSingle();
    if (!pai) return falha("Categoria pai não encontrada.");
    ({ grupo, sentido } = pai);
  }
  if (!(grupo in GRUPOS_CATEGORIA)) return falha("Escolha o grupo do DRE.");
  if (sentido !== "entrada" && sentido !== "saida") return falha("Escolha se é entrada ou saída.");

  const componente = t("componente_custo");
  const dados = {
    nome, grupo, sentido, parent_id: parent || null, codigo: t("codigo") || null,
    // subcategoria sem escolha própria usa o componente da principal
    componente_custo: grupo === "custo_operacional" && componente in COMPONENTES_CUSTO ? componente : null,
    ativa: form.get("ativa") === "on",
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data: atual } = await supabase.from("categorias").select("sistema").eq("id", id).maybeSingle();
    const { error, count } = await supabase.from("categorias")
      .update(atual?.sistema ? { codigo: dados.codigo, updated_at: dados.updated_at } : dados, { count: "exact" }).eq("id", id);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar categorias.");
    // filhas acompanham grupo e sentido de uma categoria principal
    if (!parent && !atual?.sistema) {
      await supabase.from("categorias").update({ grupo, sentido, updated_at: dados.updated_at }).eq("parent_id", id);
    }
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("categorias").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(mensagemBanco(error));
  }
  revalidatePath("/categorias");
  return sucesso(id ? `Categoria ${nome} atualizada.` : `Categoria ${nome} criada.`);
}

export async function excluirCategoria(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("categorias").delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (error.code === "23503") return falha("Esta categoria tem subcategorias ou lançamentos. Desative em vez de excluir.");
    return falha(mensagemBanco(error));
  }
  if (!count) return falha("Seu usuário não tem permissão para excluir categorias.");
  revalidatePath("/categorias");
  return sucesso("Categoria excluída.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grava a ordem de um grupo de irmãos (arrastar na lista). O banco confere permissão e nível.
export async function reordenarCategorias(ids: string[]): Promise<{ erro?: string }> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000 || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return { erro: "Lista de categorias inválida." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reordenar_categorias", { p_ids: ids });
  if (error) return { erro: mensagemBanco(error) };
  if (data !== ids.length) return { erro: "Seu usuário não tem permissão para mudar a ordem das categorias." };
  revalidatePath("/categorias");
  return {};
}

// Plano de categorias padrão da piscicultura de engorda: deixa só as categorias do plano. Cria o que falta; as que
// não são do plano são apagadas, ou desativadas quando têm lançamento (o histórico fica). O banco confere permissão.
export async function aplicarPlanoPadrao(): Promise<{ erro?: string; mensagem?: string }> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restaurar_plano_categorias", { p_empresa: atual.id });
  if (error) return { erro: mensagemBanco(error) };
  const { criadas = 0, apagadas = 0, desativadas = 0 } = (data ?? {}) as { criadas?: number; apagadas?: number; desativadas?: number };
  revalidatePath("/categorias");
  if (!criadas && !apagadas && !desativadas) return { mensagem: "Já estava só com as categorias padrão. Nada mudou." };
  const n = (q: number, um: string, varios: string) => (q ? `${q} ${q === 1 ? um : varios}` : "");
  const partes = [n(criadas, "criada", "criadas"), n(apagadas, "apagada", "apagadas"),
    n(desativadas, "desativada por ter lançamentos", "desativadas por terem lançamentos")].filter(Boolean);
  return { mensagem: `Ficaram só as categorias padrão: ${partes.join(", ")}.` };
}
