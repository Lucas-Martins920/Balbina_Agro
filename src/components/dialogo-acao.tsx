"use client";

import { useRef, useState, type ReactNode } from "react";
import { useAreaVisivel } from "@/components/area-visivel";
import { classeBotao } from "@/components/ui";

type Variante = Parameters<typeof classeBotao>[0];

// Botão que abre uma caixa de confirmação/edição como <dialog> modal: fica centralizada na tela,
// por cima de tudo, e não é cortada por tabela com rolagem nem pela borda da tela (celular e tablet).
// Esc ou "fechar" fecham.
export function DialogoAcao({ rotulo, titulo, variante = "secundario", children }: {
  rotulo: string;
  titulo: string;
  variante?: Variante;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  // com o teclado do celular aberto, a caixa sobe para a parte visível da tela em vez de ficar atrás dele
  const area = useAreaVisivel(aberto, ref);
  return (
    <>
      <button type="button" className={classeBotao(variante, "sm")} onClick={() => { ref.current?.showModal(); setAberto(true); }}>{rotulo}</button>
      <dialog ref={ref} aria-label={titulo} onClose={() => setAberto(false)}
        style={area ? { marginTop: area.top + 8, marginBottom: "auto", maxHeight: area.height - 16 } : undefined}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-borda bg-solido p-0 text-left text-texto shadow-xl backdrop:bg-black/40">
        <div className="flex items-center justify-between gap-2 border-b border-borda px-4 py-2">
          <span className="text-sm font-medium">{titulo}</span>
          <button type="button" className={classeBotao("secundario", "sm")} onClick={() => ref.current?.close()}>fechar</button>
        </div>
        <div className="p-4">{children}</div>
      </dialog>
    </>
  );
}
