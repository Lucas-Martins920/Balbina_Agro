"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO, lerCentavos } from "@/lib/formato";
import { lerKg, textoKg } from "@/lib/pescado";
import { lerDocumento, lerUf, TIPOS_PONTO } from "@/lib/pontos";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/pontos-de-venda", "layout");
  revalidatePath("/estoque");
  revalidatePath("/vendas", "layout");
  revalidatePath("/contas-a-pagar");
}

const texto = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

// Kg por classe vindos dos campos <prefixo><classe_id> (vazio fica de fora; null quando algum é inválido)
function kgPorClasse(form: FormData, prefixo: string): Record<string, number> | null {
  const itens: Record<string, number> = {};
  for (const [chave, valor] of form.entries()) {
    if (!chave.startsWith(prefixo)) continue;
    const kg = lerKg(valor);
    if (kg === null) return null;
    if (kg !== undefined) itens[chave.slice(prefixo.length)] = kg;
  }
  return itens;
}

const KG_INVALIDO = "Os pesos precisam ser em kg, como 350 ou 1.250,5.";

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export async function criarPonto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = texto(form, "nome");
  const tipo = texto(form, "tipo") || "loja";
  const documento = lerDocumento(form.get("documento"));
  const uf = lerUf(form.get("uf"));
  if (!nome) return falha("Informe o nome do ponto de venda.");
  if (!(tipo in TIPOS_PONTO)) return falha("Tipo de ponto inválido.");
  if (documento === "invalido") return falha("CNPJ ou CPF inválido.");
  if (uf === "invalido") return falha("UF precisa ter duas letras, como AM.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_ponto_venda", {
    p_empresa: atual.id, p_nome: nome, p_tipo: tipo, p_municipio: texto(form, "municipio") || null, p_uf: uf,
    p_endereco: texto(form, "endereco") || null, p_documento: documento, p_inscricao_estadual: texto(form, "inscricao_estadual") || null,
    p_criar_caixa: form.get("criar_caixa") === "on",
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`Ponto ${nome} cadastrado, com estoque de pescado e centro de custo próprios.`);
}

export async function salvarPonto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = texto(form, "id");
  const nome = texto(form, "nome");
  const tipo = texto(form, "tipo") || "loja";
  const documento = lerDocumento(form.get("documento"));
  const uf = lerUf(form.get("uf"));
  if (!id) return falha("Ponto não informado.");
  if (!nome) return falha("Informe o nome do ponto de venda.");
  if (!(tipo in TIPOS_PONTO)) return falha("Tipo de ponto inválido.");
  if (documento === "invalido") return falha("CNPJ ou CPF inválido.");
  if (uf === "invalido") return falha("UF precisa ter duas letras, como AM.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("pontos_venda").update({
    nome, tipo, municipio: texto(form, "municipio") || null, uf, endereco: texto(form, "endereco") || null, documento,
    inscricao_estadual: texto(form, "inscricao_estadual") || null, conta_caixa_id: texto(form, "conta_caixa_id") || null,
    observacoes: texto(form, "observacoes") || null, ...(form.has("ativo_presente") ? { ativo: form.get("ativo") === "on" } : {}),
  }).eq("id", id).eq("empresa_id", atual.id);
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Ponto de venda salvo.");
}

// Contagem do pescado de um ponto (inventário): acerta cada classe para os kg contados
export async function contarPonto(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = texto(form, "id");
  const contagem = kgPorClasse(form, "conta_");
  if (!contagem) return falha(KG_INVALIDO);
  if (!Object.keys(contagem).length) return falha("Preencha a contagem de pelo menos uma classe (0 zera a classe).");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventariar_ponto", { p_ponto: id, p_contagem: contagem, p_observacao: texto(form, "observacao") || null });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  const dif = Number(data);
  return sucesso(dif === 0 ? "Contagem bate com o sistema; nada lançado." : `Ajuste de ${dif > 0 ? "+" : "-"}${textoKg(Math.abs(dif), 3)} lançado.`);
}

// ---------------------------------------------------------------------------
// Transferências
// ---------------------------------------------------------------------------

export async function transferirPeixe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const origem = texto(form, "origem_id");
  const destino = texto(form, "destino_id");
  const data = texto(form, "data");
  if (!origem || !destino) return falha("Escolha a origem e o destino.");
  if (origem === destino) return falha("Escolha um destino diferente da origem.");
  if (!data) return falha("Informe a data da saída.");
  const { atual } = await getEmpresaAtual();
  if (data > hojeISO(atual.fuso)) return falha("A data da transferência não pode ser futura.");
  const kg = kgPorClasse(form, "classe_");
  if (!kg) return falha(KG_INVALIDO);
  const classes = Object.entries(kg).filter(([, q]) => q > 0);
  if (!classes.length) return falha("Informe os kg de peixe que vão na transferência.");
  const frete = texto(form, "frete") ? lerCentavos(form.get("frete")) : 0;
  if (frete === null || frete < 0) return falha("Frete inválido. Use o formato 45,00.");

  const supabase = await createClient();
  // produto que guarda o estoque de cada classe (fator 1): a transferência anda em kg
  const { data: bases } = await supabase.from("produtos").select("id, classe_peixe_id").eq("empresa_id", atual.id).eq("base_estoque", true)
    .in("classe_peixe_id", classes.map(([c]) => c));
  const base = new Map((bases ?? []).map((b) => [b.classe_peixe_id, b.id]));
  if (classes.some(([c]) => !base.has(c))) return falha("Classe do pescado sem produto de estoque. Lance uma despesca ou uma contagem dela antes.");

  const { error } = await supabase.rpc("transferir_peixe", {
    p_empresa: atual.id, p_origem: origem, p_destino: destino, p_data: data,
    p_itens: classes.map(([c, q]) => ({ produto_id: base.get(c), quantidade: q })),
    p_frete_cents: frete, p_frete_a_pagar: form.get("frete_a_pagar") === "on",
    p_transportador: texto(form, "transportador_id") || null, p_vencimento_frete: texto(form, "vencimento_frete") || null,
    p_receber: form.get("a_caminho") !== "on", p_observacoes: texto(form, "observacoes") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  const total = classes.reduce((s, [, q]) => s + q, 0);
  return sucesso(`${textoKg(total, 3)} de peixe ${form.get("a_caminho") === "on" ? "a caminho" : "transferidos"}.`);
}

export async function receberTransferencia(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = texto(form, "id");
  const perdas = kgPorClasse(form, "perda_");
  if (!perdas) return falha("A perda precisa ser em kg, como 2 ou 1,5.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receber_transferencia_peixe", {
    p_transferencia: id, p_perdas: perdas, p_data: texto(form, "data") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`${textoKg(Number(data), 3)} de peixe recebidos.`);
}

export async function cancelarTransferencia(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_transferencia_peixe", { p_transferencia: texto(form, "id") });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Transferência cancelada: o peixe voltou para a origem.");
}
