import { abrirLoteCampo } from "@/lib/campo/servidor";
import { receberDaFila } from "@/lib/campo/rota";

// Povoamento de um viveiro vazio pelo app de campo: quantidade, espécie, peso médio e data.
export async function POST(request: Request) {
  return receberDaFila(request, abrirLoteCampo);
}
