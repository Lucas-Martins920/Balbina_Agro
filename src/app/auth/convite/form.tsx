"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, classeBotao } from "@/components/ui";
import { FormNovaSenha } from "@/components/nova-senha";
import { clienteNavegador } from "@/lib/supabase/client";

type Etapa = "carregando" | "senha" | "sem_sessao";

export function FormSenhaConvite() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("carregando");

  // O link do Supabase devolve a sessão no fragmento (#access_token=...); o servidor não enxerga essa parte.
  useEffect(() => {
    (async () => {
      const supabase = clienteNavegador();
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token });
        window.history.replaceState(null, "", window.location.pathname);
      }
      const { data } = await supabase.auth.getUser();
      setEtapa(data.user ? "senha" : "sem_sessao");
    })();
  }, []);

  async function entrar() {
    const supabase = clienteNavegador();
    await supabase.rpc("aceitar_convites");
    // A sessão do link não vale como os dois fatores: entra de novo com a senha que acabou de criar.
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login?aviso=senha");
    router.refresh();
  }

  if (etapa === "carregando") return <p className="text-sm text-texto-suave">Abrindo o convite…</p>;
  if (etapa === "sem_sessao") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso>O link do convite expirou ou já foi usado. Entre com seu e-mail e senha ou peça um novo convite.</Aviso>
        <Link href="/login" className={classeBotao("secundario", "sm")}>Ir para o login</Link>
      </div>
    );
  }
  return <FormNovaSenha aoSalvar={entrar} botao="Salvar senha e entrar" />;
}
