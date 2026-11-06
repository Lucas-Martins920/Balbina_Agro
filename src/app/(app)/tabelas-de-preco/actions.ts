"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos, lerDecimal } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

async function exigir(chave: string) {
  const { pode } = await getPermissoes();
  return pode(chave) ? null : "Seu usuário não tem permissão para alterar preços.";
}

function revalidar() {
  revalidatePath("/tabelas-de-preco");
  revalidatePath("/produtos");
  revalidatePath("/contatos");
  revalidatePath("/vendas", "layout");
}

// Salva o cabeçalho e os preços de uma vez. Campo de preço vazio tira o produto da tabela.
export async function salvarTabelaPreco(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const negado = await exigir("vendas.precos");
  if (negado) return falha(negado);
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id") || null;
  const nome = t("nome");
  if (!nome) return falha("Dê um nome para a tabela, como Atacado ou Varejo.");
  const padrao = form.get("padrao") === "on";
  const ajuste = padrao || !t("ajuste_pct") ? 0 : lerDecimal(t("ajuste_pct"));
  if (ajuste === null || ajuste <= -100 || ajuste > 1000) return falha("Ajuste inválido. Use, por exemplo, -10 para 10% abaixo da padrão.");

  const precos: { produto_id: string; preco_cents: number | null }[] = [];
  for (const produto of form.getAll("produtos").map(String)) {
    const texto = t(`preco_${produto}`);
    const preco = texto ? lerCentavos(texto) : null;
    if (texto && preco === null) return falha(`Preço inválido: “${texto}”. Use o formato 12,50.`);
    precos.push({ produto_id: produto, preco_cents: preco });
  }

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_tabela_preco", {
    p_empresa: atual.id, p_id: id, p_nome: nome, p_padrao: padrao, p_ativa: padrao || form.get("ativa") === "on",
    p_ajuste_pct: Math.round(ajuste * 100) / 100, p_observacoes: t("observacoes"), p_precos: precos,
  });
  if (error) return falha(error.code === "23505" ? "Já existe uma tabela com esse nome." : mensagemBanco(error));
  revalidar();
  return sucesso(id ? `${nome} atualizada.` : `${nome} criada.`);
}

export async function excluirTabelaPreco(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const negado = await exigir("vendas.precos");
  if (negado) return falha(negado);
  const supabase = await createClient();
  const { error, count } = await supabase.from("listas_preco").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para excluir tabelas de preço.");
  revalidar();
  return sucesso("Tabela excluída.");
}
