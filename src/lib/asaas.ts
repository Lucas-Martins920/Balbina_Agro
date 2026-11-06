import "server-only";
import { ambiente as ambienteDoApp } from "@/lib/ambiente";
import { ambienteAsaas, conferirCredencial, mensagemErroAsaas, urlBase } from "@/lib/asaas-mapa";
import { decifrar } from "@/lib/cripto";
import { createAdminClient } from "@/lib/supabase/admin";

export type Credencial = { chave: string; ambiente: string | undefined };

// Chave da conta Asaas da piscicultura. Quem chama já leu o perfil com o cliente do usuário (RLS), então só
// chega aqui um perfil da empresa dele; o segredo é lido com a chave de serviço e decifrado no servidor.
// A chave única do servidor (credenciais_ref + ASAAS_API_KEY) saiu em 2026-11-02: toda piscicultura liga a própria conta.
export async function credencialDoPerfil(perfil: { id: string }): Promise<Credencial> {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("Defina SUPABASE_SECRET_KEY no servidor para usar a conta Asaas da piscicultura.");
  const db = createAdminClient();
  const [{ data: segredo }, { data: conta }] = await Promise.all([
    db.from("contas_asaas_segredos").select("chave_cifrada").eq("perfil_cobranca_id", perfil.id).maybeSingle(),
    db.from("contas_asaas").select("ambiente").eq("perfil_cobranca_id", perfil.id).maybeSingle(),
  ]);
  if (segredo && conta) return { chave: decifrar(segredo.chave_cifrada), ambiente: ambienteAsaas(conta.ambiente) };
  throw new Error("Conecte a conta Asaas da piscicultura em Cobranças antes de emitir.");
}

// Recusa do Asaas (respondeu com erro). Falha de rede ou tempo esgotado não é AsaasErro: nesses casos
// não dá para saber se o Asaas fez o que pedimos, e quem chama precisa conferir antes de repetir.
export class AsaasErro extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export async function asaas<T>(credencial: Credencial, caminho: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const problema = conferirCredencial(credencial, ambienteDoApp());
  if (problema) throw new AsaasErro(0, problema);
  const resposta = await fetch(`${urlBase(credencial.ambiente)}${caminho}`, {
    method: init.method ?? "GET",
    // sem resposta em 20 s desiste, para a tela não ficar presa (o webhook usa 5 s)
    signal: AbortSignal.timeout(init.timeoutMs ?? 20000),
    headers: { access_token: credencial.chave, "Content-Type": "application/json", "User-Agent": "balbina-erp" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const texto = await resposta.text();
  if (!resposta.ok) throw new AsaasErro(resposta.status, mensagemErroAsaas(resposta.status, texto));
  try {
    return (texto ? JSON.parse(texto) : {}) as T;
  } catch {
    throw new Error("O Asaas respondeu algo que não dá para ler. Tente de novo em instantes.");
  }
}
