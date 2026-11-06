import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { diasAtrasISO, hojeISO } from "@/lib/formato";
import { cursorSeguinte, linhaDaTransacao, statusDoItem, type ContaPluggy, type TransacaoPluggy } from "@/lib/open-finance-mapa";
import { aplicarRegrasEmPartes, type Parte, type Ponto } from "@/lib/regras-em-partes";

// Open Finance pela Pluggy (agregador autorizado pelo Banco Central). A piscicultura conecta o banco
// no widget da Pluggy; o ERP lê contas e lançamentos com PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET.
const API = "https://api.pluggy.ai";

export function openFinanceConfigurado() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

// A chave da API vale 2 horas; guardamos por 1h50 na instância do servidor.
let chaveCache: { valor: string; ate: number } | null = null;

async function chaveApi() {
  if (chaveCache && chaveCache.ate > Date.now()) return chaveCache.valor;
  if (!openFinanceConfigurado()) throw new Error("O Open Finance não está configurado no servidor (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET).");
  const r = await fetch(`${API}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`A Pluggy recusou as credenciais (${r.status}). Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.`);
  const { apiKey } = (await r.json()) as { apiKey: string };
  chaveCache = { valor: apiKey, ate: Date.now() + 110 * 60 * 1000 };
  return apiKey;
}

async function pluggy<T>(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const enviar = async () => fetch(`${API}${caminho}`, {
    method: init.method ?? "GET",
    headers: { "X-API-KEY": await chaveApi(), "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  let r = await enviar();
  if (r.status === 401 || r.status === 403) {
    chaveCache = null; // chave vencida antes da hora
    r = await enviar();
  }
  const texto = await r.text();
  if (!r.ok) throw new Error(`Pluggy recusou (${r.status}): ${texto.slice(0, 200)}`);
  return (texto ? JSON.parse(texto) : {}) as T;
}

export type ItemPluggy = {
  id: string;
  status: string;
  clientUserId?: string | null;
  connector?: { name?: string } | null;
  error?: { message?: string } | null;
};

// Token de 30 minutos para o widget. clientUserId amarra o banco conectado à empresa.
export async function criarTokenConexao(empresaId: string, itemId?: string) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const segredo = process.env.PLUGGY_WEBHOOK_TOKEN;
  const webhookUrl = site?.startsWith("https://") && segredo
    ? `${site.replace(/\/$/, "")}/api/webhooks/pluggy?token=${encodeURIComponent(segredo)}` : undefined;
  const { accessToken } = await pluggy<{ accessToken: string }>("/connect_token", {
    method: "POST",
    body: { ...(itemId ? { itemId } : {}), options: { clientUserId: empresaId, avoidDuplicates: true, ...(webhookUrl ? { webhookUrl } : {}) } },
  });
  return accessToken;
}

export const buscarItem = (itemId: string) => pluggy<ItemPluggy>(`/items/${encodeURIComponent(itemId)}`);

export async function buscarContas(itemId: string) {
  return (await pluggy<{ results: ContaPluggy[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`)).results;
}

// GET /transactions paginado por página foi desligado pela Pluggy (410): a v2 usa cursor
export async function buscarTransacoes(contaId: string, desde: string) {
  const todas: TransacaoPluggy[] = [];
  let after: string | null = null;
  for (let pagina = 0; pagina < 200; pagina++) {
    const q = new URLSearchParams({ accountId: contaId, dateFrom: desde, dateTo: hojeISO(), ...(after ? { after } : {}) });
    const r = await pluggy<{ results: TransacaoPluggy[]; next: string | null }>(`/v2/transactions?${q}`);
    todas.push(...r.results);
    after = cursorSeguinte(r.next);
    if (!after) break;
  }
  return todas;
}

export async function removerItem(itemId: string) {
  await pluggy(`/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}

export type ResultadoSincronizacao = { novas: number; porRegra: number; contas: number };

type Conexao = { id: string; empresa_id: string; item_id: string; instituicao: string | null; ultima_sincronizacao: string | null };

// Traz o extrato de cada conta ligada à conexão. Funciona com o cliente do usuário (botão
// "Sincronizar") ou com o cliente admin (rotina diária e webhook). Reimportar é seguro:
// o banco ignora lançamentos já importados pelo id da transação.
export async function sincronizarConexao(db: SupabaseClient, conexao: Conexao): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = { novas: 0, porRegra: 0, contas: 0 };
  try {
    const item = await buscarItem(conexao.item_id);
    // as credenciais da Pluggy são do servidor: o item tem de ter sido aberto por esta empresa
    if (item.clientUserId !== conexao.empresa_id) throw new Error("Esta conexão não pertence a esta empresa.");
    const status = statusDoItem(item.status);
    const { data: contas, error } = await db.from("contas_financeiras").select("id, open_finance_conta_id, saldo_inicial_data")
      .eq("empresa_id", conexao.empresa_id).eq("open_finance_item_id", conexao.item_id).eq("arquivada", false)
      .not("open_finance_conta_id", "is", null);
    if (error) throw new Error(error.message);

    const saldos = new Map((await buscarContas(conexao.item_id)).map((c) => [c.id, c.balance]));
    // depois da primeira leitura, basta olhar as últimas semanas (lançamentos chegam com atraso de até alguns dias)
    const janela = conexao.ultima_sincronizacao ? diasAtrasISO(20) : null;
    for (const conta of contas ?? []) {
      if (!saldos.has(conta.open_finance_conta_id)) continue; // conta que não é deste item
      const inicio = janela && janela > conta.saldo_inicial_data ? janela : conta.saldo_inicial_data;
      const linhas = (await buscarTransacoes(conta.open_finance_conta_id, inicio))
        .map(linhaDaTransacao)
        .filter((l) => l !== null && l.data >= conta.saldo_inicial_data);
      if (linhas.length) {
        const { data, error: e } = await db.rpc("importar_extrato", {
          p_conta: conta.id, p_origem: "open_finance", p_linhas: linhas, p_arquivo: `Open Finance ${conexao.instituicao ?? ""}`.trim(),
        });
        if (e) throw new Error(e.message);
        const r = data as { importacao_id: string; novas: number; por_regra?: number; regras_fim?: boolean } & Ponto;
        resultado.novas += r.novas;
        resultado.porRegra += r.por_regra ?? 0;
        if (r.regras_fim === false) {
          // o banco aplica as regras em partes de ~3 s; continua de onde parou
          const resto = await aplicarRegrasEmPartes(async (ponto) => {
            const { data: parte, error: e2 } = await db.rpc("aplicar_regras_lote", {
              p_conta: conta.id, p_importacao: r.importacao_id, p_apos_data: ponto.apos_data, p_apos_id: ponto.apos_id,
            });
            if (e2) throw new Error(e2.message);
            return parte as Parte;
          }, { inicio: { apos_data: r.apos_data, apos_id: r.apos_id }, prazoMs: 40_000 });
          resultado.porRegra += resto.aplicadas;
        }
      }
      const saldo = saldos.get(conta.open_finance_conta_id);
      if (saldo !== undefined) {
        await db.from("contas_financeiras").update({ saldo_banco_cents: Math.round(saldo * 100), saldo_banco_em: new Date().toISOString() }).eq("id", conta.id);
      }
      resultado.contas++;
    }
    await db.from("conexoes_bancarias").update({
      status, erro: status === "ativa" || status === "atualizando" ? null : item.error?.message ?? null,
      ultima_sincronizacao: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", conexao.id);
    return resultado;
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    await db.from("conexoes_bancarias").update({ status: "erro", erro: mensagem.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", conexao.id);
    throw e;
  }
}
