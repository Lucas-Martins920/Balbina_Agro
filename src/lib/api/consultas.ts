import "server-only";

// Colunas que a API devolve. Mudar o nome de uma coluna aqui quebra integrações: só acrescente.

export const COLUNAS_LANCAMENTO = `id, tipo, descricao, referencia, vencimento, competencia, previsao, valor_cents, desconto_cents,
  juros_cents, multa_cents, pago_cents, status, forma_pagamento, parcela_numero, parcela_total, grupo_parcelamento_id,
  contato_id, origem, created_at, updated_at,
  contato:contatos(id, nome, cpf_cnpj),
  rateio:agendamento_rateios(categoria_id, centro_custo_id, valor_cents)`;

export const COLUNAS_BAIXA = "id, conta_id, data, valor_cents, juros_cents, multa_cents, desconto_cents, observacao, created_at";

export const COLUNAS_CONTATO = `id, tipos, nome, cpf_cnpj, inscricao_estadual, email, telefone, endereco, cidade, uf, produtor_rural,
  observacoes, arquivado, created_at, updated_at`;

export const COLUNAS_PRODUTO = `id, tipo, nome, sku, unidade, fator_kg, classe_peixe_id, ncm, cfop_padrao, categoria_financeira_id,
  custo_medio_cents, estoque_minimo, observacoes, ativo, para_venda, created_at, updated_at`;

export const COLUNAS_VENDA = `id, numero, cliente_id, data, entrega_prevista, rota, condicao_pagamento, forma_pagamento, status,
  total_cents, origem, observacoes, created_at, updated_at,
  cliente:contatos(id, nome, cpf_cnpj),
  itens:pedido_itens(id, produto_id, quantidade, preco_unit_cents, desconto_cents, total_cents, produto:produtos(nome, unidade))`;

type Lancamento = { valor_cents: number; desconto_cents: number; pago_cents: number; status: string; vencimento: string };

// Mesmo cálculo da view titulos: saldo em aberto e "vencido" para quem passou do vencimento.
export function comSituacao<T extends Lancamento>(l: T, hoje: string) {
  const vencido = (l.status === "aberto" || l.status === "parcial") && l.vencimento < hoje;
  return { ...l, saldo_cents: l.valor_cents - l.desconto_cents - l.pago_cents, situacao: vencido ? "vencido" : l.status };
}
