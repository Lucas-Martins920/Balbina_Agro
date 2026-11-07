import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { emManutencao, respostaManutencao } from "@/lib/manutencao";

// CSP com nonce: o script-src só aceita scripts com o nonce desta requisição ou carregados
// por eles ('strict-dynamic'). Em desenvolvimento o React usa eval para depuração.
// O Supabase do ambiente (produção, site de teste, local ou o do E2E em 127.0.0.1) entra no connect-src
// pela própria URL configurada, além do curinga *.supabase.co.
function origemSupabase() {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const ws = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    return ` ${u.origin} ${ws}`;
  } catch {
    return "";
  }
}

// IA local (Ollama) que o app de campo chama direto quando está sem internet (src/lib/ai/offline-chat.ts)
function origemOllama() {
  try {
    return process.env.NEXT_PUBLIC_OLLAMA_URL ? ` ${new URL(process.env.NEXT_PUBLIC_OLLAMA_URL).origin}` : "";
  } catch {
    return "";
  }
}

function cspHeader(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind e tema
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${origemSupabase()} https://vitals.vercel-insights.com https://api.pluggy.ai${origemOllama()}`,
    "frame-src 'self' https://challenges.cloudflare.com https://connect.pluggy.ai",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  if (emManutencao()) return respostaManutencao(request.nextUrl.pathname);

  // Gera um nonce único por requisição e passa no cabeçalho da requisição: o layout lê o x-nonce e o
  // Next lê o CSP da requisição para pôr o nonce nos próprios scripts.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = cspHeader(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);

  // Aplica o CSP com o nonce na resposta (inclusive em redirecionamentos e erros).
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
