import { NextResponse } from "next/server";
import { emailDeEntrada, eLoginLocal } from "@/lib/login-local";
import { bloqueioLogin, erroCaptcha, ipDaRequisicao, registrarFalhaLogin } from "@/lib/login-servidor";
import { clienteAvulso } from "@/lib/app-celular/sessao";

// Login do app de celular: mesma regra do site (trava de 5 erros, captcha, usuário sem e-mail), mas devolve
// a sessão em JSON para o app guardar no cofre do aparelho. O 2º fator continua obrigatório: o app vê
// mfa_pendente e chama /api/app/mfa antes de qualquer dado aparecer (o banco já barra até lá).
export async function POST(request: Request) {
  let corpo: { identificacao?: unknown; senha?: unknown; captcha?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const identificacao = typeof corpo.identificacao === "string" ? corpo.identificacao.trim() : "";
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  const captchaToken = typeof corpo.captcha === "string" && corpo.captcha ? corpo.captcha : undefined;
  if (!identificacao || !senha) return NextResponse.json({ erro: "Informe e-mail ou usuário e a senha." }, { status: 422 });

  const email = emailDeEntrada(identificacao);
  const travado = await bloqueioLogin(email);
  if (travado) return NextResponse.json({ erro: travado }, { status: 429 });

  const supabase = clienteAvulso();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha, options: { captchaToken } });
  if (error || !data.session) {
    const captcha = error ? erroCaptcha(error) : null;
    if (!captcha) await registrarFalhaLogin(email, ipDaRequisicao(request.headers));
    const erro = captcha ?? (eLoginLocal(email) ? "Usuário ou senha incorretos." : "E-mail ou senha incorretos.");
    return NextResponse.json({ erro, captcha: Boolean(captcha) }, { status: 401 });
  }

  const local = eLoginLocal(email);
  if (!local) await supabase.rpc("aceitar_convites");
  const { data: pendente } = await supabase.rpc("mfa_pendente");
  const s = data.session;
  return NextResponse.json({
    sessao: { access_token: s.access_token, refresh_token: s.refresh_token },
    mfa_pendente: pendente === true,
    login_local: local,
  });
}
