import { lancarInsumoCampo } from "@/lib/campo/servidor";
import { receberDaFila } from "@/lib/campo/rota";

// Insumo aplicado no viveiro pelo app de campo: corretivo, adubo, medicamento ou outro produto do estoque.
export async function POST(request: Request) {
  return receberDaFila(request, lancarInsumoCampo);
}
