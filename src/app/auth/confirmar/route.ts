import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Destino do link de confirmação de e-mail do Supabase.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const codigo = url.searchParams.get("code");
  const supabase = await createClient();

  let ok = false;
  if (tokenHash && tipo) {
    ok = !(await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })).error;
  } else if (codigo) {
    ok = !(await supabase.auth.exchangeCodeForSession(codigo)).error;
  }

  // Entra nas empresas que convidaram este e-mail
  if (ok) await supabase.rpc("aceitar_convites");
  const destino = url.clone();
  destino.search = "";
  // convite com o modelo de e-mail por token_hash: a pessoa ainda precisa definir a senha.
  // "Esqueci minha senha" chega com type=recovery (token_hash) ou com ?proximo=senha (code).
  const recuperacao = tipo === "recovery" || url.searchParams.get("proximo") === "senha";
  if (!ok) destino.pathname = "/login";
  else if (tipo === "invite") destino.pathname = "/auth/convite";
  else if (recuperacao) destino.pathname = "/auth/nova-senha";
  else {
    // Cadastro confirmado. A sessão do link não vale como os dois fatores (o banco só completa
    // sessão aberta com senha): a pessoa entra com a senha e depois o código.
    await supabase.auth.signOut({ scope: "local" });
    destino.pathname = "/login";
    destino.searchParams.set("aviso", "confirmado");
  }
  return NextResponse.redirect(destino);
}
