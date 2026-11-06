// Pescado: o estoque, a despesca e a venda do peixe são em kg. O produto de venda diz quantos kg cabem na
// unidade dele (produtos.fator_kg): kg = 1, caixa de 20 kg = 20. A classe vem do peso do peixe
// (Pequeno, Médio, Grande, Extra; "Inteiro" quando a despesca não separou).

export const KG_CAIXA = 20;

type Valor = number | string | null | undefined;

const n = (v: Valor) => (v === null || v === undefined || v === "" ? null : Number(v));

// Só o número, no formato brasileiro: 1234.5 -> "1.234,5". Até `casas` decimais (sem zeros sobrando).
export function numeroKg(kg: Valor, casas = 1) {
  const v = n(kg);
  if (v === null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
}

// 1234.5 -> "1.234,5 kg"
export function textoKg(kg: Valor, casas = 1) {
  const v = n(kg);
  return v === null || !Number.isFinite(v) ? "—" : `${numeroKg(v, casas)} kg`;
}

// Peso de um peixe: 850 -> "850 g"; 1250 -> "1,25 kg"
export function textoPeso(gramas: Valor) {
  const v = n(gramas);
  if (v === null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v / 1000)} kg`;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v)} g`;
}

// Texto digitado -> kg. Aceita "12,5", "12.5" e "1.234,5". undefined quando vazio, null quando inválido.
export function lerKg(valor: unknown): number | null | undefined {
  let t = String(valor ?? "").trim().replace(/\s|kg$/gi, "");
  if (t === "") return undefined;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// Número inteiro de peixes digitado ("12.000" ou "12000"). undefined quando vazio, null quando inválido.
export function lerPeixes(valor: unknown): number | null | undefined {
  const t = String(valor ?? "").trim().replace(/\./g, "");
  if (t === "") return undefined;
  return /^\d+$/.test(t) ? Number(t) : null;
}

// Quantidade do produto (kg, caixas) -> kg de peixe
export function emKg(quantidade: Valor, fatorKg: Valor) {
  return (n(quantidade) ?? 0) * (n(fatorKg) || 1);
}

// O produto de venda é por kg (fator 1): aceita fração. Os outros (caixa de 20 kg) vão em unidades inteiras.
export function vendidoPorKg(fatorKg: Valor) {
  return n(fatorKg) === 1;
}

// Quantidade de um produto de venda: por kg "12,5 kg"; em embalagem "3 cx" (unidade do cadastro)
export function textoQuantidade(quantidade: Valor, fatorKg: Valor, unidade?: string | null) {
  const q = n(quantidade);
  if (q === null || !Number.isFinite(q)) return "—";
  if (vendidoPorKg(fatorKg)) return textoKg(q, 3);
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(q)} ${unidade || "un."}`;
}

// Total vendido / kg vendidos -> preço médio do kg, em centavos
export function precoKg(totalCents: Valor, kg: Valor) {
  const t = n(totalCents), k = n(kg);
  return t === null || !k ? null : Math.round(t / k);
}

// Embalagem do produto de venda, pelo fator de kg: 1 é "por kg", 20 é a caixa de 20 kg. Não depende do nome,
// que a piscicultura pode trocar. Usada para separar a grade do PDV.
export type EmbalagemPescado = "kg" | "caixa" | "outros";

export const EMBALAGENS_PESCADO: Record<EmbalagemPescado, { titulo: string }> = {
  kg: { titulo: "Por kg" },
  caixa: { titulo: "Caixas" },
  outros: { titulo: "Outros produtos" },
};

const ORDEM_EMBALAGENS = Object.keys(EMBALAGENS_PESCADO) as EmbalagemPescado[];

export function embalagemPescado(fatorKg: Valor): EmbalagemPescado {
  const f = n(fatorKg);
  if (f === 1) return "kg";
  if (f !== null && f > 1) return "caixa";
  return "outros";
}

// Agrupa mantendo a ordem de entrada dentro de cada grupo; grupos vazios ficam de fora.
export function agruparPorEmbalagem<T extends { fator_kg: number | null }>(itens: T[]) {
  return ORDEM_EMBALAGENS
    .map((embalagem) => ({ embalagem, titulo: EMBALAGENS_PESCADO[embalagem].titulo, itens: itens.filter((i) => embalagemPescado(i.fator_kg) === embalagem) }))
    .filter((g) => g.itens.length > 0);
}

// Classe do peixe pelo peso: a faixa em texto ("1 a 2 kg", "até 1 kg", "acima de 3 kg")
export function faixaClasse(pesoMinG: Valor, pesoMaxG: Valor) {
  const min = n(pesoMinG), max = n(pesoMaxG);
  if (min === null && max === null) return "";
  if (min === null) return `até ${textoPeso(max)}`;
  if (max === null) return `acima de ${textoPeso(min)}`;
  return `${textoPeso(min)} a ${textoPeso(max)}`;
}

// Custo do kg produzido num mês, somando os lotes: todo o custo ÷ a biomassa que eles ganharam
// (fim − início + despescado). Lote que perdeu biomassa entra no custo e não no ganho, como em
// margem_cliente_mes (20261105000004). Sem ganho, não há custo do kg.
export function custoKgMes(linhas: { custo_total_cents: Valor; ganho_kg: Valor }[]) {
  const custo = linhas.reduce((s, l) => s + (n(l.custo_total_cents) ?? 0), 0);
  const ganho = linhas.reduce((s, l) => s + Math.max(0, n(l.ganho_kg) ?? 0), 0);
  return ganho > 0 ? { custoCents: custo, ganhoKg: ganho, kgCents: custo / ganho } : null;
}
