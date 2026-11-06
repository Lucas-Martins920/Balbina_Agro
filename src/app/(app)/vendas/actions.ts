"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import type { Meio } from "@/lib/asaas-mapa";
import { emitirCobrancaTitulo } from "@/lib/cobranca";
import { getEmpresaAtual } from "@/lib/empresa";
import { hojeISO, lerCentavos } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";
import { CONDICOES } from "@/lib/vendas";
import type { VendaBalcao } from "@/lib/pdv";
import { gravarVendaBalcao, type RetornoBalcao } from "@/lib/pdv-servidor";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { cookiePonto } from "@/lib/pontos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidar() {
  revalidatePath("/vendas", "layout");
  revalidatePath("/estoque");
  revalidatePath("/contas-a-receber");
  revalidatePath("/cobrancas");
  revalidatePath("/painel");
}

async function exigir(chave: string) {
  const { pode } = await getPermissoes();
  return pode(chave) ? null : "Seu usuário não tem permissão para isso.";
}

// ---------------------------------------------------------------------------
// Cliente rápido (cadastro dentro da venda)
// ---------------------------------------------------------------------------

export type ClienteRapido = { id: string; nome: string; telefone: string | null; cpf_cnpj: string | null; lista_preco_id: string | null };

export async function criarClienteRapido(dados: { nome: string; cpf_cnpj?: string; telefone?: string }): Promise<{ erro: string } | { cliente: ClienteRapido }> {
  const negado = await exigir("vendas.lancar");
  if (negado) return { erro: negado };
  const nome = dados.nome.trim();
  const doc = (dados.cpf_cnpj ?? "").replace(/\D/g, "");
  const telefone = (dados.telefone ?? "").trim() || null;
  if (!nome) return { erro: "Informe o nome do cliente." };
  if (doc && doc.length !== 11 && doc.length !== 14) return { erro: "CPF ou CNPJ inválido." };

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  if (doc) {
    const { data: existente } = await supabase.from("contatos").select("id, nome, tipos, telefone, cpf_cnpj, lista_preco_id").eq("empresa_id", atual.id).eq("cpf_cnpj", doc).maybeSingle();
    if (existente) {
      if (!existente.tipos.includes("cliente")) {
        const { error } = await supabase.from("contatos").update({ tipos: [...existente.tipos, "cliente"] }).eq("id", existente.id);
        if (error) return { erro: mensagemBanco(error) };
      }
      return { cliente: { id: existente.id, nome: existente.nome, telefone: existente.telefone, cpf_cnpj: existente.cpf_cnpj, lista_preco_id: existente.lista_preco_id } };
    }
  }
  const { data, error } = await supabase.from("contatos")
    .insert({ empresa_id: atual.id, tipos: ["cliente"], nome, cpf_cnpj: doc || null, telefone })
    .select("id, nome, telefone, cpf_cnpj, lista_preco_id").single();
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/vendas", "layout");
  return { cliente: data };
}

// ---------------------------------------------------------------------------
// Nova venda: cria o pedido e, se pedido, já fatura, recebe ou cobra
// ---------------------------------------------------------------------------

export type ItemVenda = { produto_id: string; quantidade: number; preco_unit_cents?: number };
export type DadosVenda = {
  client_id: string;
  cliente_id: string;
  itens: ItemVenda[];
  condicao: string;
  forma_pagamento: string | null;
  entrega: string | null;
  observacoes: string;
  faturar: boolean;
  recebido_conta_id: string | null; // à vista já recebido: em que conta caiu
  cobrar: boolean; // emitir boleto/Pix no Asaas para as parcelas
  ponto_venda_id?: string | null; // de onde sai o peixe; sem ponto = piscicultura
};
export type RetornoVenda = { erro: string } | { pedidoId: string; aviso?: string };

async function titulosDoPedido(supabase: Supabase, pedido: string) {
  const { data } = await supabase.from("agendamentos").select("id, valor_cents, desconto_cents, pago_cents, status")
    .eq("origem", "pedido_venda").eq("origem_id", pedido).in("status", ["aberto", "parcial"]).order("vencimento");
  return (data ?? []).map((a) => ({ id: a.id, saldo_cents: Number(a.valor_cents) - Number(a.desconto_cents) - Number(a.pago_cents) }))
    .filter((t) => t.saldo_cents > 0);
}

async function receber(supabase: Supabase, empresa: string, pedido: string, conta: string, forma: string | null) {
  const { atual } = await getEmpresaAtual();
  const titulos = await titulosDoPedido(supabase, pedido);
  if (!titulos.length) return null;
  // uma baixa por título, num insert só (tudo ou nada)
  const data = hojeISO(atual.fuso);
  const { error } = await supabase.from("baixas").insert(titulos.map((t) => ({
    empresa_id: empresa, agendamento_id: t.id, conta_id: conta, data, valor_cents: Number(t.saldo_cents), forma_pagamento: forma,
  })));
  if (error) return mensagemBanco(error);
  return null;
}

async function cobrar(supabase: Supabase, empresa: string, pedido: string, forma: string | null) {
  const plano = await foraDoPlano("cobrancas");
  if (plano) return plano;
  const { data: perfil } = await supabase.from("perfis_cobranca").select("id").eq("empresa_id", empresa).eq("provedor", "asaas").eq("ativo", true).maybeSingle();
  if (!perfil) return "Ative a cobrança pelo Asaas em Cobranças para gerar boleto e Pix.";
  const meio: Meio = forma === "pix" ? "pix" : forma === "boleto" ? "boleto_pix" : "boleto_pix";
  const erros: string[] = [];
  for (const t of await titulosDoPedido(supabase, pedido)) {
    const erro = await emitirCobrancaTitulo(supabase, t.id, perfil.id, meio);
    if (erro) erros.push(erro);
  }
  return erros.length ? erros.join(" ") : null;
}

export async function registrarVenda(dados: DadosVenda): Promise<RetornoVenda> {
  const negado = await exigir("vendas.lancar");
  if (negado) return { erro: negado };
  const condicao = CONDICOES[dados.condicao];
  if (!dados.cliente_id) return { erro: "Escolha o cliente." };
  if (!condicao) return { erro: "Escolha a condição de pagamento." };
  const itens = dados.itens.filter((i) => i.quantidade > 0);
  if (itens.length === 0) return { erro: "Adicione pelo menos um produto." };

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: pedido, error } = await supabase.rpc("criar_pedido", {
    p_empresa: atual.id,
    p_cliente: dados.cliente_id,
    p_itens: itens,
    p_data: hojeISO(atual.fuso),
    p_entrega: dados.entrega || null,
    p_parcelas: condicao.parcelas,
    p_forma_pagamento: dados.forma_pagamento || null,
    p_observacoes: dados.observacoes,
    p_client_id: dados.client_id || null,
  });
  if (error) return { erro: mensagemBanco(error) };
  if (dados.ponto_venda_id) {
    const { error: e1 } = await supabase.from("pedidos_venda").update({ ponto_venda_id: dados.ponto_venda_id }).eq("id", pedido).eq("status", "aberto");
    if (e1) return { pedidoId: pedido, aviso: `Pedido salvo na piscicultura; não deu para marcar o ponto de venda: ${mensagemBanco(e1)}` };
  }
  revalidar();
  if (!dados.faturar) return { pedidoId: pedido };

  const { data: pedidoAtual } = await supabase.from("pedidos_venda").select("status").eq("id", pedido).single();
  if (pedidoAtual?.status === "aberto" || pedidoAtual?.status === "separado") {
    const { error: e2 } = await supabase.rpc("faturar_pedido", { p_pedido: pedido });
    if (e2) return { pedidoId: pedido, aviso: `Pedido salvo, mas não faturado: ${mensagemBanco(e2)}` };
  }
  if (dados.recebido_conta_id) {
    const erro = await receber(supabase, atual.id, pedido, dados.recebido_conta_id, dados.forma_pagamento);
    if (erro) return { pedidoId: pedido, aviso: `Pedido faturado, mas o recebimento não foi registrado: ${erro}` };
  } else if (dados.cobrar) {
    const erro = await cobrar(supabase, atual.id, pedido, dados.forma_pagamento);
    if (erro) return { pedidoId: pedido, aviso: `Pedido faturado, mas a cobrança não saiu: ${erro}` };
  }
  return { pedidoId: pedido };
}

// ---------------------------------------------------------------------------
// PDV
// ---------------------------------------------------------------------------

export type DadosBalcao = VendaBalcao;
export type { RetornoBalcao };

export async function venderNoBalcao(dados: DadosBalcao): Promise<RetornoBalcao> {
  const negado = await exigir("pdv.operar");
  if (negado) return { erro: negado };
  const { atual } = await getEmpresaAtual();
  const r = await gravarVendaBalcao(await createClient(), atual, dados);
  if (!("erro" in r)) revalidar();
  return r;
}

// Ponto de venda em que este caixa vende; fica lembrado no navegador
export async function escolherPontoPdv(form: FormData) {
  const id = String(form.get("ponto_venda_id") ?? "");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data } = await supabase.from("pontos_venda").select("id").eq("id", id).eq("empresa_id", atual.id).eq("ativo", true).maybeSingle();
  if (!data) return;
  (await cookies()).set(cookiePonto(atual.id), id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/vendas", "layout");
}

// ---------------------------------------------------------------------------
// Ações do pedido (lista e página do pedido)
// ---------------------------------------------------------------------------

async function rodar(fn: string, form: FormData, ok: string, chave = "vendas.lancar"): Promise<EstadoAcao> {
  const negado = await exigir(chave);
  if (negado) return falha(negado);
  const id = String(form.get("pedido_id") ?? "");
  if (!id) return falha("Pedido não informado.");
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_pedido: id });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(ok);
}

export async function faturarPedido(_: EstadoAcao, form: FormData) {
  const r = await rodar("faturar_pedido", form, "Pedido faturado: peixe baixado do estoque e contas a receber geradas.");
  if (r.erro) return r;
  // D1: com o faturamento completo ligado, o mesmo toque emite a NF-e e gera o boleto/Pix
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: cfg } = await supabase.from("automacoes_empresa").select("faturamento_completo").eq("empresa_id", atual.id).maybeSingle();
  if (!cfg?.faturamento_completo) return r;
  const partes = ["Pedido faturado."];
  const pedidoId = String(form.get("pedido_id") ?? "");
  const { pode, noPlano } = await getPermissoes();
  if (noPlano("notas") && pode("notas.editar")) {
    const nota = new FormData();
    nota.set("pedido_id", pedidoId);
    const { emitirNfe } = await import("../notas/actions");
    const n = await emitirNfe({}, nota);
    partes.push(n.erro ? `NF-e não saiu: ${n.erro}` : "NF-e enviada para a SEFAZ.");
  }
  const { data: pedido } = await supabase.from("pedidos_venda").select("forma_pagamento").eq("id", pedidoId).single();
  if (["boleto", "pix"].includes(pedido?.forma_pagamento ?? "") && noPlano("cobrancas") && pode("cobrancas.emitir")) {
    const erro = await cobrar(supabase, atual.id, pedidoId, pedido!.forma_pagamento);
    partes.push(erro ? `Cobrança não saiu: ${erro}` : "Boleto/Pix gerado.");
  }
  revalidar();
  return sucesso(partes.join(" "));
}

export async function entregarPedido(_: EstadoAcao, form: FormData) {
  return rodar("entregar_pedido", form, "Entrega registrada.");
}

export async function desfazerEntrega(_: EstadoAcao, form: FormData) {
  return rodar("desfazer_entrega", form, "Entrega desfeita: o pedido voltou para faturado.", "vendas.cancelar");
}

export async function desfazerFaturamento(_: EstadoAcao, form: FormData) {
  return rodar("desfazer_faturamento", form, "Faturamento desfeito: o peixe voltou ao estoque e as contas a receber foram canceladas.", "vendas.cancelar");
}

export async function cancelarPedido(_: EstadoAcao, form: FormData) {
  return rodar("cancelar_pedido", form, "Pedido cancelado.", "vendas.cancelar");
}

export async function cobrarPedido(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const negado = await exigir("cobrancas.emitir");
  if (negado) return falha(negado);
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const erro = await cobrar(supabase, atual.id, String(form.get("pedido_id") ?? ""), String(form.get("forma") ?? "") || null);
  revalidar();
  if (erro) return falha(erro);
  return sucesso("Cobrança emitida. Mande o Pix ou o boleto para o cliente pelo WhatsApp.");
}

export async function receberPedido(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const negado = await exigir("vendas.lancar");
  if (negado) return falha(negado);
  const conta = String(form.get("conta_id") ?? "");
  if (!conta) return falha("Escolha a conta onde o dinheiro caiu.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const erro = await receber(supabase, atual.id, String(form.get("pedido_id") ?? ""), conta, String(form.get("forma") ?? "") || null);
  revalidar();
  if (erro) return falha(erro);
  return sucesso("Recebimento registrado.");
}

export async function definirPreco(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const negado = await exigir("vendas.precos");
  if (negado) return falha(negado);
  const produto = String(form.get("produto_id") ?? "");
  const preco = lerCentavos(form.get("preco"));
  const { atual } = await getEmpresaAtual();
  const desde = String(form.get("desde") ?? "") || hojeISO(atual.fuso);
  if (!produto) return falha("Escolha o produto.");
  if (!String(form.get("cliente_id") ?? "")) return falha("Escolha o cliente. O preço de todos fica nas tabelas de preço.");
  if (preco === null) return falha("Preço inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_preco", {
    p_produto: produto, p_preco_cents: preco, p_cliente: String(form.get("cliente_id") ?? "") || null, p_desde: desde,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/vendas", "layout");
  return sucesso("Preço salvo.");
}

// Tira o preço especial: o cliente volta para a tabela dele (ou a padrão)
export async function removerPrecoCliente(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const negado = await exigir("vendas.precos");
  if (negado) return falha(negado);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_preco", {
    p_produto: String(form.get("produto_id") ?? ""), p_cliente: String(form.get("cliente_id") ?? ""),
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/vendas", "layout");
  return sucesso("Preço especial removido.");
}

// ---------------------------------------------------------------------------
// Venda para outra empresa do mesmo dono (o ponto de venda é outra empresa no Balbina)
// ---------------------------------------------------------------------------

export async function lancarEntradaGrupo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("receber_compra_do_grupo", {
    p_pedido: String(form.get("pedido_id") ?? ""), p_empresa: String(form.get("empresa_id") ?? ""),
    p_ponto: String(form.get("ponto_venda_id") ?? "") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Entrada lançada na outra empresa: peixe no estoque e contas a pagar para a piscicultura.");
}

export async function desfazerEntradaGrupo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("desfazer_compra_do_grupo", { p_compra: String(form.get("compra_id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Entrada desfeita na outra empresa.");
}
