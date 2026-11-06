"use client";

import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { clienteNavegador } from "@/lib/supabase/client";

// Senha nova com confirmação, para quem já tem sessão (convite ou "esqueci minha senha").
export function FormNovaSenha({ aoSalvar, botao }: { aoSalvar: () => void | Promise<void>; botao: string }) {
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(false);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const senha = String(form.get("senha") ?? "");
    if (senha.length < 8) return setErro("A senha precisa de pelo menos 8 caracteres.");
    if (senha !== String(form.get("confirmacao") ?? "")) return setErro("As senhas não conferem. Digite a mesma senha nos dois campos.");
    setPendente(true);
    const { error } = await clienteNavegador().auth.updateUser({ password: senha });
    if (error) {
      setPendente(false);
      return setErro(`Não foi possível salvar a senha: ${error.message}`);
    }
    await aoSalvar();
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <Campo rotulo="Nova senha" id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
      <Campo rotulo="Confirme a nova senha" id="confirmacao" name="confirmacao" type="password" autoComplete="new-password" minLength={8} required />
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>{pendente ? "Aguarde…" : botao}</Botao>
    </form>
  );
}
