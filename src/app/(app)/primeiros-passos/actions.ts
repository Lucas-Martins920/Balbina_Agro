"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

// O banco confere que é o master; aqui só repassa e atualiza as telas que mostram o assistente.
function atualizar() {
  revalidatePath("/primeiros-passos");
  revalidatePath("/painel");
}

export async function pularPasso(passo: string, pular: boolean) {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("assistente_pular", { p_empresa: atual.id, p_passo: passo, p_pular: pular });
  if (error) throw new Error(error.message);
  atualizar();
}

export async function esconderAssistente() {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("assistente_esconder", { p_empresa: atual.id, p_esconder: true });
  if (error) throw new Error(error.message);
  atualizar();
  redirect("/painel");
}

export async function retomarAssistente() {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("assistente_esconder", { p_empresa: atual.id, p_esconder: false });
  if (error) throw new Error(error.message);
  atualizar();
  redirect("/primeiros-passos");
}
