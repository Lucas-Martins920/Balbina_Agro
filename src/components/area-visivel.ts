"use client";

import { useEffect, useState, type RefObject } from "react";

// Parte da tela que sobra acima do teclado do celular. No iPhone (e no Android, que hoje só encolhe a
// "visual viewport"), um painel `fixed` continua com a altura da tela inteira quando o teclado abre, e o campo
// digitado fica atrás do teclado. Enquanto o teclado está aberto este hook devolve o topo e a altura da área
// visível, para a gaveta ou o diálogo caberem nela; com o teclado fechado devolve null e nada muda.
// Também traz o campo em foco para a vista quando o teclado abre ou quando a pessoa pula para o próximo campo.
export function useAreaVisivel(ativo: boolean, ref: RefObject<HTMLElement | null>) {
  const [area, setArea] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!ativo || !vv) return;
    let quadro = 0;
    const mostrarFoco = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const el = document.activeElement;
        if (el instanceof HTMLElement && ref.current?.contains(el) && el.matches("input, select, textarea")) {
          el.scrollIntoView({ block: "nearest" });
        }
      });
    };
    const medir = () => {
      // teclado = a área visível ficou bem menor que a janela (zoom de pinça não conta: escala diferente de 1)
      const teclado = vv.scale <= 1.01 && window.innerHeight - vv.height > 120;
      setArea(teclado ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null);
      if (teclado) mostrarFoco();
    };
    // ao trocar de campo com o teclado já aberto, espera o navegador terminar a rolagem dele
    let espera: ReturnType<typeof setTimeout> | undefined;
    const aoFocar = () => { clearTimeout(espera); espera = setTimeout(mostrarFoco, 120); };
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    const alvo = ref.current;
    alvo?.addEventListener("focusin", aoFocar);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
      alvo?.removeEventListener("focusin", aoFocar);
      cancelAnimationFrame(quadro);
      clearTimeout(espera);
      setArea(null);
    };
  }, [ativo, ref]);

  return area;
}

// Celular e tablet: abrir a gaveta já com o cursor num campo faz o teclado subir e cobrir metade dela.
export function telaDeToque() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
}
