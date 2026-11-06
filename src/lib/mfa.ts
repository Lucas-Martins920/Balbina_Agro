import "server-only";
import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/cripto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Sem o 2º fator (app autenticador ou código por e-mail) o banco não devolve dado nenhum.
// Antes de concluir que a pessoa não tem empresa, confere se o que falta é o código.
export async function exigirSegundoFator(voltar: string) {
  if (await segundoFatorPendente()) redirect(`/auth/mfa?voltar=${encodeURIComponent(voltar)}`);
}

export async function segundoFatorPendente() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mfa_pendente");
  return data === true;
}

type Claims = { sub?: string; session_id?: string; aal?: string } | null | undefined;
type MetodoSessao = "email" | "link_email" | "app" | "dispositivo_app" | "dispositivo_email";

// Registra a sessão atual como verificada pelo e-mail (sessoes_2fa, só a chave de serviço grava).
// Chame apenas depois de o Supabase Auth ter conferido um código ou link enviado ao e-mail da pessoa.
export async function marcarSessaoVerificada(metodo: MetodoSessao) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return registrarSessaoVerificada(data?.claims, metodo);
}

// Mesma regra, para quem já tem as claims (o app de celular manda o token no cabeçalho, sem cookie).
export async function registrarSessaoVerificada(claims: Claims, metodo: MetodoSessao) {
  if (!claims?.sub || !claims.session_id) return false;
  const { error } = await createAdminClient()
    .from("sessoes_2fa")
    .upsert({ session_id: claims.session_id, user_id: claims.sub, metodo });
  return !error;
}

// "Confiar neste dispositivo por 14 dias": o navegador guarda um token aleatório num cookie
// httpOnly; o banco guarda só o hash (dispositivos_confiaveis, só a chave de serviço lê).
export const COOKIE_DISPOSITIVO = "balbina_dispositivo";
export const DIAS_CONFIANCA = 14;

// Só depois de a sessão ter passado pelo 2º fator. Use em Server Action (grava cookie).
export async function confiarNesteDispositivo() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || (await segundoFatorPendente())) return false;
  const criado = await criarDispositivoConfiavel(claims, (await headers()).get("user-agent"));
  if (!criado) return false;
  (await cookies()).set(COOKIE_DISPOSITIVO, criado.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: criado.expira,
  });
  return true;
}

// Grava o dispositivo e devolve o token aleatório (o banco guarda só o hash). Quem chama confere antes
// que a sessão já passou pelo 2º fator; o navegador guarda o token em cookie, o app no cofre do aparelho.
export async function criarDispositivoConfiavel(claims: Claims, descricao: string | null) {
  if (!claims?.sub) return null;
  const metodo = claims.aal === "aal2" ? "app" : "email";
  const token = randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + DIAS_CONFIANCA * 86_400_000);
  const admin = createAdminClient();
  await admin.from("dispositivos_confiaveis").delete().eq("user_id", claims.sub).lt("expira_em", new Date().toISOString());
  const { error } = await admin.from("dispositivos_confiaveis").insert({
    user_id: claims.sub,
    token_hash: hashToken(token),
    metodo,
    descricao: descricao?.slice(0, 200) ?? null,
    expira_em: expira.toISOString(),
  });
  return error ? null : { token, expira };
}

// No login: se este navegador foi confiado por esta pessoa e ainda vale, libera a sessão sem código.
export async function usarDispositivoConfiavel() {
  const token = (await cookies()).get(COOKIE_DISPOSITIVO)?.value;
  if (!token) return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return liberarPorDispositivo(data?.claims, token);
}

// Libera a sessão destas claims se o token for de um dispositivo confiado pela mesma pessoa e ainda valer.
export async function liberarPorDispositivo(claims: Claims, token: string) {
  const sub = claims?.sub;
  if (!sub || !token) return false;
  const { data: dispositivo } = await createAdminClient()
    .from("dispositivos_confiaveis")
    .select("metodo")
    .eq("user_id", sub)
    .eq("token_hash", hashToken(token))
    .gt("expira_em", new Date().toISOString())
    .maybeSingle();
  if (!dispositivo) return false;
  return registrarSessaoVerificada(claims, dispositivo.metodo === "app" ? "dispositivo_app" : "dispositivo_email");
}

// Tela de segurança: quantos navegadores estão confiados, e esquecer todos.
export async function contarDispositivosConfiaveis(userId: string) {
  const { count } = await createAdminClient()
    .from("dispositivos_confiaveis")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("expira_em", new Date().toISOString());
  return count ?? 0;
}

export async function esquecerDispositivos(userId: string) {
  await createAdminClient().from("dispositivos_confiaveis").delete().eq("user_id", userId);
  (await cookies()).delete(COOKIE_DISPOSITIVO);
}
