import { NextResponse } from "next/server";
import { criarDispositivoConfiavel, liberarPorDispositivo, registrarSessaoVerificada } from "@/lib/mfa";
import { clienteAvulso, sessaoDoApp, type SessaoApp } from "@/lib/app-celular/sessao";

// 2º fator do app de celular, com as mesmas regras de /auth/mfa do site:
// - "dispositivo": o aparelho foi confiado (14 dias) por esta pessoa → libera a sessão sem código;
// - "enviar_email" / "confirmar_email": código de 6 dígitos que o Supabase Auth manda e confere;
// - "confirmar_app": o app já conferiu o código do autenticador direto no Supabase (sessão aal2) e só
//   pede para guardar o aparelho como confiável.
// "confiar": true devolve um token que o app guarda no cofre do aparelho; o banco guarda só o hash.

type Corpo = { acao?: unknown; codigo?: unknown; confiar?: unknown; token?: unknown; captcha?: unknown; aparelho?: unknown };

const json = (dados: unknown, status = 200) => NextResponse.json(dados, { status });

async function pendente(s: SessaoApp) {
  const { data } = await s.supabase.rpc("mfa_pendente");
  return data === true;
}

async function confiarSePedido(s: SessaoApp, corpo: Corpo) {
  if (corpo.confiar !== true) return undefined;
  const aparelho = typeof corpo.aparelho === "string" ? `App Balbina · ${corpo.aparelho}` : "App Balbina";
  const criado = await criarDispositivoConfiavel(s.claims, aparelho).catch(() => null);
  return criado?.token;
}

export async function POST(request: Request) {
  const s = await sessaoDoApp(request);
  if (!s) return json({ erro: "Sessão expirada. Entre de novo." }, 401);
  let corpo: Corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ erro: "JSON inválido." }, 400);
  }

  switch (corpo.acao) {
    case "dispositivo": {
      const token = typeof corpo.token === "string" ? corpo.token : "";
      const ok = await liberarPorDispositivo(s.claims, token).catch(() => false);
      return json({ ok });
    }
    case "enviar_email": {
      if (!s.claims.email) return json({ erro: "Quem entra com usuário (sem e-mail) usa o app autenticador." }, 422);
      const captchaToken = typeof corpo.captcha === "string" && corpo.captcha ? corpo.captcha : undefined;
      const { error } = await clienteAvulso().auth.signInWithOtp({ email: s.claims.email, options: { shouldCreateUser: false, captchaToken } });
      if (error) {
        if (error.status === 429 || /rate|seconds/i.test(error.message)) return json({ erro: "Aguarde um minuto antes de pedir outro código." }, 429);
        if (/captcha/i.test(error.message)) return json({ erro: "Não conseguimos confirmar que você não é um robô. Tente de novo.", captcha: true }, 422);
        return json({ erro: `Não foi possível enviar o código: ${error.message}` }, 502);
      }
      return json({ info: `Enviamos um código para ${s.claims.email}.` });
    }
    case "confirmar_email": {
      if (!s.claims.email) return json({ erro: "Sessão sem e-mail." }, 422);
      const codigo = typeof corpo.codigo === "string" ? corpo.codigo.replace(/\D/g, "") : "";
      if (codigo.length < 6) return json({ erro: "Digite o código que chegou no seu e-mail." }, 422);
      const avulso = clienteAvulso();
      const { data, error } = await avulso.auth.verifyOtp({ email: s.claims.email, token: codigo, type: "email" });
      if (error || !data.session) return json({ erro: "Código inválido ou expirado. Confira o último e-mail ou peça outro código." }, 422);
      await avulso.auth.signOut({ scope: "local" });
      if (!(await registrarSessaoVerificada(s.claims, "email").catch(() => false))) {
        return json({ erro: "O código está certo, mas não conseguimos liberar o acesso. Tente de novo em instantes." }, 503);
      }
      return json({ ok: true, dispositivo: await confiarSePedido(s, corpo) });
    }
    case "confirmar_app": {
      if (s.claims.aal !== "aal2" || (await pendente(s))) return json({ erro: "Confirme o código do app autenticador primeiro." }, 422);
      return json({ ok: true, dispositivo: await confiarSePedido(s, corpo) });
    }
    default:
      return json({ erro: "Ação desconhecida." }, 400);
  }
}
