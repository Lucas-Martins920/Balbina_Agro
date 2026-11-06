"use client";

import { useEffect, useState } from "react";
import { classeBotao } from "@/components/ui";

type Estado = "carregando" | "sem_suporte" | "bloqueado" | "ligado" | "desligado";

function chaveBytes(base64: string) {
  const b = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

// Liga os avisos neste celular (lembrete de apontamento e outros). Precisa do service worker de /campo.
export function AvisosPush({ chavePublica }: { chavePublica: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // tudo dentro da promessa: o estado só muda depois de montar
    Promise.resolve().then(async (): Promise<Estado> => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "sem_suporte";
      if (Notification.permission === "denied") return "bloqueado";
      const s = await navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).catch(() => null);
      return s ? "ligado" : "desligado";
    }).then(setEstado);
  }, []);

  async function ligar() {
    setErro(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.ready;
      const inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chavePublica) });
      const resp = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inscricao.toJSON()) });
      if (!resp.ok) throw new Error();
      setEstado("ligado");
    } catch {
      setErro("Não deu para ligar os avisos. Tente com internet.");
    }
  }

  async function desligar() {
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.getSubscription();
    if (s) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => undefined);
      await s.unsubscribe();
    }
    setEstado("desligado");
  }

  if (estado === "carregando" || estado === "sem_suporte") return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {estado === "ligado" ? (
        <p className="flex items-center justify-between gap-2">
          <span>Avisos ligados neste celular.</span>
          <button type="button" onClick={desligar} className={classeBotao("secundario", "sm")}>Desligar</button>
        </p>
      ) : estado === "bloqueado" ? (
        <p className="text-texto-suave">Os avisos estão bloqueados nas configurações do navegador deste celular.</p>
      ) : (
        <button type="button" onClick={ligar} className={`${classeBotao("secundario", "sm")} self-start`}>Avisar neste celular quando faltar apontamento</button>
      )}
      {erro && <p className="text-perigo">{erro}</p>}
    </div>
  );
}
