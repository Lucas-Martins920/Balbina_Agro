import { AcaoConfirmada } from "@/components/acao-confirmada";
import { FormAcao } from "@/components/form-acao";
import { Cartao, Selecao } from "@/components/ui";
import { desfazerEntradaGrupo, lancarEntradaGrupo } from "@/app/(app)/vendas/actions";
import { formatarData } from "@/lib/formato";
import { textoKg } from "@/lib/pescado";
import { carregarPontos } from "@/lib/pontos-dados";
import { createClient } from "@/lib/supabase/server";

// Pedido para outra empresa do usuário (o cliente tem o CNPJ dela): lança a entrada lá com um clique.
export async function EntradaNoGrupo({ pedidoId, empresaAtual, documentoCliente, faturado }: {
  pedidoId: string; empresaAtual: string; documentoCliente: string | null; faturado: boolean;
}) {
  if (!documentoCliente) return null;
  const supabase = await createClient();
  const [{ data: empresa }, { data: compra }] = await Promise.all([
    supabase.from("empresas").select("id, razao_social, nome_fantasia").eq("cnpj", documentoCliente).neq("id", empresaAtual).maybeSingle(),
    supabase.from("compras_grupo").select("id, data, kg, pontos_venda(nome)").eq("pedido_origem_id", pedidoId).maybeSingle(),
  ]);
  if (!empresa) return null;
  const nome = empresa.nome_fantasia || empresa.razao_social;
  const pontos = (await carregarPontos(empresa.id)).filter((p) => p.ativo);

  return (
    <Cartao titulo={`Venda para ${nome}`} descricao="O cliente é outra empresa sua no Balbina. A entrada lá põe o peixe no estoque dela, ao preço desta venda, e as parcelas em contas a pagar para esta piscicultura.">
      {compra ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>Entrada lançada em {formatarData(compra.data)}: {textoKg(compra.kg)} de peixe em {(compra.pontos_venda as unknown as { nome: string } | null)?.nome ?? nome}.</p>
          <AcaoConfirmada acao={desfazerEntradaGrupo} botao="Desfazer a entrada" confirmar="Desfazer" variante="perigo"
            pergunta={`O peixe sai do estoque de ${nome} e as contas a pagar são canceladas.`}>
            <input type="hidden" name="compra_id" value={compra.id} />
          </AcaoConfirmada>
        </div>
      ) : faturado ? (
        <FormAcao acao={lancarEntradaGrupo} botao={`Lançar a entrada em ${nome}`}>
          <input type="hidden" name="pedido_id" value={pedidoId} />
          <input type="hidden" name="empresa_id" value={empresa.id} />
          {pontos.length > 1 && (
            <Selecao rotulo="O peixe entra em" id="ponto_venda_id" name="ponto_venda_id" defaultValue={pontos.find((p) => p.sede)?.id}>
              {pontos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Selecao>
          )}
        </FormAcao>
      ) : (
        <p className="text-sm text-texto-suave">Fature o pedido para lançar a entrada em {nome}.</p>
      )}
    </Cartao>
  );
}
