"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { validarGrupos, type GrupoBiometria } from "@/lib/biometria-grupos";
import { formatarNumero, lerCentavos, lerDecimal, lerInteiro } from "@/lib/formato";
import { lerKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";

// Peso em gramas digitado ("30", "1,5", "1.250"): null quando vazio, NaN quando inválido
function lerGramas(v: FormDataEntryValue | null) {
  const n = lerKg(v);
  if (n === undefined) return null;
  return n === null || n <= 0 ? NaN : n;
}

function revalidarLotes() {
  revalidatePath("/lotes", "layout");
  revalidatePath("/piscicultura");
  revalidatePath("/campo");
}

export async function povoarLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const codigo = String(form.get("codigo") ?? "").trim();
  const especie = String(form.get("especie_id") ?? "");
  const viveiro = String(form.get("viveiro_id") ?? "");
  const povoamento = String(form.get("data_povoamento") ?? "");
  const qtd = lerInteiro(form.get("qtd_povoada"));
  const peso = lerGramas(form.get("peso_inicial_g"));
  const alvo = lerGramas(form.get("peso_alvo_g"));
  const custo = form.get("custo") ? lerCentavos(form.get("custo")) : 0;

  if (!codigo) return falha("Informe o código do lote.");
  if (!especie || !viveiro) return falha("Escolha a espécie e o viveiro.");
  if (!povoamento) return falha("Informe a data do povoamento.");
  if (!qtd || qtd <= 0) return falha("Informe a quantidade de peixes.");
  if (peso === null || Number.isNaN(peso)) return falha("Informe o peso médio dos peixes no povoamento, em gramas.");
  if (Number.isNaN(alvo)) return falha("Peso de despesca inválido.");
  if (custo === null) return falha("Custo inválido. Use o formato 12.345,67.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("povoar_lote", {
    p_empresa: atual.id,
    p_codigo: codigo,
    p_especie: especie,
    p_povoamento: povoamento,
    p_viveiro: viveiro,
    p_qtd: qtd,
    p_peso_inicial_g: peso,
    p_custo_cents: custo,
    p_fornecedor: String(form.get("fornecedor_id") ?? "") || null,
    p_peso_alvo_g: alvo,
  });
  if (error) {
    if (error.message.includes("exclusion")) return falha("Esse viveiro já tem um lote povoado nesse período.");
    return falha(mensagemBanco(error));
  }
  revalidarLotes();
  return sucesso(`Lote ${codigo} povoado.`);
}

const FASES_VALIDAS = ["alevinagem", "recria", "engorda"];

export async function editarLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const codigo = t("codigo");
  const qtd = lerInteiro(form.get("qtd_povoada"));
  const peso = lerGramas(form.get("peso_inicial_g"));
  const alvo = lerGramas(form.get("peso_alvo_g"));
  const custo = t("custo") ? lerCentavos(t("custo")) : 0;
  if (!codigo) return falha("Informe o código do lote.");
  if (!t("especie_id")) return falha("Escolha a espécie.");
  if (!t("data_povoamento")) return falha("Informe a data do povoamento.");
  if (!qtd || qtd <= 0) return falha("Informe a quantidade de peixes.");
  if (peso === null || Number.isNaN(peso)) return falha("Informe o peso médio dos peixes no povoamento, em gramas.");
  if (Number.isNaN(alvo)) return falha("Peso de despesca inválido.");
  if (custo === null) return falha("Custo inválido. Use o formato 12.345,67.");
  if (!FASES_VALIDAS.includes(t("fase"))) return falha("Escolha a fase.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_lote", {
    p_lote: t("id"),
    p_codigo: codigo,
    p_especie: t("especie_id"),
    p_povoamento: t("data_povoamento"),
    p_qtd: qtd,
    p_peso_inicial_g: peso,
    p_custo_cents: custo,
    p_fase: t("fase"),
    p_fornecedor: t("fornecedor_id") || null,
    p_previsao_despesca: t("previsao_despesca") || null,
    p_peso_alvo_g: alvo,
    p_observacoes: t("observacoes") || null,
  });
  if (error) {
    if (error.message.includes("exclusion")) return falha("Esse viveiro já tem outro lote nesse período.");
    return falha(mensagemBanco(error));
  }
  revalidarLotes();
  return sucesso(`Lote ${codigo} atualizado.`);
}

export async function excluirLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("lotes").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para excluir lotes.");
  revalidarLotes();
  return sucesso("Lote excluído.");
}

// Fecha o ciclo sem despesca total (perda do lote, venda do viveiro inteiro por fora, erro de cadastro).
// A despesca total já encerra o lote sozinha.
export async function encerrarLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t("data"))) return falha("Informe a data do encerramento.");
  if (!t("motivo")) return falha("Diga por que o lote está sendo encerrado.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("encerrar_lote", { p_lote: t("id"), p_data: t("data"), p_motivo: t("motivo") });
  if (error) return falha(mensagemBanco(error));
  revalidarLotes();
  return sucesso("Lote encerrado: os viveiros ficaram livres.");
}

export async function reabrirLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reabrir_lote", { p_lote: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidarLotes();
  return sucesso("Lote reaberto.");
}

// Biometria: pesa uma amostra do viveiro. Dá para informar o peso total da amostra ou o peso médio.
// Grupos da biometria vindos do formulário (campo escondido "grupos", JSON); vazio = biometria pelo total
function lerGruposForm(form: FormData): { ok: GrupoBiometria[] } | { erro: string } | null {
  let bruto: unknown;
  try { bruto = JSON.parse(String(form.get("grupos") ?? "[]")); } catch { return { erro: "Grupos inválidos." }; }
  if (!Array.isArray(bruto) || bruto.length === 0) return null;
  return validarGrupos(bruto);
}

export async function registrarBiometria(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const grupos = lerGruposForm(form);
  if (grupos && "erro" in grupos) return falha(grupos.erro);
  if (grupos) {
    if (!t("viveiro_id")) return falha("Escolha o viveiro.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t("data"))) return falha("Informe a data da biometria.");
    const opcional = (k: string, max: number) => { if (!t(k)) return null; const v = lerDecimal(t(k)); return v === null || v < 0 || v > max ? NaN : v; };
    const jejum = opcional("jejum_horas", 96), temp = opcional("temperatura_c", 45), ox = opcional("oxigenio_mg_l", 30);
    if ([jejum, temp, ox].some((v) => Number.isNaN(v))) return falha("Confira jejum (0 a 96 h), temperatura (0 a 45 °C) e oxigênio (0 a 30 mg/L).");
    const { atual } = await getEmpresaAtual();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("registrar_biometria_grupos", {
      p_empresa: atual.id, p_viveiro: t("viveiro_id"), p_data: t("data"), p_grupos: grupos.ok, p_client_id: null, p_lote: t("lote_id") || null,
      p_origem: "web", p_observacoes: t("observacoes") || null, p_jejum_horas: jejum, p_temperatura_c: temp, p_oxigenio_mg_l: ox,
    });
    if (error) return falha(mensagemBanco(error));
    const { data: b } = await supabase.from("biometrias").select("peso_medio_g, peixes_amostrados").eq("id", data).maybeSingle();
    revalidarLotes();
    revalidatePath("/painel");
    revalidatePath("/racao");
    return sucesso(b ? `Biometria lançada: ${formatarNumero(Number(b.peso_medio_g), 1)} g de média em ${b.peixes_amostrados} peixes.` : "Biometria lançada.");
  }
  const peixes = lerInteiro(form.get("peixes"));
  const total = lerGramas(form.get("peso_total_g"));
  const medio = lerGramas(form.get("peso_medio_g"));
  const comprimento = lerGramas(form.get("comprimento_cm"));
  const uniformidade = t("uniformidade_pct") ? lerDecimal(t("uniformidade_pct")) : null;
  if (!t("viveiro_id")) return falha("Escolha o viveiro.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t("data"))) return falha("Informe a data da biometria.");
  if (!peixes || peixes <= 0) return falha("Informe quantos peixes foram pesados.");
  if (Number.isNaN(total) || Number.isNaN(medio)) return falha("Peso inválido. Use gramas, como 350 ou 1.250.");
  if (total === null && medio === null) return falha("Informe o peso total da amostra ou o peso médio.");
  if (Number.isNaN(comprimento)) return falha("Comprimento inválido.");
  if (uniformidade !== null && (uniformidade < 0 || uniformidade > 100)) return falha("Uniformidade vai de 0 a 100%.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_biometria", {
    p_empresa: atual.id,
    p_viveiro: t("viveiro_id"),
    p_data: t("data"),
    p_peixes: peixes,
    p_peso_total_g: total,
    p_peso_medio_g: total === null ? medio : null,
    p_comprimento_cm: comprimento,
    p_uniformidade_pct: uniformidade,
    p_observacoes: t("observacoes") || null,
    p_lote: t("lote_id") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidarLotes();
  revalidatePath("/painel");
  return sucesso("Biometria lançada: o peso do lote e a ração sugerida foram atualizados.");
}

// Corrigir os grupos de uma biometria já lançada (somar, corrigir ou tirar um grupo): o banco recalcula a média
export async function corrigirGruposBiometria(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const grupos = lerGruposForm(form);
  if (!id) return falha("Biometria não encontrada.");
  if (!grupos) return falha("Informe pelo menos um grupo pesado.");
  if ("erro" in grupos) return falha(grupos.erro);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("corrigir_grupos_biometria", { p_biometria: id, p_grupos: grupos.ok });
  if (error) return falha(mensagemBanco(error));
  revalidarLotes();
  revalidatePath("/racao");
  return sucesso(`Grupos corrigidos: ${formatarNumero(Number(data), 1)} g de média.`);
}

export async function excluirBiometria(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("biometrias").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para apagar biometrias.");
  revalidarLotes();
  return sucesso("Biometria apagada.");
}

export async function criarEspecie(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = String(form.get("nome") ?? "").trim();
  const cientifico = String(form.get("nome_cientifico") ?? "").trim();
  if (!nome) return falha("Informe o nome da espécie.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("especies").insert({ empresa_id: atual.id, nome, nome_cientifico: cientifico || null });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/lotes/especies");
  return sucesso(`Espécie ${nome} criada. Agora cole a curva de crescimento dela.`);
}

// Cada linha: semana; peso (g); taxa de alimentação (% do peso vivo por dia); refeições por dia; proteína (%);
// ração (g/peixe/dia); sobrevivência (%). Só semana e peso são obrigatórios.
export async function salvarCurva(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const especie = String(form.get("especie_id") ?? "");
  const texto = String(form.get("curva") ?? "");
  if (!especie) return falha("Escolha a espécie.");

  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^semana/i.test(l));
  if (linhas.length === 0) return falha("Cole ao menos uma linha.");

  const registros = [];
  for (const [i, linha] of linhas.entries()) {
    const partes = linha.split(/[;\t]/).map((p) => p.trim());
    const semana = lerInteiro(partes[0]);
    if (!semana || semana < 1 || semana > 156) return falha(`Linha ${i + 1}: semana inválida ("${partes[0]}").`);
    const peso = lerDecimal(partes[1]);
    if (peso === null || peso <= 0) return falha(`Linha ${i + 1}: informe o peso esperado em gramas.`);
    const refeicoes = partes[3] ? lerInteiro(partes[3]) : null;
    registros.push({
      especie_id: especie,
      semana,
      peso_g: peso,
      taxa_alimentacao_pct: lerDecimal(partes[2]),
      refeicoes_dia: refeicoes,
      proteina_pct: lerDecimal(partes[4]),
      consumo_g_peixe_dia: lerDecimal(partes[5]),
      sobrevivencia_pct: lerDecimal(partes[6]),
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("curvas_crescimento").upsert(registros, { onConflict: "especie_id,semana" });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/lotes", "layout");
  return sucesso(`${registros.length} semanas salvas na curva.`);
}

export async function transferirLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const lote = t("lote_id");
  const origem = t("viveiro_origem_id");
  const data = t("data");
  if (!origem) return falha("Escolha o viveiro de onde os peixes saem.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return falha("Informe a data da transferência.");

  const viveiros = form.getAll("destino_viveiro").map((v) => String(v));
  const qtds = form.getAll("destino_qtd").map((v) => String(v).trim());
  const destinos: { viveiro: string; qtd: number | null }[] = [];
  for (const [i, viveiro] of viveiros.entries()) {
    if (!viveiro && !qtds[i]) continue;
    if (!viveiro) return falha("Escolha o viveiro de cada destino.");
    const qtd = qtds[i] ? lerInteiro(qtds[i]) : null;
    if (qtds[i] && (!qtd || qtd <= 0)) return falha("Quantidade de peixes inválida.");
    destinos.push({ viveiro, qtd });
  }
  if (!destinos.length) return falha("Escolha o viveiro de destino.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("transferir_lote", {
    p_lote: lote,
    p_viveiro_origem: origem,
    p_data: data,
    p_destinos: destinos,
    p_observacoes: t("observacoes") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidarLotes();
  revalidatePath("/planejamento");
  return sucesso("Lote transferido.");
}

export async function desfazerTransferencia(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("desfazer_transferencia", { p_transferencia: String(form.get("id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidarLotes();
  revalidatePath("/planejamento");
  return sucesso("Transferência desfeita.");
}
