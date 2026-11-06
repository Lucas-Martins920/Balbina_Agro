const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numero = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined): string {
  return moeda.format(Number(value ?? 0));
}

export function formatNumber(value: number | null | undefined): string {
  return numero.format(Number(value ?? 0));
}

/**
 * Datas "YYYY-MM-DD" são interpretadas pelo JS como meia-noite UTC, o que no
 * Brasil (UTC-3/-4) mostra o dia anterior. Aqui tratamos a data como local.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

export function todayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function daysLabel(days: number): string {
  if (days < 0) return `venceu há ${Math.abs(days)} dia(s)`;
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence em ${days} dias`;
}
