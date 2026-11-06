// "Authorization: Bearer <token>" → token. Qualquer outro formato = null (a rota responde 401).
export function tokenDoCabecalho(cabecalho: string | null | undefined) {
  const m = cabecalho?.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i);
  return m?.[1] ?? null;
}
