"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos } from "@/lib/formato";
import { createClient } from "@/lib/supabase/server";

// Cartão de crédito tem tela própria (Cartões); aqui só contas e caixas.
const TIPOS_CONTA = ["corrente", "poupanca", "caixinha", "aplicacao"];

function revalidarContas() {
  revalidatePath("/contas");
  revalidatePath("/painel");
  revalidatePath("/fluxo-de-caixa");
}

export async function salvarConta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const id = t("id");
  const nome = t("nome");
  const tipo = t("tipo");
  const saldoTexto = t("saldo_inicial");
  const negativo = saldoTexto.startsWith("-");
  const saldo = saldoTexto ? lerCentavos(saldoTexto.replace(/^-/, "")) : 0;
  const data = t("saldo_inicial_data");
  if (!nome) return falha("Informe o nome da conta.");
  if (!TIPOS_CONTA.includes(tipo)) return falha("Escolha o tipo da conta.");
  if (saldo === null) return falha("Saldo inicial inválido. Use o formato 1.234,56.");
  if (!data) return falha("Informe a data do saldo inicial.");

  const dados = {
    nome,
    tipo,
    banco_codigo: t("banco_codigo") || null,
    agencia: t("agencia") || null,
    conta: t("conta") || null,
    conta_dv: t("conta_dv") || null,
    saldo_inicial_cents: negativo ? -saldo : saldo,
    saldo_inicial_data: data,
    arquivada: form.get("arquivada") === "on",
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  if (id) {
    // Vínculos do Open Finance e do NIBO ficam: nenhum deles é tocado aqui.
    const { error, count } = await supabase.from("contas_financeiras")
      .update(dados, { count: "exact" }).eq("id", id).neq("tipo", "cartao_credito");
    if (error) return falha(mensagemBanco(error));
    if (!count) return falha("Seu usuário não tem permissão para editar contas.");
  } else {
    const { atual } = await getEmpresaAtual();
    const { error } = await supabase.from("contas_financeiras").insert({ ...dados, arquivada: false, empresa_id: atual.id });
    if (error) return falha(mensagemBanco(error));
  }
  revalidarContas();
  if (id && dados.arquivada) return sucesso(`Conta ${nome} arquivada.`);
  return sucesso(id ? `Conta ${nome} atualizada.` : `Conta ${nome} criada.`);
}

// O banco recusa a exclusão de conta com movimento ou ligada ao Open Finance (trigger protege_exclusao).
export async function excluirConta(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("contas_financeiras").delete({ count: "exact" })
    .eq("id", id).neq("tipo", "cartao_credito");
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não tem permissão para excluir contas.");
  revalidarContas();
  return sucesso("Conta excluída.");
}

export async function transferir(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const origem = String(form.get("conta_origem_id") ?? "");
  const destino = String(form.get("conta_destino_id") ?? "");
  const data = String(form.get("data") ?? "");
  const valor = lerCentavos(form.get("valor"));
  if (!origem || !destino) return falha("Escolha as duas contas.");
  if (origem === destino) return falha("Origem e destino precisam ser contas diferentes.");
  if (!data) return falha("Informe a data.");
  if (!valor || valor <= 0) return falha("Valor inválido.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("transferencias").insert({
    empresa_id: atual.id,
    conta_origem_id: origem,
    conta_destino_id: destino,
    data,
    valor_cents: valor,
    descricao: String(form.get("descricao") ?? "").trim() || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidatePath("/contas");
  revalidatePath("/painel");
  return sucesso("Transferência registrada.");
}
