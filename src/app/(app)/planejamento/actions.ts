"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos, lerDecimal, lerInteiro } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/planejamento", "layout");
}

const SEM_PERMISSAO = "Seu usuário não tem permissão para editar o planejamento.";

export async function salvarParametros(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const inteiro = (k: string) => lerInteiro(t(k));
  const dinheiro = (k: string) => (t(k) ? lerCentavos(t(k)) : null);
  const dados = {
    semanas_alevinagem: inteiro("semanas_alevinagem"),
    semanas_recria: inteiro("semanas_recria"),
    semanas_cultivo: inteiro("semanas_cultivo"),
    vazio_alevinagem_dias: inteiro("vazio_alevinagem_dias"),
    vazio_recria_dias: inteiro("vazio_recria_dias"),
    vazio_engorda_dias: inteiro("vazio_engorda_dias"),
    intervalo_lotes_semanas: inteiro("intervalo_lotes_semanas"),
    peixes_por_lote: t("peixes_por_lote") ? inteiro("peixes_por_lote") : null,
    meta_peixes: t("meta_peixes") ? inteiro("meta_peixes") : null,
    especie_id: t("especie_id") || null,
    horizonte_meses: inteiro("horizonte_meses"),
    peso_povoamento_g: lerDecimal(t("peso_povoamento_g")),
    preco_kg_cents: dinheiro("preco_kg"),
    racao_alevinagem_kg_cents: dinheiro("racao_alevinagem_kg"),
    racao_recria_kg_cents: dinheiro("racao_recria_kg"),
    racao_engorda_kg_cents: dinheiro("racao_engorda_kg"),
    mortalidade_recria_pct: lerDecimal(t("mortalidade_recria_pct")) ?? 0,
    mortalidade_engorda_pct: lerDecimal(t("mortalidade_engorda_pct")) ?? 0,
    perda_despesca_pct: lerDecimal(t("perda_despesca_pct")) ?? 0,
  };
  for (const [k, v] of Object.entries(dados)) {
    if (v === null && !["peixes_por_lote", "meta_peixes", "especie_id", "peso_povoamento_g"].includes(k) && !k.endsWith("_cents")) return falha("Preencha todos os prazos com números inteiros.");
  }
  for (const k of ["preco_kg", "racao_alevinagem_kg", "racao_recria_kg", "racao_engorda_kg"]) {
    if (t(k) && lerCentavos(t(k)) === null) return falha("Valor inválido. Use o formato 12,34.");
  }
  if (!dados.peso_povoamento_g || dados.peso_povoamento_g <= 0 || dados.peso_povoamento_g > 2000) return falha("Informe o peso médio dos alevinos no povoamento, em gramas (até 2.000 g).");
  if (t("peixes_por_lote") && !dados.peixes_por_lote) return falha("Alevinos por lote precisa ser um número inteiro.");
  if (t("meta_peixes") && !dados.meta_peixes) return falha("A meta de peixes precisa ser um número inteiro.");
  if ((dados.semanas_cultivo ?? 0) <= (dados.semanas_alevinagem ?? 0) + (dados.semanas_recria ?? 0)) {
    return falha("As semanas de cultivo até a despesca precisam passar da alevinagem + recria: o lote precisa de tempo na engorda.");
  }

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("planejamento_parametros").upsert({ empresa_id: atual.id, ...dados }, { onConflict: "empresa_id" });
  if (error) {
    if (error.message.includes("row-level security")) return falha(SEM_PERMISSAO);
    if (error.message.includes("engorda_depois_da_recria")) return falha("As semanas de cultivo até a despesca precisam passar da alevinagem + recria.");
    if (error.message.includes("_check")) return falha("Algum prazo está fora da faixa: alevinagem até 20 semanas, recria até 40, cultivo de 8 a 104 e vazio até 120 dias.");
    return falha(mensagemBanco(error));
  }
  revalidar();
  return sucesso("Parâmetros salvos. A previsão já foi refeita.");
}

export async function salvarLotePlanejado(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const qtd = lerInteiro(t("qtd_peixes"));
  if (!t("codigo")) return falha("Dê um código ao lote planejado.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t("data_povoamento"))) return falha("Informe a data do povoamento.");
  if (!qtd || qtd <= 0) return falha("Informe a quantidade de alevinos.");
  const dados = {
    codigo: t("codigo"),
    data_povoamento: t("data_povoamento"),
    qtd_peixes: qtd,
    especie_id: t("especie_id") || null,
    viveiro_alevinagem_id: t("viveiro_alevinagem_id") || null,
    viveiro_recria_id: t("viveiro_recria_id") || null,
    viveiro_engorda_id: t("viveiro_engorda_id") || null,
    situacao: ["planejado", "confirmado", "povoado", "cancelado"].includes(t("situacao")) ? t("situacao") : "planejado",
    observacoes: t("observacoes") || null,
  };
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("lotes_planejados").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha(SEM_PERMISSAO);
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("lotes_planejados").insert({ ...dados, empresa_id: atual.id });
    if (error) {
      if (error.message.includes("row-level security")) return falha(SEM_PERMISSAO);
      if (error.code === "23505") return falha("Já existe um lote planejado com esse código.");
      return falha(mensagemBanco(error));
    }
  }
  revalidar();
  return sucesso(`Lote ${dados.codigo} ${id ? "atualizado" : "incluído no plano"}.`);
}

export async function excluirLotePlanejado(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("lotes_planejados").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha(SEM_PERMISSAO);
  revalidar();
  return sucesso("Lote tirado do plano.");
}

const CATEGORIAS = ["alevino", "vacina", "medicamento", "racao", "mao_obra", "energia", "embalagem", "transporte", "manutencao", "outros"];
const FASES = ["alevinagem", "recria", "engorda", "ciclo"];
const BASES = ["peixe", "lote", "mes", "kg"];

export async function salvarCusto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const valor = lerCentavos(t("valor"));
  if (!t("descricao")) return falha("Descreva o custo.");
  if (!CATEGORIAS.includes(t("categoria")) || !FASES.includes(t("fase")) || !BASES.includes(t("base"))) return falha("Escolha categoria, fase e base.");
  if (valor === null) return falha("Valor inválido. Use o formato 12,34.");
  if (t("base") === "kg" && !["engorda", "ciclo"].includes(t("fase"))) return falha("Custo por kg despescado só existe na engorda (ou no ciclo inteiro).");
  const semana = t("semana") ? lerInteiro(t("semana")) : null;
  if (t("semana") && (!semana || semana < 1 || semana > 130)) return falha("Semana de cultivo entre 1 e 130.");
  const dados = {
    descricao: t("descricao"), categoria: t("categoria"), fase: t("fase"), base: t("base"), valor_cents: valor,
    semana: ["peixe", "lote"].includes(t("base")) ? semana : null,
    vigente_desde: t("vigente_desde") || null,
    ativo: form.get("ativo") === "on",
    observacoes: t("observacoes") || null,
  };
  const supabase = await createClient();
  if (id) {
    const { error, count } = await supabase.from("planejamento_custos").update(dados, { count: "exact" }).eq("id", id);
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha(SEM_PERMISSAO);
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("planejamento_custos").insert({ ...dados, empresa_id: atual.id });
    if (error) return falha(error.message.includes("row-level security") ? SEM_PERMISSAO : mensagemBanco(error));
  }
  revalidar();
  return sucesso(`${dados.descricao} salvo.`);
}

export async function excluirCusto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("planejamento_custos").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha(SEM_PERMISSAO);
  revalidar();
  return sucesso("Custo excluído.");
}

// Itens de partida para a piscicultura só ajustar os valores. Valores de exemplo, não cotação.
export async function incluirCustosModelo(): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const modelo = [
    { descricao: "Alevinos", categoria: "alevino", fase: "alevinagem", base: "peixe", valor_cents: 22, semana: 1 },
    { descricao: "Frete dos alevinos", categoria: "transporte", fase: "alevinagem", base: "lote", valor_cents: 80000, semana: 1 },
    { descricao: "Calcário e adubação do viveiro", categoria: "medicamento", fase: "ciclo", base: "lote", valor_cents: 150000, semana: 1 },
    { descricao: "Mão de obra do lote", categoria: "mao_obra", fase: "ciclo", base: "mes", valor_cents: 250000, semana: null },
    { descricao: "Energia dos aeradores", categoria: "energia", fase: "engorda", base: "mes", valor_cents: 120000, semana: null },
    { descricao: "Análises de água e biometria", categoria: "outros", fase: "ciclo", base: "mes", valor_cents: 20000, semana: null },
    { descricao: "Gelo e caixas na despesca", categoria: "embalagem", fase: "engorda", base: "kg", valor_cents: 30, semana: null },
  ].map((m) => ({ ...m, empresa_id: atual.id, observacoes: "Valor de exemplo: troque pelo preço do seu fornecedor." }));
  const { error } = await supabase.from("planejamento_custos").insert(modelo);
  if (error) return falha(error.message.includes("row-level security") ? SEM_PERMISSAO : mensagemBanco(error));
  revalidar();
  return sucesso("Itens de exemplo incluídos. Ajuste cada valor para a realidade da sua piscicultura.");
}

// Aplica a sugestão calculada pela meta de peixes (tamanho do lote e cadência). A piscicultura confirma clicando e pode
// ajustar depois nos parâmetros.
export async function aplicarSugestaoMeta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const n = (k: string) => lerInteiro(String(form.get(k) ?? ""));
  const dados = { peixes_por_lote: n("peixes_por_lote"), intervalo_lotes_semanas: n("intervalo_lotes_semanas") };
  if (Object.values(dados).some((v) => !v)) return falha("Sugestão inválida. Recarregue a página.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data, error } = await supabase.from("planejamento_parametros").update(dados).eq("empresa_id", atual.id).select("empresa_id");
  if (error) {
    if (error.message.includes("row-level security")) return falha(SEM_PERMISSAO);
    return falha(mensagemBanco(error));
  }
  if (!data?.length) return falha("Salve os parâmetros da piscicultura antes de aplicar a sugestão.");
  revalidar();
  return sucesso("Sugestão aplicada. Os lotes sugeridos já aparecem em Lotes e viveiros.");
}
