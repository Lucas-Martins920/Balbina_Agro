import "server-only";
import { somarDias } from "@/lib/formato";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { sugerirApontamentos, type LancamentoHistorico, type Sugestoes } from "@/lib/sugestao-apontamento";

export const DIAS_SUGESTAO = 14;

// Lançamentos dos últimos 14 dias dos viveiros ocupados, para pré-preencher o apontamento.
// `cliente`: o do app de celular (token no cabeçalho); sem ele, o da sessão do site (cookie).
export async function carregarSugestoes(empresaId: string, hoje: string, ocupados: { viveiro_id: string; lote_id: string }[], cliente?: SupabaseClient): Promise<Sugestoes> {
  if (!ocupados.length) return {};
  const supabase = cliente ?? (await createClient());
  const { data } = await supabase.from("apontamento_lancamentos")
    .select("turno, racao_kg, apontamentos_diarios!inner(data, lote_id, viveiro_id), apontamento_racoes(produto_id, kg)")
    .eq("empresa_id", empresaId)
    .gte("apontamentos_diarios.data", somarDias(hoje, -DIAS_SUGESTAO))
    .in("apontamentos_diarios.viveiro_id", ocupados.map((o) => o.viveiro_id))
    .order("created_at", { ascending: false })
    .limit(2000);
  const historico: LancamentoHistorico[] = (data ?? []).map((l) => {
    const d = l.apontamentos_diarios as unknown as { data: string; lote_id: string; viveiro_id: string };
    return {
      viveiro_id: d.viveiro_id, lote_id: d.lote_id, data: d.data, turno: l.turno,
      racao_kg: Number(l.racao_kg),
      racoes: (l.apontamento_racoes ?? []).map((r) => ({ produto_id: r.produto_id, kg: Number(r.kg) })),
    };
  });
  return sugerirApontamentos(historico, ocupados);
}
