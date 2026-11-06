"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, classeBotao } from "@/components/ui";
import { CodigoMfa } from "@/components/codigo-mfa";
import { clienteNavegador } from "@/lib/supabase/client";
import { confiarDispositivo } from "./actions";
import { CadastroApp } from "./cadastro-app";
import { CodigoEmail } from "./codigo-email";
import { CaixaConfiar } from "./confiar";

// `local`: login por usuário (sem e-mail). Sem app cadastrado, cadastra o app aqui: o código por e-mail não chega.
export function FormMfa({ destino, email, comSenha, local = false }: { destino: string; email: string; comSenha: boolean; local?: boolean }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<"carregando" | "app" | "email" | "sem_sessao">("carregando");
  const [confiar, setConfiar] = useState(false);

  function seguir() {
    router.replace(destino);
    router.refresh();
  }

  useEffect(() => {
    (async () => {
      const { data } = await clienteNavegador().auth.mfa.getAuthenticatorAssuranceLevel();
      if (!data?.currentLevel) return setEtapa("sem_sessao");
      if (data.currentLevel === "aal2") return seguir();
      // com app autenticador cadastrado só ele vale; sem app, o código vai por e-mail
      setEtapa(data.nextLevel === "aal2" ? "app" : "email");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function trocarConta() {
    await clienteNavegador().auth.signOut({ scope: "local" });
    router.replace("/login");
  }

  if (etapa === "carregando") return <p className="text-sm text-texto-suave">Carregando…</p>;
  if (etapa === "sem_sessao") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso>Sua sessão expirou. Entre de novo com e-mail ou usuário e a senha.</Aviso>
        <Link href="/login" className={classeBotao("secundario", "sm")}>Ir para o login</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {etapa === "app" ? (
        <>
          <p className="text-sm">Abra o app autenticador no celular e digite o código do Balbina.</p>
          <CodigoMfa aoConfirmar={async () => { if (confiar) await confiarDispositivo(); seguir(); }} botao="Entrar" />
          <CaixaConfiar checked={confiar} onChange={(e) => setConfiar(e.currentTarget.checked)} />
          <p className="text-sm text-texto-suave">
            {local
              ? "Perdeu o celular? Peça ao master da piscicultura para zerar o app autenticador do seu usuário."
              : "Perdeu o celular? Fale com o suporte do Balbina para desativar o app da sua conta."}
          </p>
        </>
      ) : local && comSenha ? (
        <CadastroApp aoConfirmar={seguir} />
      ) : comSenha ? (
        <CodigoEmail email={email} destino={destino} />
      ) : (
        // sessão aberta por link de e-mail: o código do e-mail só completa uma sessão aberta com senha
        <Aviso tipo="info">Para continuar, entre com o seu e-mail e senha.</Aviso>
      )}
      <button
        type="button"
        onClick={trocarConta}
        className={classeBotao("secundario", "sm")}
      >
        Entrar com outra conta
      </button>
    </div>
  );
}
