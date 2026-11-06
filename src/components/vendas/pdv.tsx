"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { venderNoBalcao } from "@/app/(app)/vendas/actions";
import { Aviso, Botao, CLASSE_CONTROLE, classeBotao } from "@/components/ui";
import { Contador } from "@/components/vendas/controles";
import { EmbalagemPescadoIcone } from "@/components/vendas/embalagem-pescado";
import { EmitirNfce } from "@/components/vendas/emitir-nfce";
import { formatarInteiro, formatarMoeda, lerCentavos } from "@/lib/formato";
import { estoqueNoCarrinho } from "@/lib/estoque-carrinho";
import { agruparPorEmbalagem, textoQuantidade, vendidoPorKg } from "@/lib/pescado";
import { fecharPagamento, FORMAS_PDV, notasSugeridas, precoVigente, type FormaPdv, type ListaPreco, type PagamentoPdv, type PrecoTabela } from "@/lib/vendas";
import type { ClienteVenda, ContaVenda, ProdutoVenda } from "@/lib/vendas-dados";

type Props = {
  clientes: ClienteVenda[]; produtos: ProdutoVenda[]; precos: PrecoTabela[]; listas: ListaPreco[]; contas: ContaVenda[]; hoje: string; empresa: string; nfce?: boolean;
  // ponto de venda do caixa (null = piscicultura, empresa sem pontos)
  ponto?: { id: string; nome: string; sede: boolean } | null;
};
type Concluida = { pedidoId: string; numero: number; total: number; troco: number; itens: { nome: string; quantidade: number; preco: number; texto: string }[]; pagamentos: PagamentoPdv[]; cliente: string };

const CHAVE_CONTA = "balbina.pdv.conta";

function lerConta(empresa: string) {
  try {
    return localStorage.getItem(`${CHAVE_CONTA}.${empresa}`) ?? "";
  } catch {
    return "";
  }
}

export function Pdv({ clientes, produtos, precos, listas, contas, hoje, empresa, nfce = false, ponto = null }: Props) {
  const [enviando, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [cliente, setCliente] = useState<ClienteVenda | null>(null);
  const [trocandoCliente, setTrocandoCliente] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [pagando, setPagando] = useState(false);
  const [aberto, setAberto] = useState(false); // painel do carrinho no celular
  const [pagamentos, setPagamentos] = useState<PagamentoPdv[]>([]);
  const [forma, setForma] = useState<FormaPdv>("dinheiro");
  const [valor, setValor] = useState("");
  const bancos = contas.filter((c) => c.tipo !== "caixinha");
  // a conta só aparece depois de escolher Pix/cartão, então ler o navegador aqui não quebra a hidratação
  const [conta, setConta] = useState(() => {
    const salva = typeof window === "undefined" ? "" : lerConta(empresa);
    return salva && contas.some((c) => c.id === salva) ? salva : bancos[0]?.id ?? "";
  });
  const [erro, setErro] = useState<string | null>(null);
  const [concluida, setConcluida] = useState<Concluida | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const campoBusca = useRef<HTMLInputElement>(null);

  // Tabela da venda: a do cliente, a não ser que o caixa troque nesta venda
  const [tabelaEscolhida, setTabelaEscolhida] = useState<string | null>(null);
  const ativas = listas.filter((l) => l.ativa);
  const padrao = listas.find((l) => l.padrao)?.id ?? "";
  const tabelaCliente = cliente?.lista_preco_id && ativas.some((l) => l.id === cliente.lista_preco_id) ? cliente.lista_preco_id : padrao;
  const tabela = tabelaEscolhida ?? tabelaCliente;
  const preco = useMemo(() => precoVigente(precos, hoje, listas), [precos, hoje, listas]);
  const precoDe = (p: string) => preco(p, cliente?.id, tabela) ?? 0;
  const escolherCliente = (c: ClienteVenda | null) => {
    setCliente(c);
    setTabelaEscolhida(null);
  };
  const visiveis = produtos.filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const grupos = agruparPorEmbalagem(visiveis);
  const itens = produtos.filter((p) => (carrinho[p.id] ?? 0) > 0).map((p) => ({ ...p, quantidade: carrinho[p.id], preco: precoDe(p.id) }));
  const total = itens.reduce((s, i) => s + Math.round(i.quantidade * i.preco), 0);
  const fechamento = fecharPagamento(total, pagamentos);
  const semPreco = itens.filter((i) => i.preco === 0);

  // O que está no carrinho já sai do estoque da classe do peixe, em todas as formas (kg e caixa)
  const estoque = estoqueNoCarrinho(produtos, carrinho);

  // Põe no carrinho só o que o estoque da classe ainda tem; nunca passa do que sobrou
  function mudarQuantidade(id: string, quantidade: number) {
    const limite = estoque.get(id)?.max;
    const produto = produtos.find((p) => p.id === id);
    const nome = produto?.nome ?? "";
    if (limite !== undefined && quantidade > limite) {
      setErro(limite > 0 ? `Só há estoque para ${textoQuantidade(limite, produto?.fator_kg, produto?.unidade)} de ${nome}.` : `Sem estoque de ${nome}: o peixe desta classe já está no carrinho ou acabou.`);
      quantidade = limite;
    } else setErro(null);
    setCarrinho((c) => ({ ...c, [id]: Math.max(quantidade, 0) }));
  }
  const adicionar = (id: string, delta = 1) => mudarQuantidade(id, (carrinho[id] ?? 0) + delta);

  function limpar() {
    setCarrinho({});
    setPagamentos([]);
    escolherCliente(null);
    setPagando(false);
    setAberto(false);
    setErro(null);
    setValor("");
    setForma("dinheiro");
    setClientId(crypto.randomUUID());
    setConcluida(null);
    setBusca("");
    campoBusca.current?.focus();
  }

  function irParaPagamento() {
    setErro(null);
    if (itens.length === 0) return setErro("Toque nos produtos para montar a venda.");
    if (semPreco.length) return setErro(`Sem preço na tabela: ${semPreco.map((i) => i.nome).join(", ")}. Cadastre em Preços.`);
    setPagando(true);
    setAberto(true);
    setValor("");
  }

  function adicionarPagamento(f: FormaPdv, centavos: number | null) {
    if (!centavos || centavos <= 0) return setErro("Valor inválido.");
    setErro(null);
    setPagamentos((ps) => [...ps, { forma: f, valor_cents: centavos }]);
    setValor("");
  }

  const qtd = (q: number, p: { fator_kg: number | null; unidade: string }) => textoQuantidade(q, p.fator_kg, p.unidade);

  function finalizar() {
    if (!fechamento.pronto || enviando) return;
    if (pagamentos.some((p) => p.forma !== "dinheiro") && !conta) return setErro("Escolha a conta onde cai o Pix e o cartão.");
    try {
      if (conta) localStorage.setItem(`${CHAVE_CONTA}.${empresa}`, conta);
    } catch {
      // sem armazenamento local: só não lembra a conta
    }
    iniciar(async () => {
      const r = await venderNoBalcao({
        client_id: clientId,
        cliente_id: cliente?.id ?? null,
        lista_id: tabela !== tabelaCliente ? tabela : null,
        itens: itens.map((i) => ({ produto_id: i.id, quantidade: i.quantidade })),
        pagamentos: pagamentos.map((p) => ({ ...p, conta_id: p.forma === "dinheiro" ? null : conta })),
        ponto_venda_id: ponto?.id ?? null,
      });
      if ("erro" in r) return setErro(r.erro);
      setConcluida({
        pedidoId: r.pedidoId, numero: r.numero, total: r.total_cents, troco: r.troco_cents, pagamentos, cliente: cliente?.nome ?? "Consumidor final",
        itens: itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco, texto: qtd(i.quantidade, i) })),
      });
    });
  }

  // Atalhos de teclado do caixa: F2 recebe/finaliza, Esc volta, / busca
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (concluida) {
        // digitando o CPF da NFC-e: Enter envia o formulário, não começa outra venda
        if (document.activeElement?.tagName === "INPUT") return;
        if (e.key === "Enter" || e.key === "Escape" || e.key === "F2") { e.preventDefault(); limpar(); }
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (pagando) finalizar();
        else irParaPagamento();
      } else if (e.key === "Escape") {
        if (pagando) setPagando(false);
        else setAberto(false);
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        campoBusca.current?.focus();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const clientesFiltrados = clientes.filter((c) => c.nome !== "Consumidor final" && (!buscaCliente.trim() || c.nome.toLowerCase().includes(buscaCliente.trim().toLowerCase()))).slice(0, 8);
  const falta = fechamento.falta;

  if (concluida) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="print:hidden flex flex-col items-center gap-2">
          <p className="text-sm text-texto-suave">Venda nº {concluida.numero} concluída</p>
          <p className="text-4xl font-semibold tabular-nums">{formatarMoeda(concluida.total)}</p>
          {concluida.troco > 0 && (
            <p className="rounded-lg bg-[var(--etiqueta-positivo)] px-6 py-3 text-2xl font-semibold text-[var(--etiqueta-positivo-texto)] tabular-nums">Troco: {formatarMoeda(concluida.troco)}</p>
          )}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Botao type="button" onClick={limpar} className="h-12 px-8 text-base" autoFocus>Nova venda (Enter)</Botao>
            <Botao type="button" variante="secundario" onClick={() => window.print()} className="h-12">Imprimir cupom</Botao>
          </div>
          {nfce && <div className="mt-2"><EmitirNfce pedidoId={concluida.pedidoId} /></div>}
        </div>
        {/* Cupom não fiscal, só aparece na impressão */}
        <div className="hidden text-left font-mono text-xs text-black print:fixed print:inset-0 print:z-50 print:block print:w-72 print:bg-white print:p-2">
          <p className="text-center font-semibold">CUPOM NÃO FISCAL</p>
          <p className="text-center">Venda nº {concluida.numero} · {new Date().toLocaleString("pt-BR")}</p>
          {ponto && !ponto.sede && <p className="text-center">{ponto.nome}</p>}
          <p className="mb-2 text-center">{concluida.cliente}</p>
          {concluida.itens.map((i) => (
            <p key={i.nome} className="flex justify-between gap-2"><span>{i.texto} × {i.nome}</span><span>{formatarMoeda(Math.round(i.quantidade * i.preco))}</span></p>
          ))}
          <p className="mt-2 flex justify-between border-t border-dashed pt-1 font-semibold"><span>TOTAL</span><span>{formatarMoeda(concluida.total)}</span></p>
          {concluida.pagamentos.map((p, i) => (
            <p key={i} className="flex justify-between"><span>{FORMAS_PDV[p.forma]}</span><span>{formatarMoeda(p.valor_cents)}</span></p>
          ))}
          {concluida.troco > 0 && <p className="flex justify-between"><span>Troco</span><span>{formatarMoeda(concluida.troco)}</span></p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-24 lg:grid-cols-[1fr_24rem] lg:pb-0">
      {/* Produtos */}
      <section className="flex flex-col gap-3">
        <input ref={campoBusca} type="search" aria-label="Buscar produto" placeholder="Buscar produto  ( / )" value={busca} autoFocus
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && visiveis.length === 1) { adicionar(visiveis[0].id); setBusca(""); } }}
          className={`h-12 text-base ${CLASSE_CONTROLE}`} />
        {produtos.length === 0 && <p className="text-sm text-texto-suave">Nenhum produto de pescado ativo. Cadastre em Produtos.</p>}
        {grupos.map((g) => (
          <div key={g.embalagem} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 pt-1 text-sm font-semibold">
              <EmbalagemPescadoIcone embalagem={g.embalagem} className="size-6" />
              {g.titulo}
              <span className="text-xs font-normal text-texto-suave tabular-nums">{formatarInteiro(g.itens.length)}</span>
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {g.itens.map((p) => {
                const q = carrinho[p.id] ?? 0;
                const pr = precoDe(p.id);
                const resta = estoque.get(p.id)?.resta ?? null;
                const esgotado = resta !== null && resta <= 0;
                return (
                  <button key={p.id} type="button" onClick={() => adicionar(p.id)} aria-disabled={esgotado || undefined}
                    className={`relative ${esgotado && q === 0 ? "opacity-60" : ""} flex min-h-24 flex-col justify-between gap-2 rounded-lg border p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] ${q > 0 ? "border-marca bg-marca-suave/60" : "border-borda bg-superficie hover:bg-elevado/60"}`}>
                    <span className="flex items-start gap-2">
                      <EmbalagemPescadoIcone embalagem={g.embalagem} className="size-8 sm:size-10" />
                      <span className="min-w-0 break-words text-sm font-medium leading-tight">{p.nome}</span>
                    </span>
                    <span className="flex items-end justify-between gap-1">
                      <span className={`text-base font-semibold tabular-nums ${pr ? "" : "text-perigo"}`}>{pr ? formatarMoeda(pr) : "sem preço"}{pr && vendidoPorKg(p.fator_kg) ? <span className="text-xs font-normal text-texto-suave">/kg</span> : null}</span>
                      {resta !== null && <span className={`whitespace-nowrap text-xs ${esgotado ? "text-alerta" : "text-texto-suave"}`}>{esgotado ? "esgotado" : qtd(resta, p)}</span>}
                    </span>
                    {q > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex min-w-6 items-center justify-center rounded-full bg-marca px-1.5 text-xs font-semibold text-white tabular-nums">
                        {vendidoPorKg(p.fator_kg) ? qtd(q, p) : formatarInteiro(q)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Carrinho e pagamento: coluna no computador, tela cheia no celular */}
      <aside className={`${aberto ? "fixed inset-0 z-[35] flex overflow-y-auto" : "hidden"} flex-col gap-3 bg-fundo p-4 lg:static lg:z-auto lg:flex lg:rounded-lg lg:border lg:border-borda lg:bg-superficie`}>
        <div className="flex items-center justify-between lg:hidden">
          <p className="font-semibold">{pagando ? "Pagamento" : "Carrinho"}</p>
          <button type="button" className={classeBotao("secundario", "sm")} onClick={() => (pagando ? setPagando(false) : setAberto(false))}>voltar</button>
        </div>

        {/* Cliente opcional */}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-texto-suave">Cliente</span>
          <button type="button" className={classeBotao("secundario", "sm")} onClick={() => setTrocandoCliente(!trocandoCliente)}>
            {cliente?.nome ?? "Consumidor final"}
          </button>
        </div>
        {ativas.length > 1 && (
          <label className="flex items-center justify-between gap-2 text-sm">
            <span className="text-texto-suave">Tabela</span>
            <select value={tabela} onChange={(e) => setTabelaEscolhida(e.target.value === tabelaCliente ? null : e.target.value)}
              className={`h-9 max-w-[60%] ${CLASSE_CONTROLE}`}>
              {ativas.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.id === tabelaCliente && cliente ? " (do cliente)" : ""}</option>)}
            </select>
          </label>
        )}
        {trocandoCliente && (
          <div className="flex flex-col gap-2 rounded-md border border-borda p-2">
            <input type="search" aria-label="Buscar cliente" placeholder="Buscar cliente" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} autoFocus
              className={`h-10 ${CLASSE_CONTROLE}`} />
            <div className="flex flex-wrap gap-1">
              <button type="button" className="rounded-full border border-borda px-3 py-1 text-xs" onClick={() => { escolherCliente(null); setTrocandoCliente(false); }}>Consumidor final</button>
              {clientesFiltrados.map((c) => (
                <button key={c.id} type="button" className="rounded-full border border-borda px-3 py-1 text-xs hover:bg-elevado/60" onClick={() => { escolherCliente(c); setTrocandoCliente(false); setBuscaCliente(""); }}>{c.nome}</button>
              ))}
            </div>
          </div>
        )}

        {!pagando ? (
          <>
            {itens.length === 0 ? (
              <p className="rounded-md border border-dashed border-borda p-6 text-center text-sm text-texto-suave">Toque nos produtos para adicionar.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-borda">
                {itens.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{i.nome}</p>
                      <p className="text-xs text-texto-suave tabular-nums">{formatarMoeda(i.preco)}{vendidoPorKg(i.fator_kg) ? "/kg" : ""} · {formatarMoeda(Math.round(i.quantidade * i.preco))}</p>
                    </div>
                    <Contador rotulo={i.nome} valor={i.quantidade} casas={vendidoPorKg(i.fator_kg) ? 3 : 0} max={estoque.get(i.id)?.max} onChange={(v) => mudarQuantidade(i.id, v)} />
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end justify-between border-t border-borda pt-3">
              <span className="text-sm text-texto-suave">Total</span>
              <span className="text-3xl font-semibold tabular-nums">{formatarMoeda(total)}</span>
            </div>
            {erro && <Aviso>{erro}</Aviso>}
            <Botao type="button" onClick={irParaPagamento} className="h-14 text-lg">Receber (F2)</Botao>
            {itens.length > 0 && <button type="button" className={classeBotao("secundario", "sm")} onClick={limpar}>Cancelar venda</button>}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-elevado/60 p-2"><p className="text-xs text-texto-suave">Total</p><p className="text-xl font-semibold tabular-nums">{formatarMoeda(total)}</p></div>
              <div className={`rounded-md p-2 ${falta > 0 ? "bg-[var(--etiqueta-alerta)]" : "bg-[var(--etiqueta-positivo)]"}`}>
                <p className="text-xs text-texto-suave">{falta > 0 ? "Falta" : "Troco"}</p>
                <p className="text-xl font-semibold tabular-nums">{formatarMoeda(falta > 0 ? falta : fechamento.troco)}</p>
              </div>
            </div>

            {pagamentos.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {pagamentos.map((p, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md border border-borda px-3 py-1.5">
                    <span>{FORMAS_PDV[p.forma]}</span>
                    <span className="flex items-center gap-3 tabular-nums">{formatarMoeda(p.valor_cents)}
                      <button type="button" aria-label="Remover pagamento" className="text-texto-suave" onClick={() => setPagamentos(pagamentos.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {falta > 0 && (
              <>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Forma de pagamento">
                  {(Object.keys(FORMAS_PDV) as FormaPdv[]).map((f) => (
                    <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}
                      className={`h-12 rounded-md border text-sm font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] ${forma === f ? "border-destaque bg-destaque text-destaque-texto" : "border-borda bg-superficie hover:bg-elevado/60"}`}>
                      {FORMAS_PDV[f]}
                    </button>
                  ))}
                </div>
                {forma === "dinheiro" ? (
                  <div className="flex flex-wrap gap-2">
                    {notasSugeridas(falta).map((n) => (
                      <button key={n} type="button" onClick={() => adicionarPagamento("dinheiro", n)}
                        className="h-11 flex-1 rounded-xl border border-borda bg-superficie px-3 text-sm font-medium tabular-nums hover:bg-elevado/60">
                        {n === falta ? "Exato" : formatarMoeda(n)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Botao type="button" onClick={() => adicionarPagamento(forma, falta)} className="h-12">
                    {FORMAS_PDV[forma]} de {formatarMoeda(falta)}
                  </Botao>
                )}
                <div className="flex gap-2">
                  <input aria-label="Outro valor" inputMode="decimal" placeholder="Outro valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") adicionarPagamento(forma, lerCentavos(valor)); }}
                    className={`h-11 min-w-0 flex-1 ${CLASSE_CONTROLE}`} />
                  <Botao type="button" variante="secundario" onClick={() => adicionarPagamento(forma, lerCentavos(valor))} className="h-11">Somar</Botao>
                </div>
              </>
            )}

            {pagamentos.some((p) => p.forma !== "dinheiro") && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-texto-suave">Pix e cartão caem na conta</span>
                <select value={conta} onChange={(e) => setConta(e.target.value)} className={`h-10 ${CLASSE_CONTROLE}`}>
                  <option value="" disabled>Escolha…</option>
                  {bancos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
            )}

            {fechamento.erro && <Aviso>{fechamento.erro}</Aviso>}
            {erro && <Aviso>{erro}</Aviso>}
            <Botao type="button" onClick={finalizar} disabled={!fechamento.pronto || enviando} className="h-14 text-lg">
              {enviando ? "Finalizando…" : "Finalizar venda (F2)"}
            </Botao>
            <button type="button" className={classeBotao("secundario", "sm")} onClick={() => { setPagando(false); setPagamentos([]); }}>Voltar ao carrinho</button>
          </>
        )}
      </aside>

      {/* Barra do celular */}
      {!aberto && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-borda bg-superficie/95 px-4 py-3 backdrop-blur lg:hidden">
          <button type="button" className="text-left" onClick={() => setAberto(true)}>
            <span className="block text-xs text-texto-suave">{itens.length} {itens.length === 1 ? "item" : "itens"} · ver carrinho</span>
            <span className="text-xl font-semibold tabular-nums">{formatarMoeda(total)}</span>
          </button>
          <Botao type="button" onClick={irParaPagamento} className="h-12 px-6 text-base" disabled={itens.length === 0}>Receber</Botao>
        </div>
      )}
      {!aberto && erro && <div className="fixed inset-x-4 bottom-20 z-20 lg:hidden"><Aviso>{erro}</Aviso></div>}
    </div>
  );
}
