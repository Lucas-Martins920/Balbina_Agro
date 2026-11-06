"use client";

import { useEffect, useRef } from "react";

type Turnstile = { render: (el: HTMLElement, opcoes: Record<string, unknown>) => string };
type JanelaApp = Window & { turnstile?: Turnstile; ReactNativeWebView?: { postMessage: (m: string) => void } };

function avisarApp(mensagem: { tipo: "token" | "sem-captcha" | "erro"; token?: string }) {
  (window as JanelaApp).ReactNativeWebView?.postMessage(JSON.stringify(mensagem));
}

export function CaptchaApp({ chave }: { chave: string | null }) {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chave) {
      avisarApp({ tipo: "sem-captcha" });
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => {
      const t = (window as JanelaApp).turnstile;
      if (!t || !caixa.current) return avisarApp({ tipo: "erro" });
      t.render(caixa.current, {
        sitekey: chave,
        language: "pt-br",
        theme: "auto",
        callback: (token: string) => avisarApp({ tipo: "token", token }),
        "error-callback": () => avisarApp({ tipo: "erro" }),
      });
    };
    s.onerror = () => avisarApp({ tipo: "erro" });
    document.head.appendChild(s);
  }, [chave]);

  return <div ref={caixa} className="min-h-[65px]" />;
}
