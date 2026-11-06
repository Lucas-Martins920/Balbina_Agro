import { isAuthRetryableFetchError } from "@supabase/supabase-js";

// Erro do Auth ao conferir a sessão: só rede, timeout ou 5xx são temporários (vale tentar de novo).
// 4xx (refresh token vencido ou já usado, JWT inválido) quer dizer sessão morta: o caminho é o login.
export function falhaTemporaria(error: unknown) {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: number } | null)?.status;
  return typeof status === "number" && (status === 0 || status >= 500);
}
