import { test } from "node:test";
import assert from "node:assert/strict";
import { faltasLcdpr, gerarLcdpr } from "./lcdpr.ts";

const produtor = { cpf: "111.111.111-91", nome: "JOSÉ DA SILVA", forma_apuracao: 1 as const, endereco: "RUA TESTE", numero: "1234",
  complemento: "BLOCO Z | SALA 301", bairro: "BAIRRO LCDPR", uf: "df", cod_mun: "5300108", cep: "71000-000", telefone: "(61) 3333-3333", email: "teste@lcdpr.com.br" };
const imovel = { codigo: 1, cad_itr: "12345678", caepf: "12345678901234", inscricao_estadual: "12345678901234", nome: "Fazenda Tudo Certo",
  endereco: "Rodovia BR 999, Km 3000", bairro: "Distrito do Meio", uf: "DF", cod_mun: "5300108", cep: "71000000", tipo_exploracao: 2, participacao_centesimos: 5000,
  terceiros: [{ tipo: 3, documento: "123.456.789-12", nome: "JOÃO DE SOUSA", participacao_centesimos: 520 }] };

test("arquivo no leiaute 1.3: registros, separador, valores e saldo", () => {
  const arq = gerarLcdpr({
    produtor, imoveis: [imovel], contas: [{ codigo: 1, banco: "999", nome_banco: "Banco LCDPR", agencia: "1234", numero: "0000000123456789" }],
    lancamentos: [
      { data: "2019-01-05", cod_imovel: 1, cod_conta: 1, tipo_doc: 1, hist: "Ração", id_partic: "11222333000181", tipo_lanc: 2, entrada_cents: 0, saida_cents: 150000 },
      { data: "2019-01-02", cod_imovel: 1, cod_conta: 1, num_doc: "3", tipo_doc: 1, hist: "Venda de 100 sacas de milho", id_partic: "12345678912", tipo_lanc: 1, entrada_cents: 1000000, saida_cents: 0 },
      { data: "2019-02-10", cod_imovel: 1, cod_conta: 0, tipo_doc: 3, hist: "Frete", id_partic: "12345678912", tipo_lanc: 2, entrada_cents: 0, saida_cents: 900000 },
    ],
    de: "2019-01-01", ate: "2019-12-31", contador: { nome: "JOSE DE SOUZA", documento: "12345678912", crc: "AL123456O" },
  });
  assert.ok(arq.endsWith("\r\n"));
  const l = arq.trimEnd().split("\r\n");
  assert.equal(l[0], "0000|LCDPR|0013|11111111191|JOSÉ DA SILVA|0|0||01012019|31122019");
  assert.equal(l[1], "0010|1");
  assert.equal(l[2], "0030|RUA TESTE|1234|BLOCO Z SALA 301|BAIRRO LCDPR|DF|5300108|71000000|6133333333|teste@lcdpr.com.br");
  assert.equal(l[3], "0040|001|BR|BRL|12345678|12345678901234|12345678901234|Fazenda Tudo Certo|Rodovia BR 999, Km 3000|||Distrito do Meio|DF|5300108|71000000|2|05000");
  assert.equal(l[4], "0045|001|3|12345678912|JOÃO DE SOUSA|00520");
  assert.equal(l[5], "0050|001|BR|999|Banco LCDPR|1234|0000000123456789");
  assert.equal(l[6], "Q100|02012019|001|001|3|1|Venda de 100 sacas de milho|12345678912|1|1000000|0|1000000|P");
  assert.equal(l[7], "Q100|05012019|001|001||1|Ração|11222333000181|2|0|150000|850000|P");
  assert.equal(l[8], "Q100|10022019|001|000||3|Frete|12345678912|2|0|900000|50000|N");
  assert.equal(l[9], "Q200|012019|1000000|150000|850000|P");
  assert.equal(l[10], "Q200|022019|0|900000|50000|N");
  assert.equal(l[11], "9999|JOSE DE SOUZA|12345678912|AL123456O|||12");
});

test("aponta o que falta no cadastro", () => {
  assert.deepEqual(faltasLcdpr(produtor, imovel), []);
  assert.deepEqual(faltasLcdpr({ ...produtor, cpf: "123" }, { ...imovel, caepf: null }), ["CPF do produtor", "CAEPF (14 dígitos)"]);
});
