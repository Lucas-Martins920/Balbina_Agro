import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { GRUPOS } from "./modulos.ts";
import { CHAVES_VALIDAS, temPermissao, type Acesso } from "./permissoes-regras.ts";
import { buscarDuvidas, chavesDosTutoriais, passosPermitidos, podeVerTutorial, TOUR_GERAL, TUTORIAIS, tutorialDaTela } from "./tutoriais.ts";

const app = new URL("../app/", import.meta.url);

// Tratador pronto (app.permissoes_perfil no banco): apontamento do viveiro.
const tratador: Acesso = { master: false, perfil: "tratador", total: false, chaves: ["apontamentos.editar", "lotes.ver", "piscicultura.ver", "sanidade.ver"] };
const master: Acesso = { master: true, perfil: "sem_restricao", total: true, chaves: [] };
const permitidas = (acesso: Acesso) => new Set(chavesDosTutoriais().filter((c) => (c === "master" ? acesso.master : temPermissao(acesso, c))));

test("acha o tutorial pela rota, com [id] e barra no fim", () => {
  assert.equal(tutorialDaTela("/apontamentos")?.nome, "Apontamento diário");
  assert.equal(tutorialDaTela("/apontamentos/")?.nome, "Apontamento diário");
  assert.equal(tutorialDaTela("/lotes/0b6f3a1c")?.tela, "/lotes/[id]");
  assert.equal(tutorialDaTela("/lotes/especies")?.tela, "/lotes/especies", "rota exata ganha da rota com [id]");
  assert.equal(tutorialDaTela("/nao-existe"), undefined);
});

test("cada tela do tutorial existe no app", () => {
  for (const tu of TUTORIAIS) {
    const pasta = tu.tela === "/campo" ? "campo" : `(app)${tu.tela}`;
    assert.ok(existsSync(new URL(`${pasta}/page.tsx`, app)), `${tu.tela} não tem page.tsx`);
  }
});

test("todo módulo do menu tem tutorial", () => {
  for (const m of GRUPOS.flatMap((g) => g.modulos).filter((m) => m.slug !== "vendedor")) {
    assert.ok(tutorialDaTela(`/${m.slug}`), `falta tutorial para /${m.slug}`);
  }
});

test("as chaves dos tutoriais existem no catálogo de permissões", () => {
  for (const c of chavesDosTutoriais()) {
    const valida = c === "master" || CHAVES_VALIDAS.has(c) || (c.endsWith(".ver") && [...CHAVES_VALIDAS].some((v) => v.startsWith(`${c.split(".")[0]}.`)));
    assert.ok(valida, `chave desconhecida: ${c}`);
  }
});

test("o tratador vê só os tutoriais das telas dele", () => {
  const p = permitidas(tratador);
  const dele = TUTORIAIS.filter((tu) => podeVerTutorial(tu, p)).map((tu) => tu.tela);
  for (const tela of ["/apontamentos", "/lotes", "/campo", "/painel"]) assert.ok(dele.includes(tela), tela);
  for (const tela of ["/contas-a-pagar", "/configuracoes/usuarios", "/custo-do-kg", "/primeiros-passos"]) assert.ok(!dele.includes(tela), tela);
});

test("passo com permissão some para quem não tem a chave", () => {
  const lotes = tutorialDaTela("/lotes")!;
  const titulos = (a: Acesso) => passosPermitidos(lotes, permitidas(a)).map((p) => p.titulo);
  assert.ok(!titulos(tratador).includes("Povoar um lote"));
  assert.ok(titulos(master).includes("Povoar um lote"));
  assert.equal(passosPermitidos(lotes, permitidas(master)).length, lotes.passos.length);
});

test("o master vê todos os tutoriais", () => {
  const p = permitidas(master);
  assert.ok([TOUR_GERAL, ...TUTORIAIS].every((tu) => podeVerTutorial(tu, p)));
});

test("busca de dúvidas sem acento e só nas telas permitidas", () => {
  assert.ok(buscarDuvidas("carencia", permitidas(master)).some((d) => d.tela === "/sanidade"));
  assert.ok(buscarDuvidas("competência", permitidas(master)).some((d) => d.tela === "/contas-a-pagar"));
  assert.equal(buscarDuvidas("competencia", permitidas(tratador)).length, 0, "tratador não vê dúvidas do financeiro");
  assert.ok(buscarDuvidas("tutorial", permitidas(tratador)).length > 0, "as dúvidas gerais valem para todos");
  assert.deepEqual(buscarDuvidas(" ", permitidas(master)), []);
});

test("as marcas data-tour usadas existem no código", () => {
  const fontes = ["../components/ui.tsx", "../components/menu-lateral.tsx", "../components/barra-lateral.tsx", "../components/cadastro.tsx", "../components/tutorial.tsx",
    "../components/campo/app-campo.tsx", "../components/campo/chat-campo.tsx", "../app/(app)/layout.tsx", "../app/(app)/_titulos/pagina.tsx"]
    .map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
  const marcas = new Set([TOUR_GERAL, ...TUTORIAIS].flatMap((tu) => tu.passos.flatMap((p) => [p.alvo ?? []].flat()))
    .flatMap((s) => [...s.matchAll(/data-tour="([^"]+)"/g)].map((m) => m[1])));
  for (const m of marcas) assert.ok(fontes.includes(`data-tour="${m}"`), `nenhum componente tem data-tour="${m}"`);
});
