// Versão vigente dos Termos de uso, da Política de privacidade e da Política de cookies. Ao mudar o
// texto de qualquer um deles, mude a data: quem aceitou a versão anterior aceita de novo ao entrar
// (tabela aceites_termos, uma linha por pessoa e versão).
export const VERSAO_TERMOS = "2026-10-28";

export const DOCUMENTOS_LEGAIS = [
  { href: "/termos", nome: "Termos de uso" },
  { href: "/privacidade", nome: "Política de privacidade" },
  { href: "/cookies", nome: "Política de cookies" },
] as const;

// Dados do fornecedor do Balbina que aparecem nos documentos. Preencha antes de vender.
export const FORNECEDOR = {
  razaoSocial: process.env.NEXT_PUBLIC_BALBINA_RAZAO_SOCIAL || "[razão social do fornecedor]",
  cnpj: process.env.NEXT_PUBLIC_BALBINA_CNPJ || "[CNPJ]",
  email: process.env.NEXT_PUBLIC_BALBINA_EMAIL || "[e-mail de contato e do encarregado de dados]",
  foro: process.env.NEXT_PUBLIC_BALBINA_FORO || "[cidade/UF]",
};

// O navegador lê "/\site.com" e "/<tab>/site.com" como "//site.com": só caminhos internos de verdade.
export function destinoSeguro(voltar: unknown, padrao = "/painel") {
  const v = typeof voltar === "string" ? voltar : "";
  return /^\/(?![\/\\])/.test(v) && !/\s/.test(v) ? v : padrao;
}
