import { asaas, credencialDoPerfil } from "@/lib/asaas";
import { idAsaas, lerPagamento, lerWebhook, situacaoDoEvento, type Pagamento } from "@/lib/asaas-mapa";
import { tokenConfereHash } from "@/lib/cripto";
import { hojeISO } from "@/lib/formato";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Webhook de cobranças do Asaas. Cada conta de piscicultura chama com ?perfil=<id> e o token só dela, que o
// Balbina cadastra ao ligar a conta (guardamos o hash). O aviso antigo sem ?perfil (chave única do servidor,
// ASAAS_WEBHOOK_TOKEN) saiu em 2026-11-02 e passa a responder 401.
// Responde 200 mesmo para eventos ignorados, senão o Asaas pausa a fila.
export async function POST(request: Request) {
  const perfil = new URL(request.url).searchParams.get("perfil");
  const token = request.headers.get("asaas-access-token");
  const db = createAdminClient();
  if (!perfil || !UUID.test(perfil)) return Response.json({ erro: "token inválido" }, { status: 401 });
  const { data: segredo } = await db.from("contas_asaas_segredos").select("webhook_token_sha256").eq("perfil_cobranca_id", perfil).maybeSingle();
  if (!tokenConfereHash(token, segredo?.webhook_token_sha256)) return Response.json({ erro: "token inválido" }, { status: 401 });
  const evento = await request.json().catch(() => null);
  if (!evento?.id) return Response.json({ erro: "evento sem id" }, { status: 400 });

  // aprovação cadastral da conta da piscicultura
  const situacao = situacaoDoEvento(evento.event);
  if (situacao) {
    await db.from("contas_asaas").update({ situacao, updated_at: new Date().toISOString() }).eq("perfil_cobranca_id", perfil);
    return Response.json({ ok: true });
  }

  // webhooks chegam repetidos: o id do evento é único
  const { data: novo, error: erroEvento } = await db.from("webhook_eventos")
    .upsert({ provedor: "asaas", id_evento: evento.id, payload: evento }, { onConflict: "provedor,id_evento", ignoreDuplicates: true })
    .select("id");
  if (erroEvento) return Response.json({ erro: erroEvento.message }, { status: 500 });
  if (!novo?.length) {
    // repetido: só reprocessa se a tentativa anterior falhou (a baixa é idempotente)
    const { data: antes } = await db.from("webhook_eventos").select("processado_em, erro").eq("provedor", "asaas").eq("id_evento", evento.id).single();
    if (antes?.processado_em && !antes.erro) return Response.json({ ok: true, repetido: true });
  }

  const acao = lerWebhook(evento, hojeISO());
  let erro: string | null = null;
  if (acao.acao !== "ignorar") {
    const buscar = (coluna: "id_externo" | "id", valor: string) => {
      const q = db.from("cobrancas").select("id, id_externo, perfil_cobranca_id, status, perfis_cobranca!inner(provedor)")
        .eq(coluna, valor).eq("perfis_cobranca.provedor", "asaas");
      // cada conta só mexe nas cobranças do próprio perfil
      return q.eq("perfil_cobranca_id", perfil);
    };
    let { data: cobrancas } = await buscar("id_externo", acao.pagamento);
    // id do Asaas não gravado (falhou logo depois de criar): acha pela externalReference, conferida na API abaixo
    const referencia = String(evento.payment?.externalReference ?? "");
    if (!cobrancas?.length && acao.acao === "baixar" && UUID.test(referencia)) {
      ({ data: cobrancas } = await buscar("id", referencia));
      cobrancas = (cobrancas ?? []).filter((c) => !c.id_externo);
    }
    for (const c of cobrancas ?? []) {
      if (acao.acao === "baixar") {
        erro = (await baixarConferindo(db, c, acao.pagamento)) ?? erro;
      } else if (c.status !== "paga") {
        const agora = new Date().toISOString();
        const { error } = await db.from("cobrancas").update({ status: acao.status, updated_at: agora, ...(acao.status === "visualizada" ? { visualizada_em: agora } : {}) }).eq("id", c.id);
        if (error) erro = error.message;
      }
    }
  }
  await db.from("webhook_eventos").update({ processado_em: new Date().toISOString(), erro }).eq("provedor", "asaas").eq("id_evento", evento.id);
  // erro de processamento fica registrado; 500 faz o Asaas tentar de novo
  return erro ? Response.json({ erro }, { status: 500 }) : Response.json({ ok: true });
}

type Cobranca = { id: string; id_externo: string | null; perfil_cobranca_id: string; perfis_cobranca: unknown };

// Valor, data e situação vêm da API do Asaas, não do corpo do aviso: um token vazado não baixa nada
// que o Asaas não tenha recebido. Timeout curto porque o Asaas pausa a fila se o webhook demora;
// falha na API devolve erro e o Asaas manda de novo.
async function baixarConferindo(db: ReturnType<typeof createAdminClient>, c: Cobranca, idPagamento: string): Promise<string | null> {
  const id = idAsaas(idPagamento, "pay");
  if (!id) return "Id de pagamento inválido";
  try {
    const cred = await credencialDoPerfil({ id: c.perfil_cobranca_id });
    const pg = lerPagamento(await asaas<Pagamento>(cred, `/payments/${id}`, { timeoutMs: 5000 }), hojeISO());
    if (!pg.pago) return null;
    if (!c.id_externo) {
      if (pg.referencia !== c.id) return null;
      const { error } = await db.from("cobrancas").update({ id_externo: id, updated_at: new Date().toISOString() }).eq("id", c.id).is("id_externo", null);
      if (error) return error.message;
    }
    const { error } = await db.rpc("baixar_cobranca", { p_perfil: c.perfil_cobranca_id, p_id_externo: id, p_valor_cents: pg.valor_cents, p_data: pg.data });
    return error?.message ?? null;
  } catch (e) {
    return e instanceof Error ? e.message : "Falha ao consultar o Asaas";
  }
}
