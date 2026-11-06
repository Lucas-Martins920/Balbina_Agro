"use client";

import { useActionState } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { classeBotao } from "@/components/ui";

// Botão "excluir" de uma linha de tabela que mostra o motivo quando o banco recusa.
export function ExcluirLinha({ acao, id }: { acao: (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>; id: string }) {
  const [estado, enviar, excluindo] = useActionState<EstadoAcao, FormData>(acao, {});
  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={excluindo} className={classeBotao("perigo", "sm")}>excluir</button>
      {estado.erro && <span role="alert" className="max-w-64 text-right text-xs text-perigo">{estado.erro}</span>}
    </form>
  );
}
