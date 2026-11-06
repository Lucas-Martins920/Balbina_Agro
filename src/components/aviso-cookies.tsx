"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Botao, CLASSE_BOTAO_TEXTO } from "@/components/ui";

const CHAVE = "balbina.aviso-cookies";
const EVENTO = "balbina-aviso-cookies";

// localStorage pode não existir (aba anônima com armazenamento bloqueado): aí não insiste no aviso
function jaViu() {
  try {
    return Boolean(localStorage.getItem(CHAVE));
  } catch {
    return true;
  }
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  return () => window.removeEventListener(EVENTO, avisar);
}

// Só cookies essenciais: não há o que consentir, mas avisamos uma vez e mostramos a política.
export function AvisoCookies() {
  // no servidor conta como visto, para não piscar o aviso antes de ler o navegador
  const visto = useSyncExternalStore(assinar, jaViu, () => true);
  if (visto) return null;

  function fechar() {
    try {
      localStorage.setItem(CHAVE, new Date().toISOString());
    } catch {}
    window.dispatchEvent(new Event(EVENTO));
  }

  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-xl md:bottom-4 print:hidden">
      <div className="cristal flex flex-col gap-3 rounded-3xl border border-borda px-4 py-3.5 text-sm sm:flex-row sm:items-center">
        <p className="flex-1 text-texto-suave">
          O Balbina usa só cookies essenciais, para manter você conectado e lembrar suas preferências.{" "}
          <Link href="/cookies" className={CLASSE_BOTAO_TEXTO}>Política de cookies</Link>
        </p>
        <Botao type="button" onClick={fechar} className="self-end sm:self-auto">Entendi</Botao>
      </div>
    </div>
  );
}
