// Dados retornados pela rota /api/app/painel.

export interface ViveiroDia {
  viveiro_id: string;
  viveiro: string;
  setor: string;
  lote: string;
  peixes: number;
  semana: number;
  fase: string;
  apontado: boolean;
}

export interface EntregaDia {
  id: string;
  numero: number;
  cliente: string;
  total_cents: number;
  itens: string;
}

export interface AlertaLote {
  nivel: "critico" | "atencao" | "info";
  tipo: string;
  titulo: string;
  detalhe: string;
}

export interface DadosPainel {
  hoje: string;
  viveiros: ViveiroDia[];
  entregas: EntregaDia[];
  alertas: AlertaLote[];
}
