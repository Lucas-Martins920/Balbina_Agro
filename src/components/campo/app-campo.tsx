"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, CloudUpload, MessageCircle, Scale, WavesHorizontal, Wheat, type LucideIcon } from "lucide-react";
import { alternarAjuda } from "@/components/tutorial";
import { hojeISO } from "@/lib/formato";
import { useOnline } from "@/lib/online";
import { turnoAgora } from "@/lib/rotulos";
import { resumoFila, type ItemFila } from "@/lib/campo/fila";
import type { Turno } from "@/lib/campo/propostas";
import { ProvedorCampo, type Aba, type AcaoFolha, type Campo, type DadosCampo } from "./contexto";
import { useFilaCampo, usePreferencia } from "./fila-cliente";
import { ChatCampo } from "./chat-campo";
import { ViveirosCampo } from "./viveiros-campo";
import { RacaoCampo } from "./racao-campo";
import { BiometriaCampo } from "./biometria-campo";
import { EnviosCampo } from "./envios-campo";
import { FolhasCampo } from "./folhas-campo";

const ABAS: { chave: Aba; nome: string; icone: LucideIcon }[] = [
  { chave: "chat", nome: "Chat", icone: MessageCircle },
  { chave: "viveiros", nome: "Viveiros", icone: WavesHorizontal },
  { chave: "racao", nome: "Ração", icone: Wheat },
  { chave: "biometria", nome: "Biometria", icone: Scale },
  { chave: "envios", nome: "Envios", icone: CloudUpload },
];
const ABAS_VALIDAS = new Set<string>(ABAS.map((a) => a.chave));
const nada = () => () => undefined;

// App de campo (/campo): chat com IA, viveiros, ração e insumos, biometria e a fila de envios.
// Depois de aberto uma vez com sinal, funciona sem internet e envia sozinho quando o sinal volta.
export function AppCampo({ dados }: { dados: DadosCampo }) {
  const router = useRouter();
  const online = useOnline();
  // a tela pode vir do cache de outro dia: a data e o turno são os do celular, não os de quando a página foi salva
  const hoje = useSyncExternalStore(nada, () => hojeISO(dados.empresa.fuso), () => dados.hoje);
  const turno = useSyncExternalStore(nada, () => turnoAgora(new Date(), dados.empresa.fuso), () => "manha") as Turno;
  const [abaSalva, setAba] = usePreferencia<string>(`balbina:campo:aba:${dados.empresa.id}`, "chat");
  const aba = (ABAS_VALIDAS.has(abaSalva) ? abaSalva : "chat") as Aba;
  const [kgSaco, mudarKgSaco] = usePreferencia<number>(`balbina:campo:kg-saco:${dados.empresa.id}`, 25);
  const [aviso, setAviso] = useState<{ texto: string; tom: "ok" | "erro"; id: number } | null>(null);
  const [acao, setAcao] = useState<(AcaoFolha & { versao: number }) | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const tempo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const avisar = useCallback((texto: string, tom: "ok" | "erro" = "ok") => {
    clearTimeout(tempo.current);
    setAviso({ texto, tom, id: Date.now() });
    tempo.current = setTimeout(() => setAviso(null), tom === "erro" ? 5000 : 2800);
  }, []);
  useEffect(() => () => clearTimeout(tempo.current), []);

  // depois de enviar, a tela pede os números novos ao servidor (peso, ração sugerida, lote aberto)
  const aoEnviar = useCallback((n: number) => {
    avisar(n === 1 ? "Enviado." : `${n} envios feitos.`);
    router.refresh();
  }, [avisar, router]);
  const fila = useFilaCampo(dados.empresa.id, online, aoEnviar);

  const salvar = useCallback((item: ItemFila) => {
    const ok = fila.enfileirar(item);
    if (!ok) avisar("O celular está sem espaço para guardar. Libere espaço ou lance com sinal.", "erro");
    else avisar(navigator.onLine ? "Salvo. Enviando…" : "Salvo no celular. Vai sozinho quando o sinal voltar.");
    return ok;
  }, [fila, avisar]);

  const abrir = useCallback((a: AcaoFolha) => {
    setAcao((atual) => ({ ...a, versao: (atual?.versao ?? 0) + 1 }));
    setFolhaAberta(true);
  }, []);

  const tanques = dados.painel.tanques;
  const campo = useMemo<Campo>(() => ({
    dados, hoje, turno, online, kgSaco, mudarKgSaco, fila, salvar, abrir, avisar,
    irPara: (a) => setAba(a),
    tanque: (id) => tanques.find((t) => t.id === id),
    pendentes: (viveiro) => fila.fila.filter((i) => i.corpo.viveiro_id === viveiro),
    cartoes: {
      tanques: tanques.map((t) => ({ id: t.id, rotulo: t.rotulo, lote: t.lote ? { id: t.lote.id } : null })),
      insumos: dados.painel.insumos, medicamentos: dados.medicamentos, racoes: dados.racoes,
    },
  }), [dados, hoje, turno, online, kgSaco, mudarKgSaco, fila, salvar, abrir, avisar, setAba, tanques]);

  // service worker: guarda a tela e os arquivos dela para abrir sem sinal
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const guardar = () => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.startsWith(`${location.origin}/_next/static/`));
      navigator.serviceWorker.controller?.postMessage({ tipo: "guardar", urls });
    };
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(guardar).catch(() => undefined);
    navigator.serviceWorker.addEventListener("controllerchange", guardar);
    // pede ao navegador para não apagar a fila quando faltar espaço
    navigator.storage?.persist?.().catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", guardar);
  }, []);

  const resumo = resumoFila(fila.fila);

  return (
    <ProvedorCampo value={campo}>
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <header data-tour="sinal" className="cristal sticky top-0 z-30 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-texto-suave uppercase">Balbina Campo</p>
            <h1 className="truncate text-base font-semibold">{dados.empresa.nome}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setAba("envios")} aria-label={`${online ? "Online" : "Sem sinal"}. ${resumo.total ? `${resumo.total} na fila de envio` : "Nada na fila"}`}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-solido px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ring-borda transition-transform duration-150 ease-out active:scale-[0.96]">
              <span className="relative flex size-2.5">
                {online && fila.enviando && <span className="absolute inline-flex size-full animate-ping rounded-full bg-positivo opacity-60" />}
                <span className={`relative inline-flex size-2.5 rounded-full ${online ? "bg-positivo" : "bg-perigo"}`} />
              </span>
              {online ? (fila.enviando ? "enviando" : "online") : "sem sinal"}
              {resumo.total > 0 && (
                <span className={`rounded-full px-1.5 text-[12px] tabular-nums ${resumo.precisam ? "bg-perigo/15 text-perigo" : "bg-alerta/15 text-alerta"}`}>{resumo.total}</span>
              )}
            </button>
            {/* a ajuda fica no topo: o rodapé é das cinco abas */}
            <button type="button" data-tour="ajuda" onClick={alternarAjuda} aria-haspopup="dialog" aria-label="Ajuda e tutoriais" title="Ajuda e tutoriais (?)"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-solido text-texto ring-1 ring-inset ring-borda transition-transform duration-150 ease-out active:scale-[0.92]">
              <CircleHelp size={18} strokeWidth={1.9} aria-hidden />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
          {ABAS.map((a) => (
            <section key={a.chave} hidden={aba !== a.chave} aria-label={a.nome} className={aba === a.chave ? "campo-entra" : undefined}>
              {a.chave === "chat" && <ChatCampo ativo={aba === "chat"} />}
              {a.chave === "viveiros" && <ViveirosCampo />}
              {a.chave === "racao" && <RacaoCampo />}
              {a.chave === "biometria" && <BiometriaCampo />}
              {a.chave === "envios" && <EnviosCampo />}
            </section>
          ))}
        </main>

        {aviso && (
          <div role="status" key={aviso.id}
            className={`campo-entra fixed inset-x-4 top-[calc(4.75rem+env(safe-area-inset-top))] z-40 mx-auto max-w-md rounded-2xl px-4 py-3 text-[15px] font-medium shadow-[var(--sombra-cristal)] ${aviso.tom === "erro" ? "bg-perigo text-white" : "bg-destaque text-destaque-texto"}`}>
            {aviso.texto}
          </div>
        )}

        <nav aria-label="Módulos do app de campo" data-tour="abas-campo" className="igapo cristal fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg rounded-t-[1.125rem] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ul className="grid grid-cols-5">
            {ABAS.map(({ chave, nome, icone: Icone }) => {
              const ativa = aba === chave;
              return (
                <li key={chave}>
                  <button type="button" onClick={() => setAba(chave)} aria-current={ativa ? "page" : undefined}
                    className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.94] ${ativa ? "text-marca-claro" : "text-texto-suave"}`}>
                    <span className={`grid h-7 w-12 place-items-center rounded-md transition-colors duration-200 ${ativa ? "bg-marca text-white" : ""}`}>
                      <Icone size={20} strokeWidth={ativa ? 2.3 : 1.9} />
                    </span>
                    {nome}
                    {chave === "envios" && resumo.total > 0 && (
                      <span className={`absolute top-1 right-[calc(50%-1.4rem)] min-w-[1.1rem] rounded-full px-1 text-[10px] leading-[1.1rem] font-semibold text-white tabular-nums ${resumo.precisam ? "bg-perigo" : "bg-alerta"}`}>{resumo.total}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <FolhasCampo acao={acao} aberta={folhaAberta} fechar={() => setFolhaAberta(false)} />
      </div>
    </ProvedorCampo>
  );
}
