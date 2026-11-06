"use server";

import { redirect } from "next/navigation";
import { segundoFatorPendente } from "@/lib/mfa";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/termos";

export type EstadoSenha = { erro?: string };

// Troca da senha inicial dada pelo master. Vai pela chave de serviço porque a conta não tem e-mail para a
// reautenticação do Supabase; só vale para o próprio login local, marcado para trocar e já com o 2º fator em dia.
export async function trocarSenhaInicial(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) return { erro: "A senha precisa de pelo menos 8 caracteres." };
  if (senha !== String(form.get("confirmacao") ?? "")) return { erro: "As senhas não conferem. Digite a mesma senha nos dois campos." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) redirect("/login");
  if (await segundoFatorPendente()) redirect("/auth/mfa?voltar=/auth/primeiro-acesso");
  const { data: local } = await supabase.rpc("meu_login_local");
  const info = local as { trocar_senha?: boolean; inicio?: string | null } | null;
  if (!info?.trocar_senha) redirect(destinoSeguro(form.get("voltar")));

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
  if (error) return { erro: `Não foi possível salvar a senha: ${error.message}` };
  await admin.from("logins_locais").update({ trocar_senha: false, updated_at: new Date().toISOString() }).eq("user_id", id);
  // vindo do painel (padrão do layout), o cargo operacional vai para a tela enxuta dele
  const voltar = destinoSeguro(form.get("voltar"));
  redirect(voltar === "/painel" && info.inicio ? info.inicio : voltar);
}
