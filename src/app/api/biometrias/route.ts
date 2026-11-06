import { gravarBiometriaCampo } from "@/lib/campo/servidor";
import { receberDaFila } from "@/lib/campo/rota";

// Biometria lançada no app de campo: peixes pesados e peso da amostra.
export async function POST(request: Request) {
  return receberDaFila(request, gravarBiometriaCampo);
}
