import type { BrowserContext, Page } from "@playwright/test";
import { comServiceWorker, expect, filaGuardada, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// App de campo (/campo): o trato do turno pela aba Ração. Sem sinal o lançamento fica guardado no aparelho e
// sai sozinho quando a conexão volta. Este arquivo roda depois de producao-vendas (ordem alfabética, 1 worker).

async function abrirCampo(page: Page) {
  await page.goto("/campo");
  const abas = page.getByRole("navigation", { name: "Módulos do app de campo" });
  await expect(abas).toBeVisible();
  await abas.getByRole("button", { name: "Ração", exact: true }).click();
}

// Abre a folha de ração do viveiro V1 e lança a tarde: kg de ração e peixes mortos.
async function lancarTarde(page: Page, kg: string, mortes: number) {
  const aba = page.getByRole("region", { name: "Ração" });
  await aba.getByRole("listitem").filter({ hasText: "V1" }).getByRole("button", { name: /^(Lançar|Outro)$/ }).click();
  const folha = page.getByRole("dialog");
  await folha.getByText("Tarde", { exact: true }).click();
  await folha.getByRole("group", { name: "Como contar a ração" }).getByRole("button", { name: "Quilos", exact: true }).click();
  await folha.getByLabel(/^Ração dada/).fill(kg);
  for (let i = 0; i < mortes; i++) await folha.getByRole("button", { name: "Mais peixes mortos" }).click();
  await folha.getByRole("button", { name: /^Salvar/ }).click();
}

// Espera o envio de verdade ("Tudo enviado" na aba Envios), não só a fila vazia. Se o servidor já tem lançamento
// da tarde neste viveiro (de outro teste), o envio para e espera a decisão: "Somar mesmo assim".
async function esperarEnvio(page: Page) {
  await page.getByRole("navigation", { name: "Módulos do app de campo" }).getByRole("button", { name: /^Envios/ }).click();
  const envios = page.getByRole("region", { name: "Envios" });
  const somar = envios.getByRole("button", { name: "Somar mesmo assim" });
  const tudo = envios.getByText("Tudo enviado", { exact: true });
  await expect(somar.or(tudo).first()).toBeVisible({ timeout: 30_000 });
  if (await somar.isVisible()) await somar.click();
  await expect(tudo).toBeVisible({ timeout: 30_000 });
  await expect(envios.getByText(/^Ração .*V1/).first()).toBeVisible();
}

async function semSinal(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect(page.getByRole("button", { name: /^Sem sinal\./ })).toBeVisible();
}

test.describe("app de campo no celular", () => {
  test("lançamento com sinal sai da fila na hora", async ({ page }) => {
    await abrirCampo(page);
    await lancarTarde(page, "4,5", 1);
    await esperarEnvio(page);
  });

  test("sem sinal guarda no celular e envia quando a conexão volta", async ({ page, context }) => {
    await abrirCampo(page);
    await semSinal(context, page);
    await lancarTarde(page, "3", 0);
    await expect(page.getByText("Salvo no celular. Vai sozinho quando o sinal voltar.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sem sinal. 1 na fila de envio" })).toBeVisible();

    await context.setOffline(false);
    await esperarEnvio(page);
  });

  // O Playwright não recarrega a página sem rede: aqui a fila é conferida no armazenamento do aparelho (IndexedDB)
  // e, com a conexão de volta, a página recarregada tem que enviar o que ficou guardado.
  test("ao sair da tela, a fila continua guardada no aparelho", async ({ page, context }) => {
    await abrirCampo(page);
    await semSinal(context, page);
    await lancarTarde(page, "2", 0);
    await expect(page.getByRole("button", { name: "Sem sinal. 1 na fila de envio" })).toBeVisible();
    expect(await filaGuardada(page, "balbina:campo:envios:")).toContain("racao_kg");

    await context.setOffline(false);
    await page.reload();
    await esperarEnvio(page);
  });
});

// Fila no IndexedDB (src/lib/db/indexeddb.ts) e envio automático a cada 5 s (src/lib/sync/worker.ts), sem recarregar
test.describe("app de campo sem internet", () => {
  test("a fila mora no IndexedDB e sai sozinha quando a internet volta, sem recarregar", async ({ page, context }) => {
    await comServiceWorker(page, "/campo");
    await page.getByRole("navigation", { name: "Módulos do app de campo" }).getByRole("button", { name: "Biometria", exact: true }).click();
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: /^Sem sinal\./ })).toBeVisible();

    const aba = page.getByRole("region", { name: "Biometria" });
    await aba.getByRole("group", { name: "Viveiro" }).getByRole("button", { name: /V1/ }).click();
    await aba.getByRole("button", { name: /Registrar biometria/ }).click();
    const folha = page.getByRole("dialog");
    // biometria em grupos (o padrão): um puçá com 20 peixes e 1 kg
    await folha.getByRole("textbox", { name: "Peixes", exact: true }).first().fill("20");
    await folha.getByRole("textbox", { name: "Peso kg", exact: true }).first().fill("1");
    await folha.getByRole("button", { name: "Concluir biometria" }).click();
    // peso fora do esperado para o lote: a folha pede para conferir antes de concluir
    const conferir = folha.getByRole("button", { name: "Está certo, concluir" });
    if (await conferir.isVisible().catch(() => false)) await conferir.click();
    await expect(page.getByRole("button", { name: "Sem sinal. 1 na fila de envio" })).toBeVisible();

    expect(await filaGuardada(page, "balbina:campo:envios:")).toContain("\"tipo\":\"biometria\"");
    const noLocalStorage = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("balbina:campo:envios:")));
    expect(noLocalStorage).toEqual([]);

    await context.setOffline(false);
    await page.getByRole("navigation", { name: "Módulos do app de campo" }).getByRole("button", { name: /^Envios/ }).click();
    await expect(page.getByRole("region", { name: "Envios" }).getByText("Tudo enviado", { exact: true })).toBeVisible({ timeout: 30_000 });
  });

});

test.describe("app de campo na tela do celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("as cinco abas do rodapé respondem e a ajuda abre pelo topo", async ({ page }) => {
    await page.goto("/campo");
    const abas = page.getByRole("navigation", { name: "Módulos do app de campo" });
    for (const nome of ["Viveiros", "Ração", "Biometria", "Envios", "Chat"]) {
      // nada pode ficar por cima das abas (o botão de ajuda tapava a aba Envios)
      await abas.getByRole("button", { name: nome, exact: true }).click({ timeout: 5_000 });
      await expect(page.getByRole("region", { name: nome })).toBeVisible();
    }
    await page.getByRole("banner").getByRole("button", { name: "Ajuda e tutoriais" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
