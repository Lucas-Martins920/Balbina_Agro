import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";

// Cliente sem usuário, que passa por cima do RLS. Só para webhooks de provedores, que chegam sem
// sessão, e para o e-mail de convite (auth.admin); nunca para ler ou gravar dados de uma ação de usuário.
export function createAdminClient() {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error("Defina SUPABASE_SECRET_KEY para receber webhooks e enviar convites");
  return createClient(supabaseEnv().url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}
