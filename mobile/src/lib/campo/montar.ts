import { CAMPOS_AGUA, lerMedida, type ChaveAgua } from "@regras/agua.ts";
import { validarApontamentoCampo, type Medicacao } from "@regras/apontamento-campo.ts";
import type { RacaoLancada, RespostaChecklist } from "@regras/apontamento-racao.ts";
import { CAUSAS_MORTE } from "@regras/causas-morte.ts";
import { lerDecimal } from "@regras/formato.ts";
import type { ItemChecklist, Pendente, Viveiro } from "./tipos";

// Formulário do lançamento do viveiro no app (ração, mortes, água, checklist e medicação), como texto digitado.
// `montarApontamento` aplica as mesmas regras do /campo e, no fim, o mesmo validarApontamentoCampo que o
// servidor usa: o que passa aqui passa lá.
export type RespostaItem = { ok?: boolean; valor?: number; naoMedir?: boolean };
export type Formulario = {
  viveiro_id: string;
  data: string;
  turno: "manha" | "tarde";
  mortes: string;
  causa: string; // causa provável das mortes; vazio = não sabe
  racaoKg: string; // só quando a piscicultura não cadastrou tipos de ração
  racoes: { produto_id: string; kg: string }[];
  agua: Partial<Record<ChaveAgua, string>>;
  checklist: Record<string, RespostaItem>;
  medicamento_id: string;
  medDias: string;
  medDose: string;
  medBase: string; // kg de ração medicada ou m³ de água, conforme a via do medicamento
  medQuantidade: string;
  observacoes: string;
};

export function formularioVazio(viveiro_id: string, data: string, turno: "manha" | "tarde"): Formulario {
  return {
    viveiro_id, data, turno, mortes: "", causa: "", racaoKg: "", racoes: [{ produto_id: "", kg: "" }],
    agua: {}, checklist: {}, medicamento_id: "", medDias: "", medDose: "", medBase: "", medQuantidade: "", observacoes: "",
  };
}

// Itens do checklist que valem para o viveiro: os de todos e os da fase do lote (engorda ou alevinagem/recria)
export function itensDoViveiro(itens: ItemChecklist[], viveiro: Viveiro | undefined) {
  const fase = viveiro?.checklist ?? "engorda";
  return itens.filter((c) => c.aplica_em === "todos" || c.aplica_em === fase);
}

// Base da dose do medicamento: na ração é por kg de ração; banho e água do viveiro, por m³ de água
export function baseDaDose(via: string | null | undefined) {
  return via === "racao" ? { rotulo: "Ração medicada (kg)", unidade: "kg de ração" } : { rotulo: "Água tratada (m³)", unidade: "m³ de água" };
}

const inteiro = (t: string) => {
  const s = t.trim().replace(/\./g, "");
  if (s === "") return 0;
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

type Contexto = { viveiros: Viveiro[]; checklist: ItemChecklist[]; temTiposRacao: boolean; agua: boolean; hoje: string; clientId: string };

export function montarApontamento(f: Formulario, ctx: Contexto): { ok: Pendente } | { erro: string } {
  const g = ctx.viveiros.find((x) => x.id === f.viveiro_id);
  if (!g) return { erro: "Escolha o viveiro." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data) || f.data > ctx.hoje) return { erro: "Data inválida." };
  const mortes = inteiro(f.mortes);
  if (!Number.isInteger(mortes)) return { erro: "Peixes mortos: número inteiro." };
  if (mortes > g.peixes) return { erro: `As mortes passam dos ${g.peixes.toLocaleString("pt-BR")} peixes do viveiro.` };
  if (f.causa && !CAUSAS_MORTE.some((c) => c.chave === f.causa)) return { erro: "Causa das mortes desconhecida." };
  const causas = f.causa && mortes > 0 ? { [f.causa]: mortes } : undefined;

  const racoes: RacaoLancada[] = [];
  let racaoKg = 0;
  if (ctx.temTiposRacao) {
    for (const [i, r] of f.racoes.entries()) {
      if (!r.produto_id && !r.kg.trim()) continue;
      const kg = lerDecimal(r.kg);
      if (!r.produto_id || kg === null || kg <= 0) return { erro: `Ração, linha ${i + 1}: escolha o tipo e informe os kg.` };
      racoes.push({ produto_id: r.produto_id, kg });
    }
    racaoKg = Math.round(racoes.reduce((s, r) => s + r.kg, 0) * 1000) / 1000;
  } else {
    const kg = lerDecimal(f.racaoKg);
    if (kg !== null && kg < 0) return { erro: "Ração inválida." };
    racaoKg = kg ?? 0;
  }

  // qualidade da água: só as medidas preenchidas; a faixa de cada uma é conferida por validarAgua
  let agua: Pendente["agua"] = null;
  if (ctx.agua) {
    const medidas: Partial<Record<ChaveAgua, number>> = {};
    for (const c of CAMPOS_AGUA) {
      const n = lerMedida(f.agua[c.chave]);
      if (n === undefined) continue;
      if (n === null) return { erro: `${c.nome}: informe um número.` };
      medidas[c.chave] = n;
    }
    agua = Object.keys(medidas).length ? medidas : null;
  }

  const checklist: RespostaChecklist[] = [];
  for (const item of itensDoViveiro(ctx.checklist, g)) {
    const r = f.checklist[item.id];
    if (item.tipo === "numero") {
      if (r && !r.naoMedir && typeof r.valor === "number") checklist.push({ item_id: item.id, valor: r.valor });
    } else {
      // sim/não é obrigatório, como no /campo
      if (typeof r?.ok !== "boolean") return { erro: `Checklist: responda "${item.nome}".` };
      checklist.push({ item_id: item.id, ok: r.ok });
    }
  }

  let medicacao: Medicacao | null = null;
  if (f.medicamento_id) {
    const opcional = (t: string) => (t.trim() ? lerDecimal(t) : null);
    medicacao = { medicamento_id: f.medicamento_id, dias: opcional(f.medDias) ?? 1, dose_por_unidade: opcional(f.medDose), base_dose: opcional(f.medBase), quantidade: opcional(f.medQuantidade) };
  }

  const pendente: Pendente = {
    client_id: ctx.clientId, viveiro_id: g.id, viveiro_nome: g.nome, data: f.data, turno: f.turno, mortes, descartes: 0,
    racao_kg: racaoKg, agua, observacoes: f.observacoes.trim().slice(0, 500), medicacao, racoes, checklist, causas,
  };
  // a mesma validação do servidor: se recusar aqui, o servidor também recusaria
  const v = validarApontamentoCampo(pendente, ctx.hoje);
  if ("erro" in v) return v;
  return { ok: pendente };
}
