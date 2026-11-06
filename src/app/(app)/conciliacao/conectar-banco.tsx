"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { EstadoAcao } from "@/lib/acao";
import { Aviso, Botao } from "@/components/ui";
import { gerarTokenConexao, registrarConexao } from "./open-finance-actions";

type Props = { itemId?: string; rotulo?: string; variante?: "primario" | "secundario" };

// Abre o widget da Pluggy, onde a pessoa escolhe o banco e autoriza no app do próprio banco.
export function ConectarBanco({ itemId, rotulo = "Conectar banco", variante = "primario" }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoAcao>({});
  const [etapa, setEtapa] = useState<"livre" | "abrindo" | "importando">("livre");

  async function abrir() {
    setEstado({});
    setEtapa("abrindo");
    const r = await gerarTokenConexao(itemId);
    if (!r.token) {
      setEstado({ erro: r.erro });
      setEtapa("livre");
      return;
    }
    const { PluggyConnect } = await import("pluggy-connect-sdk");
    const widget = new PluggyConnect({
      connectToken: r.token,
      includeSandbox: r.sandbox,
      updateItem: itemId,
      language: "pt",
      countries: ["BR"],
      theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      onSuccess: async ({ item }) => {
        setEtapa("importando");
        setEstado(await registrarConexao(item.id));
        setEtapa("livre");
        router.refresh();
      },
      onError: ({ message }) => setEstado({ erro: `O banco não concluiu a conexão: ${message}` }),
      onClose: () => setEtapa((e) => (e === "abrindo" ? "livre" : e)),
    });
    await widget.init().catch(() => {
      setEstado({ erro: "Não consegui abrir a janela do Open Finance. Tente de novo." });
      setEtapa("livre");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Botao type="button" variante={variante} onClick={abrir} disabled={etapa !== "livre"} className="self-start">
        {etapa === "importando" ? "Trazendo o extrato…" : etapa === "abrindo" ? "Abrindo…" : rotulo}
      </Botao>
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      {estado.ok && <Aviso tipo="info">{estado.ok}</Aviso>}
    </div>
  );
}
