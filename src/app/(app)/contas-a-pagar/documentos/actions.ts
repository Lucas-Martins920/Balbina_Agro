"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { receberDocumento } from "@/lib/documento-recebido";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO, lerDecimal } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function revalidar() {
  revalidatePath("/contas-a-pagar/documentos");
  revalidatePath("/contas-a-pagar");
  revalidatePath("/pendencias");
}

// C3: foto ou PDF de boleto, nota ou recibo lido por IA. Grava como proposta para conferir.
export async function lerDocumentoEnviado(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await getPermissoes()).pode("contas-a-pagar.editar")) return falha("Seu usuário não pode lançar contas a pagar.");
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return falha("Escolha a foto ou o PDF.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const r = await receberDocumento(supabase, atual.id, {
    base64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"), tipo: arquivo.type, nome: arquivo.name, tamanho: arquivo.size,
  }, "upload", hojeISO(atual.fuso));
  if (r.erro) return falha(r.erro);
  revalidar();
  return sucesso("Documento lido. Confira os dados abaixo e lance.");
}

export async function lancarDocumento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const valor = lerDecimal(String(form.get("valor") ?? ""));
  const vencimento = String(form.get("vencimento") ?? "");
  const competencia = String(form.get("competencia") ?? "");
  const categoria = String(form.get("categoria_id") ?? "");
  if (valor === null || valor <= 0) return falha("Informe o valor.");
  if (!DATA.test(vencimento)) return falha("Informe o vencimento.");
  if (!categoria) return falha("Escolha a categoria.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("lancar_documento_recebido", {
    p_doc: String(form.get("id") ?? ""), p_descricao: String(form.get("descricao") ?? ""), p_valor_cents: Math.round(valor * 100),
    p_vencimento: vencimento, p_competencia: DATA.test(competencia) ? competencia : null, p_categoria: categoria,
    p_centro: String(form.get("centro_custo_id") ?? "") || null,
    p_fornecedor_nome: String(form.get("fornecedor_nome") ?? "") || null, p_fornecedor_doc: String(form.get("fornecedor_documento") ?? "") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Conta a pagar criada.");
}

export async function mudarSituacaoDocumento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const status = form.get("status") === "ignorada" ? "ignorada" : "nova";
  const supabase = await createClient();
  const { data, error } = await supabase.from("documentos_recebidos").update({ status })
    .eq("id", String(form.get("id") ?? "")).neq("status", "lancada").select("id");
  if (error) return falha(mensagemBanco(error));
  if (!data?.length) return falha("Seu usuário não pode mudar este documento (ou ele já virou conta a pagar).");
  revalidar();
  return sucesso(status === "ignorada" ? "Documento ignorado." : "Documento de volta para lançar.");
}
