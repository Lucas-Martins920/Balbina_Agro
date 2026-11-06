"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarClienteRapido, registrarVenda } from "@/app/(app)/vendas/actions";
import { Aviso, Botao, CLASSE_BOTAO_TEXTO, CLASSE_CONTROLE, classeBotao } from "@/components/ui";
import { Chip, Contador, Opcao } from "@/components/vendas/controles";
import { formatarData, formatarInteiro, formatarMoeda, lerCentavos } from "@/lib/formato";
import { estoqueNoCarrinho } from "@/lib/estoque-carrinho";
import { textoKg, textoQuantidade, vendidoPorKg } from "@/lib/pescado";
import { FORMAS_PAGAMENTO } from "@/lib/titulos";
import { CONDICOES, precoVigente, type ListaPreco, type PrecoTabela } from "@/lib/vendas";
import type { ClienteVenda, ContaVenda, ProdutoVenda, UltimoPedido } from "@/lib/vendas-dados";

type Props = {
  clientes: ClienteVenda[];
  produtos: ProdutoVenda[];
  precos: PrecoTabela[];
  listas: ListaPreco[];
  contas: ContaVenda[];
  ultimos: UltimoPedido[];
  asaasAtivo: boolean;
  hoje: string;
  clienteInicial?: string;
  repetir?: boolean;
  // pontos de venda ativos (a piscicultura primeiro); o seletor só aparece com mais de um
  pontos?: { id: string; nome: string }[];
};

const FORMAS_RAPIDAS = ["pix", "boleto", "dinheiro", "cartao", "ted"] as const;
const RECEBE_NA_HORA = new Set(["pix", "dinheiro", "cartao", "ted"]);

function amanha(hoje: string) {
  const d = new Date(`${hoje}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function NovaVenda({ clientes: iniciais, produtos, precos, listas, contas, ultimos, asaasAtivo, hoje, clienteInicial, repetir, pontos = [] }: Props) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [clientes, setClientes] = useState(iniciais);
  const [cliente, setCliente] = useState<ClienteVenda | null>(() => iniciais.find((c) => c.id === clienteInicial) ?? null);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<{ nome: string; cpf_cnpj: string; telefone: string } | null>(null);
  const ultimoDe = useMemo(() => new Map(ultimos.map((u) => [u.cliente_id, u])), [ultimos]);
  const ultimoInicial = cliente ? ultimoDe.get(cliente.id) : undefined;

  const [qtd, setQtd] = useState<Record<string, number>>(() =>
    repetir && ultimoInicial ? Object.fromEntries(ultimoInicial.itens.map((i) => [i.produto_id, i.quantidade])) : {});
  const [precoManual, setPrecoManual] = useState<Record<string, string>>({});
  const [editandoPreco, setEditandoPreco] = useState<string | null>(null);
  const [condicao, setCondicao] = useState(ultimoInicial?.condicao ?? "avista");
  const [forma, setForma] = useState<string>(ultimoInicial?.forma_pagamento ?? "pix");
  const [entrega, setEntrega] = useState<string>(hoje);
  const [observacoes, setObservacoes] = useState("");
  const [ponto, setPonto] = useState(pontos[0]?.id ?? "");
  const [faturar, setFaturar] = useState(true);
  const [recebido, setRecebido] = useState(false);
  const [contaRecebido, setContaRecebido] = useState(() => contas.find((c) => c.tipo === "corrente")?.id ?? contas[0]?.id ?? "");
  const [cobrar, setCobrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [clientId] = useState(() => crypto.randomUUID());

  // Tabela da venda: a do cliente, a não ser que o vendedor troque nesta venda
  const [tabelaEscolhida, setTabelaEscolhida] = useState<string | null>(null);
  const padrao = listas.find((l) => l.padrao)?.id ?? "";
  const tabelaCliente = (cliente?.lista_preco_id && listas.some((l) => l.id === cliente.lista_preco_id && l.ativa)) ? cliente.lista_preco_id : padrao;
  const tabela = tabelaEscolhida ?? tabelaCliente;
  const preco = useMemo(() => precoVigente(precos, hoje, listas), [precos, hoje, listas]);
  const precoDe = (p: string) => {
    const manual = precoManual[p];
    if (manual !== undefined && manual.trim()) return lerCentavos(manual);
    return preco(p, cliente?.id, tabela);
  };

  // clientes com pedido recente primeiro
  const ordem = useMemo(() => new Map(ultimos.map((u, i) => [u.cliente_id, i])), [ultimos]);
  const sugeridos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo
      ? clientes.filter((c) => c.nome.toLowerCase().includes(termo) || (c.cpf_cnpj ?? "").includes(termo.replace(/\D/g, "") || "#"))
      : [...clientes].sort((a, b) => (ordem.get(a.id) ?? 1e9) - (ordem.get(b.id) ?? 1e9));
    return lista.slice(0, termo ? 12 : 8);
  }, [busca, clientes, ordem]);

  // estoque único da classe do peixe: o que a outra forma (kg ou caixa) já pegou sai do disponível desta
  const estoque = estoqueNoCarrinho(produtos, qtd);
  const linhas = produtos.map((p) => ({ ...p, disponivel: estoque.get(p.id)?.max ?? null, quantidade: qtd[p.id] ?? 0, preco: precoDe(p.id) }));
  const escolhidas = linhas.filter((l) => l.quantidade > 0);
  const total = escolhidas.reduce((s, l) => s + Math.round(l.quantidade * (l.preco ?? 0)), 0);
  const kg = escolhidas.reduce((s, l) => s + l.quantidade * (l.fator_kg ?? 0), 0);
  const semPreco = escolhidas.filter((l) => l.preco === null);
  const semEstoque = escolhidas.filter((l) => l.disponivel !== null && l.quantidade > l.disponivel);

  const podeReceber = faturar && condicao === "avista" && RECEBE_NA_HORA.has(forma);
  const podeCobrar = faturar && asaasAtivo && (forma === "boleto" || forma === "pix") && !(podeReceber && recebido);

  function escolherCliente(c: ClienteVenda) {
    setCliente(c);
    setTabelaEscolhida(null);
    setBusca("");
    setErro(null);
    const u = ultimoDe.get(c.id);
    if (u?.condicao) setCondicao(u.condicao);
    if (u?.forma_pagamento) setForma(u.forma_pagamento);
  }

  function repetirUltimo() {
    const u = cliente && ultimoDe.get(cliente.id);
    if (!u) return;
    setQtd(Object.fromEntries(u.itens.map((i) => [i.produto_id, i.quantidade])));
    setPrecoManual({});
  }

  function salvarNovoCliente() {
    if (!novo) return;
    iniciar(async () => {
      const r = await criarClienteRapido(novo);
      if ("erro" in r) return setErro(r.erro);
      setClientes((cs) => (cs.some((c) => c.id === r.cliente.id) ? cs : [...cs, r.cliente]));
      setNovo(null);
      escolherCliente(r.cliente);
    });
  }

  function enviar() {
    setErro(null);
    if (!cliente) return setErro("Escolha o cliente.");
    if (escolhidas.length === 0) return setErro("Adicione pelo menos um produto.");
    if (semPreco.length) return setErro(`Informe o preço de ${semPreco.map((l) => l.nome).join(", ")}.`);
    iniciar(async () => {
      const r = await registrarVenda({
        client_id: clientId,
        cliente_id: cliente.id,
        itens: escolhidas.map((l) => ({
          produto_id: l.id, quantidade: l.quantidade,
          // preço digitado ou de outra tabela vai junto; senão o banco aplica a tabela do cliente
          ...(precoManual[l.id]?.trim() || tabela !== tabelaCliente ? { preco_unit_cents: l.preco ?? undefined } : {}),
        })),
        condicao,
        forma_pagamento: forma || null,
        entrega: entrega || null,
        observacoes,
        faturar,
        recebido_conta_id: podeReceber && recebido ? contaRecebido : null,
        cobrar: podeCobrar && cobrar,
        ponto_venda_id: pontos.length > 1 && ponto !== pontos[0]?.id ? ponto : null,
      });
      if ("erro" in r) return setErro(r.erro);
      router.push(`/vendas/${r.pedidoId}${r.aviso ? `?aviso=${encodeURIComponent(r.aviso)}` : "?nova=1"}`);
    });
  }

  const ultimo = cliente ? ultimoDe.get(cliente.id) : undefined;
  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]));

  return (
    <div className="flex flex-col gap-5 pb-28">
      {/* 1. Cliente */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-texto-suave">1. Cliente</h2>
        {cliente ? (
          <div className="flex flex-col gap-2 rounded-lg border border-marca/50 bg-superficie p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{cliente.nome}</p>
                <p className="text-xs text-texto-suave">{[cliente.cpf_cnpj, cliente.telefone].filter(Boolean).join(" · ") || "Sem CPF/CNPJ e telefone"}</p>
              </div>
              <button type="button" className={classeBotao("secundario", "sm")} onClick={() => setCliente(null)}>trocar</button>
            </div>
            {ultimo && ultimo.itens.length > 0 && (
              <button type="button" onClick={repetirUltimo}
                className="rounded-md border border-dashed border-borda px-3 py-2 text-left text-sm hover:bg-elevado/60">
                <span className="font-medium">↻ Repetir o último pedido</span>
                <span className="block text-xs text-texto-suave">
                  {formatarData(ultimo.data)}: {ultimo.itens.map((i) => `${formatarInteiro(i.quantidade)} ${nomeProduto.get(i.produto_id) ?? "produto"}`).join(", ")}
                </span>
              </button>
            )}
          </div>
        ) : novo ? (
          <div className="flex flex-col gap-2 vidro rounded-2xl border border-borda p-3">
            <p className="text-sm font-medium">Novo cliente</p>
            <input autoFocus aria-label="Nome do cliente" placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              className={`h-11 ${CLASSE_CONTROLE}`} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="CPF ou CNPJ" placeholder="CPF ou CNPJ (para boleto/Pix)" inputMode="numeric" value={novo.cpf_cnpj}
                onChange={(e) => setNovo({ ...novo, cpf_cnpj: e.target.value })} className={`h-11 ${CLASSE_CONTROLE}`} />
              <input aria-label="Telefone" placeholder="WhatsApp" inputMode="tel" value={novo.telefone}
                onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} className={`h-11 ${CLASSE_CONTROLE}`} />
            </div>
            <div className="flex gap-2">
              <Botao type="button" onClick={salvarNovoCliente} disabled={enviando}>{enviando ? "Salvando…" : "Cadastrar e usar"}</Botao>
              <Botao type="button" variante="secundario" onClick={() => setNovo(null)}>Voltar</Botao>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input type="search" aria-label="Buscar cliente" placeholder="Buscar cliente por nome ou CPF/CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)}
              className={`h-11 ${CLASSE_CONTROLE}`} />
            <div className="flex flex-wrap gap-2">
              {sugeridos.map((c) => (
                <Chip key={c.id} ativo={false} onClick={() => escolherCliente(c)}>{c.nome}</Chip>
              ))}
              <Chip ativo={false} onClick={() => setNovo({ nome: busca, cpf_cnpj: "", telefone: "" })} className="border-dashed">+ Novo cliente</Chip>
            </div>
            {busca && sugeridos.length === 0 && <p className="text-sm text-texto-suave">Nenhum cliente com esse nome.</p>}
          </div>
        )}
      </section>

      {/* 2. Produtos */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-texto-suave">2. Produtos</h2>
          {listas.filter((l) => l.ativa).length > 1 && (
            <label className="flex items-center gap-2 text-sm text-texto-suave">
              Tabela
              <select value={tabela} onChange={(e) => setTabelaEscolhida(e.target.value === tabelaCliente ? null : e.target.value)}
                className={`h-9 ${CLASSE_CONTROLE}`}>
                {listas.filter((l) => l.ativa).map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}{l.id === tabelaCliente && cliente ? " (do cliente)" : ""}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {produtos.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum produto de pescado ativo. Cadastre em Produtos.</p>
        ) : (
          <ul className="divide-y divide-borda vidro rounded-2xl border border-borda">
            {linhas.map((l) => (
              <li key={l.id} className={`flex flex-wrap items-center gap-3 p-3 ${l.quantidade > 0 ? "bg-marca-suave/60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.nome}</p>
                  <p className="text-xs text-texto-suave">
                    {editandoPreco === l.id ? (
                      <input autoFocus aria-label={`Preço de ${l.nome}`} inputMode="decimal" placeholder="0,00" value={precoManual[l.id] ?? ""}
                        onChange={(e) => setPrecoManual({ ...precoManual, [l.id]: e.target.value })} onBlur={() => setEditandoPreco(null)}
                        className="h-8 w-24 rounded border border-borda bg-superficie px-2 text-sm text-texto" />
                    ) : (
                      <button type="button" className={`${CLASSE_BOTAO_TEXTO} ${l.preco === null ? "text-perigo" : ""}`} onClick={() => setEditandoPreco(l.id)}>
                        {l.preco === null ? "sem preço · definir" : `${formatarMoeda(l.preco)} ${vendidoPorKg(l.fator_kg) ? "o kg" : "cada"}`}
                      </button>
                    )}
                    {l.disponivel !== null && <span className={l.quantidade > l.disponivel ? "text-alerta" : ""}> · {textoQuantidade(l.disponivel, l.fator_kg, l.unidade)} em estoque</span>}
                  </p>
                </div>
                <Contador rotulo={l.nome} valor={l.quantidade} casas={vendidoPorKg(l.fator_kg) ? 3 : 0} max={l.disponivel ?? undefined} onChange={(v) => setQtd({ ...qtd, [l.id]: v })} />
              </li>
            ))}
          </ul>
        )}
        {semEstoque.length > 0 && (
          <p className="text-sm text-alerta">Estoque não cobre {semEstoque.map((l) => l.nome).join(", ")}. Dá para anotar o pedido e faturar depois da próxima despesca.</p>
        )}
      </section>

      {/* 3. Pagamento e entrega */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-texto-suave">3. Pagamento e entrega</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Condição de pagamento">
          {Object.entries(CONDICOES).map(([v, c]) => <Chip key={v} ativo={condicao === v} onClick={() => setCondicao(v)}>{c.nome}</Chip>)}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Forma de pagamento">
          {FORMAS_RAPIDAS.map((f) => <Chip key={f} ativo={forma === f} onClick={() => setForma(f)}>{FORMAS_PAGAMENTO[f]}</Chip>)}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Entrega">
          <span className="text-sm text-texto-suave">Entrega:</span>
          <Chip ativo={entrega === hoje} onClick={() => setEntrega(hoje)}>Hoje</Chip>
          <Chip ativo={entrega === amanha(hoje)} onClick={() => setEntrega(amanha(hoje))}>Amanhã</Chip>
          <input type="date" aria-label="Data de entrega" value={entrega} onChange={(e) => setEntrega(e.target.value)}
            className={`h-10 ${CLASSE_CONTROLE}`} />
        </div>
        {pontos.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-texto-suave">O peixe sai de:</span>
            <select value={ponto} onChange={(e) => setPonto(e.target.value)} aria-label="Ponto de venda" className={`h-10 ${CLASSE_CONTROLE}`}>
              {pontos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        <input aria-label="Observações" placeholder="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
          className={`h-11 ${CLASSE_CONTROLE}`} />
      </section>

      {/* 4. O que fazer ao salvar */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-texto-suave">4. Ao confirmar</h2>
        <Opcao marcado={faturar} onChange={setFaturar} titulo="Faturar agora"
          detalhe="Baixa o peixe do estoque e lança a conta a receber. Desmarque para só anotar o pedido." />
        {podeReceber && (
          <Opcao marcado={recebido} onChange={setRecebido} titulo="Já recebi o pagamento" detalhe="Registra o recebimento na conta escolhida e a venda já fica quitada." />
        )}
        {podeReceber && recebido && (
          <select aria-label="Conta onde o dinheiro caiu" value={contaRecebido} onChange={(e) => setContaRecebido(e.target.value)}
            className={`h-11 ${CLASSE_CONTROLE}`}>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
        {podeCobrar && (
          <Opcao marcado={cobrar} onChange={setCobrar} titulo={forma === "pix" ? "Gerar Pix no Asaas" : "Gerar boleto com Pix no Asaas"}
            detalhe={cliente && !cliente.cpf_cnpj ? "Este cliente não tem CPF/CNPJ; o Asaas exige para cobrar." : "O cliente recebe por e-mail e você pode mandar pelo WhatsApp."} />
        )}
      </section>

      {erro && <Aviso>{erro}</Aviso>}

      {/* Rodapé fixo com o total */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-superficie/95 px-4 py-3 backdrop-blur md:left-[248px]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-texto-suave">{escolhidas.length} {escolhidas.length === 1 ? "item" : "itens"}{kg > 0 && ` · ${textoKg(kg, 3)} de peixe`}</p>
            <p className="text-xl font-semibold tabular-nums">{formatarMoeda(total)}</p>
          </div>
          <Botao type="button" onClick={enviar} disabled={enviando} className="h-12 px-6 text-base">
            {enviando ? "Salvando…" : faturar ? (recebido && podeReceber ? "Vender e receber" : "Confirmar venda") : "Salvar pedido"}
          </Botao>
        </div>
      </div>
    </div>
  );
}
