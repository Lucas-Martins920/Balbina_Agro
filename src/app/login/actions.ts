"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registrarAceite } from "@/lib/aceite-termos";
import { emailDeEntrada, eLoginLocal } from "@/lib/login-local";
import { bloqueioLogin, erroCaptcha, ipDaRequisicao, registrarFalhaLogin } from "@/lib/login-servidor";
import { destinoSeguro, VERSAO_TERMOS } from "@/lib/termos";

export type EstadoLogin = { erro?: string; info?: string };

const SITE = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Token do Cloudflare Turnstile (components/captcha.tsx). O Supabase Auth confere quando a proteção
// por captcha está ligada no painel; desligada, ele ignora.
function tokenCaptcha(form: FormData) {
  return String(form.get("cf-turnstile-response") ?? "") || undefined;
}

async function registrarFalha(email: string) {
  await registrarFalhaLogin(email, ipDaRequisicao(await headers()));
}

// Entra com e-mail ou com o usuário criado pelo master (login local, sem e-mail).
async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const identificacao = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!identificacao || !senha) return { erro: "Informe e-mail ou usuário e a senha." };
  const email = emailDeEntrada(identificacao);
  const travado = await bloqueioLogin(email);
  if (travado) return { erro: travado };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha, options: { captchaToken: tokenCaptcha(form) } });
  if (error) {
    const captcha = erroCaptcha(error);
    if (!captcha) await registrarFalha(email);
    return { erro: captcha ?? (eLoginLocal(email) ? "Usuário ou senha incorretos." : "E-mail ou senha incorretos.") };
  }
  let padrao = "/painel";
  if (eLoginLocal(email)) {
    // cargo operacional cai direto na tela enxuta (apontamento no celular, checklist ou ração)
    const { data: local } = await supabase.rpc("meu_login_local");
    padrao = (local as { inicio?: string | null } | null)?.inicio ?? padrao;
  } else {
    await supabase.rpc("aceitar_convites");
  }
  const destino = destinoSeguro(form.get("voltar"), padrao);
  // A senha sozinha não abre nada: falta o código do app autenticador ou do e-mail.
  const { data: pendente } = await supabase.rpc("mfa_pendente");
  if (pendente === true) redirect(`/auth/mfa?voltar=${encodeURIComponent(destino)}`);
  redirect(destino);
}

const CADASTRO_ENVIADO =
  "Se esse e-mail ainda não tiver conta, enviamos um link para confirmar o cadastro. Se você já tem conta, volte em Entrar ou use Esqueci minha senha.";

async function criarConta(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!email || senha.length < 8) return { erro: "Informe um e-mail e uma senha com pelo menos 8 caracteres." };
  if (senha !== String(form.get("confirmacao") ?? "")) return { erro: "As senhas não conferem. Digite a mesma senha nos dois campos." };
  if (form.get("aceite") !== "on") return { erro: "Para criar a conta, aceite os Termos de uso e a Política de privacidade." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    // a conta só ganha sessão depois de confirmar o e-mail: o aceite vai nos metadados e vira
    // registro em aceites_termos no primeiro acesso (exigirAceiteTermos)
    options: {
      emailRedirectTo: `${SITE()}/auth/confirmar`,
      captchaToken: tokenCaptcha(form),
      data: { termos_versao: VERSAO_TERMOS, termos_aceitos_em: new Date().toISOString() },
    },
  });
  // E-mail já cadastrado recebe a mesma resposta de um novo (o Supabase com confirmação ligada também
  // não diz), para não revelar quais e-mails têm conta; a mensagem já aponta o caminho de quem tem.
  if (error && error.code !== "user_already_exists") return { erro: erroCaptcha(error) ?? `Não foi possível criar a conta: ${error.message}` };
  if (data.session) {
    await registrarAceite("cadastro");
    redirect("/onboarding");
  }
  return { info: CADASTRO_ENVIADO };
}

// O link do e-mail passa por /auth/confirmar, que abre a sessão e leva para /auth/nova-senha.
async function recuperarSenha(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { erro: "Informe o e-mail da sua conta." };
  if (!email.includes("@")) return { erro: "Quem entra com usuário (sem e-mail) pede a senha nova ao master da piscicultura." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE()}/auth/confirmar?proximo=senha`,
    captchaToken: tokenCaptcha(form),
  });
  const captcha = error && erroCaptcha(error);
  if (captcha) return { erro: captcha };
  // mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados
  return { info: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha." };
}

// Uma ação só para o formulário inteiro: o modo vai num campo escondido. Trocar a ação do
// useActionState conforme o modo fazia o envio usar a ação de um modo anterior (ex.: Entrar rodava
// o "Esqueci minha senha" de novo e a mesma mensagem ficava na tela).
export async function enviarLogin(estado: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const modo = form.get("modo");
  if (modo === "criar") return criarConta(estado, form);
  if (modo === "recuperar") return recuperarSenha(estado, form);
  return entrar(estado, form);
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
