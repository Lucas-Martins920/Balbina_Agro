"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { focus } from "@/lib/focus";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_MANIFESTO: Record<string, string> = {
  ciencia: "Ciência registrada. O XML completo fica disponível em instantes.",
  confirmacao: "Operação confirmada na SEFAZ.",
  desconhecimento: "Operação desconhecida registrada na SEFAZ.",
  nao_realizada: "Operação não realizada registrada na SEFAZ.",
};

function revalidar() {
  revalidatePath("/notas/recebidas");
  revalidatePath("/pendencias");
  revalidatePath("/contas-a-pagar");
}

export async function lancarNfeRecebida(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const vencimento = String(form.get("vencimento") ?? "");
  const categoria = String(form.get("categoria_id") ?? "");
  const centro = String(form.get("centro_custo_id") ?? "") || null;
  if (!DATA.test(vencimento)) return falha("Informe o vencimento.");
  if (!categoria) return falha("Escolha a categoria.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("lancar_nfe_recebida", { p_nfe: id, p_vencimento: vencimento, p_categoria: categoria, p_centro: centro });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Conta a pagar criada.");
}

export async function mudarSituacaoNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const status = form.get("status") === "ignorada" ? "ignorada" : "nova";
  const supabase = await createClient();
  const { data, error } = await supabase.from("nfes_recebidas").update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).neq("status", "lancada").select("id");
  if (error) return falha(mensagemBanco(error));
  if (!data?.length) return falha("Seu usuário não pode mudar esta nota (ou ela já virou conta a pagar).");
  revalidar();
  return sucesso(status === "ignorada" ? "Nota ignorada." : "Nota de volta para lançar.");
}

// Manifestação do destinatário na SEFAZ, pela Focus. É um ato fiscal: sempre botão de quem pode mexer em notas.
export async function manifestarNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await getPermissoes()).pode("notas.editar")) return falha("Seu usuário não pode manifestar notas fiscais.");
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const id = String(form.get("id") ?? "");
  const tipo = String(form.get("tipo") ?? "");
  const justificativa = String(form.get("justificativa") ?? "").trim();
  if (!(tipo in TIPOS_MANIFESTO)) return falha("Escolha a manifestação.");
  if (tipo === "nao_realizada" && (justificativa.length < 15 || justificativa.length > 255)) {
    return falha("Explique por que a operação não foi realizada (de 15 a 255 letras).");
  }
  const supabase = await createClient();
  const { data: nota } = await supabase.from("nfes_recebidas").select("empresa_id, chave").eq("id", id).maybeSingle();
  if (!nota) return falha("Nota não encontrada.");
  try {
    const { status, dados } = await focus<{ mensagem?: string; status?: string }>(nota.empresa_id, `/v2/nfes_recebidas/${nota.chave}/manifesto`, {
      method: "POST", body: tipo === "nao_realizada" ? { tipo, justificativa } : { tipo },
    });
    if (status >= 400) return falha(`A SEFAZ/Focus recusou: ${dados.mensagem ?? status}`);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe.");
  }
  const { error } = await supabase.from("nfes_recebidas").update({ manifestacao: tipo, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return falha(`Manifestação feita, mas não ficou anotada aqui: ${mensagemBanco(error)}`);
  revalidar();
  return sucesso(TIPOS_MANIFESTO[tipo]);
}
