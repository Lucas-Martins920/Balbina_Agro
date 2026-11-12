// Estrutura da barra lateral (src/components/barra-lateral.tsx), sem React, para testar sem navegador.
// Os grupos de módulos (src/lib/modulos.ts) ficam em três seções, como no desenho de referência: Principal
// (Painel e Rotina do dia), Operação (o dia a dia da piscicultura) e Administração (dinheiro, planejamento e cadastros).
// Cada grupo vira um item que abre os seus módulos em árvore; grupo com um módulo só vira link direto.
import { GRUPOS } from "./modulos.ts";

export type Link = { tipo: "link"; href: string; nome: string; slug: string; grupo: string | null };
export type Grupo = { tipo: "grupo"; nome: string; filhos: Link[] };
export type Secao = { nome: string; itens: (Link | Grupo)[] };

// Versão simples do celular: só a operação do dia. O resto fica na versão completa ou no computador.
export const MODULOS_CELULAR = ["apontamentos", "lotes", "despescas", "vendas", "vendedor", "vendas/pdv", "contas-a-pagar", "contas-a-receber", "contas", "estoque"];

const SECOES: { nome: string; grupos: string[] }[] = [
  { nome: "Operação", grupos: ["Produção", "Manutenções", "Comercial", "Estoque"] },
  { nome: "Administração", grupos: ["Financeiro", "Gestão", "Cadastros", "Configurações"] },
];

export const USUARIOS = { slug: "configuracoes/usuarios", nome: "Usuários e cargos" };

export const CADASTROS = "Cadastros";
export const HUB_CADASTROS = "cadastros";

// Os cadastros que a pessoa pode ver, na ordem do grupo: alimentam a tela /cadastros.
export function itensDoCadastro(visiveis: string[]): { slug: string; nome: string; descricao: string }[] {
  const g = GRUPOS.find((x) => x.nome === CADASTROS);
  return (g?.modulos ?? []).filter((m) => visiveis.includes(m.slug)).map((m) => ({ slug: m.slug, nome: m.nome, descricao: m.descricao }));
}

export function montarMenu(visiveis: string[], { master, simples = false }: { master: boolean; simples?: boolean }): Secao[] {
  const principal: Link[] = [{ tipo: "link", href: "/painel", nome: "Painel", slug: "painel", grupo: null }];
  if (!simples) principal.push({ tipo: "link", href: "/pendencias", nome: "Rotina do dia", slug: "pendencias", grupo: null });

  const secoes: Secao[] = [{ nome: "Principal", itens: principal }];
  for (const s of SECOES) {
    const itens: (Link | Grupo)[] = [];
    for (const nome of s.grupos) {
      const g = GRUPOS.find((x) => x.nome === nome);
      if (!g) continue;
      const filhos: Link[] = g.modulos
        .filter((m) => visiveis.includes(m.slug) && (!simples || MODULOS_CELULAR.includes(m.slug)))
        .map((m) => ({ tipo: "link", href: `/${m.slug}`, nome: m.nome, slug: m.slug, grupo: g.nome }));
      if (master && !simples && g.nome === "Configurações") {
        filhos.push({ tipo: "link", href: `/${USUARIOS.slug}`, nome: USUARIOS.nome, slug: USUARIOS.slug, grupo: g.nome });
      }
      // Cadastros viram uma tela só (/cadastros, com busca) em vez de um menu de vários itens
      if (g.nome === CADASTROS) {
        if (filhos.length) itens.push({ tipo: "link", href: `/${HUB_CADASTROS}`, nome: CADASTROS, slug: HUB_CADASTROS, grupo: null });
        continue;
      }
      if (filhos.length === 1) itens.push(filhos[0]);
      else if (filhos.length > 1) itens.push({ tipo: "grupo", nome: g.nome, filhos });
    }
    if (itens.length) secoes.push({ nome: s.nome, itens });
  }
  return secoes;
}

// Ativo também nas subpáginas (/relatorios/aging acende Relatórios).
export function estaAtivo(caminho: string, href: string) {
  return caminho === href || caminho.startsWith(`${href}/`);
}

// Entre os links que casam com o caminho, vale o mais específico: em /vendas/pdv acende o PDV, não Vendas.
export function hrefAtivo(caminho: string, hrefs: string[]): string | null {
  return hrefs.filter((h) => estaAtivo(caminho, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}

export function grupoAtivo(secoes: Secao[], caminho: string): string | null {
  for (const s of secoes) for (const i of s.itens) if (i.tipo === "grupo" && i.filhos.some((f) => estaAtivo(caminho, f.href))) return i.nome;
  return null;
}

export function sincronizarGruposAbertos(abertos: Set<string>, grupoAtivoAtual: string | null): Set<string> {
  if (!grupoAtivoAtual) return abertos;
  if (abertos.has(grupoAtivoAtual)) return abertos;
  return new Set(abertos).add(grupoAtivoAtual);
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export type Tela = { href: string; nome: string; grupo: string; slug: string };

// Busca do campo "Buscar telas": nome primeiro, depois grupo e descrição. Só as telas que a pessoa pode ver.
export function buscarTelas(termo: string, visiveis: string[], master = false): Tela[] {
  const q = normalizar(termo);
  if (!q) return [];
  const telas: (Tela & { descricao: string })[] = [
    { href: "/painel", nome: "Painel", grupo: "Principal", slug: "painel", descricao: "início resumo do dia" },
    { href: "/pendencias", nome: "Rotina do dia", grupo: "Principal", slug: "pendencias", descricao: "checklist do que lançar hoje" },
    ...GRUPOS.flatMap((g) =>
      g.modulos.filter((m) => visiveis.includes(m.slug)).map((m) => ({ href: `/${m.slug}`, nome: m.nome, grupo: g.nome, slug: m.slug, descricao: m.descricao })),
    ),
    ...(master ? [{ href: `/${USUARIOS.slug}`, nome: USUARIOS.nome, grupo: "Configurações", slug: USUARIOS.slug, descricao: "acesso permissões" }] : []),
  ];
  const nota = (t: (typeof telas)[number]) => {
    if (normalizar(t.nome).startsWith(q)) return 0;
    if (normalizar(t.nome).includes(q)) return 1;
    if (normalizar(t.grupo).includes(q)) return 2;
    if (normalizar(t.descricao).includes(q)) return 3;
    return -1;
  };
  return telas
    .map((t) => ({ t, n: nota(t) }))
    .filter((x) => x.n >= 0)
    .sort((a, b) => a.n - b.n)
    .map(({ t: { href, nome, grupo, slug } }) => ({ href, nome, grupo, slug }));
}
