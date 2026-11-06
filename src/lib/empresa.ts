import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exigirSegundoFator } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

export const COOKIE_EMPRESA = "empresa_id";

export type Empresa = { id: string; razao_social: string; nome_fantasia: string | null; fuso: string; apontar_qualidade_agua: boolean };

export function nomeEmpresa(e: Empresa) {
  return e.nome_fantasia || e.razao_social;
}

// O RLS só devolve as empresas de que o usuário participa.
export async function listarEmpresas(): Promise<Empresa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empresas")
    .select("id, razao_social, nome_fantasia, fuso, apontar_qualidade_agua")
    .order("razao_social");
  if (error) throw new Error(`Erro ao carregar empresas: ${error.message}`);
  return data ?? [];
}

// Entra nas empresas que convidaram o e-mail do usuário (convite feito pelo usuário master).
export async function aceitarConvites(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("aceitar_convites");
  return Number(data ?? 0);
}

// Uma vez por requisição: layout, página e getPermissoes pedem a mesma coisa.
export const getEmpresaAtual = cache(async (): Promise<{ atual: Empresa; todas: Empresa[] }> => {
  let todas = await listarEmpresas();
  if (todas.length === 0 && (await aceitarConvites()) > 0) todas = await listarEmpresas();
  if (todas.length === 0) {
    await exigirSegundoFator("/painel");
    redirect("/onboarding");
  }
  const escolhida = (await cookies()).get(COOKIE_EMPRESA)?.value;
  const atual = todas.find((e) => e.id === escolhida) ?? todas[0];
  return { atual, todas };
});
