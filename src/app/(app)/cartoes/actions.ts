"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos, lerInteiro } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/cartoes");
  revalidatePath("/contas");
  revalidatePath("/contas-a-pagar");
}

export async function criarCartao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const nome = String(form.get("nome") ?? "").trim();
  const fechamento = lerInteiro(form.get("dia_fechamento"));
  const vencimento = lerInteiro(form.get("dia_vencimento"));
  const limiteTexto = String(form.get("limite") ?? "").trim();
  const limite = limiteTexto ? lerCentavos(limiteTexto) : null;
  if (!nome) return falha("Informe o nome do cartão.");
  if (!fechamento || fechamento < 1 || fechamento > 31 || !vencimento || vencimento < 1 || vencimento > 31) {
    return falha("Dias de fechamento e vencimento entre 1 e 31.");
  }
  if (limiteTexto && limite === null) return falha("Limite inválido.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("contas_financeiras").insert({
    empresa_id: atual.id, tipo: "cartao_credito", nome, dia_fechamento: fechamento, dia_vencimento: vencimento,
    limite_cents: limite, conta_pagadora_id: String(form.get("conta_pagadora_id") ?? "") || null,
    // cartão começa zerado: todo lançamento conta para o limite usado, qualquer que seja a data
    saldo_inicial_data: "2000-01-01",
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(`Cartão ${nome} cadastrado.`);
}

export async function comprarNoCartao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const valor = lerCentavos(form.get("valor"));
  const parcelas = lerInteiro(form.get("parcelas")) ?? 1;
  const descricao = String(form.get("descricao") ?? "").trim();
  const categoria = String(form.get("categoria_id") ?? "");
  if (!descricao) return falha("Informe a descrição.");
  if (!valor) return falha("Informe o valor, ex.: 1.250,00.");
  if (!categoria) return falha("Escolha a categoria.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("compra_cartao", {
    p_cartao: String(form.get("cartao_id") ?? ""), p_data: String(form.get("data") ?? ""), p_descricao: descricao,
    p_valor_cents: valor, p_categoria: categoria, p_parcelas: parcelas,
    p_centro_custo: String(form.get("centro_custo_id") ?? "") || null, p_contato: String(form.get("contato_id") ?? "") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(parcelas > 1 ? `Compra lançada em ${parcelas} parcelas.` : "Compra lançada.");
}

export async function pagarFatura(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const valorTexto = String(form.get("valor") ?? "").trim();
  const valor = valorTexto ? lerCentavos(valorTexto) : null;
  if (valorTexto && valor === null) return falha("Valor inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("pagar_fatura", {
    p_cartao: String(form.get("cartao_id") ?? ""), p_vencimento: String(form.get("vencimento") ?? ""),
    p_data: String(form.get("data") ?? ""), p_conta: String(form.get("conta_id") ?? "") || null, p_valor_cents: valor,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Pagamento da fatura lançado.");
}
