import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemBanco } from "@/lib/acao";
import { hojeISO } from "@/lib/formato";
import { validarVendaBalcao } from "@/lib/pdv";

export type RetornoBalcao = { erro: string } | { pedidoId: string; numero: number; total_cents: number; troco_cents: number };

// Gravação da venda de balcão: a mesma para o PDV do site (venderNoBalcao) e o do app de celular (/api/app/pdv/vender).
// Quem só opera o caixa não muda preço: com tabela escolhida, o preço vem de preco_vigente aqui no servidor;
// sem ela, o banco aplica a do cliente (ou a padrão). venda_balcao baixa o estoque, recebe e calcula o troco.
export async function gravarVendaBalcao(supabase: SupabaseClient, empresa: { id: string; fuso: string }, corpo: unknown): Promise<RetornoBalcao> {
  const v = validarVendaBalcao(corpo);
  if ("erro" in v) return v;
  const dados = v.ok;
  const itens: { produto_id: string; quantidade: number; preco_unit_cents?: number }[] = [];
  for (const i of dados.itens) {
    if (!dados.lista_id) {
      itens.push(i);
      continue;
    }
    const { data: preco, error } = await supabase.rpc("preco_vigente", {
      p_produto: i.produto_id, p_cliente: dados.cliente_id, p_data: hojeISO(empresa.fuso), p_lista: dados.lista_id,
    });
    if (error) return { erro: mensagemBanco(error) };
    itens.push({ ...i, ...(preco === null ? {} : { preco_unit_cents: Number(preco) }) });
  }
  const { data, error } = await supabase.rpc("venda_balcao", {
    p_empresa: empresa.id,
    p_itens: itens,
    p_pagamentos: dados.pagamentos,
    p_cliente: dados.cliente_id,
    p_client_id: dados.client_id,
    p_ponto: dados.ponto_venda_id,
  });
  if (error) return { erro: mensagemBanco(error) };
  const r = data as { pedido_id: string; numero: number; total_cents: number; troco_cents: number };
  return { pedidoId: r.pedido_id, numero: r.numero, total_cents: Number(r.total_cents), troco_cents: Number(r.troco_cents) };
}
