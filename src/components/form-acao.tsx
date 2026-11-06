"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { Aviso, Botao } from "@/components/ui";

type Props = {
  acao: (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;
  botao: string;
  children: ReactNode;
  className?: string;
  limparAoSalvar?: boolean;
  variante?: "primario" | "secundario";
};

// Formulário ligado a uma server action: mostra erro/sucesso e limpa ao salvar.
export function FormAcao({ acao, botao, children, className = "", limparAoSalvar = true, variante = "primario" }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.versao && limparAoSalvar) ref.current?.reset();
  }, [estado.versao, limparAoSalvar]);

  return (
    <form ref={ref} action={enviar} className={`flex flex-col gap-3 ${className}`}>
      {children}
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="info">{estado.ok}</Aviso>}
      <Botao type="submit" disabled={pendente} variante={variante} className="self-start">
        {pendente ? "Salvando…" : botao}
      </Botao>
    </form>
  );
}
