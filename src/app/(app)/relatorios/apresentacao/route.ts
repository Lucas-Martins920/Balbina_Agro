import { carregarAnalise } from "@/lib/analise-periodo-dados";
import { montarRoteiro } from "@/lib/apresentacao";
import { apresentacaoPdf } from "@/lib/apresentacao-pdf";
import { apresentacaoPptx } from "@/lib/apresentacao-pptx";
import { nomeEmpresa } from "@/lib/empresa";
import { formatarData, hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";

const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// Apresentação pronta do resultado do período (Relatórios > Análise do período), em PDF ou PowerPoint.
export async function GET(request: Request) {
  if (!(await getPermissoes()).pode("relatorios.ver")) return new Response("Sem permissão", { status: 403 });
  const url = new URL(request.url);
  const { analise, empresa } = await carregarAnalise(Object.fromEntries(url.searchParams));
  const roteiro = montarRoteiro(analise, nomeEmpresa(empresa), formatarData(hojeISO(empresa.fuso)));
  const p = analise.periodos.atual;
  const nome = `resultado-${p.de}${p.ate === p.de ? "" : `-a-${p.ate}`}`;
  const pptx = url.searchParams.get("formato") === "pptx";
  const conteudo = pptx ? await apresentacaoPptx(roteiro) : apresentacaoPdf(roteiro);
  return new Response(conteudo, {
    headers: {
      "Content-Type": pptx ? PPTX : "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}.${pptx ? "pptx" : "pdf"}"`,
      "Cache-Control": "no-store",
    },
  });
}
