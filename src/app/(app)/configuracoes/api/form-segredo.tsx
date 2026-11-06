"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Aviso, Botao } from "@/components/ui";
import { BotaoCopiar } from "@/components/vendas/botao-copiar";
import type { EstadoSegredo } from "./actions";

// Como o FormAcao, mas mostra o segredo devolvido pela ação (uma vez só) com botão de copiar.
export function FormSegredo({ acao, botao, children }: {
  acao: (estado: EstadoSegredo, form: FormData) => Promise<EstadoSegredo>;
  botao: string;
  children: ReactNode;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.versao) ref.current?.reset();
  }, [estado.versao]);

  return (
    <form ref={ref} action={enviar} className="flex flex-col gap-3">
      {children}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="sucesso">{estado.ok}</Aviso>}
      {estado.segredo && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl border border-borda bg-elevado/60 px-3 py-2 font-mono text-[13px]">{estado.segredo}</code>
          <BotaoCopiar texto={estado.segredo} rotulo="Copiar" />
        </div>
      )}
      <Botao type="submit" disabled={pendente} className="self-start">
        {pendente ? "Salvando…" : botao}
      </Botao>
    </form>
  );
}
