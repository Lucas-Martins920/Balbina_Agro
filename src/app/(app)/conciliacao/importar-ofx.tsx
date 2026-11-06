"use client";

import { useActionState, useEffect, useRef } from "react";
import { Upload } from "lucide-react";
import type { EstadoAcao } from "@/lib/acao";
import { Aviso, Botao } from "@/components/ui";

type Props = {
  acao: (estado: EstadoAcao, form: FormData) => Promise<EstadoAcao>;
  contaId: string;
  contaNome: string;
};

// Botão "Importar arquivo OFX": abre a janela de arquivos e importa assim que o arquivo é escolhido.
// O seletor nativo fica escondido porque, sem estilo, ele aparece como texto solto e o usuário clicava
// no botão de enviar esperando que ele abrisse a janela de arquivos.
export function ImportarOfx({ acao, contaId, contaNome }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const form = useRef<HTMLFormElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.versao) form.current?.reset();
  }, [estado.versao]);

  return (
    <form ref={form} action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="conta_id" value={contaId} />
      <input
        ref={arquivo}
        id="arquivo"
        name="arquivo"
        type="file"
        accept=".ofx,.OFX,application/x-ofx"
        aria-label={`Arquivo OFX de ${contaNome}`}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.currentTarget.files?.length) form.current?.requestSubmit();
        }}
      />
      <Botao type="button" variante="secundario" className="self-start" disabled={pendente} onClick={() => arquivo.current?.click()}>
        <Upload aria-hidden className="size-4" />
        {pendente ? "Importando…" : "Importar arquivo OFX"}
      </Botao>
      <p className="text-xs text-texto-suave">
        Arquivo .ofx exportado do internet banking de {contaNome}. Pode importar o mesmo período de novo: o que já está no extrato (mesmo código do banco, ou mesma data, valor e descrição) é pulado.
      </p>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="info">{estado.ok}</Aviso>}
    </form>
  );
}
