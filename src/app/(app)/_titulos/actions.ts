"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { lerCentavos, lerInteiro, plural } from "@/lib/formato";
import { lerRateio } from "@/lib/rateio";
import { createClient } from "@/lib/supabase/server";
import { CONFIG_TITULO, FREQUENCIAS, lerTipo } from "@/lib/titulos";

function revalidar(tipo: keyof typeof CONFIG_TITULO) {
  revalidatePath(CONFIG_TITULO[tipo].rota);
  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/vendas");
}

export async function agendarTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const descricao = String(form.get("descricao") ?? "").trim();
  const vencimento = String(form.get("vencimento") ?? "");
  const competenciaMes = String(form.get("competencia") ?? "");
  const total = lerCentavos(form.get("valor"));
  const parcelas = lerInteiro(form.get("parcelas") || "1");

  if (!tipo) return falha("Tipo de título inválido.");
  if (!descricao) return falha("Informe a descrição.");
  if (!vencimento) return falha("Informe o vencimento.");
  if (!total || total <= 0) return falha("Valor inválido. Use o formato 1.234,56.");
  if (!parcelas || parcelas < 1 || parcelas > 120) return falha("Parcelas entre 1 e 120.");

  const rateio = lerRateio(form, total);
  if ("erro" in rateio) return falha(rateio.erro);

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("agendar_titulo", {
    p_empresa: atual.id,
    p_tipo: tipo,
    p_descricao: descricao,
    p_vencimento: vencimento,
    p_competencia: competenciaMes ? `${competenciaMes}-01` : vencimento,
    p_valor_cents: total,
    p_rateio: rateio.ok,
    p_contato: String(form.get("contato_id") ?? "") || null,
    p_referencia: String(form.get("referencia") ?? ""),
    p_parcelas: parcelas,
    p_forma_pagamento: String(form.get("forma_pagamento") ?? "") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(parcelas > 1 ? `${descricao}: ${parcelas} parcelas agendadas.` : `${descricao} agendado.`);
}

export async function baixarTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const agendamento = String(form.get("agendamento_id") ?? "");
  const conta = String(form.get("conta_id") ?? "");
  const data = String(form.get("data") ?? "");
  const valor = lerCentavos(form.get("valor"));
  const juros = form.get("juros") ? lerCentavos(form.get("juros")) : 0;
  const desconto = form.get("desconto") ? lerCentavos(form.get("desconto")) : 0;
  if (!tipo) return falha("Tipo de título inválido.");
  if (!agendamento || !conta || !data) return falha("Informe conta e data.");
  if (!valor || valor <= 0) return falha("Valor inválido.");
  if (juros === null || juros < 0) return falha("Juros inválidos.");
  if (desconto === null || desconto < 0) return falha("Desconto inválido.");
  if (desconto > valor + juros) return falha("O desconto não pode passar do valor pago.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("baixas").insert({
    empresa_id: atual.id,
    agendamento_id: agendamento,
    conta_id: conta,
    data,
    valor_cents: valor,
    juros_cents: juros,
    desconto_cents: desconto,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(CONFIG_TITULO[tipo].baixaFeita);
}

export async function criarContato(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const nome = String(form.get("nome") ?? "").trim();
  const doc = String(form.get("cpf_cnpj") ?? "").replace(/\D/g, "");
  if (!tipo) return falha("Tipo de título inválido.");
  const config = CONFIG_TITULO[tipo];
  if (!nome) return falha(`Informe o nome do ${config.contato.toLowerCase()}.`);
  if (doc && doc.length !== 11 && doc.length !== 14) return falha("CPF ou CNPJ inválido.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  // Quem já é cliente pode virar fornecedor também (e vice-versa)
  if (doc) {
    const { data: existente } = await supabase.from("contatos").select("id, tipos").eq("empresa_id", atual.id).eq("cpf_cnpj", doc).maybeSingle();
    if (existente) {
      if (existente.tipos.includes(config.tipoContato)) return falha("Já existe um contato com esse CPF ou CNPJ.");
      const { error } = await supabase.from("contatos").update({ tipos: [...existente.tipos, config.tipoContato] }).eq("id", existente.id);
      if (error) return falha(mensagemBanco(error));
      revalidar(tipo);
      return sucesso(`Contato existente marcado também como ${config.contato.toLowerCase()}.`);
    }
  }
  const { error } = await supabase.from("contatos").insert({ empresa_id: atual.id, tipos: [config.tipoContato], nome, cpf_cnpj: doc || null });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(`${config.contato} ${nome} cadastrado.`);
}

export async function criarRecorrencia(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const descricao = String(form.get("descricao") ?? "").trim();
  const valor = lerCentavos(form.get("valor"));
  const frequencia = String(form.get("frequencia") ?? "");
  const inicio = String(form.get("inicio") ?? "");
  const termino = String(form.get("termino") ?? "");
  const categoria = String(form.get("categoria_id") ?? "");
  if (!tipo) return falha("Tipo de título inválido.");
  if (!descricao) return falha("Informe a descrição.");
  if (!valor || valor <= 0) return falha("Valor inválido.");
  if (!(frequencia in FREQUENCIAS)) return falha("Escolha a frequência.");
  if (!inicio) return falha("Informe o primeiro vencimento.");
  if (termino && termino < inicio) return falha("O término precisa ser depois do primeiro vencimento.");
  if (!categoria) return falha("Escolha a categoria.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.rpc("criar_recorrencia", {
    p_empresa: atual.id,
    p_tipo: tipo,
    p_descricao: descricao,
    p_valor_cents: valor,
    p_frequencia: frequencia,
    p_inicio: inicio,
    p_categoria: categoria,
    p_centro_custo: String(form.get("centro_custo_id") ?? "") || null,
    p_contato: String(form.get("contato_id") ?? "") || null,
    p_termino: termino || null,
    p_forma_pagamento: String(form.get("forma_pagamento") ?? "") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(`${descricao}: recorrência criada e títulos gerados para os próximos 12 meses.`);
}

export async function encerrarRecorrencia(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const id = String(form.get("recorrencia_id") ?? "");
  const aPartir = String(form.get("a_partir") ?? "");
  if (!tipo || !id || !aPartir) return falha("Informe a partir de quando encerrar.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("encerrar_recorrencia", { p_recorrencia: id, p_a_partir: aPartir });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(`Recorrência encerrada. ${data} título(s) futuro(s) cancelado(s).`);
}

// Ações rápidas da lista (no jeito do NIBO): editar no painel, duplicar, estornar e ações em lote.

export async function editarTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const id = String(form.get("id") ?? "");
  const descricao = String(form.get("descricao") ?? "").trim();
  const vencimento = String(form.get("vencimento") ?? "");
  const competencia = String(form.get("competencia") ?? "");
  const valor = form.get("valor") ? lerCentavos(form.get("valor")) : null;
  if (!tipo || !id) return falha("Título inválido.");
  if (!descricao) return falha("Informe a descrição.");
  if (!vencimento) return falha("Informe o vencimento.");
  if (form.get("valor") && (!valor || valor <= 0)) return falha("Valor inválido. Use o formato 1.234,56.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_titulo", {
    p_titulo: id,
    p_descricao: descricao,
    p_vencimento: vencimento,
    p_competencia: competencia ? `${competencia}-01` : null,
    p_contato: String(form.get("contato_id") ?? "") || null,
    p_referencia: String(form.get("referencia") ?? ""),
    p_forma_pagamento: String(form.get("forma_pagamento") ?? ""),
    p_valor_cents: valor,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(`${descricao} atualizado.`);
}

export async function duplicarTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const id = String(form.get("id") ?? "");
  const vencimento = String(form.get("vencimento_copia") ?? "");
  if (!tipo || !id) return falha("Título inválido.");
  if (!vencimento) return falha("Informe o vencimento da cópia.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("duplicar_titulo", { p_titulo: id, p_vencimento: vencimento });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso("Cópia criada.");
}

export async function estornarBaixa(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const id = String(form.get("id") ?? "");
  if (!tipo || !id) return falha("Título inválido.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_baixas", { p_titulo: id });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  return sucesso(tipo === "pagar" ? "Pagamento estornado. A conta voltou a ficar em aberto." : "Recebimento estornado. A conta voltou a ficar em aberto.");
}

const ACOES_LOTE = ["baixar", "reprogramar", "excluir", "restaurar", "perda"] as const;

export async function acaoEmLote(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const acao = String(form.get("acao") ?? "") as (typeof ACOES_LOTE)[number];
  const ids = form.getAll("ids").map(String).filter(Boolean);
  if (!tipo || !ACOES_LOTE.includes(acao)) return falha("Ação inválida.");
  if (ids.length === 0) return falha("Selecione ao menos uma conta.");
  if (ids.length > 500) return falha("Selecione no máximo 500 contas por vez.");

  const supabase = await createClient();
  let resposta;
  if (acao === "baixar") {
    const conta = String(form.get("conta_id") ?? "");
    const data = String(form.get("data") ?? "");
    if (!conta || !data) return falha("Informe conta e data.");
    resposta = await supabase.rpc("baixar_titulos", { p_titulos: ids, p_conta: conta, p_data: data });
  } else if (acao === "reprogramar") {
    const vencimento = String(form.get("vencimento") ?? "");
    if (!vencimento) return falha("Informe o novo vencimento.");
    resposta = await supabase.rpc("reprogramar_titulos", { p_titulos: ids, p_vencimento: vencimento });
  } else if (acao === "excluir") {
    resposta = await supabase.rpc("excluir_titulos", { p_titulos: ids });
  } else if (acao === "restaurar") {
    resposta = await supabase.rpc("restaurar_titulos", { p_titulos: ids });
  } else {
    resposta = await supabase.rpc("marcar_perda", { p_titulos: ids });
  }
  if (resposta.error) return falha(mensagemBanco(resposta.error));
  revalidar(tipo);
  const n = Number(resposta.data ?? 0);
  const contas = plural(n, "conta", "contas");
  const feito = {
    baixar: tipo === "pagar" ? `${contas} paga(s).` : `${contas} recebida(s).`,
    reprogramar: `${contas} com novo vencimento.`,
    excluir: `${contas} na lixeira. Dá para restaurar em Excluídas.`,
    restaurar: `${plural(n, "conta restaurada", "contas restauradas")}.`,
    perda: `${plural(n, "conta marcada", "contas marcadas")} como perda.`,
  }[acao];
  return n === 0 ? falha("Nenhuma conta selecionada aceita essa ação.") : sucesso(feito);
}

// Linhas do rateio atual de um título, para o painel de trocar categorias.
export async function lerRateioTitulo(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("agendamento_rateios")
    .select("categoria_id, centro_custo_id, valor_cents, descricao").eq("agendamento_id", id).order("valor_cents", { ascending: false });
  return (data ?? []).map((l) => ({ ...l, valor_cents: Number(l.valor_cents) }));
}

// Troca categorias, centros de custo e valores do rateio, mantendo o total (vale com o título pago).
export async function ratearTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = lerTipo(form.get("tipo"));
  const id = String(form.get("id") ?? "");
  if (!tipo || !id) return falha("Título inválido.");
  const supabase = await createClient();
  const { data: t } = await supabase.from("agendamentos").select("valor_cents, descricao").eq("id", id).single();
  if (!t) return falha("Título não encontrado.");
  const rateio = lerRateio(form, Number(t.valor_cents));
  if ("erro" in rateio) return falha(rateio.erro);
  const { error } = await supabase.rpc("ratear_titulo", { p_titulo: id, p_rateio: rateio.ok });
  if (error) return falha(mensagemBanco(error));
  revalidar(tipo);
  revalidatePath("/relatorios/dre");
  return sucesso(rateio.ok.length > 1 ? `${t.descricao}: rateado em ${rateio.ok.length} linhas.` : `${t.descricao}: categoria atualizada.`);
}
