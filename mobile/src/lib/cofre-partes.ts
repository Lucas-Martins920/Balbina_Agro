// Divide e junta texto para caber no cofre do aparelho (SecureStore avisa acima de 2048 bytes por item).
export const TAMANHO_PEDACO = 1800;

export function partes(valor: string, tamanho = TAMANHO_PEDACO): string[] {
  if (valor === "") return [""];
  const lista: string[] = [];
  for (let i = 0; i < valor.length; i += tamanho) lista.push(valor.slice(i, i + tamanho));
  return lista;
}

// Algum pedaço faltando = valor corrompido: melhor tratar como ausente (o app pede o login de novo).
export function juntar(pedacos: (string | null)[]): string | null {
  if (pedacos.length === 0 || pedacos.some((p) => p === null)) return null;
  return pedacos.join("");
}
