"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, type LucideIcon } from "lucide-react";

// Modo dia/noite. Sem escolha salva ("sistema") segue o aparelho; escolher dia ou noite fixa <html data-theme>.
// O seletor só tem dia e noite: o terceiro botão (monitor, "igual ao aparelho") parecia um "modo desktop" e só
// trocava o tema. A versão completa do celular fica em src/components/versao.tsx.
// O script SCRIPT_TEMA roda antes da pintura (no <head>) para a página não piscar no tema errado.
export type Tema = "claro" | "escuro" | "sistema";
const CHAVE = "balbina-tema";
const EVENTO = "balbina-tema";

// Também marca <html class="leve"> em celular/tablet (toque), aparelho com até 4 setores ou 4 GB e quem pediu economia
// de dados: o vidro fica mais simples (globals.css). Nos outros navegadores Chromium marca <html class="lente">, os únicos
// que aceitam filtro SVG no backdrop-filter (a refração do vidro); nos demais o vidro fica só com desfoque.
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CHAVE}");if(t==="escuro")document.documentElement.dataset.theme="dark";else if(t==="claro")document.documentElement.dataset.theme="light"}catch(e){}try{var n=navigator,h=document.documentElement,l=matchMedia("(pointer: coarse)").matches||(n.hardwareConcurrency||8)<=4||(n.deviceMemory||8)<=4||(n.connection&&n.connection.saveData);if(l)h.classList.add("leve");else if(n.userAgentData&&CSS.supports("backdrop-filter","blur(1px)"))h.classList.add("lente")}catch(e){}`;

const ESCURO = "(prefers-color-scheme: dark)";

// O tema que está valendo: o escolhido ou, sem escolha, o do aparelho.
function ler(): "claro" | "escuro" {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t === "claro" || t === "escuro") return t;
  } catch {
    // navegação privada: segue o aparelho
  }
  return matchMedia(ESCURO).matches ? "escuro" : "claro";
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  const midia = matchMedia(ESCURO);
  midia.addEventListener("change", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
    midia.removeEventListener("change", avisar);
  };
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  // Sem transições durante a troca: tudo muda no mesmo quadro.
  raiz.classList.add("sem-transicao");
  if (tema === "sistema") delete raiz.dataset.theme;
  else raiz.dataset.theme = tema === "escuro" ? "dark" : "light";
  try {
    if (tema === "sistema") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, tema);
  } catch {
    // navegação privada: vale só para esta aba
  }
  window.dispatchEvent(new Event(EVENTO));
  requestAnimationFrame(() => requestAnimationFrame(() => raiz.classList.remove("sem-transicao")));
}

const OPCOES: { tema: Tema; nome: string; Icone: LucideIcon }[] = [
  { tema: "claro", nome: "Modo dia", Icone: Sun },
  { tema: "escuro", nome: "Modo noturno", Icone: Moon },
];

export function SeletorTema() {
  const atual = useSyncExternalStore(assinar, ler, () => null);
  return (
    <div role="radiogroup" aria-label="Aparência" className="inline-flex rounded-full border border-borda bg-elevado/60 p-0.5">
      {OPCOES.map(({ tema, nome, Icone }) => {
        const ativo = atual === tema;
        return (
          <button
            key={tema}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={nome}
            title={nome}
            onClick={() => aplicar(tema)}
            className={`grid size-7 place-items-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-[0.92] ${
              ativo ? "bg-solido text-texto shadow-[0_1px_3px_rgb(0_0_0/0.15)]" : "text-texto-suave hover:text-texto"
            }`}
          >
            <Icone size={14} strokeWidth={1.9} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

// Interruptor "Modo noturno" da barra lateral aberta: liga e desliga a noite, como no desenho de referência.
export function InterruptorTema() {
  const atual = useSyncExternalStore(assinar, ler, () => null);
  const noite = atual === "escuro";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={noite}
      onClick={() => aplicar(noite ? "claro" : "escuro")}
      className="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm text-texto/85 transition-colors duration-150 hover:bg-elevado/60 hover:text-texto"
    >
      {noite ? <Moon aria-hidden size={18} strokeWidth={1.75} /> : <Sun aria-hidden size={18} strokeWidth={1.75} />}
      <span className="flex-1 text-left">Modo noturno</span>
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${noite ? "bg-marca" : "bg-texto/15"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-300 ease-mola ${noite ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}

// Botão de ícone do trilho recolhido: mostra o sol ou a lua do modo atual e troca para o outro.
export function BotaoTema({ className = "" }: { className?: string }) {
  const atual = useSyncExternalStore(assinar, ler, () => null);
  const noite = atual === "escuro";
  const nome = noite ? "Mudar para o modo dia" : "Mudar para o modo noturno";
  return (
    <button type="button" aria-label={nome} data-dica={noite ? "Modo dia" : "Modo noturno"} onClick={() => aplicar(noite ? "claro" : "escuro")} className={className}>
      {noite ? <Moon aria-hidden size={18} strokeWidth={1.75} /> : <Sun aria-hidden size={18} strokeWidth={1.75} />}
    </button>
  );
}
