import { Cartao, Campo, Selecao, Titulo, classeBotao } from "@/components/ui";
import { exigirAcesso } from "@/lib/permissoes";
import { AbasRelatorio } from "../abas";

const SITUACOES = [
  ["aberto,parcial,vencido", "Em aberto (inclui vencidas)"],
  ["vencido", "Só vencidas"],
  ["quitado", "Pagas ou recebidas"],
  ["", "Todas"],
] as const;

// Planilha de contas a pagar e a receber. Antes ficava num cartão dentro da DRE.
export default async function PaginaRelatorioContas() {
  await exigirAcesso("relatorios");
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Titulo descricao="Títulos de contas a pagar ou a receber com fornecedor ou cliente, categorias, centros de custo, valor, pago e saldo. Deixe as datas em branco para pegar todos os vencimentos.">
        Contas a pagar e a receber
      </Titulo>
      <AbasRelatorio atual="/relatorios/contas" />
      <Cartao titulo="O que exportar">
        <form className="grid gap-4 sm:grid-cols-2" action="/relatorios/exportar">
          <input type="hidden" name="relatorio" value="titulos" />
          <Selecao rotulo="Tipo" id="tipo" name="tipo" defaultValue="pagar">
            <option value="pagar">Contas a pagar</option>
            <option value="receber">Contas a receber</option>
          </Selecao>
          <Selecao rotulo="Situação" id="situacao" name="situacao" defaultValue={SITUACOES[0][0]}>
            {SITUACOES.map(([v, n]) => <option key={n} value={v}>{n}</option>)}
          </Selecao>
          <Campo rotulo="Vencimento de" id="de" name="de" type="date" />
          <Campo rotulo="Vencimento até" id="ate" name="ate" type="date" />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" name="formato" value="xlsx" className={classeBotao("primario", "sm")}>Planilha (Excel)</button>
            <button type="submit" name="formato" value="csv" className={classeBotao("secundario", "sm")}>CSV</button>
          </div>
        </form>
      </Cartao>
    </div>
  );
}
