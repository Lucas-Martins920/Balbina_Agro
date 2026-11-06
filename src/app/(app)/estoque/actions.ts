"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarQuantidade, hojeISO, lerCentavos, lerDecimal } from "@/lib/formato";
import { lerKg, textoKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";

export async function movimentarEstoque(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const produto = t("produto_id");
  const operacao = t("operacao");
  const quantidade = lerDecimal(t("quantidade"));
  const data = t("data");
  if (!produto) return falha("Escolha o produto.");
  if (!["entrada", "saida", "ajuste"].includes(operacao)) return falha("Escolha entrada, saída ou ajuste de saldo.");
  if (quantidade === null || quantidade < 0 || (quantidade === 0 && operacao !== "ajuste")) return falha("Informe uma quantidade válida.");
  if (!data) return falha("Informe a data.");
  const { atual } = await getEmpresaAtual();
  if (data > hojeISO(atual.fuso)) return falha("A data do lançamento não pode ser futura.");
  const custo = operacao === "entrada" && t("custo_total") ? lerCentavos(t("custo_total")) : null;
  if (operacao === "entrada" && t("custo_total") && (custo === null || custo < 0)) return falha("Custo inválido. Use o formato 1.250,00.");

  const supabase = await createClient();
  const { data: mov, error } = await supabase.rpc("movimentar_estoque", {
    p_produto: produto, p_operacao: operacao, p_quantidade: quantidade, p_deposito: t("deposito_id") || null, p_data: data,
    p_custo_total_cents: custo, p_motivo: operacao === "saida" ? t("motivo") || null : null, p_lote: t("lote_id") || null,
    p_observacao: t("observacao") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/estoque");
  revalidatePath("/produtos");
  revalidatePath("/racao");
  const dif = Number(mov);
  if (operacao === "ajuste" && dif === 0) return sucesso("Contagem bate com o sistema; nada lançado.");
  const texto = formatarQuantidade(Math.abs(dif));
  return sucesso(operacao === "ajuste" ? `Ajuste de ${dif > 0 ? "+" : "-"}${texto} lançado.` : `${operacao === "entrada" ? "Entrada" : "Saída"} de ${texto} lançada.`);
}

// Contagem do pescado na câmara: para cada classe contada, o sistema lança o ajuste da diferença.
export async function contarPescado(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const contagens: { classe: string; kg: number }[] = [];
  for (const [chave, valor] of form.entries()) {
    if (!chave.startsWith("contado_")) continue;
    const kg = lerKg(valor);
    if (kg === undefined) continue;
    if (kg === null) return falha("A contagem precisa ser em kg, como 350 ou 1.250,5.");
    contagens.push({ classe: chave.slice(8), kg });
  }
  if (!contagens.length) return falha("Informe os kg contados de pelo menos uma classe.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const obs = String(form.get("observacao") ?? "").trim() || null;
  let ajustes = 0, diferenca = 0;
  for (const c of contagens) {
    const { data, error } = await supabase.rpc("ajustar_estoque_peixe", { p_empresa: atual.id, p_classe: c.classe, p_contado: c.kg, p_observacao: obs });
    if (error) return falha(mensagemBanco(error));
    if (Number(data)) { ajustes++; diferenca += Number(data); }
  }
  revalidatePath("/estoque");
  if (!ajustes) return sucesso("A contagem bate com o sistema; nada lançado.");
  return sucesso(`${ajustes} ${ajustes === 1 ? "ajuste lançado" : "ajustes lançados"}: ${diferenca > 0 ? "+" : "-"}${textoKg(Math.abs(diferenca), 2)} no total.`);
}
