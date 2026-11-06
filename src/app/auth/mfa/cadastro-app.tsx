"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@/components/ui";
import { clienteNavegador } from "@/lib/supabase/client";

type Cadastro = { id: string; qr: string; segredo: string };

// Cadastro do app autenticador no meio do login, para quem entra com usuário (sem e-mail) e ainda não tem app.
// O app gera o código sem internet e sem sinal; depois de confirmado, a sessão já fica com os dois fatores.
export function CadastroApp({ aoConfirmar }: { aoConfirmar: () => void }) {
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = clienteNavegador();
      const { data: todos } = await supabase.auth.mfa.listFactors();
      for (const f of todos?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Balbina", issuer: "Balbina" });
      if (error || !data) return setErro(`Não foi possível iniciar o cadastro do app: ${error?.message ?? "tente de novo"}`);
      setCadastro({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    })();
  }, []);

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cadastro) return;
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\D/g, "");
    if (codigo.length !== 6) return setErro("Digite os 6 números que aparecem no app autenticador.");
    setErro("");
    setPendente(true);
    const { error } = await clienteNavegador().auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: codigo });
    setPendente(false);
    if (error) return setErro("Código inválido ou expirado. Confira o horário do celular e tente o código atual.");
    aoConfirmar();
  }

  if (!cadastro) return erro ? <Aviso>{erro}</Aviso> : <p className="text-sm text-texto-suave">Preparando o cadastro do app…</p>;
  return (
    <form onSubmit={confirmar} className="flex flex-col gap-4 text-sm">
      <p>O seu usuário precisa do app autenticador no celular (Google Authenticator, Microsoft Authenticator ou Authy, gratuitos). Ele funciona sem internet e sem sinal.</p>
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>Abra o app autenticador e toque em adicionar conta.</li>
        <li>Leia o QR code abaixo com a câmera do app.</li>
        <li>Digite o código de 6 números que o app mostrar.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cadastro.qr} alt="QR code para o app autenticador" width={180} height={180} className="rounded-xl bg-white p-2" />
      <p className="text-texto-suave">
        Sem câmera? Digite esta chave no app: <code className="font-mono break-all text-texto select-all">{cadastro.segredo}</code>
      </p>
      <div className="max-w-56">
        <Campo rotulo="Código do app" id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={7}
          placeholder="000000" required className="text-center font-mono text-lg tracking-[0.3em]" />
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <Botao type="submit" disabled={pendente}>{pendente ? "Conferindo…" : "Confirmar e entrar"}</Botao>
    </form>
  );
}
