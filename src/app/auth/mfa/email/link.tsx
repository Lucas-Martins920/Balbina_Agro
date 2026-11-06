"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, classeBotao } from "@/components/ui";
import { confirmarLinkEmail } from "../actions";

export function LinkEmail() {
  const router = useRouter();
  const [falhou, setFalhou] = useState(false);

  // A sessão do link vem no fragmento (#access_token=...), que o servidor não enxerga.
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("access_token");
    window.history.replaceState(null, "", window.location.pathname);
    (token ? confirmarLinkEmail(token) : Promise.resolve({ ok: false })).then(({ ok }) => {
      if (!ok) return setFalhou(true);
      router.replace("/painel");
      router.refresh();
    });
  }, [router]);

  if (!falhou) return <p className="text-sm text-texto-suave">Confirmando…</p>;
  return (
    <div className="flex flex-col gap-4">
      <Aviso>
        Não conseguimos confirmar este link. Abra o link no mesmo navegador em que você entrou com a senha, ou digite o código do e-mail.
      </Aviso>
      <Link href="/auth/mfa" className={classeBotao("secundario", "sm")}>Voltar para a verificação</Link>
    </div>
  );
}
