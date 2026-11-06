"use server";

import { revalidatePath } from "next/cache";
import type { EstadoAcao } from "@/lib/acao";
import { getUsuario } from "@/lib/auth";
import { esquecerDispositivos, marcarSessaoVerificada } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

// Antes de desativar o app autenticador: a sessão já passou pelo app (aal2), então fica registrada
// como verificada e não cai no código por e-mail logo depois de desativar.
export async function manterSessaoAoDesativarApp() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.aal !== "aal2") return false;
  return marcarSessaoVerificada("app").catch(() => false);
}

// Esquece todos os navegadores confiados ("confiar neste dispositivo por 14 dias") desta pessoa.
export async function esquecerDispositivosConfiaveis(): Promise<EstadoAcao> {
  const { id } = await getUsuario();
  await esquecerDispositivos(id);
  revalidatePath("/seguranca");
  return { ok: "Pronto. O próximo login em qualquer navegador vai pedir o código.", versao: Date.now() };
}
