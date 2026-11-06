"use client";

import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { clienteNavegador } from "@/lib/supabase/client";

// Pede o código de 6 dígitos do app autenticador e eleva a sessão para aal2.
export function CodigoMfa({ aoConfirmar, botao = "Confirmar" }: { aoConfirmar: () => void; botao?: string }) {
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(false);

  async function verificar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\D/g, "");
    if (codigo.length !== 6) return setErro("Digite os 6 números que aparecem no app autenticador.");
    setPendente(true);
    setErro("");
    const supabase = clienteNavegador();
    const { data: fatores, error: erroLista } = await supabase.auth.mfa.listFactors();
    const fator = fatores?.totp[0];
    if (erroLista || !fator) {
      setPendente(false);
      return setErro("Não encontramos o autenticador desta conta. Entre de novo.");
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (error) {
      setPendente(false);
      return setErro("Código inválido ou expirado. Confira o horário do celular e tente o código atual.");
    }
    aoConfirmar();
  }

  return (
    <form onSubmit={verificar} className="flex flex-col gap-4">
      <Campo
        rotulo="Código do autenticador"
        id="codigo"
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="000000"
        autoFocus
        required
        className="text-center font-mono text-lg tracking-[0.3em]"
      />
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>{pendente ? "Conferindo…" : botao}</Botao>
    </form>
  );
}
