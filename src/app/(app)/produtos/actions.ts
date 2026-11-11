"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { TIPOS_PRODUTO_TODOS } from "@/lib/estoque";
import { lerCentavos, lerDecimal } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { lerIdsLote, mensagemAtivacao } from "@/lib/selecao-lote";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/produtos");
  revalidatePath("/insumos");
  revalidatePath("/racao");
  revalidatePath("/estoque");
}

export async function salvarProduto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  const tipo = t("tipo");
  const unidade = t("unidade");
  if (!nome) return falha("Informe o nome do produto.");
  if (!(tipo in TIPOS_PRODUTO_TODOS)) return falha("Escolha o tipo.");
  if (!unidade) return falha("Informe a unidade (kg, cx, un…).");

  const peixe = tipo === "peixe";
  // O formulário manda para_venda: pescado de venda (kg, caixa) vai sempre marcado; o produto que guarda o estoque
  // da classe não vai para a venda; o resto o usuário marca (ração, calcário, medicamento ficam como insumo de consumo)
  const paraVenda = form.get("para_venda") === "on";
  const fator = peixe ? lerDecimal(t("fator_kg")) : null;
  if (peixe && (!t("classe_peixe_id") || !fator || fator <= 0)) return falha("Para pescado, escolha a classe e quantos kg há em uma unidade (kg = 1, caixa = 20).");
  const minimo = t("estoque_minimo") ? lerDecimal(t("estoque_minimo")) : null;
  if (t("estoque_minimo") && (minimo === null || minimo < 0)) return falha("Estoque mínimo inválido.");
  const ncm = t("ncm").replace(/\D/g, "");
  if (ncm && ncm.length !== 8) return falha("NCM tem 8 números.");
  const cfop = t("cfop_padrao").replace(/\D/g, "");
  if (cfop && cfop.length !== 4) return falha("CFOP tem 4 números.");

  // Ficha técnica da ração (só tipo ração): fabricante, proteína bruta, grânulo, peso do saco e fase indicada
  const racao = tipo === "racao";
  const proteina = racao && t("proteina_pct") ? lerDecimal(t("proteina_pct")) : null;
  if (racao && t("proteina_pct") && (proteina === null || proteina < 0 || proteina > 70)) return falha("Proteína bruta inválida: informe a % (ex.: 32).");
  const saco = racao && t("saco_kg") ? lerDecimal(t("saco_kg")) : null;
  if (racao && t("saco_kg") && (saco === null || saco <= 0)) return falha("Peso do saco inválido (ex.: 25).");

  const dados = {
    nome, tipo, unidade,
    fabricante: racao ? t("fabricante") || null : null,
    proteina_pct: proteina,
    granulometria: racao ? t("granulometria") || null : null,
    saco_kg: saco,
    fase_recomendada: racao ? t("fase_recomendada") || null : null,
    sku: t("sku") || null,
    classe_peixe_id: peixe ? t("classe_peixe_id") : null,
    fator_kg: fator,
    estoque_minimo: peixe ? null : minimo,
    ncm: ncm ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : null,
    cfop_padrao: cfop || null,
    categoria_financeira_id: t("categoria_financeira_id") || null,
    observacoes: t("observacoes") || null,
    ativo: form.get("ativo") === "on",
    para_venda: paraVenda,
  };

  // Preço de venda: só quem pode alterar preços; vai para a tabela padrão. Produto que deixa de ser vendido
  // tem o preço encerrado (fica no histórico).
  const temPreco = (form.has("preco_venda") || (id !== "" && !paraVenda)) && (await getPermissoes()).pode("vendas.precos");
  const preco = temPreco && paraVenda && t("preco_venda") ? lerCentavos(t("preco_venda")) : null;
  if (temPreco && t("preco_venda") && preco === null) return falha("Preço de venda inválido. Use o formato 12,50.");

  // Ficha de embalagem (só pescado de venda): pares embalagem + quantidade; linha sem embalagem é ignorada
  const ficha: { embalagem_id: string; quantidade: number }[] = [];
  if (peixe && form.has("ficha_embalagem")) {
    const ids = form.getAll("emb_id").map(String);
    const qtds = form.getAll("emb_qtd").map(String);
    for (const [i, embalagem] of ids.entries()) {
      if (!embalagem) continue;
      const quantidade = qtds[i]?.trim() ? lerDecimal(qtds[i].trim()) : 1;
      if (!quantidade || quantidade <= 0) return falha("Quantidade de embalagem inválida.");
      if (ficha.some((f) => f.embalagem_id === embalagem)) return falha("A mesma embalagem aparece duas vezes na ficha.");
      ficha.push({ embalagem_id: embalagem, quantidade });
    }
  }

  const supabase = await createClient();
  let produtoId = id;
  if (id) {
    const { error } = await supabase.from("produtos").update(dados).eq("id", id);
    if (error) return falha(mensagemBanco(error));
  } else {
    const { atual } = await getEmpresaAtual();
    const { data, error } = await supabase.from("produtos").insert({ ...dados, empresa_id: atual.id }).select("id").single();
    if (error) return falha(mensagemBanco(error));
    produtoId = data.id;
  }
  if (peixe && form.has("ficha_embalagem")) {
    const { atual } = await getEmpresaAtual();
    let { error } = await supabase.from("produto_embalagens").delete().eq("produto_id", produtoId);
    if (!error && ficha.length) {
      ({ error } = await supabase.from("produto_embalagens")
        .insert(ficha.map((f) => ({ ...f, empresa_id: atual.id, produto_id: produtoId }))));
    }
    if (error) return falha(`Produto salvo, mas a ficha de embalagem não: ${mensagemBanco(error)}`);
  }
  if (temPreco) {
    const { data: atual } = await supabase.rpc("preco_vigente", { p_produto: produtoId });
    if (preco !== null && preco !== (atual === null ? null : Number(atual))) {
      const { error } = await supabase.rpc("definir_preco", { p_produto: produtoId, p_preco_cents: preco });
      if (error) return falha(`Produto salvo, mas o preço não: ${mensagemBanco(error)}`);
    } else if (preco === null && atual !== null) {
      const { error } = await supabase.rpc("remover_preco", { p_produto: produtoId });
      if (error) return falha(`Produto salvo, mas o preço não: ${mensagemBanco(error)}`);
    }
    revalidatePath("/tabelas-de-preco");
    revalidatePath("/vendas", "layout");
  }
  revalidar();
  return sucesso(id ? `${nome} atualizado.` : `${nome} cadastrado.`);
}

export async function excluirProduto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("produtos").delete({ count: "exact" }).eq("id", id);
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para excluir produtos.");
  revalidar();
  return sucesso("Produto excluído.");
}

// Ativa ou desativa vários produtos de uma vez. Desativar só oculta (vendas, PDV, lançamentos); o histórico fica.
// O produto que guarda o estoque de pescado da classe nunca é desativado por aqui.
export async function ativarProdutosEmLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const lidos = lerIdsLote(form.getAll("ids"));
  if ("erro" in lidos) return falha(lidos.erro);
  const acao = String(form.get("acao") ?? "");
  if (acao !== "ativar" && acao !== "desativar") return falha("Ação inválida.");
  const ativo = acao === "ativar";

  const supabase = await createClient();
  let base = 0;
  if (!ativo) {
    const { count, error } = await supabase.from("produtos").select("id", { count: "exact", head: true })
      .in("id", lidos.ids).eq("base_estoque", true);
    if (error) return falha(mensagemBanco(error));
    base = count ?? 0;
    if (base === lidos.ids.length) return falha("Estes produtos guardam o estoque de pescado da classe e ficam sempre ativos.");
  }
  let consulta = supabase.from("produtos").update({ ativo }, { count: "exact" }).in("id", lidos.ids);
  if (!ativo) consulta = consulta.eq("base_estoque", false);
  const { error, count } = await consulta;
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para alterar produtos.");
  revalidar();
  revalidatePath("/tabelas-de-preco");
  revalidatePath("/vendas", "layout");
  return sucesso(mensagemAtivacao(count, ativo, base));
}
