"use client";

import { useActionState } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { classeBotao, CLASSE_CONTROLE } from "@/components/ui";
import { DialogoAcao } from "@/components/dialogo-acao";

type Acao = (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;

// "excluir" abre a confirmação (caixa modal centralizada) com o motivo (opcional); nada sai com um clique só.
export function ExcluirLancamento({ acao, id, resumo }: { acao: Acao; id: string; resumo: string }) {
  const [estado, enviar, excluindo] = useActionState<EstadoAcao, FormData>(acao, {});
  return (
    <DialogoAcao rotulo="excluir" titulo="Excluir lançamento" variante="perigo">
      <form action={enviar} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <p className="text-sm">Excluir o lançamento {resumo}? Ração e medicação dele voltam ao estoque e ele vai para a lixeira.</p>
        <label htmlFor={`motivo-${id}`} className="text-xs text-texto-suave">Motivo (opcional)</label>
        <input id={`motivo-${id}`} name="motivo" maxLength={300} className={`${CLASSE_CONTROLE} h-9`} placeholder="Ex.: lancei no viveiro errado" />
        <button type="submit" disabled={excluindo} className={classeBotao("perigo", "sm")}>
          {excluindo ? "Excluindo…" : "Confirmar exclusão"}
        </button>
        {estado.erro && <span role="alert" className="text-sm text-perigo">{estado.erro}</span>}
      </form>
    </DialogoAcao>
  );
}

export function RestaurarLancamento({ acao, id }: { acao: Acao; id: string }) {
  const [estado, enviar, restaurando] = useActionState<EstadoAcao, FormData>(acao, {});
  return (
    <form action={enviar} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={restaurando} className={classeBotao("secundario", "sm")}>
        {restaurando ? "Restaurando…" : "restaurar"}
      </button>
      {estado.erro && <span role="alert" className="max-w-64 text-right text-xs text-perigo">{estado.erro}</span>}
    </form>
  );
}
