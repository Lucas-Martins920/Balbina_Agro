"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAreaVisivel } from "@/components/area-visivel";

const SAIDA_MS = 240;

// O rodapé da gaveta fica fora da rolagem: o botão principal está sempre ao alcance do polegar.
// O conteúdo (formulário, ficha do viveiro) manda os botões para lá com <RodapeFolha>.
const AlvoRodape = createContext<HTMLElement | null>(null);

export function RodapeFolha({ children }: { children: ReactNode }) {
  const alvo = useContext(AlvoRodape);
  const botoes = <div className="flex flex-col gap-2">{children}</div>;
  return alvo ? createPortal(botoes, alvo) : <div className="mt-5">{botoes}</div>;
}

// Gaveta de baixo do app de campo (<dialog> modal: foco preso, Esc fecha, fica por cima de tudo).
// Sobe com a curva de gaveta do iOS e desce mais rápido; dá para arrastar pela alça para fechar.
// Quem abre e fecha é o pai (aberta); fechar pelo X, pelo fundo, pelo Esc ou arrastando chama aoFechar.
// O conteúdo continua montado enquanto a gaveta desce: o pai troca a key para começar o formulário do zero.
export function Folha({ aberta, aoFechar, titulo, descricao, children, rodape }: {
  aberta: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const area = useAreaVisivel(aberta, ref);
  const arrasto = useRef<{ y: number; t: number; dy: number } | null>(null);
  const [rodapeEl, setRodapeEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta) {
      if (!d.open) {
        delete d.dataset.saindo;
        d.style.transform = "";
        d.showModal();
      }
      return;
    }
    if (!d.open || d.dataset.saindo !== undefined) return;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    d.style.transform = "";
    d.style.transition = "";
    d.dataset.saindo = "";
    const t = setTimeout(() => {
      d.close();
      delete d.dataset.saindo;
    }, reduzido ? 0 : SAIDA_MS);
    return () => clearTimeout(t);
  }, [aberta]);

  // arrastar pela alça: segue o dedo (para cima resiste), solta longe ou rápido e fecha
  function comecar(e: React.PointerEvent) {
    arrasto.current = { y: e.clientY, t: performance.now(), dy: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  }
  function mover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a || !ref.current) return;
    a.dy = e.clientY - a.y;
    const y = a.dy < 0 ? a.dy * 0.15 : a.dy;
    ref.current.style.transform = `translateY(${y}px)`;
  }
  function soltar() {
    const a = arrasto.current;
    const d = ref.current;
    arrasto.current = null;
    if (!a || !d) return;
    const velocidade = a.dy / Math.max(performance.now() - a.t, 1);
    if (a.dy > 120 || (a.dy > 24 && velocidade > 0.5)) {
      aoFechar();
      return;
    }
    d.style.transition = "";
    d.style.transform = "";
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      onCancel={(e) => { e.preventDefault(); aoFechar(); }}
      onClose={() => { if (aberta) aoFechar(); }}
      onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}
      style={area ? { marginTop: area.top + 8, marginBottom: "auto", maxHeight: area.height - 16 } : undefined}
      className="folha mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-b-0 border-borda bg-solido p-0 text-texto shadow-[var(--sombra-cristal)] open:flex"
    >
      <div
        className="flex shrink-0 cursor-grab touch-none flex-col items-center px-5 pt-2.5 pb-2 active:cursor-grabbing"
        onPointerDown={comecar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
      >
        <span aria-hidden className="h-1.5 w-10 rounded-full bg-texto-suave/30" />
        <div className="mt-2 flex w-full items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={`${id}-titulo`} className="text-lg font-semibold tracking-tight">{titulo}</h2>
            {descricao && <div className="mt-0.5 text-sm text-texto-suave">{descricao}</div>}
          </div>
          <button type="button" aria-label="Fechar" onClick={aoFechar} onPointerDown={(e) => e.stopPropagation()}
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full bg-elevado text-texto-suave transition-transform duration-150 active:scale-[0.92]">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>
      <AlvoRodape.Provider value={rodapeEl}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </AlvoRodape.Provider>
      <div ref={setRodapeEl} className="shrink-0 border-t border-linha px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] empty:hidden">{rodape}</div>
    </dialog>
  );
}
