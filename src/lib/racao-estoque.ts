// Estoque de ração: textos e alertas das entradas numeradas (o saldo por entrada, pelo FEFO, vem do banco:
// view racao_saldos).

export const DIAS_ALERTA_VALIDADE = 30;

export const numeroEntrada = (n: number) => `R-${n}`;

export type Situacao = { texto: string; tom: "perigo" | "alerta" | "neutro" };

// Validade da entrada: vencida, vence em até 30 dias ou em dia. Sem validade é a entrada de abertura.
export function situacaoValidade(dias: number | null | undefined): Situacao {
  if (dias === null || dias === undefined) return { texto: "validade não informada", tom: "alerta" };
  if (dias < 0) return { texto: `vencida há ${-dias} ${-dias === 1 ? "dia" : "dias"}`, tom: "perigo" };
  if (dias === 0) return { texto: "vence hoje", tom: "perigo" };
  if (dias <= DIAS_ALERTA_VALIDADE) return { texto: `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`, tom: "alerta" };
  return { texto: `vence em ${dias} dias`, tom: "neutro" };
}

// Saldo em sacos, para a tela: "8 sacos", "7,5 sacos"; sem peso do saco não há sacos
export function textoSacos(kg: number, sacoKg: number | null | undefined) {
  if (!sacoKg || sacoKg <= 0) return "";
  const sacos = Math.round((kg / sacoKg) * 10) / 10;
  return `${sacos.toLocaleString("pt-BR")} ${sacos === 1 ? "saco" : "sacos"}`;
}

// Nome da ração com a ficha técnica: "Ração Crescimento · 32% PB · 4–6 mm"
export function descricaoRacao(r: { nome: string; proteina_pct?: number | string | null; granulometria?: string | null }) {
  const pb = r.proteina_pct === null || r.proteina_pct === undefined || r.proteina_pct === "" ? null : Number(r.proteina_pct);
  return [r.nome, pb === null ? null : `${pb.toLocaleString("pt-BR")}% PB`, r.granulometria || null].filter(Boolean).join(" · ");
}

// Sacos fechados e o que sobra no saco aberto, sem arredondar o estoque real (63 kg em sacos de 25 kg:
// 2 fechados, 13 kg no aberto, 2,52 sacos equivalentes)
export function sacosDoSaldo(kg: number, sacoKg: number | null | undefined) {
  if (!sacoKg || sacoKg <= 0) return null;
  const fechados = Math.floor(kg / sacoKg + 1e-9);
  const aberto = Math.round((kg - fechados * sacoKg) * 1000) / 1000;
  return { equivalentes: Math.round((kg / sacoKg) * 100) / 100, fechados, abertoKg: aberto < 1e-6 ? 0 : aberto };
}
