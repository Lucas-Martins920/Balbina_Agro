import { NextResponse } from "next/server";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";

type Inscricao = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

// Celular pede para receber avisos (lembrete de apontamento e outros). Guarda a inscrição em nome de quem
// está logado, na empresa atual. DELETE apaga a inscrição deste aparelho.
export async function POST(request: Request) {
  let corpo: Inscricao;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "JSON inválido." }, { status: 400 });
  }
  const endpoint = typeof corpo.endpoint === "string" ? corpo.endpoint : "";
  const p256dh = typeof corpo.keys?.p256dh === "string" ? corpo.keys.p256dh : "";
  const auth = typeof corpo.keys?.auth === "string" ? corpo.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth || endpoint.length > 1000) {
    return NextResponse.json({ erro: "Inscrição inválida." }, { status: 422 });
  }
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  // o mesmo aparelho inscrito antes (outra empresa ou outro login) troca de dono
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_inscricoes").insert({
    empresa_id: atual.id, endpoint, p256dh, auth, aparelho: request.headers.get("user-agent")?.slice(0, 200) ?? null,
  });
  if (error) return NextResponse.json({ erro: "Não foi possível guardar a inscrição." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ erro: "Sem endereço." }, { status: 422 });
  const supabase = await createClient();
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
