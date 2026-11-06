import { estoqueNoCarrinho } from "@regras/estoque-carrinho.ts";
import { validarVendaBalcao, type VendaBalcao } from "@regras/pdv.ts";
import { agruparPorEmbalagem, textoQuantidade } from "@regras/pescado.ts";
import { fecharPagamento, FORMAS_PDV, precoVigente, type PagamentoPdv } from "@regras/vendas.ts";
import type { ClienteVenda } from "@/lib/vendas/tipos";
import type { DadosPdv } from "./tipos";

// Caixa de balcão no app com as regras do PDV do site (src/components/vendas/pdv.tsx): preço da tabela do
// cliente (ou a escolhida no caixa), seções Por kg/Caixas, o carrinho tira do estoque único da classe do peixe
// na hora e o pagamento fecha com fecharPagamento (só dinheiro tem troco). O banco confere tudo ao gravar.

export function tabelas(dados: DadosPdv, cliente: ClienteVenda | null, escolhida: string | null) {
  const ativas = dados.listas.filter((l) => l.ativa);
  const padrao = dados.listas.find((l) => l.padrao)?.id ?? "";
  const doCliente = cliente?.lista_preco_id && ativas.some((l) => l.id === cliente.lista_preco_id) ? cliente.lista_preco_id : padrao;
  return { ativas, doCliente, tabela: escolhida ?? doCliente };
}

export function montarCaixa(dados: DadosPdv, cliente: ClienteVenda | null, tabela: string, carrinho: Record<string, number>, hoje: string, busca = "") {
  const preco = precoVigente(dados.precos, hoje, dados.listas);
  const estoque = estoqueNoCarrinho(dados.produtos, carrinho);
  const termo = busca.trim().toLowerCase();
  const linhas = dados.produtos.map((p) => {
    const e = estoque.get(p.id);
    return { ...p, preco: preco(p.id, cliente?.id, tabela) ?? 0, quantidade: carrinho[p.id] ?? 0, resta: e?.resta ?? null, max: e?.max ?? null };
  });
  const itens = linhas.filter((l) => l.quantidade > 0);
  return {
    grupos: agruparPorEmbalagem(linhas.filter((l) => !termo || l.nome.toLowerCase().includes(termo))),
    itens,
    total: itens.reduce((s, i) => s + Math.round(i.quantidade * i.preco), 0),
    semPreco: itens.filter((i) => i.preco === 0),
  };
}

// Põe no carrinho só o que o estoque da classe ainda tem; nunca passa do que sobrou
export function mudarQuantidade(dados: DadosPdv, carrinho: Record<string, number>, id: string, quantidade: number): { carrinho: Record<string, number>; erro: string | null } {
  const limite = estoqueNoCarrinho(dados.produtos, carrinho).get(id)?.max;
  const produto = dados.produtos.find((p) => p.id === id);
  const nome = produto?.nome ?? "";
  let erro: string | null = null;
  if (limite !== undefined && quantidade > limite) {
    erro = limite > 0
      ? `Só há estoque para ${textoQuantidade(limite, produto?.fator_kg, produto?.unidade)} de ${nome}.`
      : `Sem estoque de ${nome}: o peixe desta classe já está no carrinho ou acabou.`;
    quantidade = limite;
  }
  return { carrinho: { ...carrinho, [id]: Math.max(quantidade, 0) }, erro };
}

export function podeReceber(caixa: ReturnType<typeof montarCaixa>): string | null {
  if (!caixa.itens.length) return "Toque nos produtos para montar a venda.";
  if (caixa.semPreco.length) return `Sem preço na tabela: ${caixa.semPreco.map((i) => i.nome).join(", ")}. Cadastre em Preços, no site.`;
  return null;
}

type Escolhas = { clientId: string; cliente: ClienteVenda | null; tabela: string; tabelaCliente: string; pagamentos: PagamentoPdv[]; conta: string; ponto: string | null };

// Corpo para /api/app/pdv/vender, já passado pelo mesmo validador do servidor
export function montarVenda(caixa: ReturnType<typeof montarCaixa>, e: Escolhas): { ok: VendaBalcao } | { erro: string } {
  const bloqueio = podeReceber(caixa);
  if (bloqueio) return { erro: bloqueio };
  const fechamento = fecharPagamento(caixa.total, e.pagamentos);
  if (fechamento.erro) return { erro: fechamento.erro };
  if (!fechamento.pronto) return { erro: `Falta receber ${(fechamento.falta / 100).toFixed(2).replace(".", ",")}.` };
  if (e.pagamentos.some((p) => p.forma !== "dinheiro") && !e.conta) return { erro: "Escolha a conta onde cai o Pix e o cartão." };
  return validarVendaBalcao({
    client_id: e.clientId,
    cliente_id: e.cliente?.id ?? null,
    lista_id: e.tabela !== e.tabelaCliente ? e.tabela : null,
    itens: caixa.itens.map((i) => ({ produto_id: i.id, quantidade: i.quantidade })),
    pagamentos: e.pagamentos.map((p) => ({ ...p, conta_id: p.forma === "dinheiro" ? null : e.conta })),
    ponto_venda_id: e.ponto,
  });
}

// Texto do cupom não fiscal para compartilhar (o site imprime o mesmo conteúdo)
export function textoCupom(v: { numero: number; total_cents: number; troco_cents: number; cliente: string; ponto: string | null; itens: { nome: string; quantidade: number; preco: number }[]; pagamentos: PagamentoPdv[] }, moeda: (c: number) => string) {
  return [
    "CUPOM NÃO FISCAL",
    `Venda nº ${v.numero}`,
    ...(v.ponto ? [v.ponto] : []),
    v.cliente,
    "",
    ...v.itens.map((i) => `${i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} × ${i.nome}  ${moeda(Math.round(i.quantidade * i.preco))}`),
    "",
    `TOTAL  ${moeda(v.total_cents)}`,
    ...v.pagamentos.map((p) => `${FORMAS_PDV[p.forma]}  ${moeda(p.valor_cents)}`),
    ...(v.troco_cents > 0 ? [`Troco  ${moeda(v.troco_cents)}`] : []),
  ].join("\n");
}
