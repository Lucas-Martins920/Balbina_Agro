"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarQuantidade, lerCentavos, lerDecimal } from "@/lib/formato";
import { numeroEntrada } from "@/lib/racao-estoque";
import { createClient } from "@/lib/supabase/server";

// As regras (validade, ração vencida, FEFO, saldo negativo, motivo, permissão) ficam no banco; aqui só a leitura
// do formulário e a mensagem.
const texto = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

function atualizarTelas() {
  revalidatePath("/racao");
  revalidatePath("/estoque");
  revalidatePath("/insumos");
}

// Entrada de ração numerada (R-1, R-2...): sacos ou kg, lote de fabricação, validade, preço e fornecedor.
export async function lancarEntradaRacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = texto(form);
  const produto = t("produto_id");
  if (!produto) return falha("Escolha a ração.");
  const sacos = t("sacos") ? lerDecimal(t("sacos")) : null;
  const kg = t("kg") ? lerDecimal(t("kg")) : null;
  if ((t("sacos") && (sacos === null || sacos <= 0)) || (t("kg") && (kg === null || kg <= 0))) return falha("Informe uma quantidade válida.");
  if (sacos === null && kg === null) return falha("Informe os sacos ou os kg que chegaram.");
  if (!t("validade")) return falha("Informe a validade da ração.");
  const custo = t("custo_total") ? lerCentavos(t("custo_total")) : null;
  if (t("custo_total") && (custo === null || custo < 0)) return falha("Valor inválido. Use o formato 1.250,00.");

  const supabase = await createClient();
  const { data: numero, error } = await supabase.rpc("registrar_entrada_racao", {
    p_produto: produto, p_validade: t("validade"), p_sacos: sacos, p_kg: kg, p_deposito: t("deposito_id") || null,
    p_data: t("data") || null, p_custo_total_cents: custo, p_lote_fabricacao: t("lote_fabricacao") || null,
    p_fabricacao: t("fabricacao") || null, p_fornecedor: t("fornecedor_id") || null, p_observacoes: t("observacoes") || null,
  });
  if (error) return falha(mensagemBanco(error));
  atualizarTelas();
  return sucesso(`Entrada ${numeroEntrada(Number(numero))} lançada.`);
}

export async function excluirEntradaRacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  if (!id) return falha("Entrada não encontrada.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_entrada_racao", { p_entrada: id });
  if (error) return falha(mensagemBanco(error));
  atualizarTelas();
  return sucesso("Entrada excluída.");
}

// Ajuste de uma entrada: saldo contado, tipo e motivo (o banco guarda o saldo antes e depois)
export async function ajustarEntradaRacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = texto(form);
  if (!t("entrada_id")) return falha("Escolha a entrada.");
  const contado = lerDecimal(t("kg_contado"));
  if (contado === null || contado < 0) return falha("Informe o saldo contado em kg (zero se não sobrou nada).");
  if (!t("tipo")) return falha("Escolha o tipo do ajuste.");
  if (!t("motivo")) return falha("Informe o motivo do ajuste.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ajustar_entrada_racao", { p_entrada: t("entrada_id"), p_kg_contado: contado, p_tipo: t("tipo"), p_motivo: t("motivo") });
  if (error) return falha(mensagemBanco(error));
  atualizarTelas();
  const dif = Number(data);
  if (!dif) return sucesso("O saldo contado bate com o sistema; nada lançado.");
  return sucesso(`Ajuste de ${dif > 0 ? "+" : "-"}${formatarQuantidade(Math.abs(dif))} kg lançado.`);
}

// Estorno de uma saída manual: a ração volta às mesmas entradas, a saída original fica no histórico
export async function estornarSaidaRacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = texto(form);
  if (!t("baixa_id")) return falha("Saída não encontrada.");
  if (!t("motivo")) return falha("Informe o motivo do estorno.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_baixa_racao", { p_baixa: t("baixa_id"), p_motivo: t("motivo") });
  if (error) return falha(mensagemBanco(error));
  atualizarTelas();
  return sucesso("Saída estornada: a ração voltou para as entradas de onde saiu.");
}

// Reserva de sacos, prazo do fornecedor e amostra da biometria
export async function salvarParametrosRacao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = texto(form);
  const inteiro = (k: string) => (/^\d+$/.test(t(k)) ? Number(t(k)) : null);
  const reserva = inteiro("reserva_sacos");
  const prazo = inteiro("prazo_entrega_dias");
  const pct = lerDecimal(t("amostra_pct"));
  const min = inteiro("amostra_min");
  const max = inteiro("amostra_max");
  if (reserva === null || reserva > 200) return falha("Reserva: de 0 a 200 sacos.");
  if (prazo === null || prazo > 90) return falha("Prazo do fornecedor: de 0 a 90 dias.");
  if (pct === null || pct <= 0 || pct > 100) return falha("Amostra: porcentagem entre 0,1 e 100.");
  if (min === null || max === null || min < 1 || max < min) return falha("Amostra: o mínimo precisa ser pelo menos 1 e não passar do máximo.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("racao_parametros").upsert({
    empresa_id: atual.id, reserva_sacos: reserva, prazo_entrega_dias: prazo, amostra_pct: pct, amostra_min: min, amostra_max: max,
    updated_at: new Date().toISOString(),
  });
  if (error) return falha(mensagemBanco(error));
  atualizarTelas();
  revalidatePath("/lotes", "layout");
  return sucesso(`Reserva de ${reserva} ${reserva === 1 ? "saco" : "sacos"}, prazo de ${prazo} dias e amostra de ${String(pct).replace(".", ",")}% (${min} a ${max} peixes).`);
}
