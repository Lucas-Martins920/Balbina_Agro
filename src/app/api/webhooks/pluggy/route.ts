import { after } from "next/server";
import { tokenConfere } from "@/lib/asaas-mapa";
import { sincronizarConexao } from "@/lib/open-finance";
import { webhookPedeSincronizar } from "@/lib/open-finance-mapa";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Webhook da Pluggy (o endereço vai no token do widget, com ?token=PLUGGY_WEBHOOK_TOKEN).
// O corpo só diz qual conexão mudou; os lançamentos são lidos de novo na API com as nossas credenciais.
// Responde na hora (a Pluggy espera no máximo 10 s) e sincroniza depois.
export async function POST(request: Request) {
  if (!tokenConfere(new URL(request.url).searchParams.get("token"), process.env.PLUGGY_WEBHOOK_TOKEN)) {
    return Response.json({ erro: "token inválido" }, { status: 401 });
  }
  const evento = await request.json().catch(() => null);
  const itemId = evento ? webhookPedeSincronizar(evento) : null;
  if (!itemId) return Response.json({ ok: true, ignorado: true });

  const db = createAdminClient();
  const { data: conexao } = await db.from("conexoes_bancarias").select("id, empresa_id, item_id, instituicao, ultima_sincronizacao")
    .eq("provedor", "pluggy").eq("item_id", itemId).neq("status", "desconectada").maybeSingle();
  if (!conexao) return Response.json({ ok: true, ignorado: true });

  after(async () => {
    await sincronizarConexao(db, conexao).catch(() => undefined); // o erro fica gravado na conexão
  });
  return Response.json({ ok: true });
}
