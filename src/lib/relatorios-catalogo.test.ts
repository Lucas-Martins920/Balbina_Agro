import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, PERMISSOES_RELATORIOS, RELATORIOS, buscarRelatorios, doMesmoAssunto, linksRapidos, relatoriosVisiveis } from "./relatorios-catalogo.ts";

const todas = (chave: string) => chave.length > 0;

test("todo relatório fica numa área conhecida, dentro de /relatorios, com href único", () => {
  const hrefs = RELATORIOS.map((r) => r.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const r of RELATORIOS) {
    assert.ok(AREAS.some((a) => a.chave === r.area), `${r.nome} sem área`);
    assert.ok(r.href.startsWith("/relatorios"), `${r.nome} fora da central`);
    assert.ok(PERMISSOES_RELATORIOS.includes(r.permissao.split(".")[0]), `${r.permissao} fora da lista de permissões da central`);
  }
});

test("a manutenção saiu do sistema (2026-11-02): nem relatório nem área", () => {
  assert.ok(!RELATORIOS.some((r) => r.href.includes("manutencao") || r.permissao.startsWith("manutencao")));
  assert.ok(!AREAS.some((a) => (a.chave as string) === "manutencao"));
  assert.ok(!PERMISSOES_RELATORIOS.includes("manutencao"));
});

test("os relatórios que moravam nos módulos agora estão na central", () => {
  const hrefs = RELATORIOS.map((r) => r.href);
  for (const h of ["/relatorios/vendas", "/relatorios/indicadores", "/relatorios/dre", "/relatorios/periodo"]) {
    assert.ok(hrefs.includes(h), `faltou ${h}`);
  }
});

test("cada pessoa só vê os relatórios das suas permissões", () => {
  const comercial = relatoriosVisiveis((c) => c === "vendas.ver");
  assert.deepEqual(comercial.map((r) => r.href), ["/relatorios/vendas"]);
  assert.equal(relatoriosVisiveis(() => false).length, 0);
  assert.equal(relatoriosVisiveis(todas).length, RELATORIOS.length);
  // relatório que pede duas permissões (XML de notas no pacote é opcional, mas LCDPR não)
  assert.ok(relatoriosVisiveis((c) => c === "relatorios.ver").some((r) => r.href === "/relatorios/dre"));
});

test("busca ignora acento e maiúscula e procura no nome, na área e na descrição", () => {
  assert.equal(buscarRelatorios("zootecnicos", RELATORIOS)[0]?.href, "/relatorios/indicadores");
  assert.ok(buscarRelatorios("CURVA ABC", RELATORIOS).some((r) => r.href === "/relatorios/vendas"));
  assert.ok(buscarRelatorios("lcdpr", RELATORIOS).some((r) => r.href === "/relatorios/contador"));
  assert.equal(buscarRelatorios("  ", RELATORIOS).length, RELATORIOS.length);
  assert.equal(buscarRelatorios("xyz-não-existe", RELATORIOS).length, 0);
});

test("atalhos de download levam o período padrão de cada relatório", () => {
  const hoje = "2026-11-02";
  const dre = linksRapidos(RELATORIOS.find((r) => r.href === "/relatorios/dre")!, hoje);
  assert.ok(dre.some((l) => l.href === "/relatorios/exportar?relatorio=resultado&regime=caixa&ano=2026&formato=xlsx"));
  const contador = linksRapidos(RELATORIOS.find((r) => r.href === "/relatorios/contador")!, "2026-01-15");
  assert.ok(contador.some((l) => l.href === "/relatorios/contador/baixar?mes=2025-12"), "janeiro pega dezembro do ano anterior");
  for (const r of RELATORIOS) for (const l of linksRapidos(r, hoje)) assert.ok(l.href.startsWith("/relatorios/"), l.href);
});

test("abas de um relatório mostram os outros do mesmo assunto que a pessoa pode ver", () => {
  const financeiro = doMesmoAssunto("/relatorios/aging", (c) => c === "relatorios.ver");
  assert.ok(financeiro.some((r) => r.href === "/relatorios/dre"));
  assert.ok(!financeiro.some((r) => r.href === "/relatorios/vendas"));
  assert.deepEqual(doMesmoAssunto("/relatorios/aging", () => false), []);
});

test("o item Relatórios do menu aparece para quem pode ver qualquer relatório e fica em Gestão", async () => {
  const { GRUPOS, podeVerModulo } = await import("./modulos.ts");
  const gestao = GRUPOS.find((g) => g.nome === "Gestão")!;
  const m = gestao.modulos.find((x) => x.slug === "relatorios")!;
  assert.deepEqual([...(m.qualquer ?? [])].sort(), [...PERMISSOES_RELATORIOS].sort());
  assert.ok(podeVerModulo(m, (c) => c === "vendas.ver"));
  assert.ok(!podeVerModulo(m, (c) => c === "estoque.ver"));
  const slugs = GRUPOS.flatMap((g) => g.modulos).map((x) => x.slug);
  for (const fora of ["indicadores", "manutencao", "manutencao/checklist", "manutencao/relatorio"]) assert.ok(!slugs.includes(fora), `${fora} ainda no menu`);
});
