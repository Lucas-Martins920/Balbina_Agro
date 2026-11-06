"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile. O widget põe o token num campo escondido "cf-turnstile-response" dentro do
// formulário; o servidor repassa ao Supabase Auth, que confere com a chave secreta. Sem
// NEXT_PUBLIC_TURNSTILE_SITE_KEY o widget não aparece (desenvolvimento e antes de ativar no Supabase).
const CHAVE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let carregando: Promise<Turnstile> | null = null;
function carregarTurnstile() {
  carregando ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile não carregou")));
    s.onerror = () => {
      carregando = null;
      reject(new Error("Turnstile não carregou"));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

// `renovar` muda a cada resposta do servidor: o token só vale uma vez, então o widget gera outro.
export function Captcha({ renovar }: { renovar?: unknown }) {
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!CHAVE) return;
    let ativo = true;
    carregarTurnstile()
      .then((t) => {
        if (!ativo || !caixa.current || widget.current) return;
        const tema = document.documentElement.dataset.theme;
        widget.current = t.render(caixa.current, { sitekey: CHAVE, language: "pt-br", theme: tema === "dark" || tema === "light" ? tema : "auto", size: "flexible" });
      })
      .catch(() => {});
    return () => {
      ativo = false;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (widget.current && renovar !== undefined) window.turnstile?.reset(widget.current);
  }, [renovar]);

  if (!CHAVE) return null;
  return <div ref={caixa} className="min-h-[65px]" />;
}

