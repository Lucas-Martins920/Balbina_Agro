import "server-only";
import { createClient } from "@/lib/supabase/server";

// Integração com o NIBO só para empresas liberadas pelo Balbina (hoje, a conta teste da Amazônia Viva)
export async function niboLiberado(empresaId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("integracoes_empresa").select("sistema").eq("empresa_id", empresaId).eq("sistema", "nibo").maybeSingle();
  return !!data;
}
