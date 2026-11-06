import { xmlNfeRecebida } from "@/lib/focus";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// XML da NF-e de compra. A nota é lida com o usuário (RLS): só sai XML de nota da empresa dele.
export async function GET(_: Request, { params }: RouteContext<"/notas/recebidas/[id]/xml">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Nota não encontrada", { status: 404 });
  if (!(await getPermissoes()).pode("notas.ver")) return new Response("Sem acesso às notas fiscais", { status: 403 });
  const supabase = await createClient();
  const { data: nota } = await supabase.from("nfes_recebidas").select("empresa_id, chave").eq("id", id).maybeSingle();
  if (!nota) return new Response("Nota não encontrada", { status: 404 });
  const resposta = await xmlNfeRecebida(nota.empresa_id, nota.chave);
  if (!resposta.ok) return new Response("A Focus NFe não entregou o XML. Dê ciência na nota e tente de novo em instantes.", { status: 502 });
  return new Response(resposta.body, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="NFe-${nota.chave}.xml"`,
      "Cache-Control": "private, no-store",
    },
  });
}
