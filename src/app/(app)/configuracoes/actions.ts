"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { FUSOS_BRASIL } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// Qualidade da água no apontamento (oxigênio, temperatura, pH, transparência, amônia). Ligada, vira campos
// opcionais na web e no celular e entra nos alertas: oxigênio abaixo de 3 mg/L pede suspender a ração.
export async function salvarApontarAgua(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { pode } = await getPermissoes();
  if (!pode("configuracoes.editar")) return falha("Seu usuário não pode alterar as configurações da empresa.");
  const ligar = form.get("apontar_qualidade_agua") === "on";
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("empresas").update({ apontar_qualidade_agua: ligar, updated_at: new Date().toISOString() }).eq("id", atual.id);
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/", "layout");
  return sucesso(ligar ? "Água ligada no apontamento." : "Água desligada no apontamento.");
}

// O fuso decide qual é o "hoje" da empresa: vencimentos, painel, estoque e relatórios.
export async function salvarFuso(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { pode } = await getPermissoes();
  if (!pode("configuracoes.editar")) return falha("Seu usuário não pode alterar as configurações da empresa.");
  const fuso = String(form.get("fuso") ?? "");
  if (!(fuso in FUSOS_BRASIL)) return falha("Escolha um fuso da lista.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("empresas").update({ fuso, updated_at: new Date().toISOString() }).eq("id", atual.id);
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/", "layout");
  return sucesso(`Fuso salvo: ${FUSOS_BRASIL[fuso]}.`);
}
