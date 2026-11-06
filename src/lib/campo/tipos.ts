// Dados que a tela /campo recebe do servidor e guarda no celular para usar sem sinal.

export type RacaoSugerida = {
  kg: number;
  refeicoes: number | null;
  por_refeicao_kg: number | null;
  proteina: number | null;
  granulo: string | null;
  fase: string | null;       // fase da tabela de arraçoamento (Recria II, Engorda I...)
  taxa_pct: number | null;
  alerta: string | null;     // oxigênio baixo, biometria atrasada...
  oxigenio_min: number | null;
};

export type PontoCrescimento = { semana: number; real: number | null; padrao: number | null };
export type BiometriaRecente = { data: string; peso_g: number; peixes: number };

export type LoteTanque = {
  id: string;
  codigo: string;
  fase: string;
  especie: string;
  povoamento: string;
  dias: number;
  semana: number;
  peixes: number;
  peso_g: number | null;          // estimado hoje (última biometria levada pela curva)
  biomassa_kg: number | null;
  peso_alvo_g: number | null;
  kg_m3: number | null;
  peixes_m2: number | null;
  ultima_biometria: string | null;
  ultimo_apontamento: string | null;
  previsao_despesca: string | null;
  carencia_ate: string | null;
  racao: RacaoSugerida | null;
  gpd: number | null;             // ganho de peso por dia desde o povoamento (g)
  conversao: number | null;       // kg de ração por kg ganho, acumulada
  sobrevivencia: number | null;   // %
  desvio_peso_pct: number | null; // peso real contra a curva da espécie
  curva: PontoCrescimento[];
  biometrias: BiometriaRecente[];
};

export type Tanque = {
  id: string;
  nome: string;
  setor: string;
  rotulo: string;                 // "Setor / Viveiro"
  area_m2: number | null;
  volume_m3: number | null;
  aeracao: boolean;
  lote: LoteTanque | null;
};

export type Opcao = { id: string; nome: string };
export type InsumoOpcao = { id: string; nome: string; unidade: string; tipo: string; saldo: number | null };
export type MedicamentoOpcao = { id: string; nome: string; dose: number | null; unidade: string; via: string | null; carencia: number };

export type PainelCampo = {
  tanques: Tanque[];
  especies: Opcao[];
  insumos: InsumoOpcao[];
};
