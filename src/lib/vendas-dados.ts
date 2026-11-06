import "server-only";
import { quantidadeQueCabe } from "@/lib/estoque-carrinho";
import { getPermissoes } from "@/lib/permissoes";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { CONDICOES, type ListaPreco, type PrecoTabela } from "@/lib/vendas";

export type ClienteVenda = { id: string; nome: string; telefone: string | null; cpf_cnpj: string | null; lista_preco_id: string | null; cidade?: string | null };
export type ProdutoVenda = { id: string; nome: string; unidade: string; fator_kg: number | null; classe_peixe_id: string | null; disponivel: number | null; kg_classe: number | null };
export type ContaVenda = { id: string; nome: string; tipo: string };
export type UltimoPedido = { cliente_id: string; data: string; condicao: string | null; forma_pagamento: string | null; itens: { produto_id: string; quantidade: number }[] };

// Acha a chave de CONDICOES que corresponde às parcelas gravadas no pedido
function chaveCondicao(c: unknown) {
  const parcelas = JSON.stringify((c as { parcelas?: unknown } | null)?.parcelas ?? null);
  return Object.entries(CONDICOES).find(([, v]) => JSON.stringify(v.parcelas) === parcelas)?.[0] ?? null;
}

// Tudo que as telas de venda (nova venda e PDV) precisam numa ida ao banco.
// Com ponto, o disponível é o estoque daquele ponto de venda; sem, o da piscicultura.
// `app`: chamada do app de celular (cliente com o token do cabeçalho e as permissões já lidas); sem ele, a sessão do site.
export async function carregarCatalogo(empresa: string, ponto?: string | null, app?: { supabase: SupabaseClient; noPlano: (modulo: string) => boolean }) {
  const supabase = app?.supabase ?? (await createClient());
  const [{ data: clientes }, { data: produtos }, { data: precos }, { data: listas }, { data: estoque }, { data: contas }, { data: perfil }, { data: recentes }] = await Promise.all([
    supabase.from("contatos").select("id, nome, telefone, cpf_cnpj, lista_preco_id, cidade").eq("empresa_id", empresa).contains("tipos", ["cliente"]).eq("arquivado", false).order("nome"),
    supabase.from("produtos").select("id, nome, unidade, fator_kg, classe_peixe_id").eq("empresa_id", empresa).in("tipo", ["peixe", "alevino"]).eq("base_estoque", false).eq("ativo", true).order("nome"),
    supabase.from("tabelas_preco").select("produto_id, cliente_id, lista_id, preco_cents, vigencia").eq("empresa_id", empresa),
    supabase.from("listas_preco").select("id, nome, padrao, ajuste_pct, ativa").eq("empresa_id", empresa).order("padrao", { ascending: false }).order("nome"),
    ponto
      ? supabase.from("estoque_peixe_ponto").select("classe_id, disponivel").eq("empresa_id", empresa).eq("ponto_venda_id", ponto)
      : supabase.from("estoque_peixe").select("classe_id, disponivel").eq("empresa_id", empresa),
    supabase.from("contas_financeiras").select("id, nome, tipo").eq("empresa_id", empresa).eq("arquivada", false).neq("tipo", "cartao_credito").order("nome"),
    supabase.from("perfis_cobranca").select("id").eq("empresa_id", empresa).eq("provedor", "asaas").eq("ativo", true).maybeSingle(),
    supabase.from("pedidos_venda").select("cliente_id, data, condicao_pagamento, forma_pagamento, pedido_itens(produto_id, quantidade)")
      .eq("empresa_id", empresa).neq("status", "cancelado").neq("origem", "pdv").order("data", { ascending: false }).order("numero", { ascending: false }).limit(300),
  ]);

  const disponivel = new Map((estoque ?? []).map((e) => [e.classe_id, Number(e.disponivel)]));
  const ultimos: UltimoPedido[] = [];
  const vistos = new Set<string>();
  for (const p of recentes ?? []) {
    if (vistos.has(p.cliente_id)) continue;
    vistos.add(p.cliente_id);
    ultimos.push({
      cliente_id: p.cliente_id, data: p.data, condicao: chaveCondicao(p.condicao_pagamento), forma_pagamento: p.forma_pagamento,
      itens: (p.pedido_itens as { produto_id: string; quantidade: number }[]).map((i) => ({ produto_id: i.produto_id, quantidade: Number(i.quantidade) })),
    });
  }

  return {
    clientes: (clientes ?? []) as ClienteVenda[],
    produtos: (produtos ?? []).map((p): ProdutoVenda => {
      const fator = p.fator_kg === null ? null : Number(p.fator_kg);
      // kg da classe no estoque: a mesma conta para o kg e para a caixa (lib/estoque-carrinho)
      const kg = p.classe_peixe_id && fator ? (disponivel.get(p.classe_peixe_id) ?? 0) : null;
      return { ...p, fator_kg: fator, kg_classe: kg, disponivel: kg === null || !fator ? null : quantidadeQueCabe(kg, fator) };
    }),
    precos: (precos ?? []) as PrecoTabela[],
    listas: (listas ?? []) as ListaPreco[],
    contas: (contas ?? []) as ContaVenda[],
    // cobrança pelo Asaas só nos planos Fiscal e Gestão
    asaasAtivo: Boolean(perfil) && (app ? app.noPlano("cobrancas") : (await getPermissoes()).noPlano("cobrancas")),
    ultimos,
  };
}
