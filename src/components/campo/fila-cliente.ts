"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  chaveEnviados, chaveFila, desfecho, lerFila, marcaDoItem, prontosParaEnvio, registrarEnviado, rotaDoItem,
  type Enviado, type ItemFila,
} from "@/lib/campo/fila";

// A fila mora no localStorage do celular e a tela assina as mudanças (inclusive de outra aba).
const EVENTO = "balbina-campo-fila";

function lerTexto(chave: string, padrao: string) {
  try {
    return localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao; // aba anônima, armazenamento bloqueado
  }
}

function gravar(chave: string, valor: unknown) {
  let ok = true;
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    ok = false; // cota cheia
  }
  window.dispatchEvent(new Event(EVENTO));
  return ok;
}

function useArmazenado(chave: string) {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENTO, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENTO, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => lerTexto(chave, "[]"),
    () => "[]",
  );
}

// muda só os itens indicados, relendo a fila (pode ter entrado envio novo nesse meio tempo)
function alterar(chave: string, mudar: (i: ItemFila) => ItemFila | null) {
  gravar(chave, lerFila(lerTexto(chave, "[]")).map(mudar).filter((i): i is ItemFila => i !== null));
}

export type EstadoFila = {
  fila: ItemFila[];
  enviados: Enviado[];
  enviando: boolean;
  sessaoExpirada: boolean;
  ultimoEnvio: string | null;
  enfileirar: (item: ItemFila) => boolean;
  sincronizar: () => Promise<number>;
  reenviar: (clientId: string, mudar?: (i: ItemFila) => ItemFila) => void;
  descartar: (clientId: string) => void;
};

// Fila de envios do app de campo. Envia na ordem em que foi lançada (o lote aberto chega antes da ração dele).
export function useFilaCampo(empresa: string, online: boolean, aoEnviar?: (n: number) => void): EstadoFila {
  const kFila = chaveFila(empresa);
  const kEnviados = chaveEnviados(empresa);
  const brutoFila = useArmazenado(kFila);
  const brutoEnviados = useArmazenado(kEnviados);
  const fila = useMemo(() => lerFila(brutoFila), [brutoFila]);
  const enviados = useMemo<Enviado[]>(() => {
    try {
      const v = JSON.parse(brutoEnviados);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }, [brutoEnviados]);
  const [enviando, setEnviando] = useState(false);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState<string | null>(null);
  const rodando = useRef(false);
  const avisar = useRef(aoEnviar);
  useEffect(() => {
    avisar.current = aoEnviar;
  }, [aoEnviar]);

  const sincronizar = useCallback(async () => {
    if (rodando.current || !navigator.onLine) return 0;
    const prontos = prontosParaEnvio(lerFila(lerTexto(kFila, "[]")));
    if (!prontos.length) return 0;
    rodando.current = true;
    setEnviando(true);
    const feitos: Enviado[] = [];
    const mudancas = new Map<string, Partial<ItemFila>>();
    let expirou = false;
    for (const item of prontos) {
      try {
        const resp = await fetch(rotaDoItem(item), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.corpo),
          redirect: "manual",
        });
        const corpo = resp.type === "opaqueredirect" ? {} : ((await resp.json().catch(() => ({}))) as Record<string, never>);
        const d = desfecho(resp.status, resp.type === "opaqueredirect", corpo);
        if (d.tipo === "sessao") {
          expirou = true;
          break;
        }
        if (d.tipo === "enviado") {
          feitos.push({ client_id: item.client_id, tipo: item.tipo, rotulo: item.rotulo, enviado_em: new Date().toISOString(), repetido: d.repetido || undefined, ...marcaDoItem(item) });
          continue;
        }
        const tentativas = (item.tentativas ?? 0) + 1;
        mudancas.set(item.client_id, d.tipo === "conflito"
          ? { erro: d.erro, conflito: d.existentes, parado: true, tentativas }
          : { erro: d.erro, parado: d.parado, tentativas });
      } catch {
        break; // caiu o sinal no meio: o resto fica para a próxima rodada
      }
    }
    const ids = new Set(feitos.map((f) => f.client_id));
    alterar(kFila, (i) => (ids.has(i.client_id) ? null : mudancas.has(i.client_id) ? { ...i, ...mudancas.get(i.client_id) } : i));
    if (feitos.length) {
      let historico: Enviado[] = [];
      try {
        historico = JSON.parse(lerTexto(kEnviados, "[]"));
      } catch {
        historico = [];
      }
      gravar(kEnviados, registrarEnviado(Array.isArray(historico) ? historico : [], feitos));
      setUltimoEnvio(new Date().toISOString());
      avisar.current?.(feitos.length);
    }
    rodando.current = false;
    setEnviando(false);
    setSessaoExpirada(expirou);
    return feitos.length;
  }, [kFila, kEnviados]);

  // ao abrir, quando o sinal volta, quando a tela volta para a frente e a cada minuto
  useEffect(() => {
    if (!online) return;
    const t = setTimeout(() => void sincronizar(), 0);
    const visivel = () => document.visibilityState === "visible" && void sincronizar();
    document.addEventListener("visibilitychange", visivel);
    const intervalo = setInterval(() => void sincronizar(), 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", visivel);
    };
  }, [online, sincronizar]);

  const enfileirar = useCallback((item: ItemFila) => {
    const ok = gravar(kFila, [...lerFila(lerTexto(kFila, "[]")), item]);
    if (ok) setTimeout(() => void sincronizar(), 0);
    return ok;
  }, [kFila, sincronizar]);

  const reenviar = useCallback((clientId: string, mudar: (i: ItemFila) => ItemFila = (i) => i) => {
    alterar(kFila, (i) => (i.client_id === clientId ? { ...mudar(i), erro: undefined, conflito: undefined, parado: undefined } : i));
    setTimeout(() => void sincronizar(), 0);
  }, [kFila, sincronizar]);

  const descartar = useCallback((clientId: string) => alterar(kFila, (i) => (i.client_id === clientId ? null : i)), [kFila]);

  return { fila, enviados, enviando, sessaoExpirada, ultimoEnvio, enfileirar, sincronizar, reenviar, descartar };
}

// Preferência guardada no celular (kg do saco, última aba): lê sem quebrar a renderização do servidor.
export function usePreferencia<T extends string | number>(chave: string, padrao: T): [T, (v: T) => void] {
  const bruto = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENTO, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENTO, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => lerTexto(chave, ""),
    () => "",
  );
  let valor = padrao;
  if (bruto) {
    try {
      const v = JSON.parse(bruto);
      if (typeof v === typeof padrao) valor = v as T;
    } catch {
      /* fica o padrão */
    }
  }
  const mudar = useCallback((v: T) => void gravar(chave, v), [chave]);
  return [valor, mudar];
}
