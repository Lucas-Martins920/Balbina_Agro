import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { montarLcdpr } from "@/lib/lcdpr-dados";
import { getPermissoes } from "@/lib/permissoes";

// Baixa o LCDPR do ano (E2, docs/automacoes.md).
export async function GET(request: Request) {
  const { pode } = await getPermissoes();
  if (!pode("relatorios.ver")) return new Response("Sem permissão", { status: 403 });
  const { atual } = await getEmpresaAtual();
  const pedido = Number(new URL(request.url).searchParams.get("ano"));
  const ano = Number.isInteger(pedido) && pedido >= 2019 && pedido <= 2100 ? pedido : Number(hojeISO(atual.fuso).slice(0, 4)) - 1;
  const r = await montarLcdpr(atual, ano);
  if ("faltas" in r && r.faltas) return new Response(`Falta no cadastro do LCDPR: ${r.faltas.join(", ")}.`, { status: 422 });
  return new Response(r.arquivo, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${r.nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
