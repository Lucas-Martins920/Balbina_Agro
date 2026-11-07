"use client";

import { useCallback, useSyncExternalStore } from "react";
import { armazemPronto, assinarArmazem, gravarItem, lerItem } from "./indexeddb";

const nada = () => () => undefined;

// Texto guardado no aparelho (IndexedDB, src/lib/db/indexeddb.ts). No servidor e no primeiro desenho, o padrão.
export function useItemArmazenado(chave: string, padrao = ""): string {
  return useSyncExternalStore(assinarArmazem, () => lerItem(chave) ?? padrao, () => padrao);
}

// O armazém já carregou do IndexedDB? Antes disso uma fila vazia pode ser só "ainda não leu".
export function useArmazemPronto(): boolean {
  return useSyncExternalStore(assinarArmazem, armazemPronto, () => false);
}

export function useGravarItem() {
  return useCallback((chave: string, valor: unknown) => gravarItem(chave, JSON.stringify(valor)), []);
}

export { nada as semAssinatura };
