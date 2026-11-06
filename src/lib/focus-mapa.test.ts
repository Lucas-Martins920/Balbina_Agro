import { test } from "node:test";
import assert from "node:assert/strict";
import { type RegraFiscal, agoraComFuso, caminhoArquivoValido, justificativaValida, lerInutilizacao, lerRetorno, montarEmpresaFocus, montarNfce, origensDoAviso, montarNfe, refDaNota, rotaFocus, urlFocus } from "./focus-mapa.ts";

const config = { cfop_interna: "5101", cfop_interestadual: "6101", icms_situacao: "400", pis_situacao: "49", cofins_situacao: "49", serie: 1, informacoes_adicionais: "Pescado isento de ICMS." };
const dest = { nome: "Mercado", cpf_cnpj: "12.312.312/0001-99", inscricao_estadual: null, email: null, telefone: null,
  endereco: { logradouro: "Rua A", numero: "10", bairro: "Centro", cep: "90000000" }, cidade: "Porto Alegre", uf: "rs" };
const itens = [{ numero_item: 1, codigo: "cx", descricao: "Caixa 20 kg · tambaqui inteiro", ncm: "03028990", cfop_padrao: null, unidade: "cx", quantidade: 3, preco_unit_cents: 18000, desconto_cents: 1000 }];

test("kg vai para a nota como KG e a caixa de 20 kg como CX", () => {
  const ct = [{ ...itens[0], descricao: "Tambaqui inteiro (kg)", unidade: "kg", quantidade: 10, preco_unit_cents: 1500 }, { ...itens[0], numero_item: 2, unidade: "cx" }];
  const n = montarNfe({ docEmitente: "95000111000195", ufEmitente: "AM", config, dest: { ...dest, uf: "am" }, itens: ct, dataEmissao: "2026-10-27", numeroPedido: 9, formaPagamento: null }) as unknown as { items: { unidade_comercial: string; unidade_tributavel: string; valor_bruto: number }[] };
  assert.equal(n.items[0].unidade_comercial, "KG");
  assert.equal(n.items[0].unidade_tributavel, "KG");
  assert.equal(n.items[0].valor_bruto, 150);
  assert.equal(n.items[1].unidade_comercial, "CX");
});

test("homologação é o padrão", () => {
  assert.equal(urlFocus(undefined), "https://homologacao.focusnfe.com.br");
});

test("nota dentro do estado com CFOP 5101 e total com desconto", () => {
  const n: Record<string, unknown> & { items: { cfop: string; unidade_comercial: string; valor_bruto: number }[] } = montarNfe({ docEmitente: "95000111000195", ufEmitente: "RS", config, dest, itens, dataEmissao: "2026-10-26", numeroPedido: 7, formaPagamento: "boleto" });
  assert.equal(n.local_destino, 1);
  assert.equal(n.cnpj_destinatario, "12312312000199");
  assert.equal(n.indicador_inscricao_estadual_destinatario, 9);
  assert.equal(n.items[0].cfop, "5101");
  assert.equal(n.items[0].unidade_comercial, "CX");
  assert.equal(n.items[0].valor_bruto, 540);
  assert.deepEqual(n.formas_pagamento, [{ forma_pagamento: "15", valor_pagamento: 530 }]);
  assert.equal(n.informacoes_adicionais_contribuinte, "Pedido 7. Pescado isento de ICMS.");
});

test("fora do estado usa 6101 e contribuinte informa IE", () => {
  const n: Record<string, unknown> & { items: { cfop: string; unidade_comercial: string; valor_bruto: number }[] } = montarNfe({ docEmitente: "1", ufEmitente: "SC", config, dest: { ...dest, inscricao_estadual: "096/1234567" }, itens, dataEmissao: "2026-10-26", numeroPedido: 1, formaPagamento: null });
  assert.equal(n.items[0].cfop, "6101");
  assert.equal(n.local_destino, 2);
  assert.equal(n.inscricao_estadual_destinatario, "0961234567");
  assert.equal(n.consumidor_final, 0);
});

test("produtor rural pessoa física emite com CPF e informa o Funrural", () => {
  const cfg = { ...config, informacoes_adicionais: "", funrural_percentual: 1.5 };
  const n: Record<string, unknown> = montarNfe({ docEmitente: "950.111.222-33", ufEmitente: "RS", config: cfg, dest, itens, dataEmissao: "2026-10-26", numeroPedido: 2, formaPagamento: "pix" });
  assert.equal(n.cpf_emitente, "95011122233");
  assert.equal(n.cnpj_emitente, undefined);
  assert.equal(n.informacoes_adicionais_contribuinte, "Pedido 2. Funrural/Senar 1,5% (R$ 7,95) a ser retido pelo adquirente, Lei 8.212/91 art. 30.");
  const pf: Record<string, unknown> = montarNfe({ docEmitente: "95011122233", ufEmitente: "RS", config: cfg, dest: { ...dest, cpf_cnpj: "12345678901" }, itens, dataEmissao: "2026-10-26", numeroPedido: 3, formaPagamento: null });
  assert.equal(pf.informacoes_adicionais_contribuinte, "Pedido 3. Funrural/Senar 1,5% (R$ 7,95) recolhido pelo produtor.");
});

test("retorno da Focus", () => {
  assert.equal(lerRetorno({ status: "processando_autorizacao" }).status, "processando");
  const ok = lerRetorno({ status: "autorizado", chave_nfe: "NFe123", numero: "15", caminho_danfe: "/arquivos/x.pdf", mensagem_sefaz: "Autorizado" });
  assert.deepEqual([ok.status, ok.numero, ok.danfe_path, ok.motivo_rejeicao], ["autorizada", 15, "/arquivos/x.pdf", null]);
  assert.deepEqual([lerRetorno({ status: "erro_autorizacao", mensagem_sefaz: "Rejeição: CEP" }).status, lerRetorno({ status: "erro_autorizacao", mensagem_sefaz: "Rejeição: CEP" }).motivo_rejeicao], ["rejeitada", "Rejeição: CEP"]);
  assert.equal(lerRetorno({ status: "erro_cancelamento" }).status, "autorizada");
});

test("referência da nota vem do id e recusa qualquer outra coisa", () => {
  assert.equal(refDaNota("0A1b2c3d-0000-4000-8000-00000000000f"), "balbina-0a1b2c3d00004000800000000000000f");
  assert.throws(() => refDaNota("../../v2/empresas"));
  assert.throws(() => refDaNota("balbina-abc"));
});

test("aviso atrasado não desfaz nota cancelada nem volta autorizada para processando", () => {
  assert.ok(!origensDoAviso("autorizada").includes("cancelada"));
  assert.ok(!origensDoAviso("processando").includes("autorizada"));
  assert.ok(!origensDoAviso("rejeitada").includes("denegada"));
  assert.ok(origensDoAviso("cancelada").includes("cancelando"));
  assert.ok(origensDoAviso("autorizada").includes("processando"));
  // cancelamento recusado mantém a nota autorizada
  assert.ok(origensDoAviso("autorizada").includes("cancelando"));
});

test("resposta do cancelamento não apaga chave, número nem DANFE", () => {
  const c = lerRetorno({ status: "cancelado", caminho_xml_cancelamento: "/arquivos/x-can.xml" });
  assert.equal(c.status, "cancelada");
  assert.equal(c.xml_cancelamento_path, "/arquivos/x-can.xml");
  assert.ok(!("chave_acesso" in c) && !("danfe_path" in c) && !("numero" in c));
  const recusado = lerRetorno({ status: "erro_cancelamento", mensagem_sefaz: "Prazo de cancelamento superior ao previsto" });
  assert.deepEqual([recusado.status, recusado.motivo_rejeicao], ["autorizada", "Prazo de cancelamento superior ao previsto"]);
  const cce = lerRetorno({ status: "autorizado", numero_carta_correcao: 2, caminho_pdf_carta_correcao: "/arquivos/cce.pdf" });
  assert.deepEqual([cce.cce_numero, cce.cce_pdf_path], [2, "/arquivos/cce.pdf"]);
});

test("NFC-e do balcão: só CNPJ, pagamentos batem com o total e CPF na nota", () => {
  const base = { config, itens, dataEmissao: "2026-10-29T10:00:00-04:00", numeroPedido: 5 };
  assert.throws(() => montarNfce({ ...base, docEmitente: "95011122233", pagamentos: [] }), /só pode ser emitida por CNPJ/);
  const n = montarNfce({ ...base, docEmitente: "95.000.111/0001-95", cpfConsumidor: "529.982.247-25",
    pagamentos: [{ forma: "dinheiro", valor_cents: 30000 }, { forma: "cartao", valor_cents: 23000 }] }) as Record<string, unknown>;
  assert.equal(n.cnpj_emitente, "95000111000195");
  assert.equal(n.presenca_comprador, 1);
  assert.equal(n.cpf_destinatario, "52998224725");
  assert.deepEqual(n.formas_pagamento, [{ forma_pagamento: "01", valor_pagamento: 300 }, { forma_pagamento: "03", valor_pagamento: 230, tipo_integracao: 2 }]);
  // soma diferente do total (troco não descontado): um pagamento só, com o total
  const t = montarNfce({ ...base, docEmitente: "95000111000195", pagamentos: [{ forma: "pix", valor_cents: 60000 }] }) as Record<string, unknown>;
  assert.deepEqual(t.formas_pagamento, [{ forma_pagamento: "17", valor_pagamento: 530 }]);
  assert.throws(() => montarNfce({ ...base, docEmitente: "95000111000195", pagamentos: [], cpfConsumidor: "111.111.111-11" }), /CPF/);
});

test("justificativa e caminho de arquivo", () => {
  assert.equal(justificativaValida("curta"), null);
  assert.equal(justificativaValida("  Numeração pulada   por falha  "), "Numeração pulada por falha");
  assert.ok(caminhoArquivoValido("/arquivos_development/1234/202610/DANFEs/1326.pdf"));
  assert.ok(!caminhoArquivoValido("https://evil.com/x.pdf"));
  assert.ok(!caminhoArquivoValido("/arquivos/../v2/empresas"));
  assert.ok(!caminhoArquivoValido("/v2/nfe/abc"));
});

test("inutilização autorizada e rejeitada", () => {
  assert.deepEqual(lerInutilizacao({ status: "autorizado", protocolo_sefaz: "135", caminho_xml: "/arquivos/1-inu.xml" }),
    { status: "autorizada", protocolo: "135", xml_path: "/arquivos/1-inu.xml", motivo: null });
  assert.equal(lerInutilizacao({ status: "erro_autorizacao", mensagem_sefaz: "Rejeição: 563" }).motivo, "Rejeição: 563");
});

test("data e hora com o fuso da piscicultura", () => {
  assert.equal(agoraComFuso("America/Manaus", new Date("2026-10-29T14:05:09Z")), "2026-10-29T10:05:09-04:00");
  assert.equal(agoraComFuso("America/Sao_Paulo", new Date("2026-10-29T02:00:00Z")), "2026-10-28T23:00:00-03:00");
});

test("cadastro do emitente na Focus: produtor rural com CPF e IE, regime normal", () => {
  const e = { cnpj: "95011122233", razao_social: "João Produtor", nome_fantasia: "Piscicultura do João", inscricao_estadual: "04.123.456-7", regime_tributario: "produtor_rural",
    endereco: { logradouro: "Ramal do Brasileirinho", numero: "SN", bairro: "Zona Rural", cep: "69000-000", municipio: "Manaus", uf: "am" } };
  const f = montarEmpresaFocus(e, { habilitaNfce: false, certificadoBase64: "QUJD", senhaCertificado: "1234" }) as Record<string, unknown>;
  assert.equal(f.cpf, "95011122233");
  assert.equal(f.cnpj, undefined);
  assert.equal(f.inscricao_estadual, "041234567");
  assert.equal(f.regime_tributario, 3);
  assert.equal(f.uf, "AM");
  assert.equal(f.cep, "69000000");
  assert.equal(f.arquivo_certificado_base64, "QUJD");
  assert.throws(() => montarEmpresaFocus({ ...e, inscricao_estadual: null }, { habilitaNfce: false }), /inscrição estadual/);
  assert.throws(() => montarEmpresaFocus(e, { habilitaNfce: true }), /CNPJ/);
  const pj = montarEmpresaFocus({ ...e, cnpj: "95000111000195", regime_tributario: "simples" },
    { habilitaNfce: true, csc: { id: 1, codigo: "ABC", ambiente: "homologacao" } }) as Record<string, unknown>;
  assert.deepEqual([pj.regime_tributario, pj.csc_nfce_homologacao, pj.id_token_nfce_homologacao, pj.arquivo_certificado_base64], [1, "ABC", 1, undefined]);
});

test("rotaFocus separa NF-e e NFC-e", () => {
  assert.equal(rotaFocus("nfe"), "/v2/nfe");
  assert.equal(rotaFocus("nfce"), "/v2/nfce");
});

test("regras fiscais: a mais específica vale para o CFOP e os textos se juntam", () => {
  const regras: RegraFiscal[] = [
    { produto_id: null, contato_id: null, destino: "qualquer", destinatario: "qualquer", cfop: null, icms_situacao: null, texto: "Produto de origem animal." },
    { produto_id: "p1", contato_id: null, destino: "dentro", destinatario: "qualquer", cfop: "5102", icms_situacao: "102", texto: null },
    { produto_id: "p1", contato_id: "c1", destino: "dentro", destinatario: "qualquer", cfop: "5949", icms_situacao: null, texto: "Bonificação." },
    { produto_id: null, contato_id: null, destino: "fora", destinatario: "qualquer", cfop: "6949", icms_situacao: null, texto: "Não vale dentro." },
  ];
  const comProduto = itens.map((i) => ({ ...i, produto_id: "p1" }));
  const n = montarNfe({ docEmitente: "95000111000195", ufEmitente: "RS", config, dest, itens: comProduto, dataEmissao: "2026-10-26", numeroPedido: 7,
    formaPagamento: null, regras, contatoId: "c1" }) as unknown as { items: { cfop: string; icms_situacao_tributaria: string }[]; informacoes_adicionais_contribuinte: string };
  assert.equal(n.items[0].cfop, "5949");
  assert.equal(n.items[0].icms_situacao_tributaria, "102");
  assert.equal(n.informacoes_adicionais_contribuinte, "Pedido 7. Pescado isento de ICMS. Produto de origem animal. Bonificação.");

  const outro = montarNfe({ docEmitente: "95000111000195", ufEmitente: "RS", config, dest, itens: comProduto, dataEmissao: "2026-10-26", numeroPedido: 8,
    formaPagamento: null, regras, contatoId: "c9" }) as unknown as { items: { cfop: string }[] };
  assert.equal(outro.items[0].cfop, "5102");
});
