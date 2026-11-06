// Causa das baixas (mortes + descartes) do lançamento do viveiro. A mesma lista está em app.causas_morte_validas
// (supabase/migrations/20261105000002_piscicultura_apontamento.sql); mudou aqui, muda lá.
export const CAUSAS_MORTE = [
  { chave: "oxigenio", nome: "Falta de oxigênio" },
  { chave: "qualidade_agua", nome: "Qualidade da água (amônia, pH)" },
  { chave: "doenca", nome: "Doença / parasita" },
  { chave: "temperatura", nome: "Temperatura / estresse" },
  { chave: "predador", nome: "Predador (aves, jacaré, lontra)" },
  { chave: "manejo", nome: "Manejo (despesca, transporte, biometria)" },
  { chave: "outra", nome: "Outra" },
] as const;

export type Causas = Partial<Record<(typeof CAUSAS_MORTE)[number]["chave"], number>>;

const CHAVES = new Set<string>(CAUSAS_MORTE.map((c) => c.chave));
const NOME = new Map<string, string>(CAUSAS_MORTE.map((c) => [c.chave, c.nome]));

// Opcional: quem não sabe a causa deixa em branco. A soma não passa das baixas do lançamento.
export function validarCausas(v: unknown, baixas: number): { ok: Causas } | { erro: string } {
  if (v === undefined || v === null) return { ok: {} };
  if (typeof v !== "object" || Array.isArray(v)) return { erro: "Causas das baixas inválidas." };
  const ok: Record<string, number> = {};
  let soma = 0;
  for (const [chave, qtd] of Object.entries(v as Record<string, unknown>)) {
    if (!CHAVES.has(chave)) return { erro: "Causa das baixas desconhecida." };
    if (typeof qtd !== "number" || !Number.isInteger(qtd) || qtd < 0) return { erro: "Causas das baixas precisam ser números inteiros." };
    if (qtd > 0) ok[chave] = qtd;
    soma += qtd;
  }
  if (soma > baixas) return { erro: `As causas somam ${soma} peixes, mais que as ${baixas} mortes e descartes do lançamento.` };
  return { ok: ok as Causas };
}

export function lerCausasForm(form: FormData, baixas: number) {
  const bruto: Record<string, number> = {};
  for (const { chave } of CAUSAS_MORTE) {
    const texto = String(form.get(`causa_${chave}`) ?? "").trim();
    if (!texto) continue;
    bruto[chave] = /^\d+$/.test(texto) ? Number(texto) : NaN;
  }
  return validarCausas(bruto, baixas);
}

// Linhas da view mortalidade_causas -> total por causa, do maior para o menor, e quantas ficaram sem causa.
export function resumoCausas(linhas: { causa: string; peixes: number }[], baixas: number) {
  const soma = new Map<string, number>();
  for (const l of linhas) soma.set(l.causa, (soma.get(l.causa) ?? 0) + Number(l.peixes));
  const resultado = [...soma].map(([causa, peixes]) => ({ causa, nome: NOME.get(causa) ?? causa, peixes })).sort((a, b) => b.peixes - a.peixes);
  const informadas = resultado.reduce((s, l) => s + l.peixes, 0);
  return { linhas: resultado, semCausa: Math.max(0, baixas - informadas) };
}
