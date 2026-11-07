import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";

function servico() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error("Defina SUPABASE_SECRET_KEY");
  return createClient(supabaseEnv().url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

const CABECALHOS = { "Cache-Control": "no-store" };

function erro(status: number, msg: string) {
  return Response.json({ erro: msg }, { status, headers: CABECALHOS });
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return erro(401, "Token da sonda ausente. Envie Authorization: Bearer <token>.");

  let corpo: unknown;
  try { corpo = await req.json(); } catch { return erro(400, "JSON inválido."); }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return erro(400, "Corpo deve ser um objeto.");

  const db = servico();
  const { data: sonda, error: errSonda } = await db
    .from("sondas").select("id, empresa_id, ativo").eq("token", token).maybeSingle();
  if (errSonda) return erro(500, "Erro ao buscar sonda.");
  if (!sonda) return erro(401, "Token desconhecido.");
  if (!sonda.ativo) return erro(403, "Sonda desativada.");

  const c = corpo as Record<string, unknown>;
  const leitura: Record<string, unknown> = {
    sonda_id: sonda.id,
    empresa_id: sonda.empresa_id,
  };

  if (c.lido_em) leitura.lido_em = c.lido_em;
  if (typeof c.oxigenio_mg_l === "number") leitura.oxigenio_mg_l = c.oxigenio_mg_l;
  if (typeof c.temperatura_c === "number") leitura.temperatura_c = c.temperatura_c;
  if (typeof c.ph === "number") leitura.ph = c.ph;
  if (typeof c.amonia_mg_l === "number") leitura.amonia_mg_l = c.amonia_mg_l;
  if (typeof c.bateria_pct === "number") leitura.bateria_pct = Math.round(c.bateria_pct);
  if (typeof c.sinal_dbm === "number") leitura.sinal_dbm = Math.round(c.sinal_dbm);

  const { data, error } = await db.from("leituras_sonda").insert(leitura).select("id, lido_em").single();
  if (error) return erro(500, `Erro ao gravar: ${error.message}`);

  return Response.json({ ok: true, leitura_id: data.id, lido_em: data.lido_em }, { status: 201, headers: CABECALHOS });
}
