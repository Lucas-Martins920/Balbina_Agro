import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO, CHAVES_VALIDAS, chavesDoCargo, GRUPOS_CATALOGO, planoInclui, podeDispensar2fa, temPermissao, type Acesso } from "./permissoes-regras.ts";

const acesso = (chaves: string[], extra: Partial<Acesso> = {}): Acesso => ({ master: false, perfil: "personalizado", total: false, chaves, ...extra });

test("master e acesso total podem tudo", () => {
  assert.equal(temPermissao(acesso([], { master: true }), "vendas.cancelar"), true);
  assert.equal(temPermissao(acesso([], { total: true }), "financeiro.fechar"), true);
});

test("chave do módulo dá direito a ver o módulo", () => {
  const a = acesso(["vendas.lancar"]);
  assert.equal(temPermissao(a, "vendas.ver"), true);
  assert.equal(temPermissao(a, "vendas.cancelar"), false);
  assert.equal(temPermissao(a, "estoque.ver"), false);
});

test("*.ver vê tudo e não edita nada", () => {
  const a = acesso(["*.ver"]);
  assert.equal(temPermissao(a, "lotes.ver"), true);
  assert.equal(temPermissao(a, "lotes.editar"), false);
});

test("catálogo cobre as chaves usadas pelas policies do banco", () => {
  for (const c of ["vendas.lancar", "pdv.operar", "cobrancas.emitir", "financeiro.fechar", "custo-do-kg.editar", "relatorios.editar", "conciliacao.editar"]) {
    assert.ok(CHAVES_VALIDAS.has(c), c);
  }
  for (const m of CATALOGO) for (const a of m.acoes) assert.match(a.chave, /^[a-z-]+\.[a-z]+$/);
});

test("o plano da empresa limita até o master", () => {
  const basic = { modulos: ["piscicultura", "lotes", "estoque", "configuracoes"] };
  assert.equal(temPermissao(acesso([], { master: true, ...basic }), "lotes.editar"), true);
  assert.equal(temPermissao(acesso([], { master: true, ...basic }), "vendas.lancar"), false);
  assert.equal(temPermissao(acesso(["*.ver"], basic), "relatorios.ver"), false);
  assert.equal(temPermissao(acesso([], { total: true, modulos: null }), "conciliacao.editar"), true);
});

test("planoInclui diz se o módulo está no plano", () => {
  assert.equal(planoInclui(acesso([], { modulos: ["notas"] }), "notas"), true);
  assert.equal(planoInclui(acesso([], { modulos: ["vendas"] }), "notas"), false);
  assert.equal(planoInclui(acesso([]), "notas"), true);
});

test("cargo da empresa soma o cargo pronto de partida e troca *.ver pelo ver de cada módulo", () => {
  const chaves = chavesDoCargo(["sanidade.editar", "inventada.editar"], ["*.ver", "lotes.editar"]);
  assert.ok(chaves.includes("sanidade.editar") && chaves.includes("lotes.editar") && chaves.includes("vendas.ver"));
  assert.ok(!chaves.includes("*.ver") && !chaves.includes("inventada.editar"));
  assert.equal(new Set(chaves).size, chaves.length);
});

test("sem 2º fator só para cargo operacional (mesma regra de app.pode_dispensar_2fa)", () => {
  assert.equal(podeDispensar2fa({ master: false, perfil: "tratador", chaves: ["apontamento.editar", "*.ver", "contas-a-pagar.ver"] }), true);
  assert.equal(podeDispensar2fa({ master: true, perfil: "tratador", chaves: [] }), false);
  for (const p of ["sem_restricao", "financeiro", "administrativo", "cadastros"]) assert.equal(podeDispensar2fa({ master: false, perfil: p, chaves: [] }), false, p);
  assert.equal(podeDispensar2fa({ master: false, perfil: "personalizado", chaves: ["lotes.editar", "cobrancas.emitir"] }), false);
  assert.equal(podeDispensar2fa({ master: false, perfil: "personalizado", chaves: ["configuracoes.editar"] }), false);
});

test("grupos do catálogo na ordem do menu, sem repetir", () => {
  assert.equal(new Set(GRUPOS_CATALOGO).size, GRUPOS_CATALOGO.length);
  for (const m of CATALOGO) assert.ok(GRUPOS_CATALOGO.includes(m.grupo), m.grupo);
});
