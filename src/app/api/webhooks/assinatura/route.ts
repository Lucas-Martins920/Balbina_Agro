import { idAsaas, tokenConfere } from "@/lib/asaas-mapa";
import { AsaasErro } from "@/lib/asaas";
import { balbinaAsaas } from "@/lib/assinatura";
import { eventoDaAssinatura, eventoDoPagamento, lerEventoAssinatura, type EventoAssinatura, type PagamentoAsaas } from "@/lib/assinatura-mapa";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook do Asaas da conta do Balbina (mensalidade das pisciculturas). Configure no painel do Asaas
// com o mesmo token de BALBINA_ASAAS_WEBHOOK_TOKEN. Pagamento confirmado libera o acesso.
export async function POST(request: Request) {
  if (!tokenConfere(request.headers.get("asaas-access-token"), process.env.BALBINA_ASAAS_WEBHOOK_TOKEN)) {
    return Response.json({ erro: "token inválido" }, { status: 401 });
  }
  const evento = await request.json().catch(() => null);
  if (!evento?.id) return Response.json({ erro: "evento sem id" }, { status: 400 });
  if (!lerEventoAssinatura(evento)) return Response.json({ ok: true, ignorado: true });

  const db = createAdminClient();
  const { data: novo, error: erroEvento } = await db.from("webhook_eventos")
    .upsert({ provedor: "asaas_balbina", id_evento: evento.id, payload: evento }, { onConflict: "provedor,id_evento", ignoreDuplicates: true })
    .select("id");
  if (erroEvento) return Response.json({ erro: "falha ao registrar" }, { status: 500 });
  if (!novo?.length) {
    const { data: antes } = await db.from("webhook_eventos").select("processado_em, erro").eq("provedor", "asaas_balbina").eq("id_evento", evento.id).single();
    if (antes?.processado_em && !antes.erro) return Response.json({ ok: true, repetido: true });
  }

  let erro: string | null = null;
  let lido: EventoAssinatura | null = null;
  try {
    lido = await conferirNoAsaas(evento);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Falha ao consultar o Asaas";
  }
  if (lido) {
    const { error } = await db.rpc("registrar_evento_assinatura", {
      p_assinatura: lido.assinatura, p_evento: lido.evento, p_vencimento: lido.vencimento, p_fatura_url: lido.fatura_url,
    });
    erro = error?.message ?? null;
  }
  await db.from("webhook_eventos").update({ processado_em: new Date().toISOString(), erro }).eq("provedor", "asaas_balbina").eq("id_evento", evento.id);
  // 500 faz o Asaas tentar de novo
  return erro ? Response.json({ erro: "falha ao processar" }, { status: 500 }) : Response.json({ ok: true });
}

// Lê na API do Asaas a cobrança ou a assinatura do aviso; o corpo do aviso só serve para saber qual.
// Timeout curto porque o Asaas pausa a fila se o webhook demora.
async function conferirNoAsaas(evento: { event?: string; payment?: { id?: string }; subscription?: { id?: string } }): Promise<EventoAssinatura | null> {
  if ((evento.event ?? "").startsWith("SUBSCRIPTION_")) {
    const id = idAsaas(evento.subscription?.id, "sub");
    if (!id) return null;
    const assinatura = await balbinaAsaas<{ id?: string; status?: string; deleted?: boolean }>(`/subscriptions/${id}`, { timeoutMs: 5000 })
      // assinatura que o Asaas não acha mais foi removida
      .catch((e) => (e instanceof AsaasErro && e.status === 404 ? { id, deleted: true } : Promise.reject(e)));
    return eventoDaAssinatura(assinatura);
  }
  const id = idAsaas(evento.payment?.id, "pay");
  if (!id) return null;
  return eventoDoPagamento(await balbinaAsaas<PagamentoAsaas>(`/payments/${id}`, { timeoutMs: 5000 }));
}
