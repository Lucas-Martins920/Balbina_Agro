import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { eLoginLocal } from "@/lib/login-local";
import { VERSAO_TERMOS } from "@/lib/termos";

// IP e navegador de quem aceitou, como prova do aceite. A Vercel põe o IP real em x-forwarded-for.
export async function origemDoPedido() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

export async function registrarAceite(origem: "cadastro" | "tela_aceite") {
  const supabase = await createClient();
  const { ip, userAgent } = await origemDoPedido();
  return supabase.rpc("aceitar_termos", { p_versao: VERSAO_TERMOS, p_origem: origem, p_ip: ip, p_user_agent: userAgent });
}

// Primeira linha das telas logadas: sem aceite da versão vigente, a pessoa passa pela tela de aceite.
// Quem marcou o aceite no cadastro (antes de confirmar o e-mail) tem o registro gravado aqui.
export async function exigirAceiteTermos(voltar: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const usuario = claims?.claims;
  if (!usuario?.sub) redirect("/login");
  // Login por usuário criado pelo master: no primeiro acesso (e depois de uma senha nova do master) troca a senha.
  if (eLoginLocal(usuario.email)) {
    const { data: local } = await supabase.rpc("meu_login_local");
    if ((local as { trocar_senha?: boolean } | null)?.trocar_senha) redirect(`/auth/primeiro-acesso?voltar=${encodeURIComponent(voltar)}`);
  }
  const { data } = await supabase.from("aceites_termos").select("id").eq("versao", VERSAO_TERMOS).maybeSingle();
  if (data) return;
  const metadados = (usuario.user_metadata ?? {}) as { termos_versao?: string };
  if (metadados.termos_versao === VERSAO_TERMOS && !(await registrarAceite("cadastro")).error) return;
  redirect(`/aceitar-termos?voltar=${encodeURIComponent(voltar)}`);
}
