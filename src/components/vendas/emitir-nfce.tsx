"use client";

import { useActionState } from "react";
import { emitirNfce, type EstadoNfce } from "@/app/(app)/notas/actions";
import { Aviso, Botao, CLASSE_CONTROLE, classeBotao } from "@/components/ui";

// NFC-e da venda que acabou de ser feita no balcão, com CPF na nota se o cliente pedir
export function EmitirNfce({ pedidoId }: { pedidoId: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoNfce, FormData>(emitirNfce, {});
  if (estado.notaId) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Aviso tipo="info">{estado.ok}</Aviso>
        <a href={`/api/notas/${estado.notaId}/danfe`} target="_blank" rel="noreferrer" className={classeBotao("secundario")}>Imprimir DANFE da NFC-e</a>
      </div>
    );
  }
  return (
    <form action={enviar} className="flex flex-col items-center gap-2">
      <input type="hidden" name="pedido_id" value={pedidoId} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <input name="cpf" inputMode="numeric" aria-label="CPF na nota (opcional)" placeholder="CPF na nota (opcional)" className={`h-12 w-56 ${CLASSE_CONTROLE}`} />
        <Botao type="submit" variante="secundario" disabled={pendente} className="h-12">{pendente ? "Emitindo…" : "Emitir NFC-e"}</Botao>
      </div>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
    </form>
  );
}
