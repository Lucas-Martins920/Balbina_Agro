"use server";

import { redirect } from "next/navigation";
import { createClient as clienteSupabase, type AMREntry } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseEnv } from "@/lib/env";
import { confiarNesteDispositivo, marcarSessaoVerificada } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/termos";

export type EstadoCodigoEmail = { erro?: string; info?: string; enviado?: boolean };

// O código por e-mail usa o próprio Supabase Auth: ele manda o código (modelo "Magic Link" com
// {{ .Token }}) e confere. Um cliente avulso, sem cookies, faz isso para não mexer na sessão da
// pessoa; a sessão que ele abre ao conferir é encerrada na hora.
function clienteAvulso() {
  const { url, key } = supabaseEnv();
  return clienteSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" } });
}

async function emailDaSessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.email ? String(data.claims.email) : null;
}

export async function enviarCodigoEmail(_: EstadoCodigoEmail, form: FormData): Promise<EstadoCodigoEmail> {
  const email = await emailDaSessao();
  if (!email) return { erro: "Sua sessão expirou. Entre de novo com e-mail e senha." };
  const reenvio = Boolean(form.get("reenvio"));
  const captchaToken = String(form.get("cf-turnstile-response") ?? "") || undefined;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await clienteAvulso().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, captchaToken, emailRedirectTo: `${site}/auth/mfa/email` },
  });
  if (error) {
    if (error.status === 429 || /rate|seconds/i.test(error.message)) {
      return { erro: "Aguarde um minuto antes de pedir outro código.", enviado: reenvio };
    }
    if (/captcha/i.test(error.message)) return { erro: "Não conseguimos confirmar que você não é um robô. Tente de novo.", enviado: reenvio };
    return { erro: `Não foi possível enviar o código: ${error.message}`, enviado: reenvio };
  }
  return { info: `Enviamos um e-mail para ${email}. Digite o código dele aqui ou toque no link do e-mail neste mesmo navegador.`, enviado: true };
}

export async function confirmarCodigoEmail(_: EstadoCodigoEmail, form: FormData): Promise<EstadoCodigoEmail> {
  const email = await emailDaSessao();
  if (!email) return { erro: "Sua sessão expirou. Entre de novo com e-mail e senha." };
  const codigo = String(form.get("codigo") ?? "").replace(/\D/g, "");
  if (codigo.length < 6) return { erro: "Digite o código que chegou no seu e-mail.", enviado: true };

  const avulso = clienteAvulso();
  const { data, error } = await avulso.auth.verifyOtp({ email, token: codigo, type: "email" });
  if (error || !data.session) return { erro: "Código inválido ou expirado. Confira o último e-mail ou peça outro código.", enviado: true };
  await avulso.auth.signOut({ scope: "local" });
  if (!(await marcarSessaoVerificada("email").catch(() => false))) {
    return { erro: "O código está certo, mas não conseguimos liberar o acesso. Tente de novo em instantes.", enviado: true };
  }
  if (form.get("confiar") === "on") await confiarNesteDispositivo().catch(() => false);
  redirect(destinoSeguro(form.get("voltar")));
}

// O e-mail também traz um link (o modelo padrão do Supabase só traz o link). Ele abre
// /auth/mfa/email com a sessão do link no fragmento; esta ação confere que é a mesma pessoa e que
// a sessão veio do e-mail há pouco, libera a sessão em uso e encerra a do link.
export async function confirmarLinkEmail(tokenDoLink: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: atual } = await supabase.auth.getClaims();
  if (!atual?.claims?.sub) return { ok: false };
  const { data: link } = await clienteAvulso().auth.getClaims(tokenDoLink);
  const claims = link?.claims;
  const agora = Date.now() / 1000;
  const doEmail = ((claims?.amr ?? []) as AMREntry[]).some(
    (a) => ["otp", "magiclink"].includes(a.method) && agora - a.timestamp < 3600,
  );
  if (!claims || claims.sub !== atual.claims.sub || !doEmail) return { ok: false };
  await createAdminClient().auth.admin.signOut(tokenDoLink, "local").catch(() => null);
  return { ok: await marcarSessaoVerificada("email").catch(() => false) };
}

// Depois do código do app (conferido no navegador): guarda este navegador por 14 dias (DIAS_CONFIANCA).
export async function confiarDispositivo(): Promise<boolean> {
  return confiarNesteDispositivo().catch(() => false);
}
