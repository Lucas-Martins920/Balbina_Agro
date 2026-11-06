"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Smartphone, type LucideIcon } from "lucide-react";
import { CHAVE_VERSAO } from "@/lib/versao";

type Versao = "celular" | "completa";

function ler(): Versao {
  return document.documentElement.classList.contains("completa") ? "completa" : "celular";
}

function trocar(versao: Versao) {
  if (versao === ler()) return;
  // Cookie para o servidor mandar a largura certa já na primeira resposta (generateViewport).
  document.cookie = versao === "completa"
    ? `${CHAVE_VERSAO}=completa; path=/; max-age=31536000; samesite=lax`
    : `${CHAVE_VERSAO}=; path=/; max-age=0; samesite=lax`;
  location.reload();
}

const OPCOES: { versao: Versao; nome: string; Icone: LucideIcon }[] = [
  { versao: "celular", nome: "Versão do celular", Icone: Smartphone },
  { versao: "completa", nome: "Versão completa (como no computador)", Icone: Monitor },
];

// Alterna a versão do celular e a completa, no mesmo formato do seletor dia/noite. Fica sempre à vista: na barra do
// alto do celular e, na versão completa, no topo da lateral. No computador não aparece (classe `so-toque`).
export function SeletorVersao() {
  const atual = useSyncExternalStore(() => () => {}, ler, () => null);
  return (
    <div role="radiogroup" aria-label="Versão" className="so-toque inline-flex shrink-0 rounded-full border border-borda bg-elevado/60 p-0.5">
      {OPCOES.map(({ versao, nome, Icone }) => {
        const ativo = atual === versao;
        return (
          <button
            key={versao}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={nome}
            title={nome}
            onClick={() => trocar(versao)}
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
