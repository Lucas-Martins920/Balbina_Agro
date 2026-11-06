// Rateio de um lançamento: várias linhas (categoria + centro de custo + valor + descrição opcional)
// que somam o valor total. Os campos vêm do componente Rateio (src/components/rateio.tsx).
import { formatarMoeda, lerCentavos } from "./formato.ts";

export type LinhaRateio = { categoria_id: string; centro_custo_id: string | null; valor_cents: number; descricao: string | null };

export const LIMITE_LINHAS_RATEIO = 50;

// Lê o rateio do formulário. Com uma linha só, o valor é o total (o campo de valor fica escondido).
export function lerRateio(form: FormData, totalCents: number): { ok: LinhaRateio[] } | { erro: string } {
  const categorias = form.getAll("rateio_categoria").map(String);
  const centros = form.getAll("rateio_cc").map(String);
  const valores = form.getAll("rateio_valor").map((v) => (String(v).trim() ? lerCentavos(v) : null));
  const descricoes = form.getAll("rateio_descricao").map((v) => String(v).trim().slice(0, 200) || null);
  if (categorias.length === 0 || categorias.some((c) => !c)) return { erro: "Escolha a categoria de cada linha do rateio." };
  if (categorias.length > LIMITE_LINHAS_RATEIO) return { erro: `O rateio aceita até ${LIMITE_LINHAS_RATEIO} linhas.` };

  if (categorias.length === 1) {
    return { ok: [{ categoria_id: categorias[0], centro_custo_id: centros[0] || null, valor_cents: totalCents, descricao: descricoes[0] ?? null }] };
  }
  if (valores.length !== categorias.length || valores.some((v) => v === null || v <= 0)) {
    return { erro: "Informe o valor de cada linha do rateio." };
  }
  const soma = valores.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (soma !== totalCents) return { erro: `O rateio soma ${formatarMoeda(soma)} e o total é ${formatarMoeda(totalCents)}.` };
  return {
    ok: categorias.map((c, i) => ({ categoria_id: c, centro_custo_id: centros[i] || null, valor_cents: valores[i]!, descricao: descricoes[i] ?? null })),
  };
}

// Quanto falta distribuir (positivo) ou passou do total (negativo). Valores inválidos contam como zero.
export function restanteDoRateio(valores: string[], totalCents: number) {
  return totalCents - valores.reduce((s, v) => s + (lerCentavos(v) ?? 0), 0);
}
