import "server-only";
import { after } from "next/server";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { hashToken } from "@/lib/cripto";
import { supabaseEnv } from "@/lib/env";
import { escopoLiberado, lerPaginacao, lerToken, type Paginacao } from "./regras";
import { entregarWebhooks } from "./webhooks";

// Contexto de uma chamada da API pública. `db` usa a chave de serviço (passa por cima do RLS), por isso
// toda consulta das rotas /api/v1 filtra por `empresaId`. As travas de referência entre empresas
// (mesma_empresa_*) e as regras dos triggers continuam valendo. O cabeçalho x-balbina-chave faz o
// histórico mostrar "API: <nome da chave>".
export type ContextoApi = {
  db: SupabaseClient;
  empresaId: string;
  chaveId: string;
  nome: string;
  escopos: string[];
  modulos: string[] | null;
  fuso: string;
  pode: (escopo: string) => boolean;
};

type Autenticacao = { chave_id: string; empresa_id: string; nome: string; escopos: string[]; modulos: string[] | null; liberada: boolean; fuso: string };

const CABECALHOS = { "Cache-Control": "no-store" };

export function respostaApi(corpo: unknown, status = 200) {
  return Response.json(corpo, { status, headers: CABECALHOS });
}

export function erroApi(status: number, codigo: string, mensagem: string) {
  return Response.json({ erro: { codigo, mensagem } }, { status, headers: CABECALHOS });
}

export function semEscopo(escopo: string) {
  return erroApi(403, "sem_escopo", `A chave não tem o escopo ${escopo} ou o plano da empresa não inclui o módulo.`);
}

function servico(headers?: Record<string, string>) {
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!chave) throw new Error("Defina SUPABASE_SECRET_KEY para a API pública");
  return createClient(supabaseEnv().url, chave, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } });
}

const LIMITE_POR_MINUTO = 300;

async function dentroDoLimite(db: SupabaseClient, chaveId: string) {
  const { data, error } = await db.rpc("api_dentro_do_limite", { p_chave_id: chaveId, p_limite: LIMITE_POR_MINUTO });
  if (error) { console.error("Rate limit:", error.message); return true; }
  return data as boolean;
}

export async function autenticar(request: Request, token: string | null): Promise<ContextoApi | Response> {
  if (!token) return erroApi(401, "nao_autenticado", "Envie a chave da API no cabeçalho Authorization: Bearer balbina_...");
  const { data, error } = await servico().rpc("api_autenticar", { p_hash: hashToken(token) });
  if (error) return erroApi(500, "erro_interno", "Não foi possível conferir a chave agora. Tente de novo.");
  const a = data as Autenticacao | null;
  if (!a) return erroApi(401, "chave_invalida", "Chave inexistente, revogada ou vencida.");
  if (!a.liberada) return erroApi(402, "assinatura_inativa", "A assinatura da empresa no Balbina está suspensa.");
  const db = servico({ "x-balbina-chave": a.chave_id });
  if (!await dentroDoLimite(db, a.chave_id)) return erroApi(429, "limite", `Limite de ${LIMITE_POR_MINUTO} chamadas por minuto por chave.`);
  const acesso = { escopos: a.escopos, modulos: a.modulos };
  return {
    db,
    empresaId: a.empresa_id,
    chaveId: a.chave_id,
    nome: a.nome,
    escopos: a.escopos,
    modulos: a.modulos,
    fuso: a.fuso,
    pode: (escopo) => escopoLiberado(acesso, escopo),
  };
}

// Erro do banco para a resposta: regra de negócio vira 422 com a mensagem do banco; o resto, 500 sem detalhes.
export function erroBanco(error: PostgrestError) {
  if (error.code === "23505") return erroApi(409, "duplicado", "Já existe um registro com estes dados (por exemplo, o mesmo CPF/CNPJ).");
  if (error.code === "23503") return erroApi(422, "referencia_invalida", "Algum id informado não existe nesta empresa.");
  if (error.code === "42501") return erroApi(403, "proibido", error.message);
  if (error.code === "P0002" || error.code === "PGRST116") return erroApi(404, "nao_encontrado", "Registro não encontrado.");
  if (error.code?.startsWith("22") || error.code?.startsWith("23") || error.code === "P0001") {
    return erroApi(422, "regra_de_negocio", error.message);
  }
  console.error("API pública:", error.code, error.message);
  return erroApi(500, "erro_interno", "Erro inesperado. Tente de novo.");
}

export function paginacao(url: URL): Paginacao | Response {
  const p = lerPaginacao(url.searchParams);
  return "erro" in p ? erroApi(400, "parametro_invalido", p.erro) : p;
}

export function pagina<T>(dados: T[] | null, total: number | null, p: Paginacao) {
  const n = total ?? 0;
  return respostaApi({
    dados: dados ?? [],
    pagina: p.pagina,
    por_pagina: p.porPagina,
    total: n,
    proxima_pagina: p.fim + 1 < n ? p.pagina + 1 : null,
  });
}

export async function lerCorpo(request: Request): Promise<unknown | Response> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return erroApi(415, "formato", "Envie o corpo em JSON (Content-Type: application/json).");
  }
  try {
    return await request.json();
  } catch {
    return erroApi(400, "json_invalido", "O corpo não é um JSON válido.");
  }
}

// Toda rota da API: autentica a chave e devolve erro em JSON quando algo foge do previsto.
export function rotaApi<C>(fn: (ctx: ContextoApi, request: Request, contexto: C) => Promise<Response>) {
  return async (request: Request, contexto: C): Promise<Response> => {
    const ctx = await autenticar(request, lerToken(request.headers.get("authorization"), request.headers.get("x-api-key")));
    if (ctx instanceof Response) return ctx;
    try {
      const resposta = await fn(ctx, request, contexto);
      // gravou: os webhooks da empresa saem logo, sem esperar a rotina
      if (request.method !== "GET" && resposta.ok) after(() => entregarWebhooks(servico()).catch(() => undefined));
      return resposta;
    } catch (e) {
      console.error("API pública:", e instanceof Error ? e.message : e);
      return erroApi(500, "erro_interno", "Erro inesperado. Tente de novo.");
    }
  };
}
