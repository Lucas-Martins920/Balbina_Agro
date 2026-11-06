// O estoque do pescado é um só por classe (Pequeno, Médio, Grande...), em kg: vender por kg ou em caixa de
// 20 kg são formas de vender o MESMO peixe. Ao montar a venda, o que já está no carrinho sai do estoque na
// hora, em todas as formas daquela classe, para o mesmo peixe não ser vendido duas vezes. Tirar do carrinho
// devolve. O produto vendido por kg (fator_kg 1) aceita fração (até o grama); os outros, unidades inteiras.
export type ProdutoEstoque = { id: string; classe_peixe_id: string | null; fator_kg: number | null; kg_classe: number | null };

// resta: quanto desta forma ainda cabe no estoque depois do carrinho inteiro.
// max: até quanto esta linha pode ir, dado o que as OUTRAS linhas já tiraram da mesma classe.
export type EstoqueLinha = { resta: number; max: number };

// kg livres -> quantidade do produto: kg com 3 casas (gramas) ou unidades inteiras da embalagem
export function quantidadeQueCabe(kg: number, fatorKg: number) {
  if (!(kg > 0) || !(fatorKg > 0)) return 0;
  const q = kg / fatorKg;
  return fatorKg === 1 ? Math.floor(q * 1000 + 1e-6) / 1000 : Math.floor(q + 1e-9);
}

export function estoqueNoCarrinho(produtos: ProdutoEstoque[], carrinho: Record<string, number>): Map<string, EstoqueLinha | null> {
  const noCarrinho = new Map<string, number>();
  for (const p of produtos) {
    const q = carrinho[p.id] ?? 0;
    if (p.classe_peixe_id && p.fator_kg && q > 0) noCarrinho.set(p.classe_peixe_id, (noCarrinho.get(p.classe_peixe_id) ?? 0) + q * p.fator_kg);
  }
  return new Map(produtos.map((p) => {
    if (!p.classe_peixe_id || !p.fator_kg || p.kg_classe === null) return [p.id, null];
    const total = noCarrinho.get(p.classe_peixe_id) ?? 0;
    const outros = total - (carrinho[p.id] ?? 0) * p.fator_kg;
    return [p.id, { resta: quantidadeQueCabe(p.kg_classe - total, p.fator_kg), max: quantidadeQueCabe(p.kg_classe - outros, p.fator_kg) }];
  }));
}
