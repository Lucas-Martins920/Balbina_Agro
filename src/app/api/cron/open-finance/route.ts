import { tokenConfere } from "@/lib/asaas-mapa";
import { openFinanceConfigurado, sincronizarConexao } from "@/lib/open-finance";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Rotina diária (vercel.json): lê o extrato de todos os bancos conectados.
// A Vercel chama com "Authorization: Bearer CRON_SECRET".
export async function GET(request: Request) {
  const recebido = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!tokenConfere(recebido, process.env.CRON_SECRET)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!openFinanceConfigurado()) return Response.json({ ok: true, ignorado: "Open Finance não configurado" });

  const db = createAdminClient();
  const { data: conexoes, error } = await db.from("conexoes_bancarias").select("id, empresa_id, item_id, instituicao, ultima_sincronizacao")
    .eq("provedor", "pluggy").neq("status", "desconectada");
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  let novas = 0;
  const falhas: string[] = [];
  for (const conexao of conexoes ?? []) {
    try {
      novas += (await sincronizarConexao(db, conexao)).novas;
    } catch {
      falhas.push(conexao.id);
    }
  }
  return Response.json({ ok: true, conexoes: conexoes?.length ?? 0, novas, falhas });
}
