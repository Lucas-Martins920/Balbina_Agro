import { useSyncExternalStore } from "react";

// O navegador está com internet? Muda sozinho quando a conexão cai ou volta; no servidor, sempre true.
export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}
