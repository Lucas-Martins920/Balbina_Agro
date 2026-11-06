import type { RacaoLancada, RespostaChecklist } from "./apontamento-racao.ts";
import { validarAgua, type Agua } from "./agua.ts";
import { validarCausas, type Causas } from "./causas-morte.ts";

// Lançamento enviado pelo app de campo (pode chegar horas depois, quando o celular pega sinal).
export type ApontamentoCampo = {
  client_id: string;
  viveiro_id: string;
  data: string;
  turno: "manha" | "tarde";
  mortes: number;
  descartes: number;
  racao_kg: number;
  agua: Agua | null;               // qualidade da água medida no turno (oxigênio, temperatura, pH...)
  observacoes: string;
  medicacao: Medicacao | null;
  racoes: RacaoLancada[];          // ração por tipo (sai do estoque); a soma cabe em racao_kg
  checklist: RespostaChecklist[];
  forcar: boolean;                 // já existe lançamento no turno e quem apontou mandou somar mesmo assim
  causas: Causas;                  // causa das baixas (opcional); celulares antigos não mandam
};

// Medicamento ou vitamina aplicado no viveiro, junto do lançamento. Vazios usam o cadastro do medicamento.
// base_dose: kg de ração (medicação na ração) ou m³ de água (banho ou aplicação no viveiro).
export type Medicacao = {
  medicamento_id: string;
  dias: number;
  dose_por_unidade: number | null;
  base_dose: number | null;
  quantidade: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inteiro = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const positivoOuNulo = (v: unknown) => v === undefined || v === null || (typeof v === "number" && v > 0 && Number.isFinite(v));

export function validarMedicacao(v: unknown): { ok: Medicacao | null } | { erro: string } {
  if (v === undefined || v === null) return { ok: null };
  if (typeof v !== "object") return { erro: "Medicação inválida." };
  const m = v as Record<string, unknown>;
  if (typeof m.medicamento_id !== "string" || !UUID.test(m.medicamento_id)) return { erro: "Escolha o medicamento." };
  const dias = m.dias ?? 1;
  if (!inteiro(dias) || (dias as number) < 1 || (dias as number) > 120) return { erro: "Dias de tratamento: de 1 a 120." };
  // celulares com a versão antiga mandam a base como agua_l
  const base = m.base_dose ?? m.agua_l;
  if (!positivoOuNulo(m.dose_por_unidade) || !positivoOuNulo(base) || !positivoOuNulo(m.quantidade)) {
    return { erro: "Dose, base (kg de ração ou m³ de água) e quantidade do medicamento precisam ser maiores que zero." };
  }
  const n = (x: unknown) => (x as number | undefined) ?? null;
  return { ok: { medicamento_id: m.medicamento_id, dias: dias as number, dose_por_unidade: n(m.dose_por_unidade), base_dose: n(base), quantidade: n(m.quantidade) } };
}

const MAX_RACOES = 8;
const MAX_CHECKLIST = 60;

function validarRacoes(v: unknown): { ok: RacaoLancada[] } | { erro: string } {
  if (v === undefined || v === null) return { ok: [] };
  if (!Array.isArray(v) || v.length > MAX_RACOES) return { erro: "Ração por tipo inválida." };
  const itens: RacaoLancada[] = [];
  for (const r of v as Record<string, unknown>[]) {
    if (!r || typeof r.produto_id !== "string" || !UUID.test(r.produto_id)) return { erro: "Escolha o tipo de ração." };
    if (typeof r.kg !== "number" || !Number.isFinite(r.kg) || r.kg <= 0) return { erro: "Informe os kg de cada tipo de ração." };
    itens.push({ produto_id: r.produto_id, kg: r.kg });
  }
  return { ok: itens };
}

function validarChecklist(v: unknown): { ok: RespostaChecklist[] } | { erro: string } {
  if (v === undefined || v === null) return { ok: [] };
  if (!Array.isArray(v) || v.length > MAX_CHECKLIST) return { erro: "Checklist inválido." };
  const respostas: RespostaChecklist[] = [];
  for (const c of v as Record<string, unknown>[]) {
    if (!c || typeof c.item_id !== "string" || !UUID.test(c.item_id)) return { erro: "Item do checklist inválido." };
    if (typeof c.valor === "number" && Number.isFinite(c.valor)) respostas.push({ item_id: c.item_id, valor: c.valor });
    else if (typeof c.ok === "boolean") respostas.push({ item_id: c.item_id, ok: c.ok });
    else return { erro: "Resposta do checklist inválida." };
  }
  return { ok: respostas };
}

export function validarApontamentoCampo(v: unknown, hoje: string): { ok: ApontamentoCampo } | { erro: string } {
  if (!v || typeof v !== "object") return { erro: "Apontamento inválido." };
  const a = v as Record<string, unknown>;
  if (typeof a.client_id !== "string" || !UUID.test(a.client_id)) return { erro: "Identificador do envio inválido." };
  if (typeof a.viveiro_id !== "string" || !UUID.test(a.viveiro_id)) return { erro: "Viveiro inválido." };
  if (typeof a.data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(a.data) || a.data > hoje) return { erro: "Data inválida." };
  const turno = a.turno ?? "manha";
  if (turno !== "manha" && turno !== "tarde") return { erro: "Turno inválido." };
  const mortes = a.mortes ?? 0;
  const descartes = a.descartes ?? 0;
  if (!inteiro(mortes) || !inteiro(descartes)) return { erro: "Mortes e descartes precisam ser números inteiros." };
  const causas = validarCausas(a.causas, (mortes as number) + (descartes as number));
  if ("erro" in causas) return causas;
  const racoes = validarRacoes(a.racoes);
  if ("erro" in racoes) return racoes;
  const somaTipos = Math.round(racoes.ok.reduce((s, r) => s + r.kg, 0) * 1000) / 1000;
  // sem total informado, o total é a soma dos tipos
  const racao = a.racao_kg ?? somaTipos;
  if (typeof racao !== "number" || !(racao >= 0) || !Number.isFinite(racao)) return { erro: "Ração inválida." };
  if (somaTipos > racao + 0.001) return { erro: "A ração por tipo passa do total de kg do lançamento." };
  const checklist = validarChecklist(a.checklist);
  if ("erro" in checklist) return checklist;
  const agua = validarAgua(a.agua);
  if ("erro" in agua) return agua;
  const medicacao = validarMedicacao(a.medicacao);
  if ("erro" in medicacao) return medicacao;
  return {
    ok: {
      client_id: a.client_id, viveiro_id: a.viveiro_id, data: a.data, turno,
      mortes: mortes as number, descartes: descartes as number, racao_kg: racao, agua: agua.ok,
      observacoes: typeof a.observacoes === "string" ? a.observacoes.slice(0, 500) : "",
      medicacao: medicacao.ok,
      racoes: racoes.ok,
      checklist: checklist.ok,
      forcar: a.forcar === true,
      causas: causas.ok,
    },
  };
}
