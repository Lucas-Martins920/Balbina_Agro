import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { BotaoLancamento } from "@/components/lancamento";
import { MessageCircle, RotateCcw } from "lucide-react";
import { Aviso, Cartao, classeBotao, Etiqueta, LinkBotao, Selecao, Tabela, Titulo, type TomEtiqueta } from "@/components/ui";
import { BotaoCopiar } from "@/components/vendas/botao-copiar";
import { BotaoNfe } from "@/components/vendas/botao-nfe";
import { EntradaNoGrupo } from "@/components/vendas/entrada-grupo";
import { MEIOS_COBRANCA } from "@/lib/asaas-mapa";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso, getPermissoes } from "@/lib/permissoes";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { textoQuantidade, vendidoPorKg } from "@/lib/pescado";
import { createClient } from "@/lib/supabase/server";
import { FORMAS_PAGAMENTO } from "@/lib/titulos";
import { CONDICOES, linkWhatsapp, STATUS_PEDIDO, TOM_STATUS_PEDIDO } from "@/lib/vendas";
import { STATUS_COBRANCA } from "@/lib/cobranca";
import { AcaoConfirmada } from "@/components/acao-confirmada";
import { cancelarPedido, cobrarPedido, desfazerEntrega, desfazerFaturamento, entregarPedido, faturarPedido, receberPedido } from "../actions";

const ETAPAS = ["aberto", "faturado", "entregue"] as const;
const TOM_COBRANCA: Record<string, TomEtiqueta> = {
  processando: "neutro", emitida: "info", visualizada: "info", paga: "positivo", expirada: "perigo", cancelada: "neutro", erro: "perigo",
};
const SITUACAO_TITULO: Record<string, [string, TomEtiqueta]> = {
  aberto: ["Em aberto", "neutro"], parcial: ["Parcial", "info"], vencido: ["Vencida", "perigo"], quitado: ["Recebida", "positivo"],
  cancelado: ["Cancelada", "neutro"], perda: ["Perda", "alerta"],
};

export default async function PaginaPedido({ params, searchParams }: PageProps<"/vendas/[id]">) {
  await exigirAcesso("vendas");
  const { noPlano, pode } = await getPermissoes();
  const { id } = await params;
  const filtros = await searchParams;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  // Pedido e títulos dele numa ida só ao banco (os títulos não dependem do pedido, só do id).
  const [{ data: pedido }, { data: ags }] = await Promise.all([
    supabase.from("pedidos_venda")
      .select("id, numero, data, entrega_prevista, status, total_cents, forma_pagamento, condicao_pagamento, observacoes, origem, cliente_id, contatos(nome, telefone, cpf_cnpj), pontos_venda(nome, sede), pedido_itens(id, quantidade, preco_unit_cents, total_cents, produtos(nome, fator_kg, unidade))")
      .eq("id", id).eq("empresa_id", atual.id).maybeSingle(),
    supabase.from("agendamentos").select("id").eq("origem", "pedido_venda").eq("origem_id", id),
  ]);
  if (!pedido) notFound();
  const idsTitulos = (ags ?? []).map((a) => a.id);
  const [{ data: titulos }, { data: cobrancas }, { data: contas }, { data: perfil }] = await Promise.all([
    supabase.from("titulos").select("id, vencimento, valor_cents, saldo_cents, situacao, parcela_numero, parcela_total").in("id", idsTitulos).order("vencimento"),
    supabase.from("cobrancas").select("id, agendamento_id, meio, vencimento, valor_cents, status, url_pdf, linha_digitavel, pix_copia_cola, erro").in("agendamento_id", idsTitulos).order("created_at", { ascending: false }),
    supabase.from("contas_financeiras").select("id, nome").eq("empresa_id", atual.id).eq("arquivada", false).neq("tipo", "cartao_credito").order("nome"),
    supabase.from("perfis_cobranca").select("id").eq("empresa_id", atual.id).eq("provedor", "asaas").eq("ativo", true).maybeSingle(),
  ]);

  const cliente = pedido.contatos as unknown as { nome: string; telefone: string | null; cpf_cnpj: string | null };
  const ponto = pedido.pontos_venda as unknown as { nome: string; sede: boolean } | null;
  const itens = pedido.pedido_itens as unknown as { id: string; quantidade: number; preco_unit_cents: number; total_cents: number; produtos: { nome: string; fator_kg: number | null; unidade: string } }[];
  const emAberto = (titulos ?? []).filter((t) => ["aberto", "parcial", "vencido"].includes(t.situacao) && Number(t.saldo_cents) > 0);
  const saldo = emAberto.reduce((s, t) => s + Number(t.saldo_cents), 0);
  const ativas = (cobrancas ?? []).filter((c) => ["processando", "emitida", "visualizada"].includes(c.status));
  const semCobranca = emAberto.filter((t) => !ativas.some((c) => c.agendamento_id === t.id));
  const condicao = Object.values(CONDICOES).find((c) => JSON.stringify(c.parcelas) === JSON.stringify((pedido.condicao_pagamento as { parcelas: unknown }).parcelas))?.nome;
  const etapa = pedido.status === "separado" ? 0 : ETAPAS.indexOf(pedido.status as (typeof ETAPAS)[number]);
  const cancelado = pedido.status === "cancelado";

  const mensagem = (c: { valor_cents: number; vencimento: string; url_pdf: string | null; pix_copia_cola: string | null }) =>
    [`Olá, ${cliente.nome}! Segue a cobrança do pedido ${pedido.numero}: ${formatarMoeda(Number(c.valor_cents))}, vencimento ${formatarData(c.vencimento)}.`,
      c.url_pdf && `Boleto/Pix: ${c.url_pdf}`, c.pix_copia_cola && `Pix copia e cola: ${c.pix_copia_cola}`].filter(Boolean).join("\n\n");
  const resumo = [`Pedido ${pedido.numero} · ${cliente.nome}`, ...itens.map((i) => `${textoQuantidade(i.quantidade, i.produtos.fator_kg, i.produtos.unidade)} × ${i.produtos.nome} = ${formatarMoeda(Number(i.total_cents))}`),
    `Total: ${formatarMoeda(Number(pedido.total_cents))}`].join("\n");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Titulo descricao={`${cliente.nome} · ${formatarData(pedido.data)}${pedido.origem === "pdv" ? " · PDV" : ""}${ponto && !ponto.sede ? ` · ${ponto.nome}` : ""}`}
        acoes={<LinkBotao href="/vendas" variante="fantasma">Todas as vendas</LinkBotao>}>
        <span className="flex flex-wrap items-center gap-3">Pedido nº {pedido.numero} <Etiqueta tom={TOM_STATUS_PEDIDO[pedido.status] ?? "neutro"}>{STATUS_PEDIDO[pedido.status] ?? pedido.status}</Etiqueta></span>
      </Titulo>

      {typeof filtros.aviso === "string" && <Aviso>{filtros.aviso}</Aviso>}
      {filtros.nova === "1" && <Aviso tipo="info">Venda registrada.</Aviso>}

      {/* Andamento */}
      {cancelado ? (
        <Aviso tipo="alerta">Pedido cancelado.</Aviso>
      ) : (
        <ol className="grid grid-cols-4 gap-1 text-center text-xs" aria-label="Andamento">
          {[...ETAPAS.map((e) => STATUS_PEDIDO[e]), saldo === 0 && etapa >= 1 ? "Recebido" : "Receber"].map((nome, i) => {
            const feito = i < 3 ? i <= etapa : saldo === 0 && etapa >= 1;
            return (
              <li key={nome} className={`rounded-md border px-1 py-2 ${feito ? "border-marca/50 bg-marca-suave font-semibold text-texto" : "border-borda text-texto-suave"}`}>
                {i === 0 ? "Pedido" : nome}
              </li>
            );
          })}
        </ol>
      )}

      {/* Próximo passo */}
      {!cancelado && (
        <div className="flex flex-wrap gap-2">
          {["aberto", "separado"].includes(pedido.status) && (
            <FormAcao acao={faturarPedido} botao="Faturar agora"><input type="hidden" name="pedido_id" value={pedido.id} /></FormAcao>
          )}
          {pedido.status === "faturado" && (
            <FormAcao acao={entregarPedido} botao="Marcar como entregue" variante="secundario"><input type="hidden" name="pedido_id" value={pedido.id} /></FormAcao>
          )}
          {pedido.status === "entregue" && pedido.origem !== "pdv" && pode("vendas.cancelar") && (
            <AcaoConfirmada acao={desfazerEntrega} botao="Desfazer entrega" confirmar="Desfazer entrega"
              pergunta="O pedido volta para faturado. Estoque e contas a receber não mudam.">
              <input type="hidden" name="pedido_id" value={pedido.id} />
            </AcaoConfirmada>
          )}
          {pedido.status === "faturado" && pedido.origem !== "pdv" && pode("vendas.cancelar") && (
            <AcaoConfirmada acao={desfazerFaturamento} botao="Desfazer faturamento" confirmar="Desfazer faturamento" variante="perigo"
              pergunta="O pedido volta para aberto: o peixe volta ao estoque e as contas a receber são canceladas. Se já tiver recebimento, boleto/Pix ativo ou nota fiscal válida, desfaça isso antes (a nota se cancela no cartão Nota fiscal; passado o prazo, só com nota de devolução).">
              <input type="hidden" name="pedido_id" value={pedido.id} />
            </AcaoConfirmada>
          )}
          <LinkBotao href={`/vendas/nova?cliente=${pedido.cliente_id}&repetir=1`}><RotateCcw size={16} strokeWidth={1.75} aria-hidden /> Vender de novo</LinkBotao>
          {cliente.telefone && (
            <a href={linkWhatsapp(cliente.telefone, resumo)} target="_blank" rel="noreferrer" className={classeBotao("secundario")}>
              <MessageCircle size={16} strokeWidth={1.75} aria-hidden /> Enviar pedido no WhatsApp
            </a>
          )}
        </div>
      )}

      {!cancelado && pedido.origem !== "pdv" && ["faturado", "entregue"].includes(pedido.status) && noPlano("notas") && (
        <Cartao titulo="Nota fiscal"><BotaoNfe pedidoId={pedido.id} pedidoStatus={pedido.status} /></Cartao>
      )}

      {!cancelado && <EntradaNoGrupo pedidoId={pedido.id} empresaAtual={atual.id} documentoCliente={cliente.cpf_cnpj} faturado={["faturado", "entregue"].includes(pedido.status)} />}

      <Cartao titulo="Itens">
        <ul className="divide-y divide-borda text-sm">
          {itens.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>{textoQuantidade(i.quantidade, i.produtos.fator_kg, i.produtos.unidade)} × {i.produtos.nome}<span className="block text-xs text-texto-suave">{formatarMoeda(Number(i.preco_unit_cents))} {vendidoPorKg(i.produtos.fator_kg) ? "o kg" : "cada"}</span></span>
              <span className="tabular-nums">{formatarMoeda(Number(i.total_cents))}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-borda pt-2 font-semibold">
          <span>Total</span><span className="tabular-nums">{formatarMoeda(Number(pedido.total_cents))}</span>
        </div>
        <p className="mt-2 text-xs text-texto-suave">
          {[condicao, pedido.forma_pagamento && FORMAS_PAGAMENTO[pedido.forma_pagamento], pedido.entrega_prevista && `entrega ${formatarData(pedido.entrega_prevista)}`, pedido.observacoes].filter(Boolean).join(" · ")}
        </p>
      </Cartao>

      {(titulos ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <h2 className="text-lg font-semibold">Recebimento {saldo > 0 ? <span className="text-sm font-normal text-texto-suave">· falta {formatarMoeda(saldo)}</span> : (titulos ?? []).every((t) => t.situacao === "cancelado") ? <span className="text-sm font-normal text-texto-suave">· parcelas canceladas</span> : <span className="text-sm font-normal text-positivo">· quitado</span>}</h2>
            {saldo > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {perfil && noPlano("cobrancas") && semCobranca.length > 0 && (
                  <BotaoLancamento rotulo="Cobrar pelo Asaas" acao={cobrarPedido} botao="Gerar boleto e Pix" variante="secundario" icone={null}
                    descricao={cliente.cpf_cnpj ? `${semCobranca.length} parcela(s) sem cobrança: o Asaas gera o boleto e o Pix e avisa quando o cliente pagar.` : "O cliente precisa de CPF ou CNPJ para o Asaas."}>
                    <input type="hidden" name="pedido_id" value={pedido.id} />
                    <input type="hidden" name="forma" value={pedido.forma_pagamento ?? "boleto"} />
                  </BotaoLancamento>
                )}
                <BotaoLancamento rotulo="Recebi o pagamento" acao={receberPedido} botao={`Registrar ${formatarMoeda(saldo)}`} icone={null}>
                  <input type="hidden" name="pedido_id" value={pedido.id} />
                  <Selecao rotulo="Conta" id="receber_conta" name="conta_id" required defaultValue="">
                    <option value="" disabled>Conta onde caiu…</option>
                    {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Selecao>
                  <Selecao rotulo="Forma" id="receber_forma" name="forma" defaultValue={pedido.forma_pagamento ?? "pix"}>
                    {Object.entries(FORMAS_PAGAMENTO).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                  </Selecao>
                </BotaoLancamento>
              </div>
            )}
          </div>
          <Tabela cabecalho={["Vencimento", "Parcela", "Valor", "Saldo", "Situação"]} direita={["Valor", "Saldo"]} total={titulos?.length ?? 0}>
            {(titulos ?? []).map((t) => (
              <tr key={t.id} className="tabular-nums">
                <td className={t.situacao === "vencido" ? "text-perigo" : ""}>{formatarData(t.vencimento)}</td>
                <td>{t.parcela_total ? `${t.parcela_numero}/${t.parcela_total}` : "única"}</td>
                <td className="text-right">{formatarMoeda(Number(t.valor_cents))}</td>
                <td className="text-right">{Number(t.saldo_cents) ? formatarMoeda(Number(t.saldo_cents)) : <span className="text-texto-suave">–</span>}</td>
                <td><Etiqueta tom={SITUACAO_TITULO[t.situacao]?.[1] ?? "neutro"}>{SITUACAO_TITULO[t.situacao]?.[0] ?? t.situacao}</Etiqueta></td>
              </tr>
            ))}
          </Tabela>

        </section>
      )}

      {(cobrancas ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Cobranças</h2>
          {(cobrancas ?? []).map((c) => (
            <Cartao key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold tabular-nums">{formatarMoeda(Number(c.valor_cents))} <span className="text-sm font-normal text-texto-suave">vence {formatarData(c.vencimento)}</span></p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-texto-suave">
                    <Etiqueta tom={TOM_COBRANCA[c.status] ?? "neutro"}>{STATUS_COBRANCA[c.status] ?? c.status}</Etiqueta>
                    {MEIOS_COBRANCA[c.meio as keyof typeof MEIOS_COBRANCA]}{c.erro && <span className="text-perigo">{c.erro}</span>}
                  </p>
                </div>
              </div>
              {["emitida", "visualizada", "expirada"].includes(c.status) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.pix_copia_cola && <BotaoCopiar texto={c.pix_copia_cola} rotulo="Copiar Pix" />}
                  {c.linha_digitavel && <BotaoCopiar texto={c.linha_digitavel} rotulo="Copiar linha do boleto" />}
                  {c.url_pdf && <a href={c.url_pdf} target="_blank" rel="noreferrer" className={classeBotao("secundario")}>Abrir boleto</a>}
                  <a href={linkWhatsapp(cliente.telefone, mensagem({ ...c, valor_cents: Number(c.valor_cents) }))} target="_blank" rel="noreferrer"
                    className={classeBotao("primario")}>
                    <MessageCircle size={16} strokeWidth={1.75} aria-hidden /> Mandar no WhatsApp
                  </a>
                </div>
              )}
            </Cartao>
          ))}
        </section>
      )}

      {!cancelado && (
        <details className="text-sm">
          <summary className={`${classeBotao("secundario", "sm")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Cancelar pedido</summary>
          <div className="mt-2 max-w-sm">
            <FormAcao acao={cancelarPedido} botao="Confirmar cancelamento" variante="secundario">
              <input type="hidden" name="pedido_id" value={pedido.id} />
              <p className="text-texto-suave">Devolve o peixe ao estoque e cancela as contas a receber. Só funciona se nada foi recebido e se não houver nota fiscal válida (cancele a nota antes).</p>
            </FormAcao>
          </div>
        </details>
      )}
    </div>
  );
}
