"use server";

import { createClient } from "@/lib/supabase/server";

const TELA_VALIDA = /^(\*|geral|\/[a-z0-9/_[\]-]{0,80})$/;

// Marca telas como vistas pela pessoa logada. Falhar aqui não atrapalha ninguém: o navegador também guarda.
export async function marcarTutoriais(telas: string[]): Promise<void> {
  const validas = [...new Set(telas)].filter((t) => TELA_VALIDA.test(t)).slice(0, 20);
  if (validas.length === 0) return;
  const supabase = await createClient();
  await supabase.from("tutoriais_vistos").upsert(validas.map((tela) => ({ tela })), { onConflict: "user_id,tela", ignoreDuplicates: true });
}

// Volta a mostrar os tutoriais: os de uma tela, ou todos (e religa o automático) quando `tela` é null.
export async function refazerTutoriais(tela: string | null): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return;
  const consulta = supabase.from("tutoriais_vistos").delete().eq("user_id", data.claims.sub);
  await (tela && TELA_VALIDA.test(tela) ? consulta.eq("tela", tela) : consulta);
}

// Liga ou desliga o tutorial automático nas telas novas (a tela '*').
export async function tutorialAutomatico(ligado: boolean): Promise<void> {
  if (ligado) return refazerTutoriais("*");
  return marcarTutoriais(["*"]);
}
