// Catálogo de permissões e a regra de checagem. A mesma regra está em app.pode() no banco
// (supabase/migrations/20261027224100_planos_balbina.sql); os perfis prontos ficam só no banco.
import { GRUPOS } from "./modulos.ts";

// `modulos`: módulos que o plano da empresa libera (null ou ausente = todos). Vem de niveis_plano no banco.
export type Acesso = { master: boolean; perfil: string; cargo?: string | null; total: boolean; chaves: string[]; nivel?: string | null; nome_plano?: string | null; modulos?: string[] | null };

export const SEM_ACESSO: Acesso = { master: false, perfil: "", total: false, chaves: [] };

export type Acao = { chave: string; nome: string };
export type ModuloPermissao = { slug: string; nome: string; grupo: string; acoes: Acao[] };

const VER: Acao = { chave: "ver", nome: "Ver" };
const EDITAR: Acao = { chave: "editar", nome: "Lançar e editar" };

// Ações de cada módulo além de ver e editar
const ACOES: Record<string, Acao[]> = {
  vendas: [VER, { chave: "lancar", nome: "Lançar e faturar pedidos" }, { chave: "cancelar", nome: "Cancelar pedidos" }, { chave: "precos", nome: "Alterar preços" }],
  cobrancas: [VER, { chave: "emitir", nome: "Emitir cobranças" }],
  "fluxo-de-caixa": [VER],
  relatorios: [VER, { chave: "editar", nome: "Editar orçamento" }],
  "custo-do-kg": [VER, { chave: "editar", nome: "Recalcular custos" }],
  historico: [VER],
};

export const CATALOGO: ModuloPermissao[] = [
  ...GRUPOS.flatMap((g) =>
    g.modulos.filter((m) => !m.permissao).map((m) => ({
      slug: m.slug,
      nome: m.nome,
      grupo: g.nome,
      acoes: (ACOES[m.slug] ?? [VER, EDITAR]).map((a) => ({ chave: `${m.slug}.${a.chave}`, nome: a.nome })),
    })),
  ),
  { slug: "pdv", nome: "PDV (frente de caixa)", grupo: "Comercial", acoes: [{ chave: "pdv.operar", nome: "Vender no caixa" }] },
  { slug: "financeiro", nome: "Fechamento do mês", grupo: "Financeiro", acoes: [{ chave: "financeiro.fechar", nome: "Fechar e reabrir o mês" }] },
];

export const GRUPOS_CATALOGO = [...new Set(CATALOGO.map((m) => m.grupo))];

export const CHAVES_VALIDAS = new Set(CATALOGO.flatMap((m) => m.acoes.map((a) => a.chave)));

// Cargos prontos (perfis). As permissões de cada um ficam em app.permissoes_perfil() no banco;
// o master também cria cargos da empresa (tabela cargos) com as permissões que quiser.
export const PERFIS: Record<string, { nome: string; descricao: string }> = {
  sem_restricao: { nome: "Acesso total", descricao: "Vê e lança em todos os módulos, mas não gerencia usuários." },
  administrativo: { nome: "Administrativo", descricao: "Vê tudo; cuida dos cadastros, contas a pagar e receber, pedidos, notas e configurações." },
  financeiro: { nome: "Financeiro", descricao: "Contas a pagar e receber, contas, cartões, cobranças, conciliação, relatórios e fechamento." },
  gerente_piscicultura: { nome: "Gerente da piscicultura", descricao: "Toda a operação de campo: viveiros, lotes, apontamento, sanidade, estoque, ração e planejamento." },
  tratador: { nome: "Tratador", descricao: "Lança o apontamento diário do viveiro (ração, mortes, qualidade da água, biometria, medicamentos)." },
  fabrica_racao: { nome: "Fabricante de ração", descricao: "Fórmulas e ordens de produção de ração; vê produtos e estoque." },
  manutencao: { nome: "Manutenção geral", descricao: "Vê piscicultura, estoque e produtos. Some mais permissões no cargo, se precisar." },
  vendedor: { nome: "Vendedor", descricao: "Lança e fatura pedidos, vende no PDV, vê estoque e contas a receber." },
  caixa: { nome: "Caixa (PDV)", descricao: "Só vende no PDV e vê os pedidos." },
  apontador: { nome: "Apontador", descricao: "Lança apontamento diário e sanidade; vê piscicultura e lotes." },
  cadastros: { nome: "Cadastros", descricao: "Vê tudo e edita piscicultura, lotes, estoque e configurações." },
  visualizacao: { nome: "Só visualização", descricao: "Vê todos os módulos e não lança nada." },
  personalizado: { nome: "Personalizado", descricao: "Só as permissões marcadas abaixo." },
};

// Chaves de um cargo novo: as marcadas mais as do cargo pronto de partida. "*.ver" vira o "ver" de cada módulo,
// porque o cargo da empresa guarda só chaves do catálogo.
export function chavesDoCargo(marcadas: string[], base: string[] = []): string[] {
  const todas = [...marcadas, ...base].flatMap((c) => (c === "*.ver" ? [...CHAVES_VALIDAS].filter((v) => v.endsWith(".ver")) : [c]));
  return [...new Set(todas.filter((c) => CHAVES_VALIDAS.has(c)))].sort();
}

function modulo(chave: string) {
  return chave.split(".")[0];
}

export function planoInclui(acesso: Acesso, mod: string): boolean {
  return !acesso.modulos || acesso.modulos.includes(mod);
}

// O plano vem primeiro, nem o master passa dele. Depois, master e "acesso total" podem tudo;
// "x.ver" vale para quem tem qualquer chave do módulo x.
export function temPermissao(acesso: Acesso, chave: string): boolean {
  if (!planoInclui(acesso, modulo(chave))) return false;
  if (acesso.master || acesso.total) return true;
  return acesso.chaves.some(
    (c) => c === chave || (chave.endsWith(".ver") && (c === "*.ver" || modulo(c) === modulo(chave))),
  );
}

// Espelho de app.pode_dispensar_2fa / app.modulos_sensiveis (supabase/migrations/20261029223000_login_local.sql),
// só para a tela avisar antes de enviar: o banco confere de novo a cada acesso.
const MODULOS_SENSIVEIS = ["contas-a-pagar", "contas-a-receber", "contas", "cobrancas", "cartoes", "conciliacao", "financeiro",
  "relatorios", "configuracoes", "notas", "custo-do-kg", "historico"];
const PERFIS_COM_2FA = ["sem_restricao", "financeiro", "administrativo", "cadastros"];

export function podeDispensar2fa(u: { master: boolean; perfil: string; chaves: string[] }): boolean {
  if (u.master || PERFIS_COM_2FA.includes(u.perfil)) return false;
  return !u.chaves.some((c) => MODULOS_SENSIVEIS.includes(modulo(c)) && !c.endsWith(".ver"));
}
