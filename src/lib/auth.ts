import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Usuario = { id: string; email: string };

// Claims da sessão, uma vez por requisição: o layout, o aceite dos termos e a página pedem as mesmas claims.
// Com chave HS256 (o Supabase local), cada getClaims() vira uma ida ao Auth; o cache() do React junta todas numa só.
export const getClaimsDaSessao = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});

export async function getUsuario(): Promise<Usuario> {
  const claims = await getClaimsDaSessao();
  if (!claims?.sub) redirect("/login");
  return { id: claims.sub, email: String(claims.email ?? "") };
}
