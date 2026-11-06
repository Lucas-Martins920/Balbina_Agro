"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, classeBotao } from "@/components/ui";
import { CodigoMfa } from "@/components/codigo-mfa";
import { FormNovaSenha } from "@/components/nova-senha";
import { clienteNavegador } from "@/lib/supabase/client";

type Etapa = "carregando" | "codigo" | "senha" | "sem_sessao";

export function FormRecuperacao() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("carregando");

  // Com a verificação em duas etapas ativa, o Supabase só troca a senha numa sessão aal2:
  // o link do e-mail não basta, a pessoa digita o código do autenticador antes.
  useEffect(() => {
    (async () => {
      const { data } = await clienteNavegador().auth.mfa.getAuthenticatorAssuranceLevel();
      if (!data?.currentLevel) return setEtapa("sem_sessao");
      setEtapa(data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? "codigo" : "senha");
    })();
  }, []);

  // A sessão do link não vale como os dois fatores: entra de novo com a senha nova.
  async function entrar() {
    await clienteNavegador().auth.signOut({ scope: "local" });
    router.replace("/login?aviso=senha");
    router.refresh();
  }

  if (etapa === "carregando") return <p className="text-sm text-texto-suave">Carregando…</p>;
  if (etapa === "sem_sessao") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso>O link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.</Aviso>
        <Link href="/login" className={classeBotao("secundario", "sm")}>Ir para o login</Link>
      </div>
    );
  }
  if (etapa === "codigo") return <CodigoMfa aoConfirmar={() => setEtapa("senha")} botao="Continuar" />;
  return <FormNovaSenha aoSalvar={entrar} botao="Salvar senha e entrar" />;
}
