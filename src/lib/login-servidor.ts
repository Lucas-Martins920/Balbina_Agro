import "server-only";
import type { AuthError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensagemBloqueio } from "@/lib/login-bloqueio";

// Regras do login que valem para o site e para o app de celular (rota /api/app/login).

export function erroCaptcha(error: AuthError) {
  return error.code === "captcha_failed" || /captcha/i.test(error.message)
    ? "Não conseguimos confirmar que você não é um robô. Aguarde a verificação terminar e tente de novo."
    : null;
}

// Senha errada vira alarme no painel do master depois de 5 na mesma hora (alertas_seguranca). Falha ao
// registrar não pode travar o login.
export async function registrarFalhaLogin(email: string, ip: string | null) {
  try {
    await createAdminClient().rpc("registrar_falha_login", { p_email: email, p_ip: ip });
  } catch {
    // sem SUPABASE_SECRET_KEY (máquina local) ou banco fora do ar
  }
}

// 5 senhas erradas em 15 minutos travam a conta por 15 minutos (public.login_bloqueado_ate). Sem a chave
// de serviço (máquina local) ou com o banco fora do ar, não trava.
export async function bloqueioLogin(email: string) {
  try {
    const { data } = await createAdminClient().rpc("login_bloqueado_ate", { p_email: email });
    return mensagemBloqueio((data as string | null) ?? null);
  } catch {
    return null;
  }
}

export function ipDaRequisicao(cabecalhos: Headers) {
  return cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
