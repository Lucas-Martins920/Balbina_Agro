import "server-only";
import { createClient } from "@/lib/supabase/server";
import { chavesDosTutoriais } from "@/lib/tutoriais";

// Telas cujo tutorial a pessoa logada já viu (o RLS só devolve as dela).
export async function telasVistas(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tutoriais_vistos").select("tela");
  return (data ?? []).map((v) => v.tela as string);
}

// Das chaves citadas nos tutoriais, as que a pessoa tem ("master" entra como chave). Só isso vai ao navegador.
export function chavesPermitidas(pode: (chave: string) => boolean, master: boolean): string[] {
  return chavesDosTutoriais().filter((c) => (c === "master" ? master : pode(c)));
}
