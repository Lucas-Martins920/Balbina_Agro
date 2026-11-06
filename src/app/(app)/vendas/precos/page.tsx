import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, LinkBotao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes";
import { formatarMoeda, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { vigenteEm } from "@/lib/vendas";
import { definirPreco, removerPrecoCliente } from "../actions";

export default async function PaginaPrecos() {
  await exigirAcesso("vendas");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const hoje = hojeISO(atual.fuso);
  const [{ data: produtos }, { data: clientes }, { data: precos }, { data: listas }] = await Promise.all([
    supabase.from("produtos").select("id, nome").eq("empresa_id", atual.id).eq("para_venda", true).eq("base_estoque", false).eq("ativo", true).order("nome"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).contains("tipos", ["cliente"]).eq("arquivado", false).order("nome"),
    supabase.from("tabelas_preco").select("produto_id, cliente_id, lista_id, preco_cents, vigencia, contatos(nome)").eq("empresa_id", atual.id),
    supabase.from("listas_preco").select("id, padrao").eq("empresa_id", atual.id),
  ]);
  const vigentes = (precos ?? []).filter((p) => vigenteEm(p.vigencia, hoje));
  const padrao = (listas ?? []).find((l) => l.padrao)?.id;
  const geral = new Map(vigentes.filter((p) => !p.cliente_id && p.lista_id === padrao).map((p) => [p.produto_id, Number(p.preco_cents)]));
  const porCliente = vigentes.filter((p) => p.cliente_id);
  const nomeProduto = new Map((produtos ?? []).map((p) => [p.id, p.nome]));

  return (
    <div className="flex flex-col gap-6">
      <Titulo descricao="Preço combinado com um cliente para um produto. Vence a tabela de preço do cliente e a padrão. Vale a partir da data escolhida e o antigo fica no histórico."
        acoes={
          <>
            <LinkBotao href="/tabelas-de-preco" variante="fantasma">Tabelas de preço</LinkBotao>
            <BotaoLancamento rotulo="Novo preço especial" acao={definirPreco} botao="Salvar preço">
            <Selecao rotulo="Cliente" id="preco_cliente" name="cliente_id" required defaultValue="">
              <option value="" disabled>Escolha…</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <Selecao rotulo="Produto" id="preco_produto" name="produto_id" required defaultValue="">
              <option value="" disabled>Escolha…</option>
              {(produtos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </Selecao>
            <Campo rotulo="Preço (R$)" id="preco_valor" name="preco" inputMode="decimal" required />
            <Campo rotulo="Vale a partir de" id="preco_desde" name="desde" type="date" defaultValue={hoje} required />
          </BotaoLancamento>
          </>
        }>
        Preços especiais por cliente
      </Titulo>

      <Tabela cabecalho={["Cliente", "Produto", "Preço", "Padrão", ""]} direita={["Preço", "Padrão"]} total={porCliente.length} vazio="Nenhum preço especial.">
        {porCliente.map((p) => (
          <tr key={`${p.cliente_id}-${p.produto_id}`} className="tabular-nums">
            <td>{(p.contatos as unknown as { nome: string } | null)?.nome}</td>
            <td>{nomeProduto.get(p.produto_id) ?? "Produto inativo"}</td>
            <td className="text-right">{formatarMoeda(Number(p.preco_cents))}</td>
            <td className="text-right text-texto-suave">{geral.has(p.produto_id) ? formatarMoeda(geral.get(p.produto_id)) : "–"}</td>
            <td className="text-right">
              <FormAcao acao={removerPrecoCliente} botao="Remover" variante="secundario" className="items-end">
                <input type="hidden" name="produto_id" value={p.produto_id} />
                <input type="hidden" name="cliente_id" value={p.cliente_id ?? ""} />
              </FormAcao>
            </td>
          </tr>
        ))}
      </Tabela>
    </div>
  );
}
