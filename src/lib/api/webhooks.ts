import "server-only";
import { lookup } from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decifrar } from "@/lib/cripto";
import { assinarWebhook, ipPrivado } from "./regras";

type Entrega = { id: string; empresa_id: string; evento: string; dados: unknown; criado_em: string; url: string; segredo_cifrado: string };

// Entrega os eventos pendentes da fila (api_webhook_entregas). Cada POST leva o cabeçalho
// X-Balbina-Assinatura (HMAC-SHA256 com o segredo do webhook); resposta 2xx conta como entregue,
// o resto volta para a fila com espera crescente (1, 2, 4... minutos, até 8 tentativas).
export async function entregarWebhooks(db: SupabaseClient, limite = 50) {
  const { data, error } = await db.rpc("api_reservar_entregas", { p_limite: limite });
  if (error) throw new Error(error.message);
  const entregas = (data ?? []) as Entrega[];
  let entregues = 0;
  // poucas por vez para um destino lento não segurar a rotina inteira
  for (let i = 0; i < entregas.length; i += 5) {
    const resultados = await Promise.all(entregas.slice(i, i + 5).map((e) => entregar(e)));
    for (const [j, r] of resultados.entries()) {
      if (r.ok) entregues += 1;
      await db.rpc("api_registrar_entrega", { p_entrega: entregas[i + j].id, p_status: r.status, p_erro: r.ok ? null : r.erro });
    }
  }
  return { reservadas: entregas.length, entregues };
}

async function entregar(e: Entrega): Promise<{ ok: boolean; status: number | null; erro: string }> {
  try {
    const url = new URL(e.url);
    // confere o IP na hora: um domínio público pode apontar para a rede interna
    const enderecos = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
    if (enderecos.length === 0 || enderecos.some((a) => ipPrivado(a.address))) {
      return { ok: false, status: null, erro: "Endereço do webhook aponta para rede interna" };
    }
    const corpo = JSON.stringify({ id: e.id, evento: e.evento, criado_em: e.criado_em, empresa_id: e.empresa_id, dados: e.dados });
    const resposta = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Balbina-Webhooks/1",
        "X-Balbina-Evento": e.evento,
        "X-Balbina-Entrega": e.id,
        "X-Balbina-Assinatura": assinarWebhook(decifrar(e.segredo_cifrado), corpo, Math.floor(Date.now() / 1000)),
      },
      body: corpo,
    });
    await resposta.body?.cancel();
    return resposta.ok ? { ok: true, status: resposta.status, erro: "" } : { ok: false, status: resposta.status, erro: `Destino respondeu ${resposta.status}` };
  } catch (erro) {
    return { ok: false, status: null, erro: erro instanceof Error ? erro.message : "Falha ao entregar" };
  }
}
