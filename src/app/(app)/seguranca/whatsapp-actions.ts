"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { numeroWhatsApp } from "@/lib/whatsapp-texto";

// H2: cada pessoa liga o próprio celular ao WhatsApp do Balbina (código mandado do celular).
function atualizar() {
  revalidatePath("/seguranca");
  revalidatePath("/configuracoes/automacoes");
}

export async function pedirCodigoWhatsApp(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const telefone = numeroWhatsApp(String(form.get("telefone") ?? ""));
  if (!telefone) return falha("Informe o celular com DDD, ex.: (92) 99123-4567.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("whatsapp_pedir_codigo", { p_empresa: atual.id, p_telefone: telefone });
  if (error) return falha(mensagemBanco(error));
  atualizar();
  return sucesso("Código gerado. Mande a mensagem abaixo do seu celular.");
}

export async function avisosWhatsApp(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const ligar = form.get("ligar") === "1";
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("whatsapp_avisos", { p_empresa: atual.id, p_ligar: ligar });
  if (error) return falha(mensagemBanco(error));
  atualizar();
  return sucesso(ligar ? "Avisos no WhatsApp ligados." : "Avisos no WhatsApp desligados.");
}

export async function desligarWhatsApp(): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_vinculos").delete().eq("empresa_id", atual.id);
  if (error) return falha(mensagemBanco(error));
  atualizar();
  return sucesso("Celular desligado do Balbina.");
}
