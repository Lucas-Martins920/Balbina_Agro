import { test } from "node:test";
import assert from "node:assert/strict";
import { GRUPOS } from "./modulos.ts";
import { buscarTelas, grupoAtivo, montarMenu } from "./menu.ts";

const todos = GRUPOS.flatMap((g) => g.modulos).map((m) => m.slug);

test("o menu completo separa Principal, Operação e Administração, sem perder nenhum módulo", () => {
  const secoes = montarMenu(todos, { master: true });
  assert.deepEqual(secoes.map((s) => s.nome), ["Principal", "Operação", "Administração"]);
  const hrefs = secoes.flatMap((s) => s.itens.flatMap((i) => (i.tipo === "link" ? [i.href] : i.filhos.map((f) => f.href))));
  for (const slug of todos) assert.ok(hrefs.includes(`/${slug}`), `faltou /${slug}`);
  assert.ok(hrefs.includes("/painel") && hrefs.includes("/pendencias"));
  assert.ok(hrefs.includes("/configuracoes/usuarios"), "master vê Usuários e cargos");
});

test("grupo com um módulo só vira link direto, e grupo sem módulo some", () => {
  const secoes = montarMenu(["apontamentos", "contas-a-pagar", "contas"], { master: false });
  const itens = secoes.flatMap((s) => s.itens);
  const producao = itens.find((i) => i.nome === "Apontamento diário");
  assert.equal(producao?.tipo, "link");
  const financeiro = itens.find((i) => i.nome === "Financeiro");
  assert.equal(financeiro?.tipo, "grupo");
  assert.ok(!itens.some((i) => i.nome === "RH" || i.nome === "Recursos humanos"));
  assert.ok(!itens.some((i) => i.tipo === "link" && i.href === "/configuracoes/usuarios"), "só master vê usuários");
});

test("versão simples do celular mostra só a operação do dia e esconde Pendências", () => {
  const secoes = montarMenu(todos, { master: true, simples: true });
  const hrefs = secoes.flatMap((s) => s.itens.flatMap((i) => (i.tipo === "link" ? [i.href] : i.filhos.map((f) => f.href))));
  assert.ok(hrefs.includes("/apontamentos"));
  assert.ok(!hrefs.includes("/categorias"));
  assert.ok(!hrefs.includes("/pendencias"));
  assert.ok(!hrefs.includes("/configuracoes/usuarios"));
});

test("busca de telas ignora acento e maiúscula e só acha o que a pessoa pode ver", () => {
  assert.equal(buscarTelas("racao", todos)[0]?.href, "/racao");
  assert.ok(buscarTelas("CONCILIAÇÃO", todos).some((t) => t.href === "/conciliacao"));
  assert.ok(buscarTelas("boleto", todos).some((t) => t.href === "/cobrancas"), "busca também na descrição");
  assert.equal(buscarTelas("conciliacao", ["apontamentos"]).length, 0);
  assert.deepEqual(buscarTelas("  ", todos), []);
  assert.ok(buscarTelas("painel", todos).some((t) => t.href === "/painel"));
});

test("grupo ativo acompanha as subpáginas", () => {
  const secoes = montarMenu(todos, { master: true });
  assert.equal(grupoAtivo(secoes, "/contas-a-pagar/novo"), "Financeiro");
  assert.equal(grupoAtivo(secoes, "/configuracoes/usuarios"), "Configurações");
  assert.equal(grupoAtivo(secoes, "/painel"), null);
});

test("o RH saiu do sistema: nem o master vê RH, funcionários ou cartão de ponto no menu", () => {
  const secoes = montarMenu(todos, { master: true });
  const itens = secoes.flatMap((s) => s.itens);
  const hrefs = itens.flatMap((i) => (i.tipo === "link" ? [i.href] : i.filhos.map((f) => f.href)));
  assert.ok(!itens.some((i) => i.nome === "RH"));
  assert.ok(!hrefs.some((h) => h === "/rh" || h.startsWith("/rh/")));
  assert.ok(!buscarTelas("ponto", todos, true).some((t) => t.href.startsWith("/rh")));
});
