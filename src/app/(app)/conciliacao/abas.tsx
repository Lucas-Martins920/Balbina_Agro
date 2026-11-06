"use client";

import { useId, useState, type ReactNode } from "react";

export type Aba = { id: string; rotulo: string; conteudo: ReactNode };

// Abas do lado "no sistema" de cada lançamento do extrato: Sugestão, Novo lançamento, Transferência, Ignorar.
export function Abas({ abas, inicial }: { abas: Aba[]; inicial?: string }) {
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.id);
  const base = useId();
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Como conciliar" className="flex flex-wrap gap-1 border-b border-borda">
        {abas.map((a) => (
          <button key={a.id} type="button" role="tab" id={`${base}-${a.id}`} aria-selected={ativa === a.id} aria-controls={`${base}-${a.id}-p`}
            onClick={() => setAtiva(a.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition ${ativa === a.id ? "border-marca font-medium text-texto" : "border-transparent text-texto-suave hover:text-texto"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a) => (
        <div key={a.id} role="tabpanel" id={`${base}-${a.id}-p`} aria-labelledby={`${base}-${a.id}`} hidden={ativa !== a.id}>
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
