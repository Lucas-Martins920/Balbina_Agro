"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { getEmpresaAtual } from "@/lib/empresa";
import { decodificarOfx, lerOfx } from "@/lib/ofx";
import { formatarData } from "@/lib/formato";
import { CAMPOS_REGRA, condicaoDoLancamento, OPERADORES_REGRA, TIPOS_REGRA, type Condicao } from "@/lib/regras";
import { lerRateio } from "@/lib/rateio";
import { aplicarRegrasEmPartes, type Parte, type Ponto } from "@/lib/regras-em-partes";
import { createClient } from "@/lib/supabase/server";

const LIMITE_ARQUIVO = 5 * 1024 * 1024;
// a página dá 60 s às ações (maxDuration); as regras param antes e o resto fica para "Aplicar regras"
const PRAZO_REGRAS_MS = 40_000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

function regrasEmPartes(supabase: Supabase, conta: string, importacao: string | null, inicio?: Ponto) {
  return aplicarRegrasEmPartes(async (ponto) => {
    const { data, error } = await supabase.rpc("aplicar_regras_lote", {
      p_conta: conta, p_importacao: importacao, p_apos_data: ponto.apos_data, p_apos_id: ponto.apos_id,
    });
    if (error) throw new Error(mensagemBanco(error));
    return data as Parte;
  }, { inicio, prazoMs: PRAZO_REGRAS_MS });
}

function revalidar() {
  revalidatePath("/conciliacao");
  revalidatePath("/contas");
  revalidatePath("/contas-a-pagar");
  revalidatePath("/contas-a-receber");
  revalidatePath("/conciliacao/regras");
}

export async function importarOfx(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const conta = String(form.get("conta_id") ?? "");
  const arquivo = form.get("arquivo");
  if (!conta) return falha("Escolha a conta do extrato.");
  if (!(arquivo instanceof File) || arquivo.size === 0) return falha("Escolha o arquivo OFX.");
  if (arquivo.size > LIMITE_ARQUIVO) return falha("Arquivo maior que 5 MB.");

  let extrato;
  try {
    extrato = lerOfx(decodificarOfx(new Uint8Array(await arquivo.arrayBuffer())));
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
  }
  if (extrato.linhas.length === 0) return falha("O arquivo não tem lançamentos.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_extrato", {
    p_conta: conta, p_origem: "ofx", p_linhas: extrato.linhas, p_arquivo: arquivo.name,
  });
  if (error) return falha(mensagemBanco(error));
  // a importação não lança nada (o saldo só muda ao lançar): só a regra "Ignorar" roda aqui
  const r = data as { total: number; novas: number; repetidas?: number; antes_do_saldo?: number; por_regra?: number };
  let antes = "";
  if (r.antes_do_saldo) {
    const { data: c } = await supabase.from("contas_financeiras").select("saldo_inicial_data").eq("id", conta).maybeSingle();
    const desde = c?.saldo_inicial_data ? ` (${formatarData(c.saldo_inicial_data)})` : "";
    antes = ` ${r.antes_do_saldo} ficaram de fora por serem de antes do saldo inicial da conta${desde}.`;
  }
  revalidar();
  const ignorados = r.por_regra ? ` ${r.por_regra} ignorado(s) pela regra "Ignorar".` : "";
  const lancar = r.novas - (r.por_regra ?? 0) > 0 ? " Nada foi lançado: o saldo só muda quando você conciliar (ou clicar em \"Aplicar regras\")." : "";
  return sucesso(resumoImportacao(r.total - (r.antes_do_saldo ?? 0), r.novas, r.repetidas ?? 0) + antes + ignorados + lancar);
}

// Diz o que entrou e o que foi pulado por já estar no extrato.
function resumoImportacao(total: number, novas: number, repetidas: number) {
  if (novas === total) return `${novas} lançamentos importados.`;
  const partes = [`${novas} lançamento(s) novo(s) de ${total} no arquivo.`];
  const mesmoId = total - novas - repetidas;
  if (mesmoId > 0) partes.push(`${mesmoId} já estavam importados.`);
  if (repetidas > 0) partes.push(`${repetidas} não entraram por já existir no extrato um lançamento com a mesma data, valor e descrição.`);
  return partes.join(" ");
}

async function executar(fn: string, args: Record<string, unknown>, ok: string): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(ok);
}

export async function conciliarComTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const movimento = String(form.get("movimento_id") ?? "");
  const titulo = String(form.get("agendamento_id") ?? "");
  if (!movimento || !titulo) return falha("Escolha o título.");
  return executar("conciliar_com_titulo", { p_movimento: movimento, p_agendamento: titulo, p_modo: String(form.get("modo") ?? "manual") }, "Conciliado.");
}

export async function conciliarMultiplos(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const movimento = String(form.get("movimento_id") ?? "");
  const titulos = form.getAll("agendamento_ids").map(String).filter(Boolean);
  if (!movimento || titulos.length === 0) return falha("Escolha ao menos um título.");
  if (titulos.length === 1) return executar("conciliar_com_titulo", { p_movimento: movimento, p_agendamento: titulos[0], p_modo: "multipla" }, "Conciliado.");
  return executar("conciliar_multiplos", { p_movimento: movimento, p_agendamentos: titulos, p_modo: "multipla" }, `Conciliado com ${titulos.length} títulos.`);
}

export async function conciliarCriandoTitulo(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const movimento = String(form.get("movimento_id") ?? "");
  if (!movimento) return falha("Lançamento do extrato não encontrado.");
  const contato = String(form.get("contato_id") ?? "") || null;
  const descricao = String(form.get("descricao") ?? "").trim() || null;
  const supabase = await createClient();
  const { data: m } = await supabase.from("movimentos_bancarios").select("empresa_id, descricao, valor_cents, cpf_cnpj_contraparte").eq("id", movimento).single();
  if (!m) return falha("Lançamento do extrato não encontrado.");
  const rateio = lerRateio(form, Math.abs(Number(m.valor_cents)));
  if ("erro" in rateio) return falha(rateio.erro);
  // produto comprado que vai para o estoque (só pagamento) e a memória do fornecedor
  const produto = String(form.get("estoque_produto_id") ?? "") || null;
  const textoQtd = String(form.get("estoque_quantidade") ?? "").trim().replace(",", ".");
  const quantidade = produto ? Number(textoQtd) : null;
  if (produto && (!textoQtd || !Number.isFinite(quantidade) || quantidade! <= 0)) return falha("Informe a quantidade que entrou no estoque.");
  const lembrarProduto = produto ? form.get("estoque_lembrar") === "on" : form.get("estoque_esquecer") === "on" ? false : null;
  const { error } = await supabase.rpc("conciliar_com_estoque", {
    p_movimento: movimento, p_rateio: rateio.ok, p_contato: contato, p_descricao: descricao,
    p_produto: produto, p_quantidade: quantidade, p_deposito: String(form.get("estoque_deposito_id") ?? "") || null,
    p_lembrar: contato ? lembrarProduto : null,
  });
  if (error) return falha(mensagemBanco(error));
  if (produto) revalidatePath("/estoque");

  let extra = "";
  if (form.get("lembrar") === "on") {
    if (rateio.ok.length > 1) {
      extra = " A regra automática não foi criada: ela vale só para lançamentos de uma categoria.";
    } else {
      const [linha] = rateio.ok;
      const cond = condicaoDoLancamento(m.descricao, m.cpf_cnpj_contraparte);
      const { error: e } = await supabase.rpc("criar_regra", {
        p_empresa: m.empresa_id, p_tipo: Number(m.valor_cents) > 0 ? "recebimento" : "pagamento",
        p_nome: `${descricao ?? m.descricao} (${cond.valor})`.slice(0, 120), p_condicoes: [cond],
        p_categoria: linha.categoria_id, p_centro_custo: linha.centro_custo_id, p_contato: contato, p_descricao: descricao,
      });
      extra = e ? ` A regra não foi criada: ${mensagemBanco(e)}` : " Os próximos parecidos serão conciliados sozinhos.";
    }
  }
  revalidar();
  const noEstoque = produto ? " O produto entrou no estoque." : "";
  return sucesso(`${rateio.ok.length > 1 ? `Lançamento rateado em ${rateio.ok.length} linhas` : "Lançamento criado"} e conciliado.${noEstoque}${extra}`);
}

// Liga o extrato ao pagamento ou transferência que já tinha sido lançado à mão (não cria outro).
export async function conciliarComExistente(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const movimento = String(form.get("movimento_id") ?? "");
  const tipo = String(form.get("tipo") ?? "");
  const id = String(form.get("id") ?? "");
  if (!movimento || !id || (tipo !== "baixa" && tipo !== "transferencia")) return falha("Escolha o lançamento já feito.");
  return executar("conciliar_com_existente", { p_movimento: movimento, p_tipo: tipo, p_id: id }, "Conciliado com o lançamento que já existia.");
}

export async function conciliarTransferencia(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const movimento = String(form.get("movimento_id") ?? "");
  const outra = String(form.get("outra_conta_id") ?? "");
  if (!movimento || !outra) return falha("Escolha a outra conta.");
  return executar("conciliar_transferencia", { p_movimento: movimento, p_outra_conta: outra }, "Transferência conciliada.");
}

export async function ignorarMovimento(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const movimento = String(form.get("movimento_id") ?? "");
  const trecho = String(form.get("trecho") ?? "").trim();
  const lembrar = form.get("lembrar") === "on";
  if (lembrar && !trecho) return falha("Diga que parte da descrição se repete (ex.: RENDE FACIL).");
  const supabase = await createClient();
  const { data: m } = await supabase.from("movimentos_bancarios").select("empresa_id, conta_id").eq("id", movimento).single();
  const { error } = await supabase.rpc("ignorar_movimento", { p_movimento: movimento });
  if (error) return falha(mensagemBanco(error));

  let extra = "";
  if (lembrar && m) {
    const { error: e } = await supabase.rpc("criar_regra", {
      p_empresa: m.empresa_id, p_tipo: "ignorar", p_nome: `Ignorar "${trecho}"`.slice(0, 120),
      p_condicoes: [{ campo: "descricao", operador: "contem", valor: trecho }], p_contas: [m.conta_id],
    });
    extra = e ? ` A regra não foi criada: ${mensagemBanco(e)}` : " Os próximos com essa descrição nesta conta serão ignorados sozinhos.";
  }
  revalidar();
  return sucesso(`Lançamento ignorado.${extra}`);
}

// O banco confere permissão, motivo e mês fechado, e só desfaz o que a conciliação criou.
async function soltar(fn: string, args: Record<string, unknown>, titulo: string): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return falha(mensagemBanco(error));
  revalidar();
  const feito = (data as string[] | null) ?? [];
  return sucesso(feito.length ? `${titulo}: ${feito.join("; ")}.` : `${titulo}.`);
}

export async function desconciliar(movimento: string, motivo: string, manterTitulo: boolean): Promise<EstadoAcao> {
  return soltar("desconciliar", { p_movimento: movimento, p_motivo: motivo, p_manter_titulo: manterTitulo }, "Desconciliado");
}

// Só o master, logo depois de digitar o código do autenticador (o banco confere de novo).
export async function apagarConciliacao(movimento: string, motivo: string): Promise<EstadoAcao> {
  return soltar("apagar_conciliacao", { p_movimento: movimento, p_motivo: motivo }, "Conciliação apagada");
}

export async function apagarDoExtrato(movimento: string, motivo: string): Promise<EstadoAcao> {
  return soltar("apagar_movimento_extrato", { p_movimento: movimento, p_motivo: motivo }, "Apagado");
}

// Arquivo lido por engano: tira do extrato o que ele trouxe e ainda está para conciliar.
// O que já foi conciliado ou ignorado fica. Quem pode conciliar cancela (o banco confere).
export async function cancelarImportacao(importacao: string, motivo: string): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancelar_importacao", { p_importacao: importacao, p_motivo: motivo });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  const r = data as { apagados: number; mantidos: number };
  const ficaram = r.mantidos ? ` ${r.mantidos} já conciliado(s) ou ignorado(s) ficaram.` : "";
  return sucesso(`Importação cancelada: ${r.apagados} lançamento(s) saíram do extrato.${ficaram}`);
}

export async function aplicarRegras(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const conta = String(form.get("conta_id") ?? "");
  const supabase = await createClient();
  let r;
  try {
    r = await regrasEmPartes(supabase, conta, null);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Não consegui aplicar as regras.");
  }
  revalidar();
  const faltam = r.fim ? "" : " Ainda há lançamentos para passar pelas regras: clique de novo para continuar.";
  return r.aplicadas || !r.fim
    ? sucesso(`${r.aplicadas} lançamento(s) conciliado(s) ou ignorado(s) pelas regras.${faltam}`)
    : falha("Nenhuma regra serviu para os lançamentos pendentes.");
}

export async function conciliarCerteiras(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conciliar_certeiras", { p_conta: String(form.get("conta_id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return data ? sucesso(`${data} lançamento(s) conciliado(s) com o título sugerido.`) : falha("As sugestões mudaram; confira uma a uma abaixo.");
}

// C1: lançamentos que as últimas vezes foram sempre para a mesma categoria viram pagamento/recebimento em lote.
export async function lancarPeloHistorico(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lancar_pelo_historico", { p_conta: String(form.get("conta_id") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return data ? sucesso(`${data} lançamento(s) lançado(s) e conciliado(s) como nas últimas vezes.`) : falha("O extrato mudou; confira um a um abaixo.");
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

// C2: cria a regra sugerida (lançamento conciliado do mesmo jeito 3 vezes ou mais).
export async function criarRegraSugerida(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const tipo = String(form.get("tipo") ?? "");
  if (tipo !== "pagamento" && tipo !== "recebimento") return falha("Sugestão inválida.");
  const condicao = condicaoDoLancamento(String(form.get("descricao") ?? ""), String(form.get("cpf_cnpj") ?? "") || null);
  const nome = String(form.get("nome") ?? "").trim().slice(0, 120);
  const texto = (k: string) => String(form.get(k) ?? "") || null;
  return executar("criar_regra", {
    p_empresa: atual.id, p_tipo: tipo, p_nome: nome, p_condicoes: [condicao],
    p_categoria: texto("categoria_id"), p_centro_custo: texto("centro_custo_id"), p_contato: texto("contato_id"),
  }, "Regra criada. Use “Aplicar regras” na conciliação para os pendentes.");
}

export async function dispensarSugestao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const { atual } = await getEmpresaAtual();
  const tipo = String(form.get("tipo") ?? "");
  if (tipo !== "regra" && tipo !== "recorrencia") return falha("Sugestão inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("sugestoes_dispensadas").upsert({ empresa_id: atual.id, tipo, chave: String(form.get("chave") ?? "") });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Sugestão dispensada.");
}

function lerCondicao(form: FormData, n: number): Condicao | null {
  const campo = String(form.get(`campo${n}`) ?? "");
  const operador = String(form.get(`operador${n}`) ?? "");
  const valor = String(form.get(`valor${n}`) ?? "").trim();
  if (!campo || !(campo in CAMPOS_REGRA) || !(operador in OPERADORES_REGRA)) return null;
  if (operador !== "vazio" && !valor) return null;
  return { campo, operador, valor };
}

export async function criarRegra(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const tipo = String(form.get("tipo") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!(tipo in TIPOS_REGRA)) return falha("Escolha o tipo da regra.");
  if (!nome) return falha("Dê um nome à regra.");
  const condicoes = [lerCondicao(form, 1), lerCondicao(form, 2)].filter((c): c is Condicao => c !== null);
  if (!condicoes.length) return falha("Preencha pelo menos uma condição.");
  const contrapartida = String(form.get("contrapartida_id") ?? "") || null;
  const categoria = String(form.get("categoria_id") ?? "") || null;
  const contato = String(form.get("contato_id") ?? "") || null;
  const descricao = String(form.get("descricao") ?? "").trim() || null;
  if (tipo !== "ignorar" && (tipo === "transferencia" ? !contrapartida : !categoria && !contato)) {
    return falha(tipo === "transferencia" ? "Escolha a outra conta da transferência." : "Escolha a categoria ou o contato.");
  }
  const { atual } = await getEmpresaAtual();
  const conta = String(form.get("conta_id") ?? "");
  const lanca = tipo !== "transferencia" && tipo !== "ignorar";
  return executar("criar_regra", {
    p_empresa: atual.id, p_tipo: tipo, p_nome: nome, p_condicoes: condicoes,
    p_operador: form.get("operador_logico") === "qualquer" ? "qualquer" : "todas",
    p_categoria: lanca ? categoria : null,
    p_centro_custo: lanca ? String(form.get("centro_custo_id") ?? "") || null : null,
    p_contato: lanca ? contato : null,
    p_descricao: lanca ? descricao : null,
    p_contrapartida: tipo === "transferencia" ? contrapartida : null,
    p_contas: conta ? [conta] : null,
  }, "Regra criada. Ela vale para as próximas importações; use “Aplicar regras” para os pendentes.");
}

export async function alternarRegra(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const ativa = form.get("ativa") === "true";
  const { error } = await supabase.from("regras_conciliacao").update({ ativa: !ativa, updated_at: new Date().toISOString() }).eq("id", String(form.get("regra_id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso(ativa ? "Regra pausada." : "Regra ativada.");
}

export async function moverRegra(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  return executar("mover_regra", { p_regra: String(form.get("regra_id") ?? ""), p_para_cima: form.get("direcao") === "cima" }, "Ordem alterada.");
}

export async function excluirRegra(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error } = await supabase.from("regras_conciliacao").delete().eq("id", String(form.get("regra_id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Regra excluída.");
}
