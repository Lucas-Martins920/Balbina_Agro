"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Aviso, Botao, CLASSE_BOTAO_TEXTO } from "@/components/ui";
import { DOCUMENTOS_LEGAIS } from "@/lib/termos";
import { aceitarTermos, type EstadoAceite } from "./actions";

export function FormAceite({ voltar }: { voltar?: string }) {
  const [estado, acao, pendente] = useActionState<EstadoAceite, FormData>(aceitarTermos, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="voltar" value={voltar ?? ""} />
      <ul className="flex flex-col gap-1.5 text-sm">
        {DOCUMENTOS_LEGAIS.map((d) => (
          <li key={d.href}>
            <Link href={d.href} target="_blank" className={CLASSE_BOTAO_TEXTO}>{d.nome}</Link>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2.5 text-sm text-texto-suave">
        <input type="checkbox" name="aceite" required className="mt-0.5 size-4 accent-marca" />
        <span>Li e aceito os Termos de uso, a Política de privacidade e a Política de cookies.</span>
      </label>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>{pendente ? "Aguarde…" : "Aceitar e continuar"}</Botao>
    </form>
  );
}
