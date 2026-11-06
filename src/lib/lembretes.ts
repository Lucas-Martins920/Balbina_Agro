// Texto do lembrete de apontamento: quais viveiros ainda não lançaram o turno.
import { formatarInteiro, formatarMoeda, formatarNumero, MESES_LONGOS } from "./formato.ts";
import { TURNOS } from "./rotulos.ts";

export type ViveiroFaltando = { viveiro: string; lote: string };

export function textoLembrete(turno: string, viveiros: ViveiroFaltando[]) {
  const nomeTurno = (TURNOS[turno] ?? turno).toLowerCase();
  const lista = viveiros.slice(0, 4).map((g) => g.viveiro).join(", ") + (viveiros.length > 4 ? ` e mais ${viveiros.length - 4}` : "");
  return {
    titulo: viveiros.length === 1 ? `Falta o apontamento da ${nomeTurno}` : `Faltam ${viveiros.length} apontamentos da ${nomeTurno}`,
    texto: `${lista}. Toque para lançar.`,
  };
}

export type Resumo = {
  racao_kg: number; peixes: number; mortes: number; oxigenio_min: number | null; sem_lancamento: number;
  pagar_hoje: { n: number; cents: number }; pagar_vencidas: number; receber_hoje: { n: number; cents: number }; alertas_criticos: number;
};

const moeda = (cents: number) => formatarMoeda(cents).replace(/ /g, " ");
const plural = (n: number, um: string, varios: string) => `${formatarInteiro(n)} ${n === 1 ? um : varios}`;

// Resumo diário (H3): ração, baixas e oxigênio de ontem, contas de hoje e alertas, numa linha que cabe no aviso.
export function textoResumo(r: Resumo) {
  const teve = r.peixes > 0 || Number(r.racao_kg) > 0;
  const oxigenio = r.oxigenio_min === null || r.oxigenio_min === undefined ? "" : `, oxigênio mínimo de ${formatarNumero(Number(r.oxigenio_min), 1)} mg/L`;
  const ontem = teve
    ? `Ontem: ${formatarNumero(Number(r.racao_kg), 1)} kg de ração, ${plural(r.mortes, "baixa", "baixas")}${oxigenio}`
    : "Ontem: nenhum apontamento";
  const partes = [ontem + (r.sem_lancamento && teve ? `; ${plural(r.sem_lancamento, "viveiro sem lançamento", "viveiros sem lançamento")}` : "") + "."];
  const hoje: string[] = [];
  if (r.pagar_hoje.n) hoje.push(`pagar ${formatarInteiro(r.pagar_hoje.n)} (${moeda(r.pagar_hoje.cents)})`);
  if (r.receber_hoje.n) hoje.push(`receber ${formatarInteiro(r.receber_hoje.n)} (${moeda(r.receber_hoje.cents)})`);
  if (r.pagar_vencidas) hoje.push(plural(r.pagar_vencidas, "vencida", "vencidas"));
  if (hoje.length) partes.push(`Hoje: ${hoje.join(", ")}.`);
  if (r.alertas_criticos) partes.push(`${plural(r.alertas_criticos, "alerta crítico", "alertas críticos")}.`);
  return { titulo: "Resumo do dia", texto: partes.join(" ") };
}

const nomeMes = (mes: string) => MESES_LONGOS[Number(mes.slice(5, 7)) - 1];

// Pacote do contador (E1)
export function textoPacoteContador(mes: string) {
  return {
    titulo: `Pacote de ${nomeMes(mes)} para o contador`,
    texto: "Resultado, contas, extratos, notas e ponto do mês num arquivo só. Toque para baixar.",
  };
}
