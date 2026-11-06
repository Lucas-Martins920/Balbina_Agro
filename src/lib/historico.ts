// Histórico de alterações (tabela audit_log, gravada por trigger no banco): nomes e formatação para a tela.
import { formatarData, formatarMoeda } from "./formato.ts";

export type Acao = "insert" | "update" | "delete";

export const ACOES: Record<Acao, { nome: string; filtro: string; tom: "positivo" | "info" | "perigo" }> = {
  insert: { nome: "Incluiu", filtro: "Inclusões", tom: "positivo" },
  update: { nome: "Editou", filtro: "Edições", tom: "info" },
  delete: { nome: "Excluiu", filtro: "Exclusões", tom: "perigo" },
};

const TABELAS: Record<string, string> = {
  empresas: "Empresa",
  usuarios_empresa: "Usuários",
  cargos: "Cargos",
  convites: "Convites de usuário",
  assinaturas: "Assinatura",
  contatos: "Clientes e fornecedores",
  categorias: "Categorias",
  centros_custo: "Centros de custo",
  contas_financeiras: "Contas e saldos",
  recorrencias: "Recorrências",
  recorrencia_reajustes: "Reajustes de recorrência",
  agendamentos: "Contas a pagar e receber",
  agendamento_rateios: "Rateio de títulos",
  baixas: "Pagamentos e recebimentos",
  transferencias: "Transferências entre contas",
  periodos_fechados: "Fechamento do mês",
  financeiro: "Financeiro zerado",
  sistema: "Sistema zerado",
  orcamentos: "Orçamento",
  importacoes_extrato: "Extratos importados",
  movimentos_bancarios: "Movimentos do extrato",
  conciliacoes: "Conciliação",
  desconciliacao: "Desconciliar e apagar do extrato",
  movimentos_apagados: "Lançamentos apagados do extrato",
  regras_conciliacao: "Regras de conciliação",
  conexoes_bancarias: "Open Finance",
  perfis_cobranca: "Perfis de cobrança",
  contas_asaas: "Conta Asaas",
  cobrancas: "Cobranças",
  remessas_cnab: "Remessas CNAB",
  notas_fiscais: "Notas fiscais",
  documentos: "Anexos",
  setores: "Setores",
  viveiros: "Viveiros",
  especies: "Espécies",
  curvas_crescimento: "Curvas da espécie",
  lotes: "Lotes",
  lote_alocacoes: "Alocação de lotes",
  lote_transferencias: "Transferência de lotes",
  classes_peixe: "Classes de peixe",
  apontamentos_diarios: "Apontamento diário",
  apontamento_racoes: "Ração do apontamento",
  biometrias: "Biometrias",
  tabela_arracoamento: "Tabela de arraçoamento",
  transferencias_peixe: "Transferências de peixe",
  transferencia_peixe_itens: "Itens da transferência de peixe",
  apontamento_lancamentos: "Lançamentos do apontamento",
  despescas: "Despescas",
  eventos_sanitarios: "Sanidade",
  depositos: "Depósitos",
  produtos: "Produtos e insumos",
  movimentos_estoque: "Movimentos de estoque",
  formulas_racao: "Fórmulas de ração",
  formula_itens: "Itens da fórmula",
  ordens_producao_racao: "Produção de ração",
  pedidos_venda: "Vendas",
  pedido_itens: "Itens da venda",
  tabelas_preco: "Tabelas de preço",
  listas_preco: "Listas de preço",
  planejamento_parametros: "Planejamento",
  planejamento_custos: "Custos do planejamento",
  lotes_planejados: "Lotes planejados",
};

export const OPCOES_TABELA = Object.entries(TABELAS)
  .map(([valor, nome]) => ({ valor, nome }))
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

export function nomeTabela(tabela: string) {
  return TABELAS[tabela] ?? tabela.replaceAll("_", " ");
}

const CAMPOS: Record<string, string> = { is_admin: "master", cpf_cnpj: "CPF/CNPJ", uf: "UF" };

export function nomeCampo(campo: string) {
  return CAMPOS[campo] ?? campo.replace(/_(cents|id)$/, "").replaceAll("_", " ");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatarValorCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "vazio";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") return campo.endsWith("_cents") ? formatarMoeda(valor) : valor.toLocaleString("pt-BR");
  if (Array.isArray(valor)) return valor.length ? valor.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ") : "vazio";
  if (typeof valor === "object") return JSON.stringify(valor);
  const texto = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return formatarData(texto);
  if (UUID.test(texto)) return `${texto.slice(0, 8)}…`;
  return texto;
}

// Campos que não ajudam a entender a mudança
const TECNICOS = new Set(["id", "empresa_id", "created_at", "updated_at", "created_by"]);

export type Registro = { acao: Acao; campos: string[] | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null };
export type Detalhe = { campo: string; antes: unknown; depois: unknown };

export function detalhesAlteracao(r: Registro): Detalhe[] {
  if (r.acao === "update") {
    return (r.campos ?? []).map((campo) => ({ campo, antes: r.antes?.[campo] ?? null, depois: r.depois?.[campo] ?? null }));
  }
  const linha = (r.acao === "insert" ? r.depois : r.antes) ?? {};
  return Object.entries(linha)
    .filter(([campo, valor]) => !TECNICOS.has(campo) && valor !== null && valor !== "" && !(Array.isArray(valor) && valor.length === 0))
    .map(([campo, valor]) => (r.acao === "insert" ? { campo, antes: null, depois: valor } : { campo, antes: valor, depois: null }));
}

export function formatarDataHora(iso: string, fuso: string) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

// "2026-10-28" no fuso da piscicultura -> "2026-10-28T00:00:00-04:00", para filtrar created_at pelo dia local
export function inicioDoDia(data: string, fuso: string) {
  const gmt = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${data}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return `${data}T00:00:00${gmt === "GMT" ? "+00:00" : gmt.slice(3)}`;
}
