import Link from "next/link";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { ExcluirLinha } from "@/components/excluir-linha";
import { BotaoLancamento } from "@/components/lancamento";
import { Campo, Cartao, CLASSE_BOTAO_TEXTO, Etiqueta, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarNumero } from "@/lib/formato";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";
import { CONDICOES } from "@/lib/vendas";
import { alternarPedidoFixo, excluirPedidoFixo, salvarPedidoFixo } from "./actions";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LINHAS = 5;
const FORMAS: Record<string, string> = { "": "A combinar", pix: "Pix", boleto: "Boleto", dinheiro: "Dinheiro", ted: "Transferência" };

// D2: cliente que compra sempre nos mesmos dias. O pedido sai sozinho na véspera, em aberto, para conferir e faturar.
export default async function PaginaPedidosFixos() {
  await exigirAcesso("vendas");
  const { pode } = await getPermissoes();
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: fixos }, { data: clientes }, { data: produtos }, { data: gerados }, { data: cfg }] = await Promise.all([
    supabase.from("pedidos_fixos").select("id, cliente_id, dias_semana, itens, parcelas, forma_pagamento, observacoes, ativo").eq("empresa_id", atual.id).order("created_at"),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).contains("tipos", ["cliente"]).eq("arquivado", false).order("nome").limit(2000),
    supabase.from("produtos").select("id, nome, unidade").eq("empresa_id", atual.id).eq("ativo", true).eq("para_venda", true).order("nome"),
    supabase.from("pedidos_fixos_gerados").select("pedido_fixo_id, entrega, pedido_id, erro").eq("empresa_id", atual.id).order("entrega", { ascending: false }).limit(30),
    supabase.from("automacoes_empresa").select("pedidos_fixos_hora").eq("empresa_id", atual.id).maybeSingle(),
  ]);
  const nomeCliente = new Map((clientes ?? []).map((c) => [c.id, c.nome]));
  const produto = new Map((produtos ?? []).map((p) => [p.id, p]));
  const clienteDoFixo = new Map((fixos ?? []).map((f) => [f.id, nomeCliente.get(f.cliente_id) ?? "cliente"]));
  const nomeCondicao = (parcelas: unknown) => Object.values(CONDICOES).find((c) => JSON.stringify(c.parcelas) === JSON.stringify(parcelas))?.nome ?? "outra condição";
  const podeEditar = pode("vendas.lancar");

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Titulo
        acoes={podeEditar && <BotaoLancamento rotulo="Novo pedido fixo" acao={salvarPedidoFixo} botao="Salvar pedido fixo">
            <Selecao rotulo="Cliente" id="pf_cliente" name="cliente_id" required defaultValue="">
              <option value="" disabled>Escolha…</option>
              {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1 font-medium">Dias de entrega</legend>
              {DIAS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5"><input type="checkbox" name="dias" value={i} className="size-4 accent-marca" />{d}</label>
              ))}
            </fieldset>
            {Array.from({ length: LINHAS }, (_, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <Selecao rotulo={`Produto ${i + 1}`} id={`pf_prod_${i}`} name="produto_id" defaultValue="" required={i === 0}>
                  <option value="">{i === 0 ? "Escolha…" : "Nenhum"}</option>
                  {(produtos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                </Selecao>
                <Campo rotulo="Quantidade" id={`pf_qtd_${i}`} name="quantidade" inputMode="decimal" required={i === 0} />
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <Selecao rotulo="Condição" id="pf_cond" name="condicao" defaultValue="avista">
                {Object.entries(CONDICOES).map(([k, c]) => <option key={k} value={k}>{c.nome}</option>)}
              </Selecao>
              <Selecao rotulo="Forma de pagamento" id="pf_forma" name="forma_pagamento" defaultValue="">
                {Object.entries(FORMAS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </Selecao>
            </div>
            <Campo rotulo="Observação no pedido" id="pf_obs" name="observacoes" placeholder="Opcional (ex.: entregar até 7h)" />
          </BotaoLancamento>}
        descricao={`O pedido de cada entrega sai sozinho na véspera, depois das ${(cfg?.pedidos_fixos_hora ?? "16:00").slice(0, 5)}, em aberto e com o preço da tabela do dia. Quem vende recebe aviso no celular, confere as quantidades e fatura.`}>
        Pedidos fixos
      </Titulo>
      <Tabela cabecalho={["Cliente", "Dias", "Itens", "Pagamento", "Situação", ""]} principal="Cliente" total={fixos?.length ?? 0} vazio="Nenhum pedido fixo ainda.">
        {(fixos ?? []).map((f) => (
          <tr key={f.id} className="align-top">
            <td className="font-medium">{nomeCliente.get(f.cliente_id) ?? "–"}{f.observacoes && <span className="block text-xs text-texto-suave">{f.observacoes}</span>}</td>
            <td>{(f.dias_semana as number[]).map((d) => DIAS[d]).join(", ")}</td>
            <td className="text-sm">{(f.itens as { produto_id: string; quantidade: number }[]).map((i) => `${formatarNumero(i.quantidade)} ${produto.get(i.produto_id)?.unidade ?? ""} ${produto.get(i.produto_id)?.nome ?? "produto inativo"}`).join("; ")}</td>
            <td className="text-sm">{nomeCondicao(f.parcelas)} · {FORMAS[f.forma_pagamento ?? ""] ?? f.forma_pagamento}</td>
            <td>
              {f.ativo ? <Etiqueta tom="positivo">Ativo</Etiqueta> : <Etiqueta>Pausado</Etiqueta>}
              {podeEditar && (
                <div className="mt-2">
                  <AcaoConfirmada acao={alternarPedidoFixo} botao={f.ativo ? "Pausar" : "Retomar"} pergunta={f.ativo ? "Para de gerar os pedidos até retomar." : "Volta a gerar os pedidos."}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="ativo" value={f.ativo ? "0" : "1"} />
                  </AcaoConfirmada>
                </div>
              )}
            </td>
            <td>{podeEditar && <ExcluirLinha acao={excluirPedidoFixo} id={f.id} />}</td>
          </tr>
        ))}
      </Tabela>

      {(gerados ?? []).length > 0 && (
        <Cartao titulo="Últimos gerados">
          <ul className="-my-2 divide-y divide-linha text-sm">
            {(gerados ?? []).map((g) => (
              <li key={`${g.pedido_fixo_id}-${g.entrega}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="tabular-nums">{formatarData(g.entrega)}</span>
                <span className="font-medium">{clienteDoFixo.get(g.pedido_fixo_id) ?? "–"}</span>
                {g.pedido_id ? <Link href={`/vendas/${g.pedido_id}`} className={CLASSE_BOTAO_TEXTO}>Abrir pedido</Link>
                  : <span className="text-perigo">Não saiu: {g.erro}</span>}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}
