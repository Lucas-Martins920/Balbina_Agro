import { test } from "node:test";
import assert from "node:assert/strict";
import { decodificarOfx, lerOfx } from "./ofx.ts";

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0748<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261011120000[-3:BRT]
<TRNAMT>1200.00
<FITID>A1
<MEMO>PIX RECEBIDO 55.666.777/0001-88 MERCADO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012
<TRNAMT>-3003,50
<FITID>A1
<NAME>AGRO MILHO
<MEMO>PAG BOLETO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261013
<TRNAMT>0.00
<FITID>A3
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

test("lê OFX SGML com vírgula decimal e FITID repetido", () => {
  const e = lerOfx(SGML);
  assert.equal(e.banco, "0748");
  assert.equal(e.conta, "12345-6");
  assert.equal(e.linhas.length, 2);
  assert.deepEqual(e.linhas[0], {
    id_externo: "A1", data: "2026-10-11", descricao: "PIX RECEBIDO 55.666.777/0001-88 MERCADO",
    valor_cents: 120000, cpf_cnpj: "55666777000188", nome: null,
  });
  assert.equal(e.linhas[1].id_externo, "A1#2");
  assert.equal(e.linhas[1].valor_cents, -300350);
  assert.equal(e.linhas[1].descricao, "AGRO MILHO - PAG BOLETO");
});

test("lê OFX XML", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><OFX><STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>-45.9</TRNAMT><FITID>X</FITID><MEMO>Tarifa &amp; IOF</MEMO></STMTTRN></OFX>`;
  const e = lerOfx(xml);
  assert.equal(e.linhas[0].valor_cents, -4590);
  assert.equal(e.linhas[0].descricao, "Tarifa & IOF");
});

test("decodifica Windows-1252", () => {
  const cp = new Uint8Array([...new TextEncoder().encode("CHARSET:1252\n<OFX><MEMO>S"), 0xc9, 0x52]);
  assert.match(decodificarOfx(cp), /SÉR/);
});

test("recusa arquivo que não é OFX", () => {
  assert.throws(() => lerOfx("data;valor\n"), /OFX/);
});

test("valor com milhar e vírgula decimal", () => {
  const xml = `<OFX><STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>-1.234,56</TRNAMT><FITID>A</FITID></STMTTRN><STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>2,345.67</TRNAMT><FITID>B</FITID></STMTTRN></OFX>`;
  assert.deepEqual(lerOfx(xml).linhas.map((l) => l.valor_cents), [-123456, 234567]);
});
