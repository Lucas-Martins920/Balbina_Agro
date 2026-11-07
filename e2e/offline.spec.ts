import type { Page } from "@playwright/test";
import { comServiceWorker, expect, filaGuardada, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Offline no sistema inteiro (public/sw.js, src/components/offline.tsx, src/lib/db/indexeddb.ts): o escritório abre
// sem internet as telas já guardadas, a tela nunca aberta mostra a lista do que está guardado, a fila do campo fica
// no IndexedDB (não no localStorage, em tela-celular.spec.ts) e o chat responde sem internet pela base do celular.
// Aqui nada é gravado no servidor: este arquivo roda antes de rotina.spec.ts, que conta com o viveiro sem biometria.

async function telaGuardada(page: Page, caminho: string) {
  return page.evaluate(async (c) => {
    const cache = await caches.open("balbina-telas-v1");
    return Boolean(await cache.match(c));
  }, caminho);
}

test.describe("sistema sem internet", () => {
  test("o painel aberto com internet abre de novo sem internet, com o aviso", async ({ page, context }) => {
    await comServiceWorker(page, "/painel");
    await page.reload(); // agora controlada: a resposta passa pelo service worker e fica guardada
    await expect.poll(() => telaGuardada(page, "/painel"), { timeout: 15_000 }).toBe(true);

    await context.setOffline(true);
    await page.goto("/painel");
    await expect(page.getByRole("status").filter({ hasText: "Sem internet. Você está vendo a última versão guardada" })).toBeVisible();
    await expect(page.locator("main")).not.toBeEmpty();

    // a internet volta: o aviso some sozinho
    await context.setOffline(false);
    await expect(page.getByText("Sem internet. Você está vendo a última versão guardada")).toHaveCount(0, { timeout: 15_000 });
  });

  test("as telas do menu ficam guardadas de antemão e abrem sem internet", async ({ page, context }) => {
    await comServiceWorker(page, "/painel");
    // o app pede para guardar o menu uns segundos depois de abrir; força de novo sem esperar as 12 h
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      r.active?.postMessage({ tipo: "aquecer", urls: ["/lotes", "/fluxo-de-caixa"] });
    });
    await expect.poll(() => telaGuardada(page, "/lotes"), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => telaGuardada(page, "/fluxo-de-caixa"), { timeout: 30_000 }).toBe(true);

    await context.setOffline(true);
    await page.goto("/lotes");
    await expect(page.getByText("Sem internet. Você está vendo a última versão guardada")).toBeVisible();
    await expect(page.getByText("E2E-1").first()).toBeVisible();
    await context.setOffline(false);
  });

  test("tela nunca aberta, sem internet, mostra as telas guardadas", async ({ page, context }) => {
    await comServiceWorker(page, "/painel");
    await context.setOffline(true);
    await page.goto("/relatorios/contador");
    await expect(page.getByRole("heading", { name: "Sem internet" })).toBeVisible();
    await expect(page.getByText("Esta tela ainda não foi aberta neste aparelho")).toBeVisible();
    await expect(page.getByRole("link", { name: "/campo" })).toBeVisible();
    await context.setOffline(false);
  });

  test("ao sair da conta, as telas guardadas são apagadas", async ({ page }) => {
    await comServiceWorker(page, "/painel");
    await page.reload();
    await expect.poll(() => telaGuardada(page, "/painel"), { timeout: 15_000 }).toBe(true);
    // a tela de login manda "sair" ao service worker (sem sair de verdade, para não derrubar a sessão dos outros testes)
    await page.evaluate(() => navigator.serviceWorker.controller?.postMessage({ tipo: "sair" }));
    await expect.poll(() => telaGuardada(page, "/painel")).toBe(false);
  });
});

test.describe("app de campo sem internet", () => {
  test("o chat responde sem internet pela base guardada no celular", async ({ page, context }) => {
    await comServiceWorker(page, "/campo");
    await page.getByRole("navigation", { name: "Módulos do app de campo" }).getByRole("button", { name: "Chat", exact: true }).click();
    await context.setOffline(true);
    const chat = page.getByRole("region", { name: "Chat" });
    await chat.getByRole("textbox", { name: "Mensagem" }).fill("qual o oxigênio mínimo para o tambaqui?");
    await chat.getByRole("button", { name: "Enviar" }).click();
    await expect(chat.getByText(/oxigênio/i).nth(1)).toBeVisible();
    await expect(chat.getByText(/base guardada no celular|Sem sinal: respondi pela base/).first()).toBeVisible();
    // a conversa também fica no IndexedDB
    expect(await filaGuardada(page, "balbina:campo:chat:")).toContain("oxigênio");
    await context.setOffline(false);
  });
});
