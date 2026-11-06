import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parametroModelo } from "./whatsapp-texto";

// H2: WhatsApp do Balbina pela API oficial da Meta (WhatsApp Business Cloud API). Um número para todas as
// pisciculturas. Ligado só com as variáveis do servidor (docs/automacoes.md › WhatsApp):
//   WHATSAPP_TOKEN          token permanente do usuário do sistema no Business Manager
//   WHATSAPP_NUMERO_ID      Phone number ID do número do Balbina
//   WHATSAPP_NUMERO         o número em si (55DDDNÚMERO), para mostrar na tela
//   WHATSAPP_SEGREDO_APP    App secret (confere a assinatura do webhook)
//   WHATSAPP_VERIFICACAO    texto livre que a Meta repete ao cadastrar o webhook
// Fora da janela de 24 horas depois da última mensagem da pessoa, a Meta só aceita mensagem de modelo
// aprovado: balbina_aviso e balbina_cobranca (texto dos modelos em docs/automacoes.md).

const VERSAO = process.env.WHATSAPP_API_VERSAO || "v24.0";
const API = `https://graph.facebook.com/${VERSAO}`;

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_NUMERO_ID);
}

export function numeroDoBalbina(): string | null {
  const n = (process.env.WHATSAPP_NUMERO ?? "").replace(/\D/g, "");
  return n || null;
}

async function chamar(caminho: string, corpo: unknown): Promise<{ ok: boolean; erro?: string }> {
  const r = await fetch(`${API}/${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  if (r.ok) return { ok: true };
  const dados = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  return { ok: false, erro: dados.error?.message ?? `HTTP ${r.status}` };
}

// Texto livre: só vale como resposta, dentro de 24 horas da última mensagem da pessoa.
export async function enviarTexto(para: string, texto: string) {
  if (!whatsappConfigurado()) return { ok: false, erro: "WhatsApp não configurado" };
  return chamar(`${process.env.WHATSAPP_NUMERO_ID}/messages`, {
    messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 4000), preview_url: false },
  });
}

export async function enviarModelo(para: string, modelo: "balbina_aviso" | "balbina_cobranca", parametros: string[]) {
  if (!whatsappConfigurado()) return { ok: false, erro: "WhatsApp não configurado" };
  return chamar(`${process.env.WHATSAPP_NUMERO_ID}/messages`, {
    messaging_product: "whatsapp", to: para, type: "template",
    template: {
      name: modelo, language: { code: "pt_BR" },
      components: [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: parametroModelo(p) })) }],
    },
  });
}

// Foto ou documento recebido: a Meta dá o endereço temporário do arquivo, baixado com o mesmo token.
export async function baixarMidia(id: string, maximo: number): Promise<{ base64: string; tipo: string; tamanho: number } | { erro: string }> {
  const cabecalho = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const info = await fetch(`${API}/${encodeURIComponent(id)}`, { headers: cabecalho, signal: AbortSignal.timeout(15_000) });
  if (!info.ok) return { erro: `não consegui baixar o arquivo (HTTP ${info.status})` };
  const { url, mime_type, file_size } = (await info.json()) as { url?: string; mime_type?: string; file_size?: number };
  if (!url) return { erro: "arquivo sem endereço" };
  if (Number(file_size) > maximo) return { erro: "arquivo grande demais" };
  const arquivo = await fetch(url, { headers: cabecalho, signal: AbortSignal.timeout(30_000) });
  if (!arquivo.ok) return { erro: `não consegui baixar o arquivo (HTTP ${arquivo.status})` };
  const bytes = Buffer.from(await arquivo.arrayBuffer());
  if (bytes.length > maximo) return { erro: "arquivo grande demais" };
  return { base64: bytes.toString("base64"), tipo: (mime_type ?? "").split(";")[0].trim().toLowerCase(), tamanho: bytes.length };
}

// Mesmo aviso do push, no WhatsApp de quem ligou o celular (e tem a permissão, quando informada).
export async function avisarPorWhatsApp(db: SupabaseClient, empresaId: string, aviso: { titulo: string; texto: string }, permissao?: string): Promise<number> {
  if (!whatsappConfigurado()) return 0;
  const { data } = await db.rpc("whatsapp_destinos", { p_empresa: empresaId, p_perm: permissao ?? null });
  const envios = await Promise.all(((data ?? []) as { telefone: string }[]).map(async (d) => {
    try {
      const r = await enviarModelo(d.telefone, "balbina_aviso", [aviso.titulo, aviso.texto]);
      if (!r.ok) console.error("aviso por WhatsApp", empresaId, r.erro);
      return r.ok ? 1 : 0;
    } catch (e) {
      console.error("aviso por WhatsApp", empresaId, e);
      return 0;
    }
  }));
  return envios.reduce<number>((s, n) => s + n, 0);
}
