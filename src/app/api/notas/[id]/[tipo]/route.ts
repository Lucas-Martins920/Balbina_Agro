import { baixarArquivoFocus } from "@/lib/focus";
import { caminhoArquivoValido } from "@/lib/focus-mapa";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// DANFE, XML da nota, do cancelamento, da carta de correção e da inutilização. A nota é lida com o
// usuário (RLS), então só sai arquivo de nota da empresa dele.
const ARQUIVOS: Record<string, { coluna: string; tipo: string; nome: (n: string) => string }> = {
  danfe: { coluna: "danfe_path", tipo: "application/pdf", nome: (n) => `DANFE-${n}.pdf` },
  xml: { coluna: "xml_path", tipo: "application/xml", nome: (n) => `NFe-${n}.xml` },
  cancelamento: { coluna: "xml_cancelamento_path", tipo: "application/xml", nome: (n) => `NFe-${n}-cancelamento.xml` },
  "cce-pdf": { coluna: "cce_pdf_path", tipo: "application/pdf", nome: (n) => `CCe-${n}.pdf` },
  "cce-xml": { coluna: "cce_xml_path", tipo: "application/xml", nome: (n) => `CCe-${n}.xml` },
};

export async function GET(_: Request, { params }: RouteContext<"/api/notas/[id]/[tipo]">) {
  const { id, tipo } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Nota não encontrada", { status: 404 });
  if (!(await getPermissoes()).pode("notas.ver")) return new Response("Sem acesso às notas fiscais", { status: 403 });
  const supabase = await createClient();
  let caminho: string | null = null;
  let nome = "";
  let conteudo = "application/xml";
  if (tipo === "inutilizacao") {
    const { data } = await supabase.from("inutilizacoes_nfe").select("xml_path, serie, numero_inicial, numero_final").eq("id", id).maybeSingle();
    caminho = data?.xml_path ?? null;
    nome = `inutilizacao-${data?.serie}-${data?.numero_inicial}-${data?.numero_final}.xml`;
  } else {
    const arquivo = ARQUIVOS[tipo];
    if (!arquivo) return new Response("Arquivo desconhecido", { status: 404 });
    const { data } = await supabase.from("notas_fiscais").select(`${arquivo.coluna}, chave_acesso, numero`).eq("id", id).maybeSingle();
    const linha = data as Record<string, string | null> | null;
    caminho = linha?.[arquivo.coluna] ?? null;
    nome = arquivo.nome(linha?.chave_acesso ?? String(linha?.numero ?? id));
    conteudo = arquivo.tipo;
  }
  if (!caminhoArquivoValido(caminho)) return new Response("Arquivo ainda não disponível", { status: 404 });
  const resposta = await baixarArquivoFocus(caminho!);
  if (!resposta.ok) return new Response("A Focus NFe não entregou o arquivo. Tente de novo em instantes.", { status: 502 });
  return new Response(resposta.body, {
    headers: {
      "Content-Type": conteudo,
      // PDF abre no navegador (para imprimir o DANFE); XML baixa
      "Content-Disposition": `${conteudo === "application/pdf" ? "inline" : "attachment"}; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
