// Tradução entre o ERP e a API v2 da Focus NFe. Sem rede aqui, para dar para testar.

import { cpfValido } from "./documento.ts";
export function urlFocus(ambiente: string | undefined) {
  return ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
}

export type ConfigFiscal = {
  cfop_interna: string; cfop_interestadual: string; icms_situacao: string; pis_situacao: string; cofins_situacao: string;
  serie: number; informacoes_adicionais: string; funrural_percentual?: number; serie_nfce?: number;
};
export type Destinatario = {
  nome: string; cpf_cnpj: string; inscricao_estadual: string | null; email: string | null; telefone: string | null;
  endereco: { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string };
  cidade: string; uf: string;
};
export type ItemNfe = { numero_item: number; codigo: string; descricao: string; ncm: string; cfop_padrao: string | null; unidade: string; quantidade: number; preco_unit_cents: number; desconto_cents: number; produto_id?: string | null };

// Regra fiscal (E3): CFOP, situação do ICMS e texto escolhidos sozinhos por produto, cliente e destino.
export type RegraFiscal = {
  produto_id: string | null; contato_id: string | null; destino: "qualquer" | "dentro" | "fora"; destinatario: "qualquer" | "contribuinte" | "nao_contribuinte";
  cfop: string | null; icms_situacao: string | null; texto: string | null;
};
type Situacao = { produtoId: string | null; contatoId: string | null; interestadual: boolean; contribuinte: boolean };

function regrasQueValem(regras: RegraFiscal[], s: Situacao) {
  return regras
    .filter((r) => (!r.produto_id || r.produto_id === s.produtoId) && (!r.contato_id || r.contato_id === s.contatoId)
      && (r.destino === "qualquer" || (r.destino === "fora") === s.interestadual)
      && (r.destinatario === "qualquer" || (r.destinatario === "contribuinte") === s.contribuinte))
    // mais específica primeiro: produto pesa mais que cliente, que pesa mais que destino e destinatário
    .map((r) => ({ r, peso: (r.produto_id ? 8 : 0) + (r.contato_id ? 4 : 0) + (r.destino !== "qualquer" ? 2 : 0) + (r.destinatario !== "qualquer" ? 1 : 0) }))
    .sort((a, b) => b.peso - a.peso)
    .map((x) => x.r);
}

const reais = (c: number) => Number((c / 100).toFixed(2));
// unidades do sistema na grafia que a SEFAZ aceita (a caixa de peixe vai como CX; o resto, em maiúsculas)
const UNIDADES: Record<string, string> = { un: "UN", kg: "KG", cx: "CX", t: "TON", l: "L", sc: "SC" };

// Itens comuns à NF-e e à NFC-e
function itensDaNota(lista: ItemNfe[], config: ConfigFiscal, interestadual: boolean, regra?: (i: ItemNfe) => RegraFiscal[]) {
  let total = 0;
  const textos: string[] = [];
  const itens = lista.map((i) => {
    const valem = regra?.(i) ?? [];
    const cfopRegra = valem.find((r) => r.cfop)?.cfop;
    const icmsRegra = valem.find((r) => r.icms_situacao)?.icms_situacao;
    for (const r of [...valem].reverse()) if (r.texto?.trim() && !textos.includes(r.texto.trim())) textos.push(r.texto.trim());
    const bruto = Math.round(Number(i.quantidade) * Number(i.preco_unit_cents));
    total += bruto - Number(i.desconto_cents);
    const unidade = UNIDADES[i.unidade] ?? i.unidade.toUpperCase().slice(0, 6);
    return {
      numero_item: i.numero_item,
      codigo_produto: i.codigo,
      descricao: i.descricao,
      codigo_ncm: i.ncm,
      cfop: cfopRegra ?? (i.cfop_padrao && !interestadual ? i.cfop_padrao : interestadual ? config.cfop_interestadual : config.cfop_interna),
      unidade_comercial: unidade,
      quantidade_comercial: Number(i.quantidade),
      valor_unitario_comercial: reais(Number(i.preco_unit_cents)),
      valor_bruto: reais(bruto),
      unidade_tributavel: unidade,
      quantidade_tributavel: Number(i.quantidade),
      valor_unitario_tributavel: reais(Number(i.preco_unit_cents)),
      ...(Number(i.desconto_cents) > 0 ? { valor_desconto: reais(Number(i.desconto_cents)) } : {}),
      inclui_no_total: 1,
      icms_origem: 0,
      icms_situacao_tributaria: icmsRegra ?? config.icms_situacao,
      pis_situacao_tributaria: config.pis_situacao,
      cofins_situacao_tributaria: config.cofins_situacao,
    };
  });
  return { itens, total, textos };
}

export function montarNfe(p: {
  docEmitente: string; ufEmitente: string; config: ConfigFiscal; dest: Destinatario; itens: ItemNfe[]; dataEmissao: string;
  numeroPedido: number; formaPagamento: string | null; regras?: RegraFiscal[]; contatoId?: string | null;
}) {
  const interestadual = p.dest.uf.toUpperCase() !== p.ufEmitente.toUpperCase();
  const doc = p.dest.cpf_cnpj.replace(/\D/g, "");
  const ie = (p.dest.inscricao_estadual ?? "").replace(/\D/g, "");
  const docEmit = p.docEmitente.replace(/\D/g, "");
  const regras = p.regras ?? [];
  const { itens, total, textos } = itensDaNota(p.itens, p.config, interestadual, regras.length
    ? (i) => regrasQueValem(regras, { produtoId: i.produto_id ?? null, contatoId: p.contatoId ?? null, interestadual, contribuinte: Boolean(ie) })
    : undefined);
  return {
    natureza_operacao: "Venda de produção do estabelecimento",
    data_emissao: p.dataEmissao,
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: interestadual ? 2 : 1,
    consumidor_final: ie ? 0 : 1,
    presenca_comprador: 9,
    // produtor rural pessoa física emite com CPF
    ...(docEmit.length === 11 ? { cpf_emitente: docEmit } : { cnpj_emitente: docEmit }),
    nome_destinatario: p.dest.nome.slice(0, 60),
    ...(doc.length === 14 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    ...(ie ? { inscricao_estadual_destinatario: ie, indicador_inscricao_estadual_destinatario: 1 } : { indicador_inscricao_estadual_destinatario: 9 }),
    logradouro_destinatario: p.dest.endereco.logradouro,
    numero_destinatario: p.dest.endereco.numero,
    ...(p.dest.endereco.complemento ? { complemento_destinatario: p.dest.endereco.complemento } : {}),
    bairro_destinatario: p.dest.endereco.bairro,
    municipio_destinatario: p.dest.cidade,
    uf_destinatario: p.dest.uf.toUpperCase(),
    cep_destinatario: p.dest.endereco.cep,
    ...(p.dest.email ? { email_destinatario: p.dest.email } : {}),
    modalidade_frete: 9,
    informacoes_adicionais_contribuinte: [`Pedido ${p.numeroPedido}.`, textoFunrural(p.config, docEmit, doc, total), p.config.informacoes_adicionais, ...textos]
      .filter(Boolean).join(" "),
    items: itens,
    formas_pagamento: [{ forma_pagamento: FORMA[p.formaPagamento ?? ""] ?? "99", valor_pagamento: reais(total) }],
  };
}

// Venda de produtor pessoa física para empresa: quem compra retém o Funrural; para pessoa física, o produtor recolhe.
function textoFunrural(c: ConfigFiscal, docEmit: string, docDest: string, totalCents: number) {
  const pct = Number(c.funrural_percentual ?? 0);
  if (docEmit.length !== 11 || pct <= 0) return "";
  const valor = (Math.round((totalCents * pct) / 100) / 100).toFixed(2).replace(".", ",");
  const pctTxt = String(pct).replace(".", ",");
  return docDest.length === 14
    ? `Funrural/Senar ${pctTxt}% (R$ ${valor}) a ser retido pelo adquirente, Lei 8.212/91 art. 30.`
    : `Funrural/Senar ${pctTxt}% (R$ ${valor}) recolhido pelo produtor.`;
}

// Códigos de meio de pagamento da NF-e (tPag)
const FORMA: Record<string, string> = { dinheiro: "01", cheque: "02", cartao: "03", boleto: "15", pix: "17", ted: "18", debito_automatico: "18" };

export type RetornoFocus = {
  status?: string; status_sefaz?: string; mensagem_sefaz?: string; chave_nfe?: string; numero?: string; serie?: string;
  protocolo?: string; caminho_xml_nota_fiscal?: string; caminho_danfe?: string; erros?: { mensagem?: string }[]; mensagem?: string;
  caminho_xml_cancelamento?: string; numero_carta_correcao?: number | string; caminho_xml_carta_correcao?: string;
  caminho_pdf_carta_correcao?: string; qrcode_url?: string;
};

// De que status a nota pode ir para o status de um aviso. Avisos chegam fora de ordem:
// cancelada e denegada são finais, e "processando" atrasado não desfaz o que a SEFAZ já respondeu.
const ORIGENS: Record<string, string[]> = {
  processando: ["rascunho", "processando"],
  autorizada: ["rascunho", "processando", "rejeitada", "autorizada", "cancelando"],
  rejeitada: ["rascunho", "processando", "rejeitada"],
  denegada: ["rascunho", "processando", "denegada"],
  cancelada: ["autorizada", "cancelando", "cancelada"],
};
export function origensDoAviso(status: string) {
  return ORIGENS[status] ?? [];
}

const motivoDe = (r: RetornoFocus) => r.mensagem_sefaz ?? (r.erros?.map((e) => e.mensagem).filter(Boolean).join("; ") || r.mensagem) ?? null;

// Status da Focus para o status da nota no ERP. Só devolve os campos que vieram: a resposta do
// cancelamento, por exemplo, não traz chave nem DANFE, e não pode apagar o que já estava gravado.
export function lerRetorno(r: RetornoFocus) {
  const status =
    r.status === "autorizado" ? "autorizada"
    : r.status === "cancelado" ? "cancelada"
    : r.status === "denegado" ? "denegada"
    : r.status === "erro_autorizacao" ? "rejeitada"
    // cancelamento recusado: a nota continua valendo
    : r.status === "erro_cancelamento" ? "autorizada"
    : "processando";
  const motivo = motivoDe(r);
  const campos: Record<string, string | number | null> = {
    chave_acesso: r.chave_nfe ?? null,
    numero: r.numero ? Number(r.numero) : null,
    protocolo: r.protocolo ?? null,
    xml_path: r.caminho_xml_nota_fiscal ?? null,
    danfe_path: r.caminho_danfe ?? null,
    xml_cancelamento_path: r.caminho_xml_cancelamento ?? null,
    cce_numero: r.numero_carta_correcao ? Number(r.numero_carta_correcao) : null,
    cce_xml_path: r.caminho_xml_carta_correcao ?? null,
    cce_pdf_path: r.caminho_pdf_carta_correcao ?? null,
    qrcode_url: r.qrcode_url ?? null,
  };
  return {
    status,
    ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== null)),
    // cancelamento recusado: guarda o motivo, mas a nota segue autorizada
    motivo_rejeicao: status === "autorizada" && r.status !== "erro_cancelamento" ? null : motivo,
  } as { status: string; motivo_rejeicao: string | null; chave_acesso?: string; numero?: number; protocolo?: string; xml_path?: string;
    danfe_path?: string; xml_cancelamento_path?: string; cce_numero?: number; cce_xml_path?: string; cce_pdf_path?: string; qrcode_url?: string };
}

// NF-e e NFC-e têm o mesmo formato na Focus, cada uma no seu endereço
export const rotaFocus = (modelo: string) => (modelo === "nfce" ? "/v2/nfce" : "/v2/nfe");

// Referência da nota na Focus, derivada do id (como em preparar_nfe). O servidor usa um token só para
// todas as pisciculturas, então nunca confia na coluna provedor_ref para montar a URL.
export function refDaNota(notaId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notaId)) throw new Error("Nota inválida");
  return `balbina-${notaId.toLowerCase().replace(/-/g, "")}`;
}

// Data e hora com o fuso da piscicultura (a NFC-e exige data_emissao a até 5 minutos de agora, com fuso)
export function agoraComFuso(fuso: string, agora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(agora).map((x) => [x.type, x.value]));
  const local = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  const minutos = Math.round((local - Math.floor(agora.getTime() / 1000) * 1000) / 60000);
  const sinal = minutos < 0 ? "-" : "+";
  const abs = Math.abs(minutos);
  const offset = `${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${offset}`;
}

export type PagamentoNota = { forma: string; valor_cents: number };

// NFC-e (modelo 65) da venda de balcão. Só para CNPJ: produtor rural pessoa física não emite NFC-e.
export function montarNfce(p: {
  docEmitente: string; config: ConfigFiscal; itens: ItemNfe[]; dataEmissao: string; numeroPedido: number;
  pagamentos: PagamentoNota[]; cpfConsumidor?: string | null;
}) {
  const docEmit = p.docEmitente.replace(/\D/g, "");
  if (docEmit.length !== 14) throw new Error("NFC-e só pode ser emitida por CNPJ. Produtor rural pessoa física emite NF-e.");
  const cpf = (p.cpfConsumidor ?? "").replace(/\D/g, "");
  if (cpf && !cpfValido(cpf)) throw new Error("CPF do consumidor inválido.");
  const { itens, total } = itensDaNota(p.itens, p.config, false);
  // a soma dos pagamentos tem de bater com o total da nota (troco já descontado)
  const pagos = p.pagamentos.filter((x) => x.valor_cents > 0);
  const soma = pagos.reduce((s, x) => s + x.valor_cents, 0);
  const formas = soma === total && pagos.length > 0
    ? pagos.map((x) => formaPagamento(x.forma, x.valor_cents))
    : [formaPagamento(pagos[0]?.forma ?? "dinheiro", total)];
  return {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: p.dataEmissao,
    cnpj_emitente: docEmit,
    presenca_comprador: 1,
    consumidor_final: 1,
    local_destino: 1,
    modalidade_frete: 9,
    ...(cpf ? { cpf_destinatario: cpf } : {}),
    indicador_inscricao_estadual_destinatario: 9,
    informacoes_adicionais_contribuinte: [`Venda ${p.numeroPedido}.`, p.config.informacoes_adicionais].filter(Boolean).join(" "),
    items: itens,
    formas_pagamento: formas,
  };
}

function formaPagamento(forma: string, valorCents: number) {
  const codigo = FORMA[forma] ?? "99";
  // cartão sem maquininha integrada ao sistema (tpIntegra 2)
  return { forma_pagamento: codigo, valor_pagamento: reais(valorCents), ...(codigo === "03" || codigo === "04" ? { tipo_integracao: 2 } : {}) };
}

// Resposta da inutilização de numeração (síncrona)
export function lerInutilizacao(r: RetornoFocus & { protocolo_sefaz?: string; caminho_xml?: string }) {
  const status = r.status === "autorizado" ? "autorizada" : r.status === "erro_autorizacao" ? "rejeitada" : "processando";
  return { status, protocolo: r.protocolo_sefaz ?? null, xml_path: r.caminho_xml ?? null, motivo: status === "autorizada" ? null : motivoDe(r) };
}

// Justificativa de cancelamento e inutilização: a SEFAZ pede de 15 a 255 caracteres
export function justificativaValida(texto: string) {
  const t = texto.trim().replace(/\s+/g, " ");
  return t.length >= 15 ? t.slice(0, 255) : null;
}

// Caminho de arquivo devolvido pela Focus (DANFE, XML, carta de correção). O app baixa do servidor
// da Focus; qualquer outra coisa (outro host, ../) é recusada.
export function caminhoArquivoValido(caminho: string | null | undefined) {
  return Boolean(caminho && /^\/arquivos[\w-]*\/[\w\-./]+$/.test(caminho) && !caminho.includes(".."));
}

// Cadastro do emitente na Focus (API de empresas). regime_tributario: 1 Simples, 3 Regime normal.
export type EmitenteFocus = {
  cnpj: string; razao_social: string; nome_fantasia: string | null; inscricao_estadual: string | null; regime_tributario: string;
  endereco: { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cep?: string; municipio?: string; uf?: string; telefone?: string; email?: string };
};
export function montarEmpresaFocus(e: EmitenteFocus, extra: {
  certificadoBase64?: string | null; senhaCertificado?: string | null; habilitaNfce: boolean;
  csc?: { id: number; codigo: string; ambiente: "producao" | "homologacao" } | null;
}) {
  const doc = e.cnpj.replace(/\D/g, "");
  const ie = (e.inscricao_estadual ?? "").replace(/\D/g, "");
  const end = e.endereco;
  const falta = [
    !end.logradouro && "rua", !end.numero && "número", !end.bairro && "bairro", !/^\d{8}$/.test((end.cep ?? "").replace(/\D/g, "")) && "CEP",
    !end.municipio && "município", !/^[A-Z]{2}$/.test((end.uf ?? "").toUpperCase()) && "UF", doc.length === 11 && !ie && "inscrição estadual",
  ].filter(Boolean);
  if (falta.length) throw new Error(`Complete os dados do emitente: ${falta.join(", ")}.`);
  if (extra.habilitaNfce && doc.length !== 14) throw new Error("NFC-e só pode ser emitida por CNPJ.");
  return {
    nome: e.razao_social.slice(0, 60),
    nome_fantasia: (e.nome_fantasia || e.razao_social).slice(0, 60),
    ...(doc.length === 11 ? { cpf: doc } : { cnpj: doc }),
    ...(ie ? { inscricao_estadual: ie } : {}),
    regime_tributario: e.regime_tributario === "simples" ? 1 : 3,
    logradouro: end.logradouro, numero: end.numero, ...(end.complemento ? { complemento: end.complemento } : {}),
    bairro: end.bairro, cep: (end.cep ?? "").replace(/\D/g, ""), municipio: end.municipio, uf: (end.uf ?? "").toUpperCase(),
    ...(end.telefone ? { telefone: end.telefone.replace(/\D/g, "") } : {}),
    ...(end.email ? { email: end.email } : {}),
    habilita_nfe: true,
    habilita_nfce: extra.habilitaNfce,
    ...(extra.certificadoBase64 ? { arquivo_certificado_base64: extra.certificadoBase64, senha_certificado: extra.senhaCertificado ?? "" } : {}),
    ...(extra.csc ? { [`csc_nfce_${extra.csc.ambiente}`]: extra.csc.codigo, [`id_token_nfce_${extra.csc.ambiente}`]: extra.csc.id } : {}),
  };
}
