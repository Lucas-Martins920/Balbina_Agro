// Linha digitável de boleto (C3 do estudo de automação): confere os dígitos e tira valor e vencimento.
// A leitura por IA pode errar um número; a conta só vem preenchida com a linha se os dígitos baterem.
// Bancário: 47 dígitos (Febraban, fator de vencimento reiniciado em 22/02/2025).
// Arrecadação (água, luz, tributos): 48 dígitos, começa com 8.

export type Boleto = {
  tipo: "bancario" | "arrecadacao";
  linha: string;
  valor_cents: number | null;
  vencimento: string | null; // AAAA-MM-DD
};

export function modulo10(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    const p = Number(numero[i]) * peso;
    soma += p > 9 ? Math.floor(p / 10) + (p % 10) : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function soma11(numero: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  return soma % 11;
}

// DV geral do código de barras bancário: 0, 10 e 11 viram 1.
export function modulo11Banco(numero: string): number {
  const dv = 11 - soma11(numero);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

// DV da arrecadação por módulo 11: resto 0 ou 1 vira 0.
export function modulo11Arrecadacao(numero: string): number {
  const resto = soma11(numero);
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

const DIA = 86_400_000;
const BASE_ANTIGA = Date.UTC(1997, 9, 7);
const BASE_NOVA = Date.UTC(2025, 1, 22); // fator 1000

// O fator volta a 1000 em 22/02/2025: fica a data mais perto de hoje entre os dois ciclos.
export function vencimentoDoFator(fator: number, hoje: string): string | null {
  if (!fator) return null;
  const ref = Date.parse(`${hoje}T00:00:00Z`);
  const candidatas = [BASE_ANTIGA + fator * DIA, fator >= 1000 ? BASE_NOVA + (fator - 1000) * DIA : NaN].filter((d) => !Number.isNaN(d));
  const escolhida = candidatas.reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) ? b : a));
  return new Date(escolhida).toISOString().slice(0, 10);
}

export function lerLinhaDigitavel(texto: string, hoje: string): Boleto | null {
  const d = texto.replace(/\D/g, "");
  if (d.length === 47) {
    const campos: [string, string][] = [[d.slice(0, 9), d[9]], [d.slice(10, 20), d[20]], [d.slice(21, 31), d[31]]];
    if (!campos.every(([n, dv]) => modulo10(n) === Number(dv))) return null;
    const barras = d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
    if (modulo11Banco(barras.slice(0, 4) + barras.slice(5)) !== Number(barras[4])) return null;
    const valor = Number(d.slice(37, 47));
    return { tipo: "bancario", linha: d, valor_cents: valor || null, vencimento: vencimentoDoFator(Number(d.slice(33, 37)), hoje) };
  }
  if (d.length === 48 && d[0] === "8") {
    const mod = d[2] === "6" || d[2] === "7" ? modulo10 : d[2] === "8" || d[2] === "9" ? modulo11Arrecadacao : null;
    if (!mod) return null;
    const blocos = [0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 11));
    if (!blocos.every((b, i) => mod(b) === Number(d[i * 12 + 11]))) return null;
    const barras = blocos.join("");
    if (mod(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) return null;
    // valor real (6 ou 8) nas posições 5 a 15 do código de barras; vencimento não tem padrão fixo
    const valor = d[2] === "6" || d[2] === "8" ? Number(barras.slice(4, 15)) : 0;
    return { tipo: "arrecadacao", linha: d, valor_cents: valor || null, vencimento: null };
  }
  return null;
}

// Mostra a linha no formato que o banco pede para colar.
export function formatarLinha(b: Boleto): string {
  const d = b.linha;
  if (b.tipo === "bancario") {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  return [0, 1, 2, 3].map((i) => `${d.slice(i * 12, i * 12 + 11)}-${d[i * 12 + 11]}`).join(" ");
}
