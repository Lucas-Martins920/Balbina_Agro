// Central de relatórios (Gestão > Relatórios): a lista de tudo o que o sistema emite, num lugar só.
// Cada relatório mantém a permissão do assunto (vendas pede vendas.ver, indicadores pedem lotes.ver...),
// então a central aparece para quem pode ver pelo menos um deles. Sem React, para testar sem navegador.
import { deslocarMes, semAcento } from "./formato.ts";

export type Area = "geral" | "financeiro" | "producao" | "comercial" | "contabil";
export type Formato = "Tela" | "PDF" | "Excel" | "CSV" | "PowerPoint" | "ZIP" | "TXT" | "Impressão";

export const AREAS: { chave: Area; nome: string }[] = [
  { chave: "geral", nome: "Visão geral" },
  { chave: "financeiro", nome: "Financeiro" },
  { chave: "producao", nome: "Produção" },
  { chave: "comercial", nome: "Comercial" },
  { chave: "contabil", nome: "Contabilidade" },
];

export type Relatorio = {
  href: string;
  nome: string;
  // nome curto para as abas dentro do assunto
  curto: string;
  descricao: string;
  area: Area;
  permissao: string;
  formatos: Formato[];
};

export const RELATORIOS: Relatorio[] = [
  {
    href: "/relatorios/periodo", nome: "Análise do período", curto: "Análise do período", area: "geral", permissao: "relatorios.ver",
    descricao: "Financeiro, produção, custo do kg e vendas do período, comparados com o anterior e com o ano passado. Sai como apresentação pronta.",
    formatos: ["Tela", "PDF", "PowerPoint"],
  },
  {
    href: "/relatorios/dre", nome: "DRE (resultado do ano)", curto: "DRE", area: "financeiro", permissao: "relatorios.ver",
    descricao: "Resultado mês a mês por caixa ou competência, com análise vertical e horizontal e filtro por centro de custo.",
    formatos: ["Tela", "Excel", "PDF", "CSV"],
  },
  {
    href: "/relatorios/contas", nome: "Contas a pagar e a receber", curto: "Contas", area: "financeiro", permissao: "relatorios.ver",
    descricao: "Planilha dos títulos em aberto, pagos ou recebidos, com filtro de vencimento.",
    formatos: ["Excel", "CSV"],
  },
  {
    href: "/relatorios/aging", nome: "Aging (vencidos por faixa)", curto: "Aging", area: "financeiro", permissao: "relatorios.ver",
    descricao: "Quanto está vencido e a vencer por faixa de dias, a pagar e a receber.",
    formatos: ["Tela"],
  },
  {
    href: "/relatorios/orcamento", nome: "Orçamento × realizado", curto: "Orçamento", area: "financeiro", permissao: "relatorios.ver",
    descricao: "Meta de cada categoria no ano contra o que aconteceu.",
    formatos: ["Tela"],
  },
  {
    href: "/relatorios/indicadores", nome: "Indicadores zootécnicos", curto: "Indicadores", area: "producao", permissao: "lotes.ver",
    descricao: "Engorda, pico, persistência, viabilidade e conversão por lote e espécie, semana a semana, contra a curva padrão.",
    formatos: ["Tela"],
  },
  {
    href: "/relatorios/vendas", nome: "Relatório comercial", curto: "Comercial", area: "comercial", permissao: "vendas.ver",
    descricao: "Vendas por mês, produto e região, curva ABC de clientes e clientes que pararam de comprar.",
    formatos: ["Tela"],
  },
  {
    href: "/relatorios/contador", nome: "Pacote do contador e LCDPR", curto: "Contador", area: "contabil", permissao: "relatorios.ver",
    descricao: "Tudo o que o escritório pede no mês num .zip, e o arquivo do LCDPR do ano.",
    formatos: ["ZIP", "TXT"],
  },
];

// Módulos cujas permissões abrem algum relatório: quem tem o "ver" de um deles vê a central.
export const PERMISSOES_RELATORIOS = [...new Set(RELATORIOS.map((r) => r.permissao.split(".")[0]))];

export function relatoriosVisiveis(pode: (chave: string) => boolean): Relatorio[] {
  return RELATORIOS.filter((r) => pode(r.permissao));
}

export function buscarRelatorios(termo: string, lista: Relatorio[]): Relatorio[] {
  const q = semAcento(termo);
  if (!q) return lista;
  const area = (a: Area) => AREAS.find((x) => x.chave === a)?.nome ?? "";
  return lista.filter((r) => [r.nome, area(r.area), r.descricao].some((t) => semAcento(t).includes(q)));
}

export type LinkRapido = { nome: string; href: string };

// Atalhos de download no cartão da central, com o período que a pessoa costuma querer.
// `hoje` é a data no fuso da empresa (AAAA-MM-DD).
export function linksRapidos(r: Relatorio, hoje: string): LinkRapido[] {
  const ano = hoje.slice(0, 4);
  const mesPassado = deslocarMes(hoje.slice(0, 7), -1);
  const q = (base: string, p: Record<string, string>) => `${base}?${new URLSearchParams(p)}`;
  switch (r.href) {
    case "/relatorios/periodo":
      return [
        { nome: "PDF do mês", href: q("/relatorios/apresentacao", { periodo: "mes", regime: "caixa", formato: "pdf" }) },
        { nome: "PowerPoint do mês", href: q("/relatorios/apresentacao", { periodo: "mes", regime: "caixa", formato: "pptx" }) },
      ];
    case "/relatorios/dre":
      return [
        { nome: `Excel ${ano}`, href: q("/relatorios/exportar", { relatorio: "resultado", regime: "caixa", ano, formato: "xlsx" }) },
        { nome: `PDF ${ano}`, href: q("/relatorios/exportar", { relatorio: "resultado", regime: "caixa", ano, formato: "pdf" }) },
      ];
    case "/relatorios/contas":
      return [
        { nome: "A pagar em aberto", href: q("/relatorios/exportar", { relatorio: "titulos", tipo: "pagar", situacao: "aberto,parcial,vencido" }) },
        { nome: "A receber em aberto", href: q("/relatorios/exportar", { relatorio: "titulos", tipo: "receber", situacao: "aberto,parcial,vencido" }) },
      ];
    case "/relatorios/contador":
      return [{ nome: `Pacote de ${mesPassado.slice(5)}/${mesPassado.slice(0, 4)}`, href: q("/relatorios/contador/baixar", { mes: mesPassado }) }];
    default:
      return [];
  }
}

// Abas no topo de cada relatório: os outros do mesmo assunto que a pessoa pode ver.
export function doMesmoAssunto(href: string, pode: (chave: string) => boolean): Relatorio[] {
  const atual = RELATORIOS.find((r) => r.href === href);
  if (!atual) return [];
  return relatoriosVisiveis(pode).filter((r) => r.area === atual.area || (atual.area === "geral" && r.area === "financeiro") || (atual.area === "financeiro" && r.area === "geral"));
}
