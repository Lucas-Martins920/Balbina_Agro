import Link from "next/link";
import { ExcluirLinha } from "@/components/excluir-linha";
import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, classeBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { createClient } from "@/lib/supabase/server";
import { exigirAcesso } from "@/lib/permissoes";
import { alternarItemChecklist, criarItemChecklist, excluirItemChecklist } from "../actions";

const APLICA_EM: Record<string, string> = { todos: "Todos os viveiros", alevinagem_recria: "Alevinagem e recria", engorda: "Engorda" };

export default async function PaginaChecklist() {
  await exigirAcesso("apontamentos");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: itens } = await supabase.from("checklist_itens").select("id, nome, tipo, unidade, aplica_em, ativo")
    .eq("empresa_id", atual.id).order("ordem").order("nome");

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo
        acoes={
          <>
            <Link href="/apontamentos" className={classeBotao("secundario", "sm")}>Voltar ao apontamento</Link>
            <BotaoLancamento rotulo="Novo item" acao={criarItemChecklist} botao="Adicionar">
          <Campo rotulo="Item" id="nome" name="nome" required placeholder="Ex.: Bebedouros limpos" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Selecao rotulo="Resposta" id="tipo" name="tipo" defaultValue="sim_nao">
              <option value="sim_nao">Ok / não ok</option>
              <option value="numero">Número</option>
            </Selecao>
            <Campo rotulo="Unidade (se número)" id="unidade" name="unidade" placeholder="Ex.: °C" />
            <Selecao rotulo="Vale para" id="aplica_em" name="aplica_em" defaultValue="todos">
              {Object.entries(APLICA_EM).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </Selecao>
          </div>
        </BotaoLancamento>
          </>
        }
        descricao="O que a equipe confere no viveiro a cada lançamento. Itens de cria e recria só aparecem nos lotes dessas fases; os de engorda, nos lotes em produção.">
        Checklist do viveiro
      </Titulo>

      <Tabela cabecalho={["Item", "Resposta", "Vale para", "Situação", ""]} principal="Item" total={itens?.length ?? 0} vazio="Nenhum item no checklist.">
        {(itens ?? []).map((i) => (
          <tr key={i.id} className={i.ativo ? "" : "text-texto-suave"}>
            <td className="font-medium">{i.nome}</td>
            <td>{i.tipo === "numero" ? `Número${i.unidade ? ` (${i.unidade})` : ""}` : "Ok / não ok"}</td>
            <td>{APLICA_EM[i.aplica_em] ?? i.aplica_em}</td>
            <td>
              <FormAcao acao={alternarItemChecklist} botao={i.ativo ? "Desativar" : "Ativar"} variante="secundario" limparAoSalvar={false}>
                <input type="hidden" name="id" value={i.id} />
                <input type="hidden" name="ativo" value={i.ativo ? "" : "1"} />
              </FormAcao>
            </td>
            <td><ExcluirLinha acao={excluirItemChecklist} id={i.id} /></td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}
