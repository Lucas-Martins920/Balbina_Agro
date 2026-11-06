import { estoqueNoCarrinho } from "@regras/estoque-carrinho.ts";
import { validarPedidoCampo } from "@regras/pedido-campo.ts";
import { textoQuantidade } from "@regras/pescado.ts";
import { precoVigente } from "@regras/vendas.ts";
import type { ClienteVenda, DadosVendas, PedidoPendente } from "./tipos";

// Carrinho do pedido no app com as regras do /vendedor: preço da tabela do cliente no dia (mesma regra de
// preco_vigente no banco), estoque único da classe do peixe entre o kg e a caixa, e no fim o mesmo
// validarPedidoCampo do servidor. O preço mostrado é estimativa: o banco recalcula ao gravar.

export function tabelaDoCliente(c: ClienteVenda, listas: DadosVendas["listas"]) {
  const padrao = listas.find((l) => l.padrao);
  return c.lista_preco_id && listas.some((l) => l.id === c.lista_preco_id && l.ativa) ? c.lista_preco_id : (padrao?.id ?? null);
}

export function linhasDoCarrinho(dados: DadosVendas, cliente: ClienteVenda | null, qtd: Record<string, number>, dia: string) {
  const preco = precoVigente(dados.precos, dia, dados.listas);
  const tabela = cliente ? tabelaDoCliente(cliente, dados.listas) : null;
  const estoque = estoqueNoCarrinho(dados.produtos, qtd);
  const linhas = dados.produtos.map((p) => ({
    ...p,
    max: estoque.get(p.id)?.max ?? null,
    quantidade: qtd[p.id] ?? 0,
    preco: cliente ? preco(p.id, cliente.id, tabela) : null,
  }));
  const escolhidas = linhas.filter((l) => l.quantidade > 0);
  return {
    linhas,
    escolhidas,
    total: escolhidas.reduce((s, l) => s + Math.round(l.quantidade * (l.preco ?? 0)), 0),
    kg: escolhidas.reduce((s, l) => s + l.quantidade * (l.fator_kg ?? 0), 0),
    semPreco: escolhidas.filter((l) => l.preco === null),
  };
}

// Clientes para escolher: com busca por nome, cidade ou CPF/CNPJ; sem busca, os que compraram por último primeiro
export function clientesSugeridos(dados: DadosVendas, busca: string, limite = 8) {
  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const ordem = new Map(dados.ultimos.map((u, i) => [u.cliente_id, i]));
  const lista = termo
    ? dados.clientes.filter((c) => c.nome.toLowerCase().includes(termo) || (c.cidade ?? "").toLowerCase().includes(termo) || (digitos && (c.cpf_cnpj ?? "").includes(digitos)))
    : [...dados.clientes].sort((a, b) => (ordem.get(a.id) ?? 1e9) - (ordem.get(b.id) ?? 1e9));
  return lista.slice(0, limite);
}

type Escolhas = { cliente: ClienteVenda | null; qtd: Record<string, number>; condicao: string; forma: string; entrega: string; observacoes: string; faturar: boolean };

export function montarPedido(dados: DadosVendas, e: Escolhas, hoje: string, clientId: string): { ok: PedidoPendente } | { erro: string } {
  if (!e.cliente) return { erro: "Escolha o cliente." };
  const c = linhasDoCarrinho(dados, e.cliente, e.qtd, hoje);
  if (!c.escolhidas.length) return { erro: "Adicione pelo menos um produto." };
  if (c.semPreco.length) return { erro: `Sem preço na tabela para ${c.semPreco.map((l) => l.nome).join(", ")}. Peça ao escritório para cadastrar.` };
  const acima = c.escolhidas.find((l) => l.max !== null && l.quantidade > l.max);
  if (acima) return { erro: `${acima.nome}: só tem ${textoQuantidade(acima.max, acima.fator_kg, acima.unidade)} em estoque.` };
  const pedido: PedidoPendente = {
    client_id: clientId, cliente_id: e.cliente.id, data: hoje, condicao: e.condicao, forma_pagamento: e.forma || null,
    entrega: e.entrega || null, observacoes: e.observacoes.trim(), faturar: e.faturar,
    itens: c.escolhidas.map((l) => ({ produto_id: l.id, quantidade: l.quantidade })),
    cliente_nome: e.cliente.nome, telefone: e.cliente.telefone, total_estimado: c.total,
    resumo: c.escolhidas.map((l) => ({ nome: l.nome, quantidade: l.quantidade, preco_cents: l.preco })),
  };
  const v = validarPedidoCampo(pedido, hoje);
  if ("erro" in v) return v;
  return { ok: pedido };
}

// Corpo para /api/app/pedidos: só o que o servidor lê
export function corpoPedido(p: PedidoPendente) {
  return { client_id: p.client_id, cliente_id: p.cliente_id, data: p.data, condicao: p.condicao, forma_pagamento: p.forma_pagamento, entrega: p.entrega, observacoes: p.observacoes, faturar: p.faturar, itens: p.itens };
}
