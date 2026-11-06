// Produtos que não são pescado: insumos, ração, embalagens e medicamentos
export const TIPOS_PRODUTO: Record<string, string> = {
  insumo_racao: "Ingrediente de ração",
  racao: "Ração",
  corretivo: "Corretivo e fertilizante",
  embalagem: "Embalagem",
  medicamento: "Medicamento",
  vacina: "Vacina",
  outro: "Outro",
};

export const TIPOS_DEPOSITO: Record<string, string> = {
  insumos: "Insumos",
  racao: "Ração",
  almoxarifado: "Almoxarifado",
  expedicao: "Expedição",
};

// Linhas do formulário de fórmula de ração
export const LINHAS_FORMULA = 10;

// Todos os tipos, para o cadastro de produtos
export const TIPOS_PRODUTO_TODOS: Record<string, string> = { peixe: "Pescado", alevino: "Alevinos", ...TIPOS_PRODUTO };

// Unidades mais usadas, sugeridas no campo (aceita outras)
export const UNIDADES = ["kg", "cx", "un", "mil", "g", "t", "sc", "l", "ml", "dose", "fr", "pct"];

// Abas que filtram listas de produtos (cadastro e estoque)
export const ABAS_PRODUTO = {
  todos: { nome: "Todos", tipos: null },
  pescado: { nome: "Pescado e alevinos", tipos: ["peixe", "alevino"] },
  insumos: { nome: "Ração e insumos", tipos: ["racao", "insumo_racao", "corretivo"] },
  embalagens: { nome: "Embalagens", tipos: ["embalagem"] },
  sanidade: { nome: "Vacinas e medicamentos", tipos: ["vacina", "medicamento"] },
  outros: { nome: "Outros", tipos: ["outro"] },
} as const;
export type AbaProduto = keyof typeof ABAS_PRODUTO;

export function produtoNaAba(tipo: string, aba: AbaProduto) {
  const tipos = ABAS_PRODUTO[aba].tipos as readonly string[] | null;
  return !tipos || tipos.includes(tipo);
}

// Unidade em que o saldo do produto aparece: o produto que guarda o estoque da classe de peixe é contado em kg
export function unidadeSaldo(p: { tipo: string; base_estoque: boolean; unidade: string }) {
  return p.tipo === "peixe" && p.base_estoque ? "kg" : p.unidade;
}
