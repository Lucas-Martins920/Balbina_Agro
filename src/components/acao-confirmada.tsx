"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { Aviso, Botao } from "@/components/ui";

type Props = {
  acao: (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;
  botao: string;
  // o que acontece, mostrado antes de confirmar
  pergunta: ReactNode;
  confirmar?: string;
  children?: ReactNode;
  variante?: "secundario" | "perigo";
};

// Botão que pede confirmação no próprio lugar antes de chamar a server action.
export function AcaoConfirmada({ acao, botao, pergunta, confirmar = "Confirmar", children, variante = "secundario" }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, pendente] = useActionState(async (anterior: EstadoAcao, form: FormData) => {
    const r = await acao(anterior, form);
    if (!r.erro) setAberto(false);
    return r;
  }, {});

  return (
    <div className="flex flex-col gap-2">
      {aberto ? (
        <form action={enviar} className="flex flex-col gap-3 rounded-xl border border-borda bg-elevado/50 p-3 text-sm">
          {children}
          <div>{pergunta}</div>
          <div className="flex flex-wrap gap-2">
            <Botao type="submit" variante={variante === "perigo" ? "perigo" : "primario"} tamanho="sm" disabled={pendente}>
              {pendente ? "Aguarde…" : confirmar}
            </Botao>
            <Botao type="button" variante="fantasma" tamanho="sm" onClick={() => setAberto(false)}>Cancelar</Botao>
          </div>
        </form>
      ) : (
        <Botao type="button" variante={variante} tamanho="sm" className="self-start" onClick={() => setAberto(true)}>{botao}</Botao>
      )}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && !aberto && <Aviso tipo="info">{estado.ok}</Aviso>}
    </div>
  );
}
