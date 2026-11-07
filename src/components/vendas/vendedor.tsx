"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { CLASSE_BOTAO_TEXTO, CLASSE_CONTROLE, classeBotao, Etiqueta } from "@/components/ui";
import { Chip, Contador, Opcao } from "@/components/vendas/controles";
import { formatarData, formatarMoeda, hojeISO, somarDias } from "@/lib/formato";
import { useOnline } from "@/lib/online";
import { gravarJson, lerJson } from "@/lib/db/indexeddb";
import { useItemArmazenado } from "@/lib/db/use-armazem";
import { marcarSemRede } from "@/lib/sync/detector";
import { useTarefaSync } from "@/lib/sync/navegador";
import { liberar, prontoAgora, registrarFalha, type ComRetry } from "@/lib/sync/queue";
import { useServiceWorker } from "@/components/offline";
import { estoqueNoCarrinho } from "@/lib/estoque-carrinho";
import { textoKg, textoQuantidade, vendidoPorKg } from "@/lib/pescado";
import { resumoWhatsapp } from "@/lib/pedido-campo";
import { FORMAS_PAGAMENTO } from "@/lib/titulos";
import { CONDICOES, STATUS_PEDIDO, TOM_STATUS_PEDIDO, linkWhatsapp, precoVigente, type ListaPreco, type PrecoTabela } from "@/lib/vendas";
import type { ClienteVenda, ProdutoVenda, UltimoPedido } from "@/lib/vendas-dados";

export type PedidoVendedor = { id: string; numero: number; data: string; status: string; total_cents: number; cliente: string };
type Props = {
  empresa: { id: string; nome: string; fuso: string };
  clientes: ClienteVenda[];
  produtos: ProdutoVenda[];
  precos: PrecoTabela[];
  listas: ListaPreco[];
  ultimos: UltimoPedido[];
  pedidos: PedidoVendedor[];
};

// O que vai para /api/pedidos, mais o que a tela precisa para mostrar a fila sem rede
type Envio = { client_id: string; cliente_id: string; data: string; condicao: string; forma_pagamento: string | null; entrega: string | null; observacoes: string; faturar: boolean; itens: { produto_id: string; quantidade: number }[] };
type Pendente = Envio & ComRetry & { cliente_nome: string; telefone: string | null; total_estimado: number; resumo: { nome: string; quantidade: number; preco_cents: number | null }[]; erro?: string };
type Enviado = Pendente & { numero: number | null; total_cents: number; aviso?: string; enviado_em: string };

const FORMAS_RAPIDAS = ["pix", "boleto", "dinheiro", "cartao", "ted"] as const;

// A fila e o histórico moram no armazém do aparelho (IndexedDB, src/lib/db/indexeddb.ts)
function ler<T>(chave: string, padrao: T): T {
  return lerJson<T>(chave, padrao);
}
function gravar(chave: string, valor: unknown) {
  gravarJson(chave, valor);
}
function useGuardado<T>(chave: string): T[] {
  const bruto = useItemArmazenado(chave, "[]");
  return useMemo(() => {
    try {
      const v = JSON.parse(bruto);
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }, [bruto]);
}
export function AppVendedor({ empresa, clientes, produtos, precos, listas, ultimos, pedidos }: Props) {
  const chaveFila = `balbina:vendedor:fila:${empresa.id}`;
  const chaveEnviados = `balbina:vendedor:enviados:${empresa.id}`;
  const online = useOnline();
  const fila = useGuardado<Pendente>(chaveFila);
  const enviados = useGuardado<Enviado>(chaveEnviados);
  const [aba, setAba] = useState<"novo" | "pedidos">("novo");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // o dia do pedido é o do celular no fuso da empresa (offline pode ser enviado amanhã)
  const hoje = useSyncExternalStore(() => () => undefined, () => hojeISO(empresa.fuso), () => hojeISO(empresa.fuso));
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<ClienteVenda | null>(null);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [condicao, setCondicao] = useState("avista");
  const [forma, setForma] = useState<string>("pix");
  const [entrega, setEntrega] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [faturar, setFaturar] = useState(false);

  // service worker: guarda esta tela e os arquivos dela para abrir sem sinal (igual ao /campo)
  useServiceWorker();

  const preco = useMemo(() => precoVigente(precos, hoje, listas), [precos, hoje, listas]);
  const nomeLista = useMemo(() => new Map(listas.map((l) => [l.id, l.nome])), [listas]);
  const padrao = listas.find((l) => l.padrao);
  const tabelaDe = (c: ClienteVenda) => (c.lista_preco_id && listas.some((l) => l.id === c.lista_preco_id && l.ativa) ? c.lista_preco_id : padrao?.id ?? null);
  const precoDe = (produto: string) => (cliente ? preco(produto, cliente.id, tabelaDe(cliente)) : null);
  const ultimoDe = useMemo(() => new Map(ultimos.map((u) => [u.cliente_id, u])), [ultimos]);

  const ordem = useMemo(() => new Map(ultimos.map((u, i) => [u.cliente_id, i])), [ultimos]);
  const sugeridos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    const lista = termo
      ? clientes.filter((c) => c.nome.toLowerCase().includes(termo) || (c.cidade ?? "").toLowerCase().includes(termo) || (digitos && (c.cpf_cnpj ?? "").includes(digitos)))
      : [...clientes].sort((a, b) => (ordem.get(a.id) ?? 1e9) - (ordem.get(b.id) ?? 1e9));
    return lista.slice(0, 8);
  }, [busca, clientes, ordem]);

  // estoque único da classe do peixe: o que a outra forma (kg ou caixa) já pegou sai do disponível desta
  const estoque = estoqueNoCarrinho(produtos, qtd);
  const linhas = produtos.map((p) => ({ ...p, disponivel: estoque.get(p.id)?.max ?? null, quantidade: qtd[p.id] ?? 0, preco: precoDe(p.id) }));
  const escolhidas = linhas.filter((l) => l.quantidade > 0);
  const total = escolhidas.reduce((s, l) => s + Math.round(l.quantidade * (l.preco ?? 0)), 0);
  const kg = escolhidas.reduce((s, l) => s + l.quantidade * (l.fator_kg ?? 0), 0);
  const semPreco = escolhidas.filter((l) => l.preco === null);

  const sincronizar = useCallback(async () => {
    const agora = Date.now();
    const atual = ler<Pendente[]>(chaveFila, []).filter((p) => prontoAgora(p, agora));
    if (!atual.length || !navigator.onLine) return;
    setEnviando(true);
    const ok = new Map<string, { numero: number | null; total_cents: number; aviso?: string }>();
    const erros = new Map<string, { erro: string; parado: boolean }>();
    for (const p of atual) {
      try {
        const envio: Envio = {
          client_id: p.client_id, cliente_id: p.cliente_id, data: p.data, condicao: p.condicao, forma_pagamento: p.forma_pagamento,
          entrega: p.entrega, observacoes: p.observacoes, faturar: p.faturar, itens: p.itens,
        };
        const resp = await fetch("/api/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envio) });
        const corpo = (await resp.json().catch(() => ({}))) as { erro?: string; numero?: number | null; total_cents?: number; aviso?: string };
        if (resp.ok) {
          ok.set(p.client_id, { numero: corpo.numero ?? null, total_cents: corpo.total_cents ?? p.total_estimado, aviso: corpo.aviso });
          continue;
        }
        // 4xx: o pedido foi recusado e só a pessoa resolve; 5xx e 429: tenta de novo sozinho, até o limite
        const parado = resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429;
        erros.set(p.client_id, { erro: corpo.erro ?? `Erro ${resp.status}`, parado });
        if (resp.status === 401) break;
      } catch {
        marcarSemRede(); // caiu o sinal no meio: o resto fica para quando a internet voltar
        break;
      }
    }
    // relê a fila: pode ter entrado pedido novo enquanto enviava
    const resto = ler<Pendente[]>(chaveFila, []);
    const marcar = (p: Pendente): Pendente => {
      const e = erros.get(p.client_id);
      if (!e) return p;
      return e.parado ? { ...p, erro: e.erro, parado: true } : registrarFalha(p, e.erro, Date.now());
    };
    gravar(chaveFila, resto.filter((p) => !ok.has(p.client_id)).map(marcar));
    if (ok.size) {
      const agora = new Date().toISOString();
      const novos = resto.filter((p) => ok.has(p.client_id)).map((p): Enviado => ({ ...p, ...ok.get(p.client_id)!, erro: undefined, enviado_em: agora }));
      gravar(chaveEnviados, [...novos, ...ler<Enviado[]>(chaveEnviados, [])].slice(0, 20));
    }
    if (ok.size || erros.size) {
      setAviso([ok.size ? `${ok.size} pedido(s) enviado(s) ao escritório.` : "", erros.size ? `${erros.size} com erro: confira na fila.` : ""].filter(Boolean).join(" "));
    }
    setEnviando(false);
  }, [chaveFila, chaveEnviados]);

  // ao abrir, a cada 5 s com internet, quando a internet volta e quando a tela volta para a frente
  useTarefaSync(`vendedor:${empresa.id}`, sincronizar, () => ler<Pendente[]>(chaveFila, []).some((p) => prontoAgora(p, Date.now())));
  const reenviar = (id: string) => {
    gravar(chaveFila, ler<Pendente[]>(chaveFila, []).map((p) => (p.client_id === id ? liberar(p) : p)));
    void sincronizar();
  };

  function escolher(c: ClienteVenda) {
    setCliente(c);
    setBusca("");
    setAviso(null);
    const u = ultimoDe.get(c.id);
    if (u?.condicao) setCondicao(u.condicao);
    if (u?.forma_pagamento) setForma(u.forma_pagamento);
  }

  function repetir(u: UltimoPedido) {
    setQtd(Object.fromEntries(u.itens.filter((i) => produtos.some((p) => p.id === i.produto_id)).map((i) => [i.produto_id, i.quantidade])));
  }

  function limpar() {
    setCliente(null);
    setQtd({});
    setObservacoes("");
    setEntrega("");
    setFaturar(false);
  }

  function enviar() {
    if (!cliente) return setAviso("Escolha o cliente.");
    if (!escolhidas.length) return setAviso("Adicione pelo menos um produto.");
    if (semPreco.length) return setAviso(`Sem preço na tabela para ${semPreco.map((l) => l.nome).join(", ")}. Peça ao escritório para cadastrar.`);
    const novo: Pendente = {
      client_id: crypto.randomUUID(), cliente_id: cliente.id, data: hoje, condicao, forma_pagamento: forma || null,
      entrega: entrega || null, observacoes, faturar, itens: escolhidas.map((l) => ({ produto_id: l.id, quantidade: l.quantidade })),
      cliente_nome: cliente.nome, telefone: cliente.telefone, total_estimado: total,
      resumo: escolhidas.map((l) => ({ nome: l.nome, quantidade: l.quantidade, preco_cents: l.preco })),
    };
    gravar(chaveFila, [...ler<Pendente[]>(chaveFila, []), novo]);
    limpar();
    setAviso(navigator.onLine ? "Enviando o pedido…" : "Pedido guardado no celular. Envia sozinho quando voltar o sinal.");
    setAba("pedidos");
    void sincronizar();
  }

  const descartar = (id: string) => gravar(chaveFila, ler<Pendente[]>(chaveFila, []).filter((p) => p.client_id !== id));
  const whatsapp = (p: Enviado) => linkWhatsapp(p.telefone, resumoWhatsapp({
    empresa: empresa.nome, cliente: p.cliente_nome, numero: p.numero, itens: p.resumo, total_cents: p.total_cents,
    condicao: CONDICOES[p.condicao]?.nome ?? p.condicao, entrega: p.entrega,
  }));
  const ultimo = cliente ? ultimoDe.get(cliente.id) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 pb-32">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Vendedor</h1>
          <p className="text-sm text-texto-suave">{empresa.nome}</p>
        </div>
        <Etiqueta tom={online ? "positivo" : "perigo"}>
          <span aria-hidden className={`size-1.5 rounded-full ${online ? "bg-positivo" : "bg-perigo"}`} />
          {online ? "online" : "sem sinal"}
        </Etiqueta>
      </header>

      <nav aria-label="Telas do vendedor" className="grid grid-cols-2 gap-1 rounded-full bg-elevado p-1 text-sm">
        {([["novo", "Novo pedido"], ["pedidos", `Pedidos${fila.length ? ` (${fila.length} na fila)` : ""}`]] as const).map(([k, nome]) => (
          <button key={k} type="button" aria-pressed={aba === k} onClick={() => setAba(k)}
            className={`min-h-10 rounded-full font-medium transition-colors ${aba === k ? "bg-solido/90 text-texto shadow-[0_2px_10px_-2px_rgb(0_0_0/0.18)]" : "text-texto-suave"}`}>
            {nome}
          </button>
        ))}
      </nav>

      {aviso && <p role="status" className="rounded-xl border border-borda bg-superficie p-3 text-sm">{aviso}</p>}

      {aba === "novo" ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Cliente</h2>
            {cliente ? (
              <div className="vidro flex flex-col gap-2 rounded-2xl border border-borda p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{cliente.nome}</p>
                    <p className="text-sm text-texto-suave">
                      {[cliente.cidade, `Tabela ${nomeLista.get(tabelaDe(cliente) ?? "") ?? "padrão"}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button type="button" className={classeBotao("secundario", "sm")} onClick={() => setCliente(null)}>Trocar</button>
                </div>
                {ultimo && (
                  <button type="button" className={classeBotao("secundario", "sm", true)} onClick={() => repetir(ultimo)}>
                    Repetir o último pedido ({formatarData(ultimo.data)})
                  </button>
                )}
              </div>
            ) : (
              <>
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, cidade ou CPF/CNPJ"
                  aria-label="Buscar cliente" className={`${CLASSE_CONTROLE} h-12 text-base`} />
                <ul className="flex flex-col gap-1">
                  {sugeridos.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => escolher(c)} className="vidro flex min-h-12 w-full flex-col items-start rounded-xl border border-borda px-3 py-2 text-left">
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-xs text-texto-suave">{[c.cidade, ultimoDe.get(c.id) ? `último pedido ${formatarData(ultimoDe.get(c.id)!.data)}` : null].filter(Boolean).join(" · ") || "sem pedido ainda"}</span>
                      </button>
                    </li>
                  ))}
                  {sugeridos.length === 0 && <li className="text-sm text-texto-suave">Nenhum cliente encontrado. Novos clientes são cadastrados no escritório.</li>}
                </ul>
              </>
            )}
          </section>

          {cliente && (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Produtos</h2>
                {linhas.length === 0 && <p className="text-sm text-texto-suave">Nenhum produto de venda cadastrado.</p>}
                <ul className="flex flex-col gap-2">
                  {linhas.map((l) => (
                    <li key={l.id} className="vidro flex items-center justify-between gap-3 rounded-2xl border border-borda p-3">
                      <div className="min-w-0">
                        <p className="font-medium">{l.nome}</p>
                        <p className="text-sm text-texto-suave tabular-nums">
                          {l.preco === null ? "sem preço na tabela" : `${formatarMoeda(l.preco)}${vendidoPorKg(l.fator_kg) ? " o kg" : ""}`}
                          {l.disponivel !== null && ` · ${textoQuantidade(l.disponivel, l.fator_kg, l.unidade)} em estoque`}
                        </p>
                      </div>
                      <Contador valor={l.quantidade} rotulo={l.nome} casas={vendidoPorKg(l.fator_kg) ? 3 : 0} max={l.disponivel ?? undefined} onChange={(v) => setQtd((q) => ({ ...q, [l.id]: v }))} />
                    </li>
                  ))}
                </ul>
              </section>

              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium">Pagamento e entrega</h2>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(CONDICOES).map(([k, c]) => <Chip key={k} ativo={condicao === k} onClick={() => setCondicao(k)}>{c.nome}</Chip>)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {FORMAS_RAPIDAS.map((f) => <Chip key={f} ativo={forma === f} onClick={() => setForma(f)}>{FORMAS_PAGAMENTO[f]}</Chip>)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[["", "Sem data"], [hoje, "Hoje"], [somarDias(hoje, 1), "Amanhã"]].map(([v, nome]) => (
                    <Chip key={nome} ativo={entrega === v} onClick={() => setEntrega(v)}>{nome}</Chip>
                  ))}
                  <input type="date" aria-label="Data de entrega" min={hoje} value={entrega} onChange={(e) => setEntrega(e.target.value)} className={`${CLASSE_CONTROLE} h-10 w-auto`} />
                </div>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações (endereço, horário, troco…)" rows={2}
                  aria-label="Observações" className={`${CLASSE_CONTROLE} py-2`} />
                <Opcao marcado={faturar} onChange={setFaturar} titulo="Já faturar"
                  detalhe="Baixa o estoque e lança no contas a receber assim que o pedido chegar. Sem marcar, o escritório confere e fatura." />
              </section>
            </>
          )}

          {cliente && (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-solido/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
              <div className="mx-auto flex max-w-md items-center justify-between gap-3">
                <div className="tabular-nums">
                  <p className="text-lg font-semibold">{formatarMoeda(total)}</p>
                  <p className="text-xs text-texto-suave">{kg ? `${textoKg(kg, 3)} de peixe` : escolhidas.length ? `${escolhidas.length} ${escolhidas.length === 1 ? "item" : "itens"}` : "nenhum item"}</p>
                </div>
                <button type="button" onClick={enviar} disabled={!escolhidas.length}
                  className="h-12 rounded-xl bg-destaque px-5 font-semibold text-destaque-texto transition-transform duration-150 active:scale-[0.98] disabled:opacity-40">
                  {online ? "Enviar pedido" : "Guardar pedido"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {fila.length > 0 && (
            <section className="vidro flex flex-col gap-2 rounded-2xl border border-borda p-3 text-sm">
              <div className="flex items-center justify-between">
                <strong>{fila.length} aguardando envio</strong>
                <button type="button" onClick={() => void sincronizar()} disabled={enviando || !online} className={CLASSE_BOTAO_TEXTO}>
                  {enviando ? "enviando…" : "enviar agora"}
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {fila.map((p) => (
                  <li key={p.client_id} className="flex flex-col gap-1">
                    <span>{p.cliente_nome} · {formatarData(p.data)} · {formatarMoeda(p.total_estimado)}</span>
                    {p.erro && (
                      <span className="text-perigo">
                        {p.erro}{" "}
                        {p.parado && <button type="button" className={classeBotao("secundario", "sm")} onClick={() => reenviar(p.client_id)}>reenviar</button>}{" "}
                        <button type="button" className={classeBotao("secundario", "sm")} onClick={() => descartar(p.client_id)}>descartar</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {enviados.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Enviados deste celular</h2>
              <ul className="flex flex-col gap-2">
                {enviados.map((p) => (
                  <li key={p.client_id} className="vidro flex flex-col gap-2 rounded-2xl border border-borda p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span><strong>{p.numero ? `Pedido ${p.numero}` : "Pedido"}</strong> · {p.cliente_nome}</span>
                      <span className="tabular-nums">{formatarMoeda(p.total_cents)}</span>
                    </div>
                    {p.aviso && <span className="text-perigo">{p.aviso}</span>}
                    {p.telefone && (
                      <a href={whatsapp(p)} target="_blank" rel="noreferrer" className={classeBotao("secundario", "sm")}>Mandar resumo no WhatsApp</a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Meus pedidos</h2>
            {pedidos.length === 0 ? (
              <p className="text-sm text-texto-suave">Nenhum pedido seu ainda.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pedidos.map((p) => (
                  <li key={p.id} className="vidro flex items-center justify-between gap-3 rounded-2xl border border-borda p-3 text-sm">
                    <div>
                      <p className="font-medium">Pedido {p.numero} · {p.cliente}</p>
                      <p className="text-xs text-texto-suave">{formatarData(p.data)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="tabular-nums">{formatarMoeda(p.total_cents)}</span>
                      <Etiqueta tom={TOM_STATUS_PEDIDO[p.status] ?? "neutro"}>{STATUS_PEDIDO[p.status] ?? p.status}</Etiqueta>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-texto-suave">A lista atualiza quando a tela abre com internet. Abra uma vez com sinal e adicione à tela inicial: depois funciona sem internet.</p>
          </section>
        </>
      )}
    </main>
  );
}
