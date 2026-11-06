import { fecharLoteCampo } from "@/lib/campo/servidor";
import { receberDaFila } from "@/lib/campo/rota";

// Fecha o lote no viveiro pelo app de campo: despesca total com os kg retirados, ou encerramento sem despesca.
export async function POST(request: Request, ctx: RouteContext<"/api/lotes/[id]/fechar">) {
  const { id } = await ctx.params;
  return receberDaFila(request, (supabase, empresa, corpo) => fecharLoteCampo(supabase, empresa, id, corpo));
}
