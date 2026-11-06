import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/env";
import { tokenDoCabecalho } from "@/lib/app-celular/token";
import { planoInclui, SEM_ACESSO, temPermissao, type Acesso } from "@/lib/permissoes-regras";

// O app de celular (pasta mobile/) não usa cookie: manda o token do Supabase em "Authorization: Bearer".
// Estas rotas ficam em /api/app e o proxy não as manda para o login (src/lib/supabase/proxy.ts).

const SEM_PERSISTIR = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

// Cliente sem sessão, para entrar com senha ou conferir código: não guarda nada.
export function clienteAvulso() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { ...SEM_PERSISTIR, flowType: "implicit" } });
}


export type SessaoApp = {
  supabase: SupabaseClient;
  claims: { sub: string; session_id?: string; aal?: string; email?: string };
};

// Confere o token (assinatura e validade, pelo Supabase Auth) e devolve um cliente que passa pelo RLS
// como o próprio usuário. Token ausente ou inválido = null (a rota responde 401).
export async function sessaoDoApp(request: Request): Promise<SessaoApp | null> {
  const token = tokenDoCabecalho(request.headers.get("authorization"));
  if (!token) return null;
  const { url, key } = supabaseEnv();
  const supabase = createClient(url, key, { auth: SEM_PERSISTIR, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await supabase.auth.getClaims(token);
  const c = data?.claims;
  if (error || !c?.sub) return null;
  return {
    supabase,
    claims: { sub: String(c.sub), session_id: c.session_id ? String(c.session_id) : undefined, aal: c.aal ? String(c.aal) : undefined, email: c.email ? String(c.email) : undefined },
  };
}

export type EmpresaApp = { id: string; fuso: string; apontar_qualidade_agua: boolean };

// Empresa que o app mandou no corpo. O RLS só devolve empresa de que o usuário participa (e só depois do
// 2º fator); assinatura atrasada barra como no site (/assinatura).
export async function empresaDoApp(s: SessaoApp, empresaId: unknown): Promise<{ empresa: EmpresaApp } | { erro: string; status: number }> {
  if (typeof empresaId !== "string" || !/^[0-9a-f-]{36}$/i.test(empresaId)) return { erro: "Empresa inválida.", status: 422 };
  const { data: empresa } = await s.supabase.from("empresas").select("id, fuso, apontar_qualidade_agua").eq("id", empresaId).maybeSingle();
  if (!empresa) return { erro: "Você não tem acesso a esta piscicultura.", status: 403 };
  const { data: assinatura } = await s.supabase.rpc("minha_assinatura", { p_empresa: empresa.id });
  if (!(assinatura as { liberada?: boolean } | null)?.liberada) return { erro: "A assinatura da piscicultura está em atraso. O master regulariza no site, em Assinatura.", status: 402 };
  return { empresa: empresa as EmpresaApp };
}

// Permissões do usuário na empresa, com a mesma regra do site (getPermissoes) e do banco (app.pode).
export async function permissoesDoApp(s: SessaoApp, empresaId: string) {
  const { data } = await s.supabase.rpc("minhas_permissoes", { p_empresa: empresaId });
  const acesso: Acesso = data ? (data as Acesso) : SEM_ACESSO;
  return { pode: (chave: string) => temPermissao(acesso, chave), noPlano: (modulo: string) => planoInclui(acesso, modulo) };
}
