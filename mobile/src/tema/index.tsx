import { useColorScheme } from "react-native";
import { CORES, type Cores } from "./tokens";

export function useTema(): { cores: Cores; escuro: boolean } {
  const escuro = useColorScheme() === "dark";
  return { cores: escuro ? CORES.escuro : CORES.claro, escuro };
}

// Forma (DESIGN.md > Forma): cantos concêntricos e tipografia
export const RAIO = { campo: 12, cartao: 20, painel: 28, capsula: 999 } as const;
export const FONTE = {
  tituloGrande: 28,
  tituloSecao: 20,
  tituloCartao: 17,
  corpo: 15,
  pequeno: 13,
  micro: 11,
} as const;
export const TOQUE = 44;

// Emil Kowalski: custom easing for spring-like motion
export const EASING = {
  mola: [0.23, 1, 0.32, 1] as const,
  saida: [0, 0, 0.2, 1] as const,
};

// Spacing scale (4px base, exponential)
export const ESP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
