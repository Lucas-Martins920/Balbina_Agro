// Biometria em grupos: a amostra é pesada em grupos (puçá, balde), cada um com peixes e peso em kg.
// O peso médio é o peso total ÷ o total de peixes (média ponderada), nunca a média dos pesos médios dos grupos.
// O banco refaz a conta (registrar_biometria_grupos); aqui é para a tela mostrar na hora e validar antes da fila.

export type GrupoBiometria = { peixes: number; peso_kg: number; ponto_captura?: string; observacao?: string };

export const MAX_GRUPOS = 500;

export function totaisGrupos(grupos: { peixes: number | null; peso_kg: number | null }[]) {
  const validos = grupos.filter((g) => g.peixes && g.peixes > 0 && g.peso_kg && g.peso_kg > 0) as { peixes: number; peso_kg: number }[];
  const peixes = validos.reduce((s, g) => s + g.peixes, 0);
  const pesoTotalG = Math.round(validos.reduce((s, g) => s + Math.round(g.peso_kg * 1000) / 1000, 0) * 1000 * 10) / 10;
  return { grupos: validos.length, peixes, pesoTotalG, pesoMedioG: peixes ? Math.round((pesoTotalG / peixes) * 100) / 100 : null };
}

// Confere grupos vindos de fora (fila do celular, formulário): devolve os grupos limpos ou a mensagem do erro
export function validarGrupos(v: unknown): { ok: GrupoBiometria[] } | { erro: string } {
  if (!Array.isArray(v) || v.length === 0) return { erro: "Informe pelo menos um grupo pesado." };
  if (v.length > MAX_GRUPOS) return { erro: `No máximo ${MAX_GRUPOS} grupos por biometria.` };
  const ok: GrupoBiometria[] = [];
  for (const [i, g] of v.entries()) {
    const o = (g ?? {}) as Record<string, unknown>;
    const peixes = typeof o.peixes === "number" ? o.peixes : NaN;
    const peso = typeof o.peso_kg === "number" ? o.peso_kg : NaN;
    if (!Number.isInteger(peixes) || peixes <= 0 || peixes > 100_000) return { erro: `Grupo ${i + 1}: informe quantos peixes foram pesados.` };
    if (!Number.isFinite(peso) || peso <= 0 || peso > 5_000) return { erro: `Grupo ${i + 1}: o peso precisa ser maior que zero (em kg).` };
    const t = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : undefined);
    ok.push({ peixes, peso_kg: Math.round(peso * 1000) / 1000, ponto_captura: t(o.ponto_captura, 120), observacao: t(o.observacao, 500) });
  }
  const total = ok.reduce((s, g) => s + g.peso_kg * 1000, 0) / ok.reduce((s, g) => s + g.peixes, 0);
  if (total > 100_000) return { erro: "O peso médio passa de 100 kg: confira os pesos (em kg) e os peixes." };
  return { ok };
}
