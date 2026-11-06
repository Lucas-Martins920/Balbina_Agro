import "server-only";
import { decifrar } from "@/lib/cripto";
import { urlFocus } from "@/lib/focus-mapa";
import { createAdminClient } from "@/lib/supabase/admin";

export type AmbienteFocus = "homologacao" | "producao";
export const ambienteFocus = (): AmbienteFocus => (process.env.FOCUS_NFE_AMBIENTE === "producao" ? "producao" : "homologacao");
export const focusBase = () => urlFocus(process.env.FOCUS_NFE_AMBIENTE);
// A API de empresas (cadastro do emitente e do certificado) só existe no servidor de produção da Focus
const BASE_EMPRESAS = "https://api.focusnfe.com.br";
// Sem resposta da Focus nesse tempo, a chamada falha com erro em vez de prender a tela/função.
const TEMPO_FOCUS_MS = 30_000;

// Token da piscicultura, gravado quando ela cadastrou o emitente pelo app. Sem cadastro, vale o token único
// do servidor (FOCUS_NFE_TOKEN), que só emite para os CNPJs/CPFs da conta Focus do dono do servidor.
// Quem chama garante que empresaId é da empresa do usuário (lida pelo RLS).
export async function tokenFocus(empresaId: string) {
  let cifrado: string | null | undefined;
  if (process.env.SUPABASE_SECRET_KEY) {
    const { data } = await createAdminClient().from("focus_emitentes_segredos")
      .select("token_homologacao_cifrado, token_producao_cifrado").eq("emitente_id", empresaId).maybeSingle();
    cifrado = ambienteFocus() === "producao" ? data?.token_producao_cifrado : data?.token_homologacao_cifrado;
  }
  if (cifrado) return decifrar(cifrado);
  const token = process.env.FOCUS_NFE_TOKEN;
  if (!token) throw new Error("A piscicultura ainda não cadastrou o emitente na Focus NFe (em Notas fiscais) e o servidor não tem FOCUS_NFE_TOKEN.");
  return token;
}

async function chamar<T>(url: string, token: string, init: { method?: string; body?: unknown }): Promise<{ status: number; dados: T }> {
  const resposta = await fetch(url, {
    method: init.method ?? "GET",
    // Focus usa Basic auth com o token como usuário e senha vazia
    headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(TEMPO_FOCUS_MS),
  });
  const texto = await resposta.text();
  let dados: T;
  try {
    dados = (texto ? JSON.parse(texto) : {}) as T;
  } catch {
    if (resposta.status === 401) throw new Error("A Focus NFe recusou o token (401). Confira o token do ambiente configurado.");
    throw new Error(`Resposta inesperada da Focus (${resposta.status}): ${texto.slice(0, 200)}`);
  }
  if (resposta.status >= 500) throw new Error(`Focus NFe fora do ar (${resposta.status}). Tente de novo em instantes.`);
  return { status: resposta.status, dados };
}

export async function focus<T>(empresaId: string, caminho: string, init: { method?: string; body?: unknown } = {}) {
  return chamar<T>(`${focusBase()}${caminho}`, await tokenFocus(empresaId), init);
}

// Cadastro de emitentes: usa o token principal da conta Focus do Balbina (revenda)
export async function focusEmpresas<T>(caminho: string, init: { method?: string; body?: unknown } = {}) {
  const token = process.env.FOCUS_NFE_TOKEN_REVENDA;
  if (!token) throw new Error("O servidor ainda não tem o token principal da Focus (FOCUS_NFE_TOKEN_REVENDA) para cadastrar emitentes.");
  return chamar<T>(`${BASE_EMPRESAS}${caminho}`, token, init);
}

// Arquivo da nota (DANFE, XML) guardado na Focus. Os caminhos são públicos no servidor da Focus;
// o app baixa por aqui para não expor o endereço e para conferir que a nota é da empresa do usuário.
export async function baixarArquivoFocus(caminho: string) {
  return fetch(`${focusBase()}${caminho}`, { cache: "no-store", signal: AbortSignal.timeout(TEMPO_FOCUS_MS) });
}

// NF-e emitidas contra o CNPJ da piscicultura (Manifestação do Destinatário). A Focus devolve até 100 por vez;
// a próxima página é pedida com versao = X-Max-Version da anterior.
export type NfeRecebidaFocus = Record<string, unknown> & { chave_nfe?: string; versao?: number };
export async function buscarNfesRecebidas(empresaId: string, cnpj: string, desde: number, paginas = 10) {
  const token = await tokenFocus(empresaId);
  const notas: NfeRecebidaFocus[] = [];
  let versao = desde;
  for (let i = 0; i < paginas; i++) {
    const resposta = await fetch(`${focusBase()}/v2/nfes_recebidas?${new URLSearchParams({ cnpj, versao: String(versao) })}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_FOCUS_MS),
    });
    if (!resposta.ok) throw new Error(`Focus NFe recusou a busca de notas recebidas (${resposta.status}): ${(await resposta.text()).slice(0, 200)}`);
    const lote = (await resposta.json()) as NfeRecebidaFocus[];
    notas.push(...lote);
    const maxima = Number(resposta.headers.get("X-Max-Version") ?? 0);
    if (lote.length < 100 || !(maxima > versao)) {
      versao = Math.max(versao, maxima);
      break;
    }
    versao = maxima;
  }
  return { notas, versao };
}

// XML da nota recebida (completo depois da ciência; antes, só o resumo)
export async function xmlNfeRecebida(empresaId: string, chave: string) {
  const token = await tokenFocus(empresaId);
  return fetch(`${focusBase()}/v2/nfes_recebidas/${chave}.xml`, {
    headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(TEMPO_FOCUS_MS),
  });
}
