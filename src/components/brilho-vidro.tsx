"use client";

import { useEffect } from "react";

// Reflexo do Liquid Glass: a lâmina de vidro sob o ponteiro ganha um brilho que acompanha o mouse
// (--mx/--my em globals.css). Um só ouvinte no documento, no máximo uma escrita por quadro.
// Fica parado no toque, no modo leve (html.leve, ver tema.tsx) e com prefers-reduced-motion.
export function BrilhoVidro() {
  useEffect(() => {
    if (document.documentElement.classList.contains("leve") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let quadro = 0;
    let anterior: HTMLElement | null = null;
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || quadro) return;
      const alvo = (e.target as Element | null)?.closest?.<HTMLElement>(".vidro, .cristal") ?? null;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        if (anterior && anterior !== alvo) {
          anterior.style.removeProperty("--mx");
          anterior.style.removeProperty("--my");
        }
        anterior = alvo;
        if (!alvo) return;
        const r = alvo.getBoundingClientRect();
        alvo.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        alvo.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    };
    document.addEventListener("pointermove", mover, { passive: true });
    return () => {
      document.removeEventListener("pointermove", mover);
      cancelAnimationFrame(quadro);
    };
  }, []);
  return null;
}

// Mapa de deslocamento da lente: vermelho empurra na horizontal e verde na vertical, só perto das bordas
// (o miolo fica em 50%, sem deslocar). Vira o filtro #lente usado pelo .cristal no Chromium.
const MAPA = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><defs>" +
    "<linearGradient id='x'><stop offset='0' stop-color='#ff0000'/><stop offset='.1' stop-color='#800000'/><stop offset='.9' stop-color='#800000'/><stop offset='1' stop-color='#000000'/></linearGradient>" +
    "<linearGradient id='y' x2='0' y2='1'><stop offset='0' stop-color='#00ff00'/><stop offset='.14' stop-color='#008000'/><stop offset='.86' stop-color='#008000'/><stop offset='1' stop-color='#000000'/></linearGradient>" +
    "</defs><rect width='100' height='100' fill='url(#x)'/><rect width='100' height='100' fill='url(#y)' style='mix-blend-mode:screen'/></svg>",
)}`;

export function FiltroLente() {
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <filter id="lente" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={MAPA} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="mapa" />
        <feDisplacementMap in="SourceGraphic" in2="mapa" scale="36" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
