"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarInteiro, hojeISO } from "@/lib/formato";
import { lerKg, lerPeixes, textoKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  for (const p of ["/despescas", "/estoque", "/lotes", "/piscicultura", "/painel", "/campo", "/custo-do-kg"]) revalidatePath(p, p === "/lotes" ? "layout" : "page");
}

// Despesca do viveiro. Os kg separados por classe de tamanho são opcionais: o que sobra do total entra como
// "Inteiro" (sem classificação), que também é vendido.
export async function registrarDespesca(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const viveiro = t("viveiro_id");
  const data = t("data");
  const tipo = t("tipo");
  const kg = lerKg(form.get("kg"));
  const peixes = lerPeixes(form.get("qtd_peixes"));
  if (!viveiro) return falha("Escolha o viveiro.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha("Informe a data da despesca.");
  const { atual } = await getEmpresaAtual();
  if (data > hojeISO(atual.fuso)) return falha("A data da despesca não pode ser futura.");
  if (tipo !== "parcial" && tipo !== "total") return falha("Escolha despesca parcial ou total.");
  if (kg === undefined || kg === null || kg <= 0) return falha("Informe os kg despescados, como 1.250,5.");
  if (peixes === null) return falha("Quantidade de peixes precisa ser um número inteiro.");

  const classes: Record<string, number> = {};
  let separados = 0;
  for (const [chave, valor] of form.entries()) {
    if (!chave.startsWith("classe_")) continue;
    const q = lerKg(valor);
    if (q === null) return falha("Os kg de cada classe precisam ser números, como 350 ou 350,5.");
    if (!q) continue;
    classes[chave.slice(7)] = q;
    separados += q;
  }
  const inteiro = t("inteiro_id");
  if (separados > kg + 0.05) return falha(`As classes somam ${textoKg(separados, 2)}, mais que o total de ${textoKg(kg, 2)}.`);
  if (separados > 0 && kg - separados > 0.0005) {
    if (!inteiro) return falha("As classes precisam somar o total despescado.");
    classes[inteiro] = Math.round((kg - separados + (classes[inteiro] ?? 0)) * 1000) / 1000;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_despesca", {
    p_empresa: atual.id, p_viveiro: viveiro, p_data: data, p_tipo: tipo, p_kg: kg,
    p_qtd_peixes: peixes ?? null, p_classes: Object.keys(classes).length ? classes : null,
    p_observacoes: t("observacoes") || null, p_client_id: t("client_id") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`Despesca ${tipo} de ${textoKg(kg)}${peixes ? ` (${formatarInteiro(peixes)} peixes)` : ""} lançada; o peixe entrou no estoque.`);
}

export async function desfazerDespesca(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("desfazer_despesca", { p_despesca: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Despesca desfeita: os peixes voltaram ao viveiro e os kg saíram do estoque.");
}
