import { tokenConfere } from "@/lib/asaas-mapa";
import { focus } from "@/lib/focus";
import { lerRetorno, origensDoAviso, refDaNota, rotaFocus, type RetornoFocus } from "@/lib/focus-mapa";
import { createAdminClient } from "@/lib/supabase/admin";

// Aviso da Focus NFe quando a SEFAZ autoriza, rejeita ou cancela uma nota.
// O cadastro do aviso (em Notas fiscais) manda FOCUS_NFE_WEBHOOK_TOKEN no header Authorization.
// O corpo só diz qual nota mudou: a situação é lida de novo na API da Focus com o token da piscicultura,
// para quem souber o token do aviso não conseguir marcar uma nota como autorizada.
export async function POST(request: Request) {
  if (!tokenConfere(request.headers.get("authorization"), process.env.FOCUS_NFE_WEBHOOK_TOKEN)) {
    return Response.json({ erro: "token inválido" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as { ref?: string } | null;
  if (!corpo?.ref) return Response.json({ erro: "aviso sem ref" }, { status: 400 });

  const db = createAdminClient();
  const { data: nota } = await db.from("notas_fiscais").select("id, empresa_id, modelo").eq("provedor_ref", corpo.ref).maybeSingle();
  if (!nota) return Response.json({ ok: true, ignorado: true });

  let retorno: RetornoFocus;
  try {
    const { status, dados } = await focus<RetornoFocus>(nota.empresa_id, `${rotaFocus(nota.modelo)}/${refDaNota(nota.id)}`);
    if (status === 404) return Response.json({ ok: true, ignorado: true });
    retorno = dados;
  } catch (e) {
    console.error("webhook focus: consulta", e instanceof Error ? e.message : e);
    return Response.json({ erro: "não foi possível consultar a nota" }, { status: 502 }); // a Focus reenvia
  }

  const campos = lerRetorno(retorno);
  const { error } = await db.from("notas_fiscais").update({
    ...campos, updated_at: new Date().toISOString(), ...(campos.status === "autorizada" ? { emitida_em: new Date().toISOString() } : {}),
  }).eq("id", nota.id).in("status", origensDoAviso(campos.status));
  if (error) {
    console.error("webhook focus", error.message);
    return Response.json({ erro: "falha ao gravar o aviso" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
