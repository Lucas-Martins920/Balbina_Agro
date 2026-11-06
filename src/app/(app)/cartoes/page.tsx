import Link from "next/link";
import { BotaoLancamento } from "@/components/lancamento";
import { SelecaoComNovo } from "@/components/selecao-com-novo";
import { Campo, CLASSE_BOTAO_TEXTO, Secao, Selecao, Tabela, Titulo } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { formatarData, formatarMoeda, hojeISO } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { GRUPOS_CATEGORIA } from "@/lib/titulos";
import { comprarNoCartao, criarCartao, pagarFatura } from "./actions";
import { exigirAcesso } from "@/lib/permissoes";
import { ordenado } from "@/lib/ordem";

const SITUACAO: Record<string, string> = { aberta: "Aberta", fechada: "Fechada", vencida: "Vencida", paga: "Paga" };

export default async function PaginaCartoes({ searchParams }: PageProps<"/cartoes">) {
  await exigirAcesso("cartoes");
  const filtros = await searchParams;
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: contas }, { data: saldos }, { data: categorias }, { data: centros }, { data: contatos }] = await Promise.all([
    supabase.from("contas_financeiras").select("id, nome, tipo, dia_fechamento, dia_vencimento, limite_cents, conta_pagadora_id")
      .eq("empresa_id", atual.id).eq("arquivada", false).order("nome"),
    supabase.from("saldos_contas").select("conta_id, saldo_cents").eq("empresa_id", atual.id),
    supabase.from("categorias").select("id, nome, grupo, sentido, parent_id, ordem").eq("empresa_id", atual.id).eq("ativa", true).eq("sentido", "saida").order("ordem").order("nome").then(ordenado),
    supabase.from("centros_custo").select("id, nome, parent_id, ordem").eq("empresa_id", atual.id).eq("ativo", true).order("ordem").order("nome").then(ordenado),
    supabase.from("contatos").select("id, nome").eq("empresa_id", atual.id).eq("arquivado", false).order("nome"),
  ]);
  const cartoes = (contas ?? []).filter((c) => c.tipo === "cartao_credito");
  const bancos = (contas ?? []).filter((c) => c.tipo !== "cartao_credito");
  const cartao = cartoes.find((c) => c.id === filtros.cartao) ?? cartoes[0];
  const hoje = hojeISO(atual.fuso);

  const [{ data: faturas }, { data: lancamentos }] = cartao
    ? await Promise.all([
        supabase.from("faturas_cartao").select("vencimento, fechamento, total_cents, pago_cents, saldo_cents, situacao").eq("cartao_id", cartao.id).order("vencimento", { ascending: false }).limit(12),
        supabase.from("lancamentos_cartao").select("baixa_id, data, descricao, parcela_numero, parcela_total, valor_cents, vencimento").eq("cartao_id", cartao.id).order("data", { ascending: false }).limit(200),
      ])
    : [{ data: [] }, { data: [] }];

  // fatura em foco: a escolhida, senão a mais antiga ainda não paga
  const emAberto = (faturas ?? []).filter((f) => f.situacao !== "paga").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const foco = (faturas ?? []).find((f) => f.vencimento === filtros.fatura) ?? emAberto[0] ?? (faturas ?? [])[0];
  const usado = -Number(saldos?.find((s) => s.conta_id === cartao?.id)?.saldo_cents ?? 0);
  const pais = new Set((categorias ?? []).map((c) => c.parent_id).filter(Boolean));
  const folhas = (categorias ?? []).filter((c) => !pais.has(c.id));

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <Titulo descricao={cartao ? `Fecha dia ${cartao.dia_fechamento}, vence dia ${cartao.dia_vencimento} · usado ${formatarMoeda(usado)}${cartao.limite_cents ? ` de ${formatarMoeda(cartao.limite_cents)}` : ""}` : "Compras no cartão viram contas pagas, cada parcela na sua fatura."}
        acoes={
          <>
            <BotaoLancamento rotulo="Cartão" titulo="Cadastrar cartão" acao={criarCartao} botao="Cadastrar" variante="secundario" tamanho="sm">
          <Campo rotulo="Nome" id="n_nome" name="nome" required placeholder="Ex.: Visa Sicredi" />
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Dia do fechamento" id="n_fech" name="dia_fechamento" type="number" min={1} max={31} required />
            <Campo rotulo="Dia do vencimento" id="n_venc" name="dia_vencimento" type="number" min={1} max={31} required />
            <Campo rotulo="Limite (R$)" id="n_lim" name="limite" inputMode="decimal" />
          </div>
          <Selecao rotulo="Conta que paga a fatura" id="n_pag" name="conta_pagadora_id" defaultValue="">
            <option value="">Escolher na hora</option>
            {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </Selecao>
        </BotaoLancamento>
            {cartao && (
              <BotaoLancamento rotulo="Lançar compra" titulo={`Compra no ${cartao.nome}`} acao={comprarNoCartao} botao="Lançar compra">
              <input type="hidden" name="cartao_id" value={cartao.id} />
              <div className="grid gap-3 grid-cols-2">
                <Campo rotulo="Descrição" id="c_desc" name="descricao" required placeholder="Ex.: Peças do comedouro" />
                <Campo rotulo="Valor total (R$)" id="c_valor" name="valor" inputMode="decimal" required />
                <Campo rotulo="Parcelas" id="c_parc" name="parcelas" type="number" min={1} max={48} defaultValue={1} />
                <Campo rotulo="Data da compra" id="c_data" name="data" type="date" defaultValue={hoje} required />
                <Selecao rotulo="Categoria" id="c_cat" name="categoria_id" required defaultValue="">
                  <option value="" disabled>Escolha…</option>
                  {Object.entries(GRUPOS_CATEGORIA).map(([g, n]) => {
                    const doGrupo = folhas.filter((c) => c.grupo === g);
                    return doGrupo.length ? <optgroup key={g} label={n}>{doGrupo.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup> : null;
                  })}
                </Selecao>
                <Selecao rotulo="Centro de custo" id="c_cc" name="centro_custo_id" defaultValue="">
                  <option value="">Nenhum</option>
                  {(centros ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
                <SelecaoComNovo novo="fornecedor" rotulo="Fornecedor" id="c_ct" name="contato_id" defaultValue="">
                  <option value="">Nenhum</option>
                  {(contatos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </SelecaoComNovo>
              </div>
              <p className="text-xs text-texto-suave">A despesa entra toda no mês da compra (competência); cada parcela sai do caixa quando a fatura dela for paga.</p>
            </BotaoLancamento>
            )}
          </>
        }>
        Cartões de crédito
      </Titulo>

      {cartoes.length > 1 && (
        <nav aria-label="Cartão" className="inline-flex flex-wrap gap-0.5 self-start rounded-lg bg-elevado/70 p-0.5 text-[13px]">
          {cartoes.map((c) => (
            <Link key={c.id} href={`/cartoes?cartao=${c.id}`} aria-current={c.id === cartao?.id ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-medium transition-colors duration-150 ${c.id === cartao?.id ? "bg-superficie text-texto shadow-[0_1px_2px_rgb(0_0_0/0.08)]" : "text-texto-suave hover:text-texto"}`}>{c.nome}</Link>
          ))}
        </nav>
      )}

      {cartao && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Faturas</h2>
            <Tabela cabecalho={["Vencimento", "Fecha em", "Total", "Pago", "Saldo", "Situação"]} total={faturas?.length ?? 0} vazio="Nenhuma compra neste cartão.">
              {(faturas ?? []).map((f) => (
                <tr key={f.vencimento} className={`tabular-nums ${f.vencimento === foco?.vencimento ? "bg-elevado/50" : ""}`}>
                  <td><Link href={`/cartoes?cartao=${cartao.id}&fatura=${f.vencimento}`} className={CLASSE_BOTAO_TEXTO}>{formatarData(f.vencimento)}</Link></td>
                  <td>{formatarData(f.fechamento)}</td>
                  <td>{formatarMoeda(f.total_cents)}</td>
                  <td>{formatarMoeda(f.pago_cents)}</td>
                  <td className="font-medium">{formatarMoeda(f.saldo_cents)}</td>
                  <td className={f.situacao === "vencida" ? "text-perigo" : ""}>{SITUACAO[f.situacao] ?? f.situacao}</td>
                </tr>
              ))}
            </Tabela>
          </section>

          {foco && (
            <Secao
              titulo={`Fatura de ${formatarData(foco.vencimento)}`}
              acoes={Number(foco.saldo_cents) > 0 && (
                <BotaoLancamento rotulo="Pagar esta fatura" titulo={`Pagar a fatura de ${formatarData(foco.vencimento)}`} acao={pagarFatura} botao={`Pagar ${formatarMoeda(foco.saldo_cents)}`} variante="secundario" icone={null}>
                    <input type="hidden" name="cartao_id" value={cartao.id} />
                    <input type="hidden" name="vencimento" value={foco.vencimento} />
                    <Selecao rotulo="Pagar com a conta" id="pf_conta" name="conta_id" required defaultValue={cartao.conta_pagadora_id ?? ""}>
                      <option value="" disabled>Escolha…</option>
                      {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                    </Selecao>
                    <Campo rotulo="Data do pagamento" id="pf_data" name="data" type="date" defaultValue={foco.vencimento < hoje ? hoje : foco.vencimento} required />
                    <Campo rotulo="Valor (em branco: o saldo todo)" id="pf_valor" name="valor" inputMode="decimal" />
                  </BotaoLancamento>
              )}
            >
              <Tabela cabecalho={["Data", "Descrição", "Parcela", "Valor"]} principal="Descrição" total={1}>
                {(lancamentos ?? []).filter((l) => l.vencimento === foco.vencimento).map((l) => (
                  <tr key={l.baixa_id} className="tabular-nums">
                    <td>{formatarData(l.data)}</td>
                    <td>{l.descricao}</td>
                    <td>{l.parcela_total > 1 ? `${l.parcela_numero}/${l.parcela_total}` : "–"}</td>
                    <td className={Number(l.valor_cents) < 0 ? "text-positivo" : ""}>{formatarMoeda(l.valor_cents)}</td>
                  </tr>
                ))}
              </Tabela>
            </Secao>
          )}

        </>
      )}

    </div>
  );
}
