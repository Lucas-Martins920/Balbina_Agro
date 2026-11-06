import { expect, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// App do vendedor (/vendedor): pedido em campo com a tabela do cliente. Sem sinal o pedido fica na fila
// do celular e vai sozinho quando a conexão volta. Este arquivo roda depois de producao-vendas e tela-celular
// (ordem alfabética, 1 worker), então as contagens de estoque daqueles fluxos não mudam aqui.
test.describe("app do vendedor", () => {
  test("pedido com sinal vai ao escritório e aparece em Meus pedidos", async ({ page }) => {
    await page.goto("/vendedor");
    await expect(page.getByRole("heading", { name: "Vendedor" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Buscar cliente" }).fill("Mercado E2E");
    await page.getByRole("button", { name: /^Mercado E2E/ }).first().click();
    await page.getByRole("button", { name: "Mais Peixe médio (kg)", exact: true }).click();
    await page.getByRole("button", { name: "Mais Peixe médio (kg)", exact: true }).click();
    await page.getByRole("button", { name: "Enviar pedido", exact: true }).click();
    await expect(page.getByText("1 pedido(s) enviado(s) ao escritório.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/aguardando envio/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Meus pedidos" })).toBeVisible();
    await expect(page.getByText(/Pedido \d+ · Mercado E2E/).first()).toBeVisible();
  });

  test("sem sinal guarda o pedido e envia quando a conexão volta", async ({ page, context }) => {
    await page.goto("/vendedor");
    await expect(page.getByRole("heading", { name: "Vendedor" })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("searchbox", { name: "Buscar cliente" }).fill("Mercado E2E");
    await page.getByRole("button", { name: /^Mercado E2E/ }).first().click();
    await page.getByRole("button", { name: "Mais Peixe médio (kg)", exact: true }).click();
    await page.getByRole("button", { name: "Guardar pedido", exact: true }).click();
    await expect(page.getByText(/1 aguardando envio/)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/aguardando envio/)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("1 pedido(s) enviado(s) ao escritório.")).toBeVisible();
  });
});
