import { test } from "node:test";
import assert from "node:assert/strict";
import { lerXmlNfe } from "./nfe-xml.ts";

const chave = "13261011222333000181550010000012341555555555";
const xml = `<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${chave}" versao="4.00">
<ide><cUF>13</cUF><tpNF>1</tpNF><dhEmi>2026-10-30T10:00:00-04:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>Cerealista Norte Ltda</xNome><enderEmit><xNome>ignorar</xNome></enderEmit></emit>
<dest><CNPJ>99888777000166</CNPJ><xNome>Piscicultura</xNome></dest>
<det nItem="1"><prod><vProd>100.00</vProd></prod></det>
<total><ICMSTot><vProd>24560.00</vProd><vNF>24560.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;

test("lê chave, emitente, valor e emissão do XML", () => {
  assert.deepEqual(lerXmlNfe(xml), {
    chave_nfe: chave, nome_emitente: "Cerealista Norte Ltda", documento_emitente: "11222333000181", valor_total: "24560.00",
    data_emissao: "2026-10-30T10:00:00-04:00", tipo_nfe: "1", situacao: "autorizada",
  });
});

test("XML que não é NF-e", () => {
  assert.equal(lerXmlNfe("<cte><infCte Id='CTe1'/></cte>"), null);
});
