// Seleção de várias linhas numa lista para uma ação em lote (ex.: ativar/desativar produtos).

export const MAX_LOTE = 500;

export function alternarSelecao(atual: Set<string>, id: string): Set<string> {
  const nova = new Set(atual);
  if (nova.has(id)) nova.delete(id);
  else nova.add(id);
  return nova;
}

// "Selecionar todos" vale para o que está visível (busca e filtro aplicados). Se todos já estão marcados, desmarca só eles.
export function alternarTodos(atual: Set<string>, visiveis: string[]): Set<string> {
  const nova = new Set(atual);
  const todos = visiveis.length > 0 && visiveis.every((id) => nova.has(id));
  for (const id of visiveis) {
    if (todos) nova.delete(id);
    else nova.add(id);
  }
  return nova;
}

// Ids vindos do formulário: sem vazios nem repetidos, até MAX_LOTE.
export function lerIdsLote(valores: unknown[]): { ids: string[] } | { erro: string } {
  const ids = [...new Set(valores.map((v) => (v == null ? "" : String(v).trim())).filter(Boolean))];
  if (ids.length === 0) return { erro: "Selecione ao menos um item." };
  if (ids.length > MAX_LOTE) return { erro: `Selecione no máximo ${MAX_LOTE} itens por vez.` };
  return { ids };
}

const produtos = (n: number) => (n === 1 ? "1 produto" : `${n} produtos`);

// `base` = produtos que guardam o estoque da classe de peixe: não são desativados.
export function mensagemAtivacao(n: number, ativo: boolean, base: number): string {
  const feito = ativo
    ? `${produtos(n)} ${n === 1 ? "ativado" : "ativados"}.`
    : `${produtos(n)} ${n === 1 ? "desativado" : "desativados"}. ${n === 1 ? "Ele some" : "Eles somem"} das vendas e lançamentos, mas o histórico fica.`;
  return base > 0 ? `${feito} ${produtos(base)} de estoque da classe de peixe ${base === 1 ? "continua ativo" : "continuam ativos"}.` : feito;
}
