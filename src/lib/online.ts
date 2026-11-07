import { useSyncExternalStore } from "react";
import { assinarConexao, conexaoAtual } from "@/lib/sync/detector";

// O aparelho tem internet de verdade? Muda sozinho quando a conexão cai ou volta, e também quando o celular está
// num Wi-Fi sem internet (src/lib/sync/detector.ts confere com o servidor). No servidor, sempre true.
export function useOnline() {
  return useSyncExternalStore(assinarConexao, conexaoAtual, () => true);
}
