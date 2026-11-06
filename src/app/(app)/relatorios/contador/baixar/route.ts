import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { montarPacote } from "@/lib/pacote-contador";
import { getPermissoes } from "@/lib/permissoes";

export const maxDuration = 60;

// Baixa o pacote do contador do mês (E1, docs/automacoes.md).
export async function GET(request: Request) {
  const { pode } = await getPermissoes();
  if (!pode("relatorios.ver")) return new Response("Sem permissão", { status: 403 });
  const { atual } = await getEmpresaAtual();
  const pedido = new URL(request.url).searchParams.get("mes") ?? "";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hojeISO(atual.fuso).slice(0, 7);
  const { zip, nome } = await montarPacote(atual, mes, { relatorios: true, notas: pode("notas.ver") });
  return new Response(zip as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
