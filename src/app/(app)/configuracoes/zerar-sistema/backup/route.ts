import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO } from "@/lib/formato";
import { getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

// Cópia (JSON) de tudo que "Zerar todo o sistema" apaga, para baixar antes de zerar.
// Tabela nova que entrar em public.zerar_sistema entra aqui também (supabase/tests/99_zerar_sistema.sql lista as duas).
const TABELAS: { tabela: string; ordem: string[]; colunas?: string }[] = [
  // financeiro
  { tabela: "contas_financeiras", ordem: ["id"] },
  { tabela: "agendamentos", ordem: ["id"] },
  { tabela: "agendamento_rateios", ordem: ["id"] },
  { tabela: "baixas", ordem: ["id"] },
  { tabela: "transferencias", ordem: ["id"] },
  { tabela: "recorrencias", ordem: ["id"] },
  { tabela: "recorrencia_reajustes", ordem: ["id"] },
  { tabela: "cobrancas", ordem: ["id"] },
  { tabela: "remessas_cnab", ordem: ["id"] },
  { tabela: "pagamentos_saida", ordem: ["id"] },
  { tabela: "whatsapp_cobrancas", ordem: ["agendamento_id", "faixa"] },
  { tabela: "importacoes_extrato", ordem: ["id"] },
  { tabela: "movimentos_bancarios", ordem: ["id"] },
  { tabela: "conciliacoes", ordem: ["id"] },
  { tabela: "movimentos_apagados", ordem: ["conta_id", "id_externo"] },
  { tabela: "periodos_fechados", ordem: ["mes"] },
  // fiscal e comercial
  { tabela: "notas_fiscais", ordem: ["id"] },
  { tabela: "inutilizacoes_nfe", ordem: ["id"] },
  { tabela: "nfes_recebidas", ordem: ["id"] },
  { tabela: "pedidos_venda", ordem: ["id"], colunas: "*, pedido_itens(*)" },
  { tabela: "pedidos_fixos_gerados", ordem: ["pedido_fixo_id", "entrega"] },
  { tabela: "compras_grupo", ordem: ["id"] },
  { tabela: "transferencias_peixe", ordem: ["id"] },
  { tabela: "transferencia_peixe_itens", ordem: ["id"] },
  // estoque e produção
  { tabela: "movimentos_estoque", ordem: ["id"] },
  { tabela: "racao_entradas", ordem: ["id"] },
  { tabela: "racao_estornos", ordem: ["id"] },
  { tabela: "racao_ajustes", ordem: ["id"] },
  { tabela: "ordens_producao_racao", ordem: ["id"] },
  { tabela: "lotes", ordem: ["id"] },
  { tabela: "lote_alocacoes", ordem: ["id"] },
  { tabela: "lote_transferencias", ordem: ["id"] },
  { tabela: "custos_lote_mensal", ordem: ["lote_id", "mes"] },
  { tabela: "apontamentos_diarios", ordem: ["id"] },
  { tabela: "apontamento_lancamentos", ordem: ["id"] },
  { tabela: "apontamento_racoes", ordem: ["id"] },
  { tabela: "apontamento_checklist", ordem: ["lancamento_id", "item_id"] },
  { tabela: "apontamentos_lixeira", ordem: ["id"] },
  { tabela: "eventos_sanitarios", ordem: ["id"] },
  { tabela: "despescas", ordem: ["id"] },
  { tabela: "biometrias", ordem: ["id"] },
  { tabela: "leituras_sonda", ordem: ["id"] },
  { tabela: "sondas", ordem: ["id"] },
  // Manutenção e documentos
  { tabela: "documentos", ordem: ["id"] },
  { tabela: "documentos_recebidos", ordem: ["id"] },
];
const PAGINA = 1000;

export async function GET() {
  if (!(await getPermissoes()).master) return new Response("Sem permissão", { status: 403 });
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const dados: Record<string, unknown[]> = {};
  for (const { tabela, ordem, colunas = "*" } of TABELAS) {
    const linhas: unknown[] = [];
    for (let de = 0; ; de += PAGINA) {
      let consulta = supabase.from(tabela).select(colunas).eq("empresa_id", atual.id);
      for (const coluna of ordem) consulta = consulta.order(coluna);
      const { data, error } = await consulta.range(de, de + PAGINA - 1);
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
      "Content-Disposition": `attachment; filename="sistema-backup-${hojeISO(atual.fuso)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
