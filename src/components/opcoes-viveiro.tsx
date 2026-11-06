import { formatarInteiro } from "@/lib/formato";
import { FINALIDADES_VIVEIRO } from "@/lib/rotulos";

export type ViveiroOpcao = { id: string; nome: string; finalidade: string; capacidade: number };

// Opções de um select de viveiro agrupadas por finalidade (alevinagem, recria, engorda).
// `bloqueio` devolve o motivo de um viveiro não poder ser escolhido (ex.: ocupado por outro lote).
export function OpcoesViveiro({ viveiros, bloqueio }: { viveiros: ViveiroOpcao[]; bloqueio?: (g: ViveiroOpcao) => string | null }) {
  return Object.entries(FINALIDADES_VIVEIRO).map(([finalidade, rotulo]) => {
    const doTipo = viveiros.filter((g) => g.finalidade === finalidade);
    if (!doTipo.length) return null;
    return (
      <optgroup key={finalidade} label={rotulo}>
        {doTipo.map((g) => {
          const motivo = bloqueio?.(g);
          return (
            <option key={g.id} value={g.id} disabled={Boolean(motivo)}>
              {g.nome} ({motivo ?? `${formatarInteiro(g.capacidade)} peixes`})
            </option>
          );
        })}
      </optgroup>
    );
  });
}
