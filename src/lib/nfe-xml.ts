// XML de NF-e que chega pela caixa de e-mail (C4): tira o que a lista de notas de compra precisa, no
// mesmo formato da busca na SEFAZ pela Focus (registrar_nfes_recebidas).
export type NfeDoXml = {
  chave_nfe: string; nome_emitente: string; documento_emitente: string | null; valor_total: string;
  data_emissao: string | null; tipo_nfe: string; situacao: "autorizada";
};

function tag(xml: string, nome: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`).exec(xml);
  return m ? m[1].trim() : null;
}

function bloco(xml: string, nome: string): string {
  const m = new RegExp(`<(?:\\w+:)?${nome}[\\s>][\\s\\S]*?</(?:\\w+:)?${nome}>`).exec(xml);
  return m ? m[0] : "";
}

export function lerXmlNfe(xml: string): NfeDoXml | null {
  const chave = /<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/.exec(xml)?.[1];
  if (!chave) return null;
  const emit = bloco(xml, "emit");
  const valor = tag(bloco(xml, "ICMSTot"), "vNF");
  return {
    chave_nfe: chave,
    nome_emitente: tag(emit, "xNome") ?? "Emitente sem nome",
    documento_emitente: tag(emit, "CNPJ") ?? tag(emit, "CPF"),
    valor_total: valor ?? "0",
    data_emissao: tag(bloco(xml, "ide"), "dhEmi") ?? tag(bloco(xml, "ide"), "dEmi"),
    tipo_nfe: tag(bloco(xml, "ide"), "tpNF") ?? "1",
    situacao: "autorizada",
  };
}
