import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// Cópia (JSON) de tudo que "Zerar financeiro" apaga, para baixar antes de zerar.
const TABELAS: { tabela: string; ordem: string }[] = [
  { tabela: "contas_financeiras", ordem: "id" },
  { tabela: "agendamentos", ordem: "id" },
  { tabela: "agendamento_rateios", ordem: "id" },
  { tabela: "baixas", ordem: "id" },
  { tabela: "transferencias", ordem: "id" },
  { tabela: "recorrencias", ordem: "id" },
  { tabela: "cobrancas", ordem: "id" },
  { tabela: "remessas_cnab", ordem: "id" },
  { tabela: "pagamentos_saida", ordem: "id" },
  { tabela: "importacoes_extrato", ordem: "id" },
  { tabela: "movimentos_bancarios", ordem: "id" },
  { tabela: "conciliacoes", ordem: "id" },
  { tabela: "periodos_fechados", ordem: "mes" },
];
const PAGINA = 1000;

export async function GET() {
  if (!(await getPermissoes()).master) return new Response("Sem permissão", { status: 403 });
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const dados: Record<string, unknown[]> = {};
  for (const { tabela, ordem } of TABELAS) {
    const linhas: unknown[] = [];
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await supabase.from(tabela).select("*").eq("empresa_id", atual.id).order(ordem).range(de, de + PAGINA - 1);
      if (error) return new Response(`Erro ao ler ${tabela}: ${error.message}`, { status: 500 });
      linhas.push(...(data ?? []));
      if (!data || data.length < PAGINA) break;
    }
    dados[tabela] = linhas;
  }
  const corpo = JSON.stringify({ empresa: { id: atual.id, razao_social: atual.razao_social }, gerado_em: new Date().toISOString(), dados });
  return new Response(corpo, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-backup-${hojeISO(atual.fuso)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
