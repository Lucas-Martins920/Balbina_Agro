import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { avisarPorWhatsApp } from "./whatsapp";

// Avisos no celular (Web Push). Ligado só com as chaves VAPID no servidor:
// NEXT_PUBLIC_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (gerar com `npx web-push generate-vapid-keys`).
export function pushConfigurado() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type Aviso = { titulo: string; texto: string; link: string; tag?: string };

// Manda o aviso para os celulares inscritos da empresa e para o WhatsApp de quem ligou o celular (H2),
// só de quem tem a permissão, quando informada. Devolve quantos receberam.
export async function avisarEmpresa(db: SupabaseClient, empresaId: string, aviso: Aviso, permissao?: string): Promise<number> {
  const [push, zap] = await Promise.all([avisarPush(db, empresaId, aviso, permissao), avisarPorWhatsApp(db, empresaId, aviso, permissao)]);
  return push + zap;
}

// Contato que vai junto dos avisos (o protocolo exige um mailto: ou https:): o VAPID_CONTATO ou o e-mail das páginas legais.
function contatoVapid(): string {
  if (process.env.VAPID_CONTATO) return process.env.VAPID_CONTATO;
  const email = process.env.NEXT_PUBLIC_BALBINA_EMAIL;
  return email ? `mailto:${email}` : "mailto:contato@example.com";
}

// Inscrição que o navegador já descartou (404/410) é apagada.
async function avisarPush(db: SupabaseClient, empresaId: string, aviso: Aviso, permissao?: string): Promise<number> {
  if (!pushConfigurado()) return 0;
  webpush.setVapidDetails(contatoVapid(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const { data } = permissao
    ? await db.rpc("inscricoes_com_permissao", { p_empresa: empresaId, p_perm: permissao })
    : await db.from("push_inscricoes").select("id, endpoint, p256dh, auth").eq("empresa_id", empresaId);
  let enviados = 0;
  const mortas: string[] = [];
  await Promise.all(((data ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(async (i) => {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify(aviso), { TTL: 6 * 3600 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) mortas.push(i.id);
    }
  }));
  if (mortas.length) await db.from("push_inscricoes").delete().in("id", mortas);
  return enviados;
}
