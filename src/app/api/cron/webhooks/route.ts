import { tokenConfere } from "@/lib/asaas-mapa";
import { entregarWebhooks } from "@/lib/api/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Entrega os webhooks da API pública que estão na fila. Chamada a cada 5 minutos pelo pg_cron do Supabase
// (migration cron_webhooks_no_banco), e de reserva pelo GitHub Actions e pela Vercel, com "Authorization: Bearer CRON_SECRET".
export async function GET(request: Request) {
  const recebido = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!tokenConfere(recebido, process.env.CRON_SECRET)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  const db = createAdminClient();
  const inicio = Date.now();
  let reservadas = 0;
  let entregues = 0;
  // lotes até esvaziar a fila ou chegar perto do tempo máximo
  while (Date.now() - inicio < 40000) {
    const r = await entregarWebhooks(db, 50);
    reservadas += r.reservadas;
    entregues += r.entregues;
    if (r.reservadas < 50) break;
  }
  return Response.json({ ok: true, reservadas, entregues });
}
