"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { gravarItem, lerItem } from "@/lib/db/indexeddb";
import { useOnline } from "@/lib/online";
import { aoVoltarConexao } from "@/lib/sync/detector";

// Offline no sistema inteiro (public/sw.js): o service worker guarda cada tela aberta com internet e os arquivos
// dela; sem internet, a tela abre a última versão guardada. Os apps de celular (/campo, /vendedor) também
// lançam sem internet; no escritório, sem internet, dá para consultar o que já foi aberto.

// Manda ao service worker os arquivos que esta tela carregou (inclui os pedaços que o HTML não cita), para a tela
// abrir completa sem sinal.
function guardarArquivos() {
  const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(`${location.origin}/_next/static/`));
  navigator.serviceWorker.controller?.postMessage({ tipo: "guardar", urls });
}

// No npm run dev o service worker fica desligado: o "aquecer" pede até 80 telas e cada uma obriga o Turbopack a
// compilar a rota (minutos de CPU a 100% e GBs de RAM no notebook), e o cache de /_next/static atrapalha o HMR.
// Para testar o offline no dev, ponha NEXT_PUBLIC_SW_DEV=1 no .env.local (ou use npm run build && npm run start).
const SW_LIGADO = process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_SW_DEV === "1";

// Tira do navegador o worker que um dev antigo deixou registrado (senão ele continua aquecendo telas).
function desligarServiceWorker() {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister())).catch(() => undefined);
}

export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!SW_LIGADO) return desligarServiceWorker();
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(guardarArquivos).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", guardarArquivos);
    // pede ao navegador para não apagar o que está guardado (filas, telas) quando faltar espaço
    navigator.storage?.persist?.().catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", guardarArquivos);
  }, []);
}

const CHAVE_AQUECIDO = "balbina:telas:aquecidas";
const AQUECER_A_CADA_MS = 12 * 60 * 60_000;
const ESPERA_AQUECER_MS = 8_000;

// Telas do menu guardadas de antemão (uma vez a cada 12 h, com internet, um pouco depois de abrir), para o
// escritório abrir qualquer tela do menu mesmo sem ter passado por ela antes de a internet cair.
function useAquecerTelas(telas: string[], online: boolean) {
  const lista = telas.join("|");
  useEffect(() => {
    if (!SW_LIGADO || !online || !("serviceWorker" in navigator) || !lista) return;
    const t = setTimeout(() => {
      const ultima = Number(lerItem(CHAVE_AQUECIDO) ?? 0);
      if (Date.now() - ultima < AQUECER_A_CADA_MS) return;
      navigator.serviceWorker.ready.then((r) => {
        r.active?.postMessage({ tipo: "aquecer", urls: lista.split("|") });
        gravarItem(CHAVE_AQUECIDO, String(Date.now()));
      }).catch(() => undefined);
    }, ESPERA_AQUECER_MS);
    return () => clearTimeout(t);
  }, [lista, online]);
}

export function ModoOffline({ telas }: { telas: string[] }) {
  const online = useOnline();
  const router = useRouter();
  useServiceWorker();
  useAquecerTelas(telas, online);
  // a internet voltou: busca os números novos da tela aberta
  useEffect(() => aoVoltarConexao(() => router.refresh()), [router]);

  if (online) return null;
  return (
    <p role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-alerta/40 bg-alerta/10 px-3.5 py-2.5 text-sm">
      <WifiOff aria-hidden size={16} className="mt-0.5 shrink-0 text-alerta" />
      <span>
        Sem internet. Você está vendo a última versão guardada desta tela; o que mudar aqui só grava com sinal.
        No campo e no vendedor, os lançamentos ficam no aparelho e vão sozinhos quando a internet voltar.
      </span>
    </p>
  );
}
