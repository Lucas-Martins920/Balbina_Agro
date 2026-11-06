// Nome de quem pagou ou recebeu, para sugerir o cadastro rápido do fornecedor/cliente na conciliação.
// O Open Finance às vezes manda o nome; no OFX ele vem no meio da descrição ("PIX - ENVIADO 02/03 17:02 FULANO").
const GENERICAS = new Set([
  "PIX", "TED", "DOC", "TEV", "TRANSF", "TRANSFERENCIA", "TRANSFERÊNCIA", "ENVIADO", "ENVIADA", "RECEBIDO", "RECEBIDA",
  "EMITIDO", "EMITIDA", "PAGTO", "PAGAMENTO", "PAG", "PGTO", "BOLETO", "TITULO", "TÍTULO", "TARIFA", "COMPRA", "CARTAO",
  "CARTÃO", "DEBITO", "DÉBITO", "CREDITO", "CRÉDITO", "DEB", "CRED", "AUT", "QR", "CODE", "SAQUE", "DEP", "DEPOSITO",
  "DEPÓSITO", "REM", "ELETRONICO", "ELETRÔNICO", "CONTA", "INTERNET", "SISPAG", "CX", "-", "–",
]);

function titulo(palavra: string) {
  return palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1).toLocaleLowerCase("pt-BR");
}

export function nomeDaContraparte(descricao: string, nomeBanco?: string | null): string {
  const fonte = nomeBanco?.trim() || descricao;
  const palavras = fonte.split(/\s+/).filter((p) => p && !/^[\d/.,:*#-]+$/.test(p));
  if (!nomeBanco?.trim()) {
    while (palavras.length && GENERICAS.has(palavras[0].toLocaleUpperCase("pt-BR"))) palavras.shift();
  }
  return palavras.map(titulo).join(" ").slice(0, 120).trim();
}
