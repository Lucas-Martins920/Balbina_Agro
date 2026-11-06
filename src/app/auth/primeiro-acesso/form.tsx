"use client";

import { useActionState } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { trocarSenhaInicial, type EstadoSenha } from "./actions";

export function FormPrimeiroAcesso({ voltar }: { voltar: string }) {
  const [estado, acao, pendente] = useActionState<EstadoSenha, FormData>(trocarSenhaInicial, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="voltar" value={voltar} />
      <Campo rotulo="Nova senha" id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      <Campo rotulo="Confirme a nova senha" id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>{pendente ? "Aguarde…" : "Salvar senha e entrar"}</Botao>
    </form>
  );
}
