import { somarDias } from "./formato.ts";

// Agrupa o fluxo previsto em semanas (segunda a domingo) com saldo acumulado.
export type ItemFluxo = { data: string; valor_cents: number };
export type SemanaFluxo = { inicio: string; fim: string; entradas: number; saidas: number; saldo: number };


function segunda(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return somarDias(iso, -((dia + 6) % 7));
}

export function semanasFluxo(saldoInicial: number, hoje: string, ate: string, itens: ItemFluxo[]): SemanaFluxo[] {
  const semanas: SemanaFluxo[] = [];
  let saldo = saldoInicial;
  for (let ini = segunda(hoje); ini <= ate; ini = somarDias(ini, 7)) {
    const fim = somarDias(ini, 6);
    const daSemana = itens.filter((i) => i.data >= ini && i.data <= fim);
    const entradas = daSemana.filter((i) => i.valor_cents > 0).reduce((s, i) => s + i.valor_cents, 0);
    const saidas = daSemana.filter((i) => i.valor_cents < 0).reduce((s, i) => s + i.valor_cents, 0);
    saldo += entradas + saidas;
    semanas.push({ inicio: ini < hoje ? hoje : ini, fim, entradas, saidas, saldo });
  }
  return semanas;
}

