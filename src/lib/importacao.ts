// Formato único que o banco importa (public.importar_pacote). Cada origem (API do NIBO,
// planilha do NIBO, planilha do LC) só precisa montar este pacote.

import { semAcento } from "./formato.ts";

export type Sentido = "entrada" | "saida";
export type Grupo = "receita_operacional" | "custo_operacional" | "despesa_operacional" | "investimento" | "financiamento";
export type TipoConta = "corrente" | "poupanca" | "caixinha" | "aplicacao" | "cartao_credito";
export type TipoContato = "cliente" | "fornecedor" | "funcionario" | "socio";

export type CategoriaImportada = { nome: string; sentido: Sentido; grupo?: Grupo; pai?: string; codigo?: string };
export type ContaImportada = {
  chave?: string; nome: string; tipo: TipoConta; banco_codigo?: string; agencia?: string; conta?: string; conta_dv?: string;
  saldo_inicial_cents?: number; saldo_inicial_data?: string; arquivada?: boolean;
};
export type ContatoImportado = {
  chave?: string; nome: string; tipos: TipoContato[]; cpf_cnpj?: string; inscricao_estadual?: string; email?: string;
  telefone?: string; cidade?: string; uf?: string; endereco?: Record<string, string>; produtor_rural?: boolean;
};
export type TipoProduto = "alevino" | "racao" | "insumo_racao" | "embalagem" | "medicamento" | "vacina" | "outro";
export type ProdutoImportado = {
  nome: string; tipo: TipoProduto; unidade: string; sku?: string; ncm?: string; estoque_minimo?: number; observacoes?: string;
};
export type FinalidadeViveiro = "alevinagem" | "recria" | "engorda" | "alevinagem_recria";
export type SistemaViveiro = "escavado" | "barragem" | "tanque_rede" | "alvenaria" | "lona" | "outro";
export type ViveiroImportado = {
  setor: string; nome: string; finalidade: FinalidadeViveiro; sistema?: SistemaViveiro; capacidade: number; aeracao?: boolean;
  area_m2?: number; volume_m3?: number; profundidade_m?: number;
};
export type LoteImportado = {
  codigo: string; especie: string; povoamento: string; setor?: string;
  viveiro: string; qtd: number; peso_inicial_g: number; peso_alvo_g?: number; custo_cents?: number; fornecedor?: string;
};
export type EstoqueImportado = { produto: string; quantidade: number; data: string; custo_cents?: number };
export type RateioImportado = { categoria: string; categoria_pai?: string; centro_custo?: string; valor_cents: number };
export type BaixaImportada = { chave?: string; conta?: string; conta_chave?: string; data: string; valor_cents: number };
export type TituloImportado = {
  chave: string; chaves_extras?: string[]; tipo: "pagar" | "receber"; descricao: string; contato?: string; contato_chave?: string;
  vencimento: string; competencia?: string; valor_cents: number; referencia?: string; cancelado?: boolean;
  rateio: RateioImportado[]; baixas: BaixaImportada[];
};
export type TransferenciaImportada = {
  chave: string; origem?: string; origem_chave?: string; destino?: string; destino_chave?: string;
  data: string; valor_cents: number; descricao?: string;
  // ids dos dois lançamentos na origem: a mesma transferência não entra de novo com outro par
  lancamentos?: string[];
};

export type Pacote = {
  origem: string;
  categorias?: CategoriaImportada[];
  centros_custo?: { nome: string }[];
  contas?: ContaImportada[];
  contatos?: ContatoImportado[];
  produtos?: ProdutoImportado[];
  titulos?: TituloImportado[];
  transferencias?: TransferenciaImportada[];
  // parte da piscicultura: vai para public.importar_piscicultura, depois do resto
  viveiros?: ViveiroImportado[];
  lotes?: LoteImportado[];
  estoque?: EstoqueImportado[];
};

export type ResultadoImportacao = {
  categorias: number; centros_custo: number; contas: number; contatos_novos: number; contatos_atualizados: number; produtos: number;
  titulos: number; titulos_ja_importados: number; baixas: number; transferencias: number; transferencias_ja_importadas: number;
  avisos: string[]; total_avisos: number;
};

export function resultadoVazio(): ResultadoImportacao {
  return {
    categorias: 0, centros_custo: 0, contas: 0, contatos_novos: 0, contatos_atualizados: 0, produtos: 0, titulos: 0,
    titulos_ja_importados: 0, baixas: 0, transferencias: 0, transferencias_ja_importadas: 0, avisos: [], total_avisos: 0,
  };
}

export function somarResultados(a: ResultadoImportacao, b: ResultadoImportacao): ResultadoImportacao {
  const soma = { ...a };
  for (const k of Object.keys(a) as (keyof ResultadoImportacao)[]) {
    if (k === "avisos") continue;
    soma[k] = (a[k] as number) + ((b[k] as number | undefined) ?? 0);
  }
  soma.avisos = [...a.avisos, ...b.avisos].slice(0, 50);
  return soma;
}

// Lançamentos vão em lotes para cada chamada ao banco ficar pequena; a importação é idempotente.
export function dividirPacote(p: Pacote, tamanho = 400): Pacote[] {
  const lotes: Pacote[] = [{ origem: p.origem, categorias: p.categorias, centros_custo: p.centros_custo, contas: p.contas, produtos: p.produtos }];
  const contatos = p.contatos ?? [];
  for (let i = 0; i < contatos.length; i += tamanho) lotes.push({ origem: p.origem, contatos: contatos.slice(i, i + tamanho) });
  const titulos = p.titulos ?? [];
  for (let i = 0; i < titulos.length; i += tamanho) lotes.push({ origem: p.origem, titulos: titulos.slice(i, i + tamanho) });
  if (p.transferencias?.length) lotes.push({ origem: p.origem, transferencias: p.transferencias });
  return lotes;
}

export function centavos(valor: unknown): number {
  if (typeof valor === "number") return Math.round(valor * 100);
  if (typeof valor !== "string") return 0;
  let t = valor.replace(/[R$\s]/g, "");
  if (!t) return 0;
  // 1.234,56 (Brasil) ou 1234.56
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Aceita 2026-01-31, 2026-01-31T00:00:00 e 31/01/2026.
export function dataIso(valor: unknown): string | undefined {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor !== "string") return undefined;
  const v = valor.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return undefined;
}

export function grupoPeloNome(nome: string | undefined): Grupo | undefined {
  const n = semAcento(nome ?? "");
  if (!n) return undefined;
  // "Despesas operacionais e outras receitas" (NIBO) é despesa: testa despesa antes de receita
  if (n.includes("despesa")) return "despesa_operacional";
  if (n.includes("custo")) return "custo_operacional";
  if (n.includes("receita")) return "receita_operacional";
  if (n.includes("investimento")) return "investimento";
  if (n.includes("financiamento") || n.includes("emprestimo")) return "financiamento";
  return undefined;
}

export function tipoContaPeloNome(tipo: string | undefined, nome = ""): TipoConta {
  const t = semAcento(`${tipo ?? ""} ${nome}`);
  if (/card|cartao|credito/.test(t)) return "cartao_credito";
  if (/saving|poupanca/.test(t)) return "poupanca";
  if (/invest|aplicacao/.test(t)) return "aplicacao";
  if (/cash|caixa|dinheiro|carteira/.test(t) && !/caixa economica/.test(t)) return "caixinha";
  return "corrente";
}

export function documento(valor: unknown): string | undefined {
  const d = String(valor ?? "").replace(/\D/g, "");
  return d.length === 11 || d.length === 14 ? d : undefined;
}
