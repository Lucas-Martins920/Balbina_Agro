// Chat de IA sem internet, pelo Ollama (https://ollama.com): um modelo aberto (mistral, neural-chat...) rodando
// num computador da fazenda. Vale nos dois lados:
//
// - Servidor (/api/chat/manejo): quando o Balbina roda na fazenda (npm run local ou npm run start num computador
//   da sede), OLLAMA_URL aponta para o Ollama da própria máquina. Se o Claude não está ligado, passou do limite do
//   mês ou não respondeu (sem internet), a pergunta vai para o Ollama.
// - Navegador (app de campo): sem internet, o celular pergunta direto ao Ollama em NEXT_PUBLIC_OLLAMA_URL. O
//   navegador só deixa uma página https falar com http://localhost (o próprio computador) ou com um endereço https;
//   para o celular no Wi-Fi da sede, o Ollama precisa estar atrás de https (docs/ia-offline.md). O Ollama também
//   precisa liberar a origem do site (OLLAMA_ORIGINS).
//
// Se o Ollama também não responder, o celular responde pela base guardada nele (conhecimento-tambaqui.ts).
// Sem "server-only" e sem import de "@/": roda no navegador, no servidor e nos testes (node --test).

import { z } from "zod";
import { textoBaseConhecimento } from "../campo/conhecimento-tambaqui.ts";
import type { MensagemChat } from "../campo/contexto-chat.ts";
import { INSTRUCOES_MANEJO, RespostaManejo, respostaDaSaida, type RespostaChat } from "../campo/manejo-ia.ts";
import type { ContextoCartoes } from "../campo/propostas.ts";

export const OLLAMA_MODELO_PADRAO = "mistral";
const PRAZO_PADRAO_MS = 60_000;

export type ConfigOllama = { url: string; modelo: string; prazoMs?: number };

export class ErroOllama extends Error {}

function config(url: string | undefined, modelo: string | undefined): ConfigOllama | null {
  const u = url?.trim().replace(/\/+$/, "");
  if (!u) return null;
  try {
    const p = new URL(u);
    if (p.protocol !== "http:" && p.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url: u, modelo: modelo?.trim() || OLLAMA_MODELO_PADRAO };
}

// Servidor: OLLAMA_URL (ex.: http://127.0.0.1:11434) e OLLAMA_MODELO (padrão mistral)
export function configOllamaServidor(env: Record<string, string | undefined> = process.env): ConfigOllama | null {
  return config(env.OLLAMA_URL, env.OLLAMA_MODELO);
}

// Navegador: NEXT_PUBLIC_OLLAMA_URL e NEXT_PUBLIC_OLLAMA_MODELO (o Next troca pelo valor no build)
export function configOllamaNavegador(): ConfigOllama | null {
  return config(process.env.NEXT_PUBLIC_OLLAMA_URL, process.env.NEXT_PUBLIC_OLLAMA_MODELO);
}

type MensagemOllama = { role: "system" | "user" | "assistant"; content: string };

// Uma conversa com saída estruturada: o Ollama recebe o JSON Schema em "format" e só gera JSON nesse formato.
export async function conversarOllama<T>(cfg: ConfigOllama, p: { sistema: string; mensagens: MensagemChat[]; esquema: z.ZodType<T> }): Promise<T> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), cfg.prazoMs ?? PRAZO_PADRAO_MS);
  const mensagens: MensagemOllama[] = [
    { role: "system", content: p.sistema },
    ...p.mensagens.map((m): MensagemOllama => ({ role: m.papel === "pessoa" ? "user" : "assistant", content: m.texto })),
  ];
  let resp: Response;
  try {
    resp = await fetch(`${cfg.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.modelo,
        stream: false,
        format: z.toJSONSchema(p.esquema),
        messages: mensagens,
        options: { temperature: 0.2 },
        keep_alive: "30m", // o modelo fica carregado entre uma pergunta e outra
      }),
      signal: controle.signal,
    });
  } catch (e) {
    throw new ErroOllama(controle.signal.aborted ? "A IA local demorou demais para responder." : `A IA local não está ligada (${cfg.url}).`, { cause: e });
  } finally {
    clearTimeout(prazo);
  }
  const corpo = (await resp.json().catch(() => ({}))) as { message?: { content?: unknown }; error?: unknown };
  if (!resp.ok) {
    const erro = typeof corpo.error === "string" ? corpo.error : `erro ${resp.status}`;
    if (resp.status === 404 && /model/i.test(erro)) throw new ErroOllama(`O modelo ${cfg.modelo} não está baixado no Ollama (rode: ollama pull ${cfg.modelo}).`);
    throw new ErroOllama(`A IA local falhou (${erro}).`);
  }
  const texto = corpo.message?.content;
  if (typeof texto !== "string") throw new ErroOllama("A IA local respondeu num formato inesperado.");
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErroOllama("A IA local não respondeu em JSON.");
  }
  const v = p.esquema.safeParse(json);
  if (!v.success) throw new ErroOllama("A IA local respondeu faltando campos.");
  return v.data;
}

// Chat de manejo pelo Ollama, com as mesmas instruções e o mesmo formato do Claude (manejo-ia.ts)
export async function responderManejoOllama(cfg: ConfigOllama, p: { mensagens: MensagemChat[]; dados: string; ctx: ContextoCartoes }): Promise<RespostaChat> {
  const saida = await conversarOllama(cfg, {
    sistema: `${INSTRUCOES_MANEJO}\n\n${textoBaseConhecimento()}\n\n${p.dados}`,
    mensagens: p.mensagens,
    esquema: RespostaManejo,
  });
  return respostaDaSaida(saida, p.ctx);
}

// O Ollama está ligado e com o modelo baixado? (GET /api/chat mostra para a tela de configuração)
export async function situacaoOllama(cfg: ConfigOllama, prazoMs = 2_000): Promise<{ online: boolean; modelo: boolean }> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), prazoMs);
  try {
    const r = await fetch(`${cfg.url}/api/tags`, { signal: controle.signal });
    if (!r.ok) return { online: false, modelo: false };
    const { models } = (await r.json().catch(() => ({}))) as { models?: { name?: string; model?: string }[] };
    const nomes = (models ?? []).flatMap((m) => [m.name, m.model]).filter((n): n is string => typeof n === "string");
    return { online: true, modelo: nomes.some((n) => n === cfg.modelo || n.split(":")[0] === cfg.modelo) };
  } catch {
    return { online: false, modelo: false };
  } finally {
    clearTimeout(prazo);
  }
}
