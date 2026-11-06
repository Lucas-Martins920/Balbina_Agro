// Contas pequenas do app de campo, iguais no celular e nos testes.

import { somarDias } from "../formato.ts";

// Biometria a cada 15 dias até a Recria II (abaixo de 70 g) e uma vez por mês depois (Embrapa, Criação de tambaquis).
export const PESO_BIOMETRIA_QUINZENAL_G = 70;

export function proximaBiometria(l: { peso_g: number | null; ultima_biometria: string | null; povoamento: string }, hoje: string) {
  const intervalo = l.peso_g !== null && l.peso_g < PESO_BIOMETRIA_QUINZENAL_G ? 15 : 30;
  const data = somarDias(l.ultima_biometria ?? l.povoamento, intervalo);
  return { data, intervalo, atrasada: data < hoje, hoje: data === hoje };
}

// Ração do turno pela tabela: o apontamento tem dois turnos (manhã e tarde), a tabela dá o total do dia.
// Arredonda para meio quilo, que é o que dá para medir no balde.
export function racaoPorTurno(kgDia: number | null | undefined): number | null {
  if (kgDia === null || kgDia === undefined || !(kgDia > 0)) return null;
  return Math.max(0.5, Math.round(kgDia) / 2);
}

// Peso médio da amostra: total em kg (o que a balança mostra) e número de peixes
export function pesoMedioAmostra(totalKg: number | null, peixes: number | null): number | null {
  if (totalKg === null || peixes === null || !(totalKg > 0) || !(peixes > 0)) return null;
  return (totalKg * 1000) / peixes;
}

// Quanto o peso medido difere do estimado pelo sistema (para avisar erro de digitação ou de amostra)
export function diferencaPct(medido: number | null, estimado: number | null): number | null {
  if (medido === null || estimado === null || !(estimado > 0)) return null;
  return (medido / estimado - 1) * 100;
}

// Sacos para levar ao viveiro: a ração do dia de vários viveiros em sacos inteiros (sobe para não faltar)
export function sacosParaKg(kg: number, kgSaco: number): number {
  return kgSaco > 0 ? Math.ceil(kg / kgSaco - 1e-9) : 0;
}
