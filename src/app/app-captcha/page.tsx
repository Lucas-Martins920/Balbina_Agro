import type { Metadata } from "next";
import { CaptchaApp } from "./captcha-app";

export const metadata: Metadata = { title: "Verificação · Balbina", robots: { index: false } };

// Aberta pelo app de celular (pasta mobile/) numa WebView: mostra o Cloudflare Turnstile e devolve o
// token ao app por postMessage. Sem NEXT_PUBLIC_TURNSTILE_SITE_KEY avisa o app que não há captcha.
export default function PaginaCaptchaApp() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <CaptchaApp chave={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
    </main>
  );
}
