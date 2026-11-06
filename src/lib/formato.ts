// Conversões entre o que a pessoa digita (pt-BR) e o que o banco guarda.

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR");

export function formatarMoeda(centavos: number | null | undefined) {
  return moeda.format((centavos ?? 0) / 100);
}

export function formatarNumero(valor: number | string | null | undefined, casas = 0) {
  if (valor === null || valor === undefined || valor === "") return "–";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(Number(valor));
}

// Quantidade de estoque: até 3 casas, sem zeros sobrando (1.000 kg, 2,5 kg)
export function formatarQuantidade(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "–";
  return numero.format(Number(valor));
}

export function formatarInteiro(valor: number | null | undefined) {
  return valor === null || valor === undefined ? "–" : numero.format(valor);
}

// "2026-10-26" -> "26/10/2026" sem passar por fuso horário
export function formatarData(iso: string | null | undefined) {
  if (!iso) return "–";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// 123456 centavos -> "1234,56" para o valor inicial de um campo; vazio quando não há valor
export function centavosParaCampo(centavos: number | null | undefined) {
  return centavos == null ? "" : (centavos / 100).toFixed(2).replace(".", ",");
}

// "2026-10-30" + 3 -> "2026-11-02", sem passar por fuso horário
export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// "2026-10" ou "2026-10-01" -> "out/26"
export function rotuloMes(iso: string) {
  return `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
}

// "2026-10" deslocado n meses: ("2026-01", -1) -> "2025-12"
export function deslocarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// Sem acento, minúsculo e sem espaço nas pontas: "  Ração " -> "racao". Para busca e comparação de nomes.
export function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// plural(1, "título", "títulos") -> "1 título"; plural(3, ...) -> "3 títulos"
export function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

// "1.234,56" | "1234.56" | "1234" -> 123456 centavos. null se inválido.
export function lerCentavos(texto: FormDataEntryValue | string | null | undefined): number | null {
  const bruto = String(texto ?? "").trim().replace(/[R$\s]/g, "");
  if (!bruto) return null;
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100);
}

// "12,5" -> 12.5
export function lerDecimal(texto: FormDataEntryValue | string | null | undefined): number | null {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return null;
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function lerInteiro(texto: FormDataEntryValue | string | null | undefined): number | null {
  const n = lerDecimal(texto);
  return n === null || !Number.isInteger(n) ? null : n;
}

// Fuso de quem ainda não escolheu outro (empresas.fuso no banco tem o mesmo padrão)
export const FUSO_PADRAO = "America/Manaus";

// Fusos do Brasil que a empresa pode escolher em Configurações
export const FUSOS_BRASIL: Record<string, string> = {
  "America/Manaus": "Amazonas (Manaus, UTC−4)",
  "America/Boa_Vista": "Roraima (UTC−4)",
  "America/Porto_Velho": "Rondônia (UTC−4)",
  "America/Cuiaba": "Mato Grosso (UTC−4)",
  "America/Campo_Grande": "Mato Grosso do Sul (UTC−4)",
  "America/Rio_Branco": "Acre (UTC−5)",
  "America/Belem": "Pará e Amapá (UTC−3)",
  "America/Fortaleza": "Nordeste (UTC−3)",
  "America/Recife": "Pernambuco (UTC−3)",
  "America/Sao_Paulo": "Brasília, Sudeste e Sul (UTC−3)",
  "America/Noronha": "Fernando de Noronha (UTC−2)",
};

// Data de hoje no fuso da piscicultura (empresa.fuso)
export function hojeISO(fuso = FUSO_PADRAO, agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(agora);
}

// Data de n dias atrás, a partir de hoje no fuso da piscicultura
export function diasAtrasISO(dias: number, fuso = FUSO_PADRAO) {
  const [a, m, d] = hojeISO(fuso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}
