"use client";

import { useEffect, useRef } from "react";
import { aoVoltarConexao, conexaoAtual } from "./detector";
import { TAG_SYNC, criarSincronizador, type Sincronizador } from "./worker";

type RegistroComSync = ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };

// Background Sync (Chrome do Android): o service worker acorda e sincroniza mesmo com a tela fechada
function pedirSegundoPlano() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((r) => (r as RegistroComSync).sync?.register(TAG_SYNC))
    .catch(() => undefined);
}

let unico: Sincronizador | null = null;

// Instância única do navegador: liga o relógio de 5 s e escuta a volta da internet, a tela voltar para a frente e
// o pedido do service worker.
export function sincronizador(): Sincronizador {
  if (unico) return unico;
  const s = criarSincronizador({ online: conexaoAtual, pedirSegundoPlano });
  unico = s;
  aoVoltarConexao(() => void s.agora());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void s.agora();
    else s.pedirSegundoPlano(); // a pessoa saiu do app com envio na fila
  });
  window.addEventListener("offline", () => s.pedirSegundoPlano());
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent<{ tipo?: string }>) => {
    if (e.data?.tipo === "sincronizar") void s.agora();
  });
  return s;
}

// A tela registra a sua fila enquanto está aberta. rodar e temPendente podem mudar a cada render.
export function useTarefaSync(nome: string, rodar: () => Promise<unknown>, temPendente: () => boolean) {
  const ref = useRef({ rodar, temPendente });
  useEffect(() => {
    ref.current = { rodar, temPendente };
  });
  useEffect(() => {
    const s = sincronizador();
    const parar = s.registrar({ nome, rodar: () => ref.current.rodar(), temPendente: () => ref.current.temPendente() });
    void s.agoraUma(nome);
    return parar;
  }, [nome]);
}
