"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { Aviso, Botao } from "@/components/ui";
import type { EstadoAcao } from "@/lib/acao";
import { reduzirImagem } from "@/lib/imagem-cliente";
import { lerDocumentoEnviado } from "./actions";

// Escolhe a foto (câmera do celular) ou o PDF, reduz a foto e manda para a leitura.
export function EnviarDocumento() {
  const [estado, enviar, pendente] = useActionState<EstadoAcao, FormData>(lerDocumentoEnviado, {});
  const [preparando, setPreparando] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  async function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const arquivo = new FormData(e.currentTarget).get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return;
    setPreparando(true);
    const dados = new FormData();
    dados.set("arquivo", await reduzirImagem(arquivo));
    setPreparando(false);
    startTransition(() => enviar(dados));
    ref.current?.reset();
  }

  const ocupado = preparando || pendente;
  return (
    <form ref={ref} onSubmit={aoEnviar} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Foto ou PDF do boleto, nota ou recibo</span>
        <input type="file" name="arquivo" accept="application/pdf,image/jpeg,image/png,image/webp" required
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-elevado file:px-3 file:py-2 file:text-sm file:font-medium" />
      </label>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="info">{estado.ok}</Aviso>}
      <Botao type="submit" disabled={ocupado} className="self-start">{ocupado ? "Lendo…" : "Ler documento"}</Botao>
    </form>
  );
}
