// Ordem das categorias e dos centros de custo escolhida pela piscicultura (arrastando na lista, como no NIBO).
// No banco a ordem vale entre irmãos; aqui a árvore vira lista plana: pai, filhos dele, próximo pai.

export type ItemOrdenavel = { id: string; nome: string; parent_id?: string | null; ordem?: number | null; grupo?: string };

// Categorias principais ficam na ordem dos grupos do DRE; a posição escolhida vale dentro de cada grupo.
const GRUPOS = ["receita_operacional", "custo_operacional", "despesa_operacional", "investimento", "financiamento"];
const posGrupo = (g?: string) => (g === undefined ? 0 : GRUPOS.indexOf(g) === -1 ? GRUPOS.length : GRUPOS.indexOf(g));

// Compara dois irmãos: posição escolhida e, empatando (ou sem posição), o nome.
export function compararOrdem(a: { nome: string; ordem?: number | null; grupo?: string }, b: { nome: string; ordem?: number | null; grupo?: string }): number {
  const ga = posGrupo(a.grupo);
  const gb = posGrupo(b.grupo);
  if (ga !== gb) return ga - gb;
  const oa = a.ordem ?? Number.MAX_SAFE_INTEGER;
  const ob = b.ordem ?? Number.MAX_SAFE_INTEGER;
  return oa !== ob ? oa - ob : a.nome.localeCompare(b.nome, "pt-BR");
}

// Percorre a árvore em profundidade. Item cujo pai não veio na lista (filtrado, inativo) sobe para a raiz.
export function ordenarArvore<T extends ItemOrdenavel>(itens: readonly T[]): { item: T; nivel: number }[] {
  const ids = new Set(itens.map((i) => i.id));
  const filhos = new Map<string | null, T[]>();
  for (const i of itens) {
    const pai = i.parent_id && ids.has(i.parent_id) && i.parent_id !== i.id ? i.parent_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), i]);
  }
  for (const lista of filhos.values()) lista.sort(compararOrdem);
  const saida: { item: T; nivel: number }[] = [];
  const vistos = new Set<string>();
  const visitar = (pai: string | null, nivel: number) => {
    for (const item of filhos.get(pai) ?? []) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      saida.push({ item, nivel });
      visitar(item.id, nivel + 1);
    }
  };
  visitar(null, 0);
  // ciclo de pais (não deveria existir): o que sobrou entra no fim
  for (const i of itens) if (!vistos.has(i.id)) saida.push({ item: i, nivel: 0 });
  return saida;
}

// Lista plana na ordem da árvore, para selects.
export function emOrdem<T extends ItemOrdenavel>(itens: readonly T[] | null | undefined): T[] {
  return ordenarArvore(itens ?? []).map((x) => x.item);
}

// Move um item para a posição de outro dentro do mesmo grupo de irmãos (o que o arrastar faz).
export function moverPara<T>(lista: readonly T[], de: number, para: number): T[] {
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item);
  return nova;
}

// Para usar direto na consulta: supabase.from("categorias").select(...).then(ordenado).
export function ordenado<R extends { data: readonly ItemOrdenavel[] | null }>(r: R): R {
  return { ...r, data: r.data ? emOrdem(r.data) : r.data };
}
