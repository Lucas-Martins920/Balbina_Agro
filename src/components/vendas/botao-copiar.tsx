"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { classeBotao } from "@/components/ui";

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          window.prompt(rotulo, texto);
        }
      }}
      className={classeBotao("secundario")}>
      {copiado ? <Check size={16} strokeWidth={1.75} aria-hidden /> : <Copy size={16} strokeWidth={1.75} aria-hidden />}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}
