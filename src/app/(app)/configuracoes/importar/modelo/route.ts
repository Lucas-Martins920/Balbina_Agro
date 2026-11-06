import { MODELOS, modeloCsv, type TipoModelo } from "@/lib/importacao-modelo";
import { modeloXlsx } from "@/lib/importacao-modelo-xlsx";
import { getPermissoes } from "@/lib/permissoes";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Modelo para baixar: xlsx com todas as abas que o plano permite, ou csv de um tipo.
export async function GET(request: Request) {
  const { master, noPlano } = await getPermissoes();
  if (!master) return new Response("Sem permissão", { status: 403 });
  const url = new URL(request.url);
  const permitidos = MODELOS.filter((m) => !m.financeiro || noPlano("financeiro"));
  const cabecalhos = (nome: string, tipo: string) => ({
    "Content-Type": tipo, "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store",
  });
  if (url.searchParams.get("formato") === "csv") {
    const m = permitidos.find((x) => x.tipo === url.searchParams.get("tipo"));
    if (!m) return new Response("Modelo não encontrado", { status: 404 });
    return new Response(modeloCsv(m.tipo), { headers: cabecalhos(`balbina-modelo-${m.tipo}.csv`, "text/csv; charset=utf-8") });
  }
  const xlsx = await modeloXlsx(permitidos.map((m) => m.tipo as TipoModelo));
  return new Response(xlsx, { headers: cabecalhos("balbina-modelo-importacao.xlsx", XLSX) });
}
