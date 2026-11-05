import { AbrirLoteOutput, LancarInsumoOutput } from "./schemas";

export function handleAbrirLotePayload(o: AbrirLoteOutput["payload"], conhecimento: any) {
  // Regras simples: densidade vs conhecimento
  const avisos: string[] = [];
  let valido = true;
  const volumeM3 = o.manejo?.volumeM3;
  if (conhecimento.densidadeMaximaPorM3 && typeof volumeM3 === "number" && volumeM3 > 0) {
    const dens = o.estoqueInicial / volumeM3;
    if (dens > conhecimento.densidadeMaximaPorM3) {
      valido = false;
      avisos.push(`Densidade ${dens.toFixed(2)} > densidadeMaximaPorM3 (${conhecimento.densidadeMaximaPorM3})`);
    }
  }
  return { valido, avisos };
}

export function handleLancarInsumoPayload(p: LancarInsumoOutput["payload"], conhecimento: any) {
  // Exemplo: se tipo == alevino, checar fornecedor recomendado no conhecimento (opcional)
  const avisos: string[] = [];
  return { valido: true, avisos };
}