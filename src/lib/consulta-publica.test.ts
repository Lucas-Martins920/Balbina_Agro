import { test } from "node:test";
import assert from "node:assert/strict";
import { dadosDoCep, dadosDoCnpj } from "./consulta-publica.ts";

test("CNPJ da BrasilAPI vira os campos do cadastro", () => {
  const r = dadosDoCnpj({
    razao_social: "PISCICULTURA  BOA VISTA LTDA", email: "Contato@Piscicultura.com.br", ddd_telefone_1: "9233334444",
    cep: "69000000", descricao_tipo_de_logradouro: "RUA", logradouro: "DAS FLORES", numero: "100", complemento: "",
    bairro: "CENTRO", municipio: "MANAUS", uf: "am",
  });
  assert.deepEqual(r, {
    nome: "PISCICULTURA BOA VISTA LTDA", email: "contato@piscicultura.com.br", telefone: "(92) 3333-4444", cep: "69000-000",
    logradouro: "RUA DAS FLORES", numero: "100", complemento: "", bairro: "CENTRO", cidade: "MANAUS", uf: "AM",
  });
});

test("tipo de logradouro não se repete e campos ausentes ficam vazios", () => {
  const r = dadosDoCnpj({ razao_social: "X", descricao_tipo_de_logradouro: "ESTRADA", logradouro: "ESTRADA AM-010 KM 20", ddd_telefone_1: null });
  assert.equal(r.logradouro, "ESTRADA AM-010 KM 20");
  assert.equal(r.telefone, "");
  assert.equal(r.cep, "");
});

test("CEP da BrasilAPI", () => {
  assert.deepEqual(dadosDoCep({ cep: "69010-060", state: "am", city: "Manaus", neighborhood: "Centro", street: "Rua X" }),
    { cep: "69010-060", logradouro: "Rua X", bairro: "Centro", cidade: "Manaus", uf: "AM" });
});
