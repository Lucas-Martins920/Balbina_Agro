import "server-only";
import { cache } from "react";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import type { SituacaoAssistente } from "@/lib/assistente";

// Situação do assistente de início na empresa atual; null para quem não é o usuário master.
export const getAssistente = cache(async (): Promise<SituacaoAssistente | null> => {
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data } = await supabase.rpc("assistente_inicio", { p_empresa: atual.id });
  return (data as SituacaoAssistente | null) ?? null;
});
