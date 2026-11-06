import type { Agua } from "@regras/agua.ts";
import type { Medicacao } from "@regras/apontamento-campo.ts";
import type { RacaoLancada, RespostaChecklist } from "@regras/apontamento-racao.ts";
import type { Causas } from "@regras/causas-morte.ts";
import type { Sugestoes } from "@regras/sugestao-apontamento.ts";

// Mesmo formato que /api/app/campo devolve (dadosCampo em src/lib/apontamento-campo-servidor.ts).
// checklist: qual checklist vale para o viveiro, pela fase do lote (engorda ou alevinagem/recria).
export type Viveiro = { id: string; nome: string; lote: string; peixes: number; fase: string; checklist: "engorda" | "alevinagem_recria" };
export type Medicamento = { id: string; nome: string; dose: number | null; unidade: string; via: string | null; carencia: number };
export type Racao = { id: string; nome: string };
export type ItemChecklist = { id: string; nome: string; tipo: string; unidade: string | null; aplica_em: string };
export type DadosCampo = {
  hoje: string;
  agua: boolean; // a piscicultura mede a qualidade da água no apontamento
  viveiros: Viveiro[];
  medicamentos: Medicamento[];
  racoes: Racao[];
  checklist: ItemChecklist[];
  sugestoes: Sugestoes;
  // quando o app baixou (mostra "dados de ontem" se ficou muito tempo sem sinal)
  baixadoEm?: string;
};

export type Existente = { origem: string; mortes: number; descartes: number; racao_kg: number | string; criado_em: string };

// Lançamento guardado no aparelho até ir para o servidor. Os campos são os de validarApontamentoCampo.
export type Pendente = {
  client_id: string;
  viveiro_id: string;
  viveiro_nome: string;
  data: string;
  turno: "manha" | "tarde";
  mortes: number;
  descartes: number;
  racao_kg: number;
  agua: Agua | null;
  observacoes: string;
  medicacao: Medicacao | null;
  racoes: RacaoLancada[];
  checklist: RespostaChecklist[];
  causas?: Causas;
  forcar?: boolean;
  conflito?: Existente[];
  erro?: string;
};
