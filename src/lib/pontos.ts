// Pontos de venda: regras puras usadas nas telas (o banco confere de novo).

export const TIPOS_PONTO: Record<string, string> = {
  piscicultura: "Na piscicultura",
  loja: "Loja",
  feira: "Feira",
  entreposto: "Entreposto / depósito",
  outro: "Outro",
};

export const STATUS_TRANSFERENCIA: Record<string, string> = {
  em_transito: "A caminho",
  recebida: "Recebida",
  cancelada: "Cancelada",
};

// Frete por kg (ou por caixa, com kgPorUnidade 20) a partir do frete total e dos kg que chegaram bons
export function fretePorUnidade(freteCents: number, kgRecebidos: number, kgPorUnidade = 1): number | null {
  if (!(kgRecebidos > 0) || !(freteCents > 0) || !(kgPorUnidade > 0)) return null;
  return Math.round((freteCents * kgPorUnidade) / kgRecebidos);
}

// Perda em % dos kg enviados (peixe que chegou sem condição de venda)
export function pctPerda(perdidos: number, enviados: number): number | null {
  if (!(enviados > 0)) return null;
  return Math.round((perdidos / enviados) * 1000) / 10;
}

// CNPJ (14) ou CPF (11) só com dígitos; vazio vira null; tamanho errado devolve "invalido"
export function lerDocumento(texto: unknown): string | null | "invalido" {
  const d = String(texto ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 11 || d.length === 14 ? d : "invalido";
}

// UF com duas letras maiúsculas; vazio vira null
export function lerUf(texto: unknown): string | null | "invalido" {
  const u = String(texto ?? "").trim().toUpperCase();
  if (!u) return null;
  return /^[A-Z]{2}$/.test(u) ? u : "invalido";
}

// Nome do cookie que lembra o ponto do PDV em cada empresa
export function cookiePonto(empresa: string) {
  return `ponto_pdv_${empresa}`;
}
