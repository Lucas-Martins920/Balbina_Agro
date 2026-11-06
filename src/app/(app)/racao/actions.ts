"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { LINHAS_FORMULA, TIPOS_DEPOSITO, TIPOS_PRODUTO } from "@/lib/estoque";
import { formatarMoeda, formatarNumero, lerCentavos, lerDecimal } from "@/lib/formato";
import { montarItensFormula, type LinhaFormula } from "@/lib/formula-racao";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/racao");
  revalidatePath("/estoque");
  revalidatePath("/apontamentos");
}

export async function criarProduto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = String(form.get("nome") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "");
  const unidade = String(form.get("unidade") ?? "").trim() || "kg";
  if (!nome) return falha("Informe o nome.");
  if (!(tipo in TIPOS_PRODUTO)) return falha("Escolha o tipo.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").insert({ empresa_id: atual.id, nome, tipo, unidade });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`${nome} cadastrado.`);
}

export async function criarDeposito(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = String(form.get("nome") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "");
  if (!nome || !(tipo in TIPOS_DEPOSITO)) return falha("Informe o nome e o tipo do depósito.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("depositos").insert({ empresa_id: atual.id, nome, tipo });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`Depósito ${nome} criado.`);
}

export async function registrarEntrada(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const quantidade = lerDecimal(form.get("quantidade"));
  const custo = lerCentavos(form.get("custo_total"));
  const data = String(form.get("data") ?? "");
  if (!quantidade || quantidade <= 0) return falha("Informe a quantidade.");
  if (custo === null) return falha("Informe o custo total da compra, ex.: 12.500,00.");
  if (!data) return falha("Informe a data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_entrada", {
    p_produto: String(form.get("produto_id") ?? ""), p_deposito: String(form.get("deposito_id") ?? ""),
    p_data: data, p_quantidade: quantidade, p_custo_total_cents: custo, p_observacao: String(form.get("observacao") ?? ""),
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`Entrada lançada a ${formatarMoeda(Math.round(custo / quantidade))} por unidade.`);
}

export async function registrarSaida(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const quantidade = lerDecimal(form.get("quantidade"));
  if (!quantidade || quantidade <= 0) return falha("Informe a quantidade.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_saida", {
    p_produto: String(form.get("produto_id") ?? ""), p_deposito: String(form.get("deposito_id") ?? ""),
    p_data: String(form.get("data") ?? ""), p_quantidade: quantidade, p_tipo: String(form.get("tipo") ?? "consumo_lote"),
    p_lote: String(form.get("lote_id") ?? "") || null, p_observacao: String(form.get("observacao") ?? ""),
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Saída lançada.");
}

export async function salvarFormula(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const racao = String(form.get("racao_id") ?? "");
  if (!racao) return falha("Escolha a ração.");
  const linhas: LinhaFormula[] = [];
  for (let i = 0; i < LINHAS_FORMULA; i++) {
    const insumo = String(form.get(`insumo_${i}`) ?? "");
    const texto = String(form.get(`kg_${i}`) ?? "").trim();
    if (!insumo && !texto) continue;
    linhas.push({ insumo_id: insumo, quantidade: lerDecimal(texto), linha: i + 1 });
  }
  // A batida pode ter qualquer total: em kg vale a soma; em % vale o total informado.
  const r = montarItensFormula(linhas, form.get("medida") === "pct" ? "pct" : "kg", lerDecimal(form.get("total_kg")));
  if (!r.ok) return falha(r.erro);
  const supabase = await createClient();
  const { error } = await supabase.rpc("salvar_formula", { p_racao: racao, p_fase: String(form.get("fase") ?? ""), p_itens: r.itens });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`Fórmula salva (batida de ${formatarNumero(r.total, 1)} kg). A versão anterior fica no histórico.`);
}

export async function produzirRacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const quantidade = lerDecimal(form.get("toneladas"));
  if (!quantidade || quantidade <= 0) return falha("Informe a quantidade.");
  const formula = String(form.get("formula_id") ?? "");
  const supabase = await createClient();
  let toneladas = quantidade;
  if (form.get("unidade") === "batidas") {
    const { data } = await supabase.from("formulas_racao").select("total_kg").eq("id", formula).maybeSingle();
    if (!data) return falha("Escolha a fórmula.");
    toneladas = Math.round(quantidade * Number(data.total_kg)) / 1000;
  }
  const { error } = await supabase.rpc("produzir_racao", {
    p_formula: formula, p_data: String(form.get("data") ?? ""), p_toneladas: toneladas,
    p_deposito_insumos: String(form.get("deposito_insumos") ?? ""), p_deposito_destino: String(form.get("deposito_destino") ?? ""),
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`${formatarNumero(toneladas, 3)} t produzidas.`);
}
