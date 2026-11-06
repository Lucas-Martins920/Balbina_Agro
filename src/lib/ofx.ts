// Leitor de extrato OFX (SGML do OFX 1.x e XML do 2.x), como os bancos brasileiros exportam.

export type LinhaExtrato = {
  id_externo: string;
  data: string; // AAAA-MM-DD
  descricao: string;
  valor_cents: number;
  cpf_cnpj: string | null;
  nome: string | null;
};

export type Extrato = { banco: string | null; conta: string | null; linhas: LinhaExtrato[] };

// Bancos ainda mandam em Windows-1252; o cabeçalho diz qual é.
export function decodificarOfx(bytes: Uint8Array): string {
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 600));
  const utf8 = /ENCODING:\s*UTF-?8|encoding="utf-8"/i.test(inicio) && !/CHARSET:\s*(1252|ISO-8859-1)/i.test(inicio);
  return new TextDecoder(utf8 ? "utf-8" : "windows-1252").decode(bytes);
}

function campo(bloco: string, tag: string): string | null {
  // SGML não fecha as tags; o valor vai até o próximo "<"
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  const v = m?.[1].trim();
  return v ? v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : null;
}

function lerData(texto: string | null): string | null {
  const m = texto?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function lerValor(texto: string | null): number | null {
  if (!texto) return null;
  // alguns bancos usam vírgula decimal (e aí o ponto é milhar)
  const limpo = texto.replace(/\s/g, "");
  const normal = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/,/g, "");
  if (!/^[-+]?\d+(\.\d+)?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100);
}

function documento(texto: string): string | null {
  const m = texto.match(/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/);
  return m ? m[1].replace(/\D/g, "") : null;
}

export function lerOfx(texto: string): Extrato {
  if (!/<OFX>/i.test(texto)) throw new Error("Arquivo não parece um OFX.");
  const linhas: LinhaExtrato[] = [];
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const vistos = new Map<string, number>();

  for (const bruto of blocos) {
    const bloco = bruto.split(/<\/STMTTRN>/i)[0];
    const data = lerData(campo(bloco, "DTPOSTED"));
    const valor = lerValor(campo(bloco, "TRNAMT"));
    if (!data || valor === null || valor === 0) continue;
    const memo = campo(bloco, "MEMO");
    const nome = campo(bloco, "NAME");
    const descricao = [nome, memo].filter((v, i, a) => v && a.indexOf(v) === i).join(" - ") || "Sem descrição";
    // Sem FITID (ou FITID repetido, comum em alguns bancos), monta um id estável com o conteúdo
    let id = campo(bloco, "FITID") ?? `${data}|${valor}|${descricao}`;
    const n = vistos.get(id) ?? 0;
    vistos.set(id, n + 1);
    if (n > 0) id = `${id}#${n + 1}`;
    linhas.push({ id_externo: id, data, descricao, valor_cents: valor, cpf_cnpj: documento(`${memo ?? ""} ${nome ?? ""}`), nome });
  }

  return { banco: campo(texto, "BANKID"), conta: campo(texto, "ACCTID"), linhas };
}
