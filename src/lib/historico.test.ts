import { test } from "node:test";
import assert from "node:assert/strict";
import { detalhesAlteracao, formatarDataHora, formatarValorCampo, inicioDoDia, nomeCampo, nomeTabela } from "./historico.ts";

test("nomeTabela traduz a tabela e não quebra com tabela nova", () => {
  assert.equal(nomeTabela("agendamentos"), "Contas a pagar e receber");
  assert.equal(nomeTabela("pedidos_venda"), "Vendas");
  assert.equal(nomeTabela("tabela_nova"), "tabela nova");
});

test("nomeCampo tira os sufixos técnicos", () => {
  assert.equal(nomeCampo("valor_cents"), "valor");
  assert.equal(nomeCampo("contato_id"), "contato");
  assert.equal(nomeCampo("data_povoamento"), "data povoamento");
  assert.equal(nomeCampo("is_admin"), "master");
});

test("formatarValorCampo mostra dinheiro, data, sim/não e vazio", () => {
  assert.equal(formatarValorCampo("valor_cents", 123456), "R$ 1.234,56");
  assert.equal(formatarValorCampo("vencimento", "2026-11-10"), "10/11/2026");
  assert.equal(formatarValorCampo("ativo", false), "Não");
  assert.equal(formatarValorCampo("telefone", null), "vazio");
  assert.equal(formatarValorCampo("tipos", ["cliente", "fornecedor"]), "cliente, fornecedor");
  assert.equal(formatarValorCampo("contato_id", "99b10000-0000-0000-0000-0000000000c1"), "99b10000…");
  assert.equal(formatarValorCampo("endereco", { cidade: "Manaus" }), '{"cidade":"Manaus"}');
});

test("detalhesAlteracao: edição lista antes e depois de cada campo", () => {
  const linhas = detalhesAlteracao({ acao: "update", campos: ["telefone"], antes: { telefone: "1" }, depois: { telefone: "2" } });
  assert.deepEqual(linhas, [{ campo: "telefone", antes: "1", depois: "2" }]);
});

test("detalhesAlteracao: inclusão e exclusão mostram a linha sem campos técnicos nem vazios", () => {
  const linha = { id: "x", empresa_id: "y", nome: "Mercado", telefone: null, created_at: "2026-10-28T10:00:00Z", updated_at: "z" };
  assert.deepEqual(detalhesAlteracao({ acao: "insert", campos: null, antes: null, depois: linha }), [{ campo: "nome", antes: null, depois: "Mercado" }]);
  assert.deepEqual(detalhesAlteracao({ acao: "delete", campos: null, antes: linha, depois: null }), [{ campo: "nome", antes: "Mercado", depois: null }]);
});

test("formatarDataHora usa o fuso da piscicultura", () => {
  assert.equal(formatarDataHora("2026-10-28T19:55:00Z", "America/Manaus"), "28/10/2026 15:55");
  assert.equal(formatarDataHora("2026-10-28T19:55:00Z", "America/Sao_Paulo"), "28/10/2026 16:55");
});

test("inicioDoDia converte a data da piscicultura para o instante certo", () => {
  assert.equal(inicioDoDia("2026-10-28", "America/Manaus"), "2026-10-28T00:00:00-04:00");
  assert.equal(inicioDoDia("2026-10-28", "America/Sao_Paulo"), "2026-10-28T00:00:00-03:00");
});
