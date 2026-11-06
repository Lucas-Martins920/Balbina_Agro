"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemBanco, sucesso, type EstadoAcao } from "@/lib/acao";
import { cifrar } from "@/lib/cripto";
import { getEmpresaAtual } from "@/lib/empresa";
import { ambienteFocus, focus, focusEmpresas } from "@/lib/focus";
import {
  agoraComFuso, justificativaValida, lerInutilizacao, lerRetorno, montarEmpresaFocus, montarNfce, montarNfe, refDaNota, rotaFocus,
  type ConfigFiscal, type Destinatario, type EmitenteFocus, type ItemNfe, type RegraFiscal, type PagamentoNota, type RetornoFocus,
} from "@/lib/focus-mapa";
import { hojeISO } from "@/lib/formato";
import { foraDoPlano, getPermissoes } from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function revalidar() {
  revalidatePath("/notas");
  revalidatePath("/vendas", "layout");
}

const motivoErro = (d: RetornoFocus, status: number) => d.mensagem ?? d.erros?.map((e) => e.mensagem).join("; ") ?? d.mensagem_sefaz ?? `erro ${status}`;

async function gravarRetorno(notaId: string, r: RetornoFocus) {
  const supabase = await createClient();
  const campos = lerRetorno(r);
  await supabase.from("notas_fiscais").update({
    ...campos, updated_at: new Date().toISOString(), ...(campos.status === "autorizada" ? { emitida_em: new Date().toISOString() } : {}),
  }).eq("id", notaId);
  return campos;
}

async function notaDoUsuario(notaId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("notas_fiscais").select("id, empresa_id, modelo, status, provedor_ref").eq("id", notaId).maybeSingle();
  return data;
}

export async function emitirNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const pedidoId = String(form.get("pedido_id") ?? "");
  const supabase = await createClient();
  const { data: notaId, error } = await supabase.rpc("preparar_nfe", { p_pedido: pedidoId });
  if (error) return falha(mensagemBanco(error));

  const [{ data: nota }, { data: pedido }, { data: itens }] = await Promise.all([
    supabase.from("notas_fiscais").select("id, provedor_ref, empresa_id").eq("id", notaId).single(),
    supabase.from("pedidos_venda").select("numero, forma_pagamento, cliente_id, contatos(nome, cpf_cnpj, inscricao_estadual, email, telefone, endereco, cidade, uf)").eq("id", pedidoId).single(),
    supabase.from("nfe_itens").select("*").eq("pedido_id", pedidoId).order("numero_item"),
  ]);
  const { data: empresa } = await supabase.from("empresas").select("cnpj, endereco").eq("id", nota!.empresa_id).single();
  const [{ data: config }, { data: regras }] = await Promise.all([
    supabase.rpc("config_fiscal_empresa", { p_empresa: nota!.empresa_id }),
    supabase.from("regras_fiscais").select("produto_id, contato_id, destino, destinatario, cfop, icms_situacao, texto")
      .eq("empresa_id", nota!.empresa_id).eq("ativa", true),
  ]);
  const ufEmitente = (empresa?.endereco as { uf?: string } | null)?.uf;
  if (!ufEmitente) {
    await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: "UF da piscicultura não configurada" }).eq("id", notaId);
    return falha("Informe a UF da piscicultura na configuração fiscal (em Notas fiscais).");
  }

  const { atual } = await getEmpresaAtual();
  const payload = montarNfe({
    docEmitente: empresa!.cnpj, ufEmitente, config: config as ConfigFiscal, dest: pedido!.contatos as unknown as Destinatario,
    itens: (itens ?? []) as ItemNfe[], dataEmissao: hojeISO(atual.fuso), numeroPedido: pedido!.numero, formaPagamento: pedido!.forma_pagamento,
    regras: (regras ?? []) as RegraFiscal[], contatoId: pedido!.cliente_id,
  });
  await supabase.from("notas_fiscais").update({ payload, ambiente: ambienteFocus() }).eq("id", notaId);

  try {
    const { status, dados } = await focus<RetornoFocus>(nota!.empresa_id, `/v2/nfe?ref=${refDaNota(nota!.id)}`, { method: "POST", body: payload });
    if (status >= 400) {
      const motivo = motivoErro(dados, status);
      await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: motivo }).eq("id", notaId);
      revalidar();
      return falha(`A Focus recusou a nota: ${motivo}`);
    }
    await gravarRetorno(notaId, dados);
  } catch (e) {
    // sem resposta não dá para saber se a nota entrou: fica processando e o "Atualizar" consulta
    revalidar();
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe");
  }
  revalidar();
  return sucesso("Nota enviada para a SEFAZ. A autorização costuma levar alguns segundos; use Atualizar se não mudar sozinha.");
}

export type EstadoNfce = EstadoAcao & { notaId?: string };

// NFC-e da venda de balcão. A Focus responde na hora (autorizada ou rejeitada).
export async function emitirNfce(_: EstadoNfce, form: FormData): Promise<EstadoNfce> {
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const { pode } = await getPermissoes();
  if (!pode("pdv.operar") && !pode("vendas.lancar")) return falha("Você não tem permissão para emitir notas.");
  const pedidoId = String(form.get("pedido_id") ?? "");
  const cpf = String(form.get("cpf") ?? "").trim();
  const supabase = await createClient();
  const { data: notaId, error } = await supabase.rpc("preparar_nfce", { p_pedido: pedidoId });
  if (error) return falha(mensagemBanco(error));

  const [{ data: nota }, { data: pedido }, { data: itens }, { data: pagamentos }] = await Promise.all([
    supabase.from("notas_fiscais").select("id, empresa_id").eq("id", notaId).single(),
    supabase.from("pedidos_venda").select("numero").eq("id", pedidoId).single(),
    supabase.from("nfe_itens").select("*").eq("pedido_id", pedidoId).order("numero_item"),
    supabase.rpc("pagamentos_do_pedido", { p_pedido: pedidoId }),
  ]);
  const [{ data: empresa }, { data: config }] = await Promise.all([
    supabase.from("empresas").select("cnpj, fuso").eq("id", nota!.empresa_id).single(),
    supabase.rpc("config_fiscal_empresa", { p_empresa: nota!.empresa_id }),
  ]);

  let payload;
  try {
    payload = montarNfce({
      docEmitente: empresa!.cnpj, config: config as ConfigFiscal, itens: (itens ?? []) as ItemNfe[], dataEmissao: agoraComFuso(empresa!.fuso),
      numeroPedido: pedido!.numero, pagamentos: (pagamentos ?? []) as PagamentoNota[], cpfConsumidor: cpf || null,
    });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "Dados inválidos";
    await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: motivo }).eq("id", notaId);
    return falha(motivo);
  }
  await supabase.from("notas_fiscais").update({ payload, ambiente: ambienteFocus() }).eq("id", notaId);

  try {
    const { status, dados } = await focus<RetornoFocus>(nota!.empresa_id, `/v2/nfce?ref=${refDaNota(nota!.id)}`, { method: "POST", body: payload });
    if (status >= 400) {
      const motivo = motivoErro(dados, status);
      await supabase.from("notas_fiscais").update({ status: "rejeitada", motivo_rejeicao: motivo }).eq("id", notaId);
      revalidar();
      return falha(`A Focus recusou a NFC-e: ${motivo}`);
    }
    const r = await gravarRetorno(notaId, dados);
    revalidar();
    if (r.status === "rejeitada") return falha(`NFC-e rejeitada: ${r.motivo_rejeicao}`);
    return { ...sucesso(r.status === "autorizada" ? "NFC-e autorizada." : "NFC-e em processamento."), notaId };
  } catch (e) {
    revalidar();
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe");
  }
}

export async function consultarNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const nota = await notaDoUsuario(String(form.get("nota_id") ?? ""));
  if (!nota?.provedor_ref) return falha("Nota não encontrada.");
  try {
    const { status, dados } = await focus<RetornoFocus>(nota.empresa_id, `${rotaFocus(nota.modelo)}/${refDaNota(nota.id)}`);
    if (status === 404) return falha("A Focus não tem esta nota. Reemita.");
    const r = await gravarRetorno(nota.id, dados);
    revalidar();
    return sucesso(r.status === "autorizada" ? "Nota autorizada." : r.status === "rejeitada" ? `Rejeitada: ${r.motivo_rejeicao}` : r.status === "cancelada" ? "Nota cancelada." : "Ainda processando.");
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao consultar a Focus NFe");
  }
}

export async function cancelarNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const justificativa = justificativaValida(String(form.get("justificativa") ?? ""));
  if (!justificativa) return falha("A SEFAZ exige uma justificativa de pelo menos 15 caracteres.");
  // o cancelamento na SEFAZ acontece antes de gravar aqui, então o RLS sozinho não segura
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  if (!(await getPermissoes()).pode("vendas.cancelar")) return falha("Você não tem permissão para cancelar notas.");
  const nota = await notaDoUsuario(String(form.get("nota_id") ?? ""));
  if (!nota || nota.status !== "autorizada") return falha("Só nota autorizada pode ser cancelada.");
  try {
    const caminho = `${rotaFocus(nota.modelo)}/${refDaNota(nota.id)}`;
    const { status, dados } = await focus<RetornoFocus>(nota.empresa_id, caminho, { method: "DELETE", body: { justificativa } });
    if (status >= 400) return falha(`Cancelamento recusado: ${motivoErro(dados, status)}`);
    const r = await gravarRetorno(nota.id, dados);
    revalidar();
    if (dados.status === "erro_cancelamento") return falha(`A SEFAZ recusou o cancelamento: ${r.motivo_rejeicao ?? "sem motivo"}`);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao cancelar na Focus NFe");
  }
  return sucesso("Nota cancelada na SEFAZ.");
}

// Carta de correção (CC-e): corrige texto da NF-e autorizada. Não serve para valores, impostos,
// emitente, destinatário nem data. A SEFAZ guarda até 20; vale a última.
export async function corrigirNfe(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const correcao = String(form.get("correcao") ?? "").trim().replace(/\s+/g, " ");
  if (correcao.length < 15 || correcao.length > 1000) return falha("A correção precisa ter de 15 a 1000 caracteres.");
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const { pode } = await getPermissoes();
  if (!pode("vendas.lancar")) return falha("Você não tem permissão para corrigir notas.");
  const nota = await notaDoUsuario(String(form.get("nota_id") ?? ""));
  if (!nota || nota.status !== "autorizada" || nota.modelo !== "nfe") return falha("Só NF-e autorizada aceita carta de correção.");
  try {
    const ref = refDaNota(nota.id);
    const { status, dados } = await focus<RetornoFocus>(nota.empresa_id, `/v2/nfe/${ref}/carta_correcao`, { method: "POST", body: { correcao } });
    if (status >= 400 || dados.status === "erro_autorizacao") return falha(`Carta de correção recusada: ${motivoErro(dados, status)}`);
    const supabase = await createClient();
    // a consulta devolve os caminhos do XML e do PDF da carta
    const consulta = await focus<RetornoFocus>(nota.empresa_id, `/v2/nfe/${ref}`).catch(() => null);
    const r = lerRetorno({ ...(consulta?.dados ?? {}), ...dados, status: "autorizado" });
    await supabase.from("notas_fiscais").update({
      cce_texto: correcao, cce_numero: r.cce_numero ?? null, cce_xml_path: r.cce_xml_path ?? null, cce_pdf_path: r.cce_pdf_path ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", nota.id);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe");
  }
  revalidar();
  return sucesso("Carta de correção registrada na SEFAZ.");
}

// Inutiliza números que pularam (nota rejeitada que não vai ser reemitida, falha de sistema).
export async function inutilizarNumeracao(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  if (!(await getPermissoes()).pode("vendas.cancelar")) return falha("Você não tem permissão para inutilizar numeração.");
  const modelo = form.get("modelo") === "nfce" ? "nfce" : "nfe";
  const serie = Number(form.get("serie"));
  const inicial = Number(form.get("numero_inicial"));
  const final = Number(form.get("numero_final") || inicial);
  const justificativa = justificativaValida(String(form.get("justificativa") ?? ""));
  if (!Number.isInteger(serie) || !Number.isInteger(inicial) || !Number.isInteger(final) || inicial < 1 || final < inicial) return falha("Informe a série e a faixa de números.");
  if (!justificativa) return falha("A SEFAZ exige uma justificativa de pelo menos 15 caracteres.");

  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  // o banco confere antes de ir à SEFAZ: número usado por nota ou faixa já inutilizada
  const { data: linha, error } = await supabase.from("inutilizacoes_nfe").insert({
    empresa_id: atual.id, modelo, serie, numero_inicial: inicial, numero_final: final, justificativa, ambiente: ambienteFocus(),
  }).select("id").single();
  if (error) return falha(mensagemBanco(error));
  const { data: empresa } = await supabase.from("empresas").select("cnpj").eq("id", atual.id).single();
  const doc = empresa!.cnpj;
  try {
    const { status, dados } = await focus<RetornoFocus & { protocolo_sefaz?: string; caminho_xml?: string }>(atual.id, `${rotaFocus(modelo)}/inutilizacao`, {
      method: "POST", body: { [doc.length === 11 ? "cpf" : "cnpj"]: doc, serie: String(serie), numero_inicial: inicial, numero_final: final, justificativa },
    });
    const r = status >= 400 ? { status: "rejeitada", protocolo: null, xml_path: null, motivo: motivoErro(dados, status) } : lerInutilizacao(dados);
    await supabase.from("inutilizacoes_nfe").update({ ...r, updated_at: new Date().toISOString() }).eq("id", linha.id);
    revalidar();
    if (r.status === "rejeitada") return falha(`A SEFAZ recusou a inutilização: ${r.motivo}`);
  } catch (e) {
    await supabase.from("inutilizacoes_nfe").update({ status: "rejeitada", motivo: e instanceof Error ? e.message : "sem resposta" }).eq("id", linha.id);
    revalidar();
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe");
  }
  return sucesso(inicial === final ? `Número ${inicial} inutilizado.` : `Números ${inicial} a ${final} inutilizados.`);
}

export async function salvarConfigFiscal(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await getPermissoes()).pode("configuracoes.editar")) return falha("Você não tem permissão para mudar a configuração fiscal.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const texto = (k: string) => String(form.get(k) ?? "").trim();
  const uf = texto("uf").toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) return falha("UF com duas letras, ex.: AM.");
  const cep = texto("cep").replace(/\D/g, "");
  if (cep && cep.length !== 8) return falha("CEP com 8 dígitos.");
  const regime = texto("regime_tributario");
  const funrural = texto("funrural_percentual").replace(",", ".");
  if (funrural && !(Number(funrural) >= 0 && Number(funrural) <= 10)) return falha("Funrural em porcentagem, ex.: 1,5.");
  const { data: empresa } = await supabase.from("empresas").select("endereco").eq("id", atual.id).single();
  const endereco = Object.fromEntries(Object.entries({
    ...((empresa?.endereco as object) ?? {}),
    uf, cep, logradouro: texto("logradouro"), numero: texto("numero"), complemento: texto("complemento"), bairro: texto("bairro"),
    municipio: texto("municipio"), telefone: texto("telefone"), email: texto("email"),
  }).filter(([, v]) => v !== ""));
  const { error } = await supabase.from("empresas").update({
    regime_tributario: regime || undefined,
    inscricao_estadual: texto("inscricao_estadual") || null,
    endereco,
    // campo vazio volta ao padrão do regime
    config_fiscal: Object.fromEntries(Object.entries({
      cfop_interna: texto("cfop_interna"), cfop_interestadual: texto("cfop_interestadual"),
      icms_situacao: texto("icms_situacao"), pis_situacao: texto("pis_situacao"), cofins_situacao: texto("cofins_situacao"),
      serie: Number(texto("serie")) || "", serie_nfce: Number(texto("serie_nfce")) || "", informacoes_adicionais: texto("informacoes_adicionais"),
      funrural_percentual: funrural === "" ? "" : Number(funrural),
    }).filter(([, v]) => v !== "")),
    updated_at: new Date().toISOString(),
  }).eq("id", atual.id);
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Configuração fiscal salva.");
}

type RespostaEmpresaFocus = { id?: number | string; token_producao?: string; token_homologacao?: string; certificado_valido_ate?: string; mensagem?: string; erros?: { mensagem?: string }[] };

// Cadastra (ou atualiza) a piscicultura como emitente na Focus, com o certificado A1. O arquivo e a senha
// vão direto para a Focus e não ficam guardados aqui; só os tokens da piscicultura, cifrados.
export async function cadastrarEmitenteFocus(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  if (!(await getPermissoes()).pode("configuracoes.editar")) return falha("Você não tem permissão para mudar a configuração fiscal.");
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const [{ data: empresa }, { data: emitente }] = await Promise.all([
    supabase.from("empresas").select("cnpj, razao_social, nome_fantasia, inscricao_estadual, regime_tributario, endereco").eq("id", atual.id).single(),
    supabase.from("focus_emitentes").select("focus_id").eq("empresa_id", atual.id).maybeSingle(),
  ]);

  const arquivo = form.get("certificado");
  let certificadoBase64: string | null = null;
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > 100_000) return falha("O certificado A1 (.pfx) tem no máximo alguns KB. Confira o arquivo.");
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) return falha("Envie o certificado A1 no formato .pfx ou .p12.");
    certificadoBase64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
  }
  const senha = String(form.get("senha_certificado") ?? "");
  if (!emitente && !certificadoBase64) return falha("Envie o certificado A1 (.pfx) para cadastrar o emitente.");
  if (certificadoBase64 && !senha) return falha("Informe a senha do certificado.");
  const habilitaNfce = form.get("habilita_nfce") === "on";
  const cscCodigo = String(form.get("csc") ?? "").trim();
  const cscId = Number(form.get("csc_id"));
  if (cscCodigo && !(cscId > 0)) return falha("Informe o identificador (ID) do CSC junto com o código.");

  let corpo;
  try {
    corpo = montarEmpresaFocus(empresa as EmitenteFocus, {
      certificadoBase64, senhaCertificado: senha, habilitaNfce, csc: cscCodigo ? { id: cscId, codigo: cscCodigo, ambiente: ambienteFocus() } : null,
    });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Dados do emitente incompletos.");
  }
  try {
    const { status, dados } = await focusEmpresas<RespostaEmpresaFocus>(emitente ? `/v2/empresas/${encodeURIComponent(emitente.focus_id)}` : "/v2/empresas",
      { method: emitente ? "PUT" : "POST", body: corpo });
    if (status >= 400 || !dados.id) return falha(`A Focus recusou o cadastro: ${dados.mensagem ?? dados.erros?.map((e) => e.mensagem).join("; ") ?? status}`);
    // grava pelo servidor: os membros só leem a situação, e os tokens nunca chegam ao navegador
    const db = createAdminClient();
    const { error } = await db.from("focus_emitentes").upsert({
      empresa_id: atual.id, focus_id: String(dados.id), habilita_nfce: habilitaNfce,
      certificado_valido_ate: dados.certificado_valido_ate ?? null, updated_at: new Date().toISOString(),
    });
    if (error) return falha(mensagemBanco(error));
    const tokens = Object.fromEntries(Object.entries({
      token_homologacao_cifrado: dados.token_homologacao ? cifrar(dados.token_homologacao) : null,
      token_producao_cifrado: dados.token_producao ? cifrar(dados.token_producao) : null,
    }).filter(([, v]) => v));
    if (Object.keys(tokens).length) await db.from("focus_emitentes_segredos").upsert({ emitente_id: atual.id, ...tokens });
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe");
  }
  revalidar();
  return sucesso(emitente ? "Emitente atualizado na Focus." : "Emitente cadastrado na Focus. Já dá para emitir em homologação.");
}

// Cadastra na Focus o aviso automático de autorização, apontando para o webhook deste app
export async function registrarWebhookFocus(): Promise<EstadoAcao> {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const token = process.env.FOCUS_NFE_WEBHOOK_TOKEN;
  if (!site || !token) return falha("Defina NEXT_PUBLIC_SITE_URL e FOCUS_NFE_WEBHOOK_TOKEN no servidor.");
  if (!(await getPermissoes()).pode("configuracoes.editar")) return falha("Você não tem permissão para mudar a configuração fiscal.");
  const plano = await foraDoPlano("notas");
  if (plano) return falha(plano);
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { data: empresa } = await supabase.from("empresas").select("cnpj").eq("id", atual.id).single();
  try {
    const { status, dados } = await focus<{ mensagem?: string }>(atual.id, "/v2/hooks", {
      method: "POST", body: { [empresa!.cnpj.length === 11 ? "cpf" : "cnpj"]: empresa!.cnpj, event: "nfe", url: `${site}/api/webhooks/focus`, authorization: token },
    });
    // a Focus responde erro quando o mesmo aviso já existe: para quem clica, é sucesso
    if (status >= 400 && /j[áa] existe um gatilho/i.test(dados.mensagem ?? "")) return sucesso("O aviso automático já estava cadastrado.");
    if (status >= 400) return falha(`A Focus recusou: ${dados.mensagem ?? status}`);
  } catch (e) {
    return falha(e instanceof Error ? e.message : "Erro ao falar com a Focus NFe");
  }
  return sucesso("Aviso automático cadastrado: as notas mudam de status sozinhas.");
}

// E3: regras fiscais por produto, cliente e destino (CFOP, situação do ICMS e texto da nota).
export async function salvarRegraFiscal(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const cfop = t("cfop").replace(/\D/g, "");
  const icms = t("icms_situacao").replace(/\D/g, "");
  if (!t("nome")) return falha("Dê um nome à regra (ex.: Peixe para fora do estado).");
  if (cfop && cfop.length !== 4) return falha("CFOP tem 4 números.");
  if (icms && !/^\d{2,3}$/.test(icms)) return falha("Situação do ICMS tem 2 ou 3 números (CST ou CSOSN).");
  if (!cfop && !icms && !t("texto")) return falha("Informe o CFOP, a situação do ICMS ou o texto da nota.");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();
  const { error } = await supabase.from("regras_fiscais").insert({
    empresa_id: atual.id, nome: t("nome"), produto_id: t("produto_id") || null, contato_id: t("contato_id") || null,
    destino: ["dentro", "fora"].includes(t("destino")) ? t("destino") : "qualquer",
    destinatario: ["contribuinte", "nao_contribuinte"].includes(t("destinatario")) ? t("destinatario") : "qualquer",
    cfop: cfop || null, icms_situacao: icms || null, texto: t("texto") || null,
  });
  if (error) return falha(mensagemBanco(error));
  revalidar();
  return sucesso("Regra fiscal salva. Vale para as próximas notas.");
}

export async function excluirRegraFiscal(_: EstadoAcao, form: FormData): Promise<EstadoAcao> {
  const supabase = await createClient();
  const { error, count } = await supabase.from("regras_fiscais").delete({ count: "exact" }).eq("id", String(form.get("id") ?? ""));
  if (error) return falha(mensagemBanco(error));
  if (!count) return falha("Seu usuário não pode mudar as regras fiscais.");
  revalidar();
  return sucesso("Regra excluída.");
}
