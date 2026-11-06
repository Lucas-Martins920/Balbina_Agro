import type { Page } from "@playwright/test";
import { expect, SESSAO_DONO, test, abrirLancamento } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Venda a prazo pelo escritório: faturar, desfazer faturamento, entregar, desfazer entrega e receber.
// Roda depois de vendas-pontos (ordem alfabética): a piscicultura começa com 19,5 kg de peixe médio.
async function medioNaPiscicultura(page: Page) {
  await page.goto("/vendas/pdv");
  return page.getByRole("button", { name: /^Peixe médio \(kg\)/ });
}

async function confirmar(page: Page, botao: string) {
  await page.getByRole("button", { name: botao, exact: true }).click();
  await page.getByRole("button", { name: botao, exact: true }).click(); // o segundo é o "confirmar" da caixa
}

test.describe.serial("venda a prazo", () => {
  let pedido = "";

  test("pedido de 2 kg em 14/28 dias, faturado na hora", async ({ page }) => {
    await page.goto("/vendas/nova");
    await page.getByRole("searchbox", { name: "Buscar cliente" }).fill("Mercado E2E");
    await page.getByRole("button", { name: "Mercado E2E", exact: true }).click();
    const mais = page.getByRole("button", { name: "Mais Peixe médio (kg)", exact: true }).first();
    await mais.click();
    await mais.click();
    await page.getByRole("group", { name: "Condição de pagamento" }).getByRole("button", { name: "14/28 dias" }).click();
    const ponto = page.getByRole("combobox", { name: "Ponto de venda" });
    if (await ponto.isVisible()) await ponto.selectOption({ label: "Piscicultura" });
    await page.getByRole("button", { name: "Confirmar venda" }).click();

    await expect(page).toHaveURL(/\/vendas\/[0-9a-f-]{36}/);
    pedido = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Faturado");
    await expect(page.getByText("falta R$ 24,00")).toBeVisible();
    await expect(page.getByRole("cell", { name: "1/2", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "2/2", exact: true })).toBeVisible();
    await expect(await medioNaPiscicultura(page)).toContainText("17,5 kg");
  });

  test("desfazer faturamento devolve o peixe e cancela as parcelas", async ({ page }) => {
    await page.goto(pedido);
    await confirmar(page, "Desfazer faturamento");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Aberto");
    await expect(page.getByRole("cell", { name: "Cancelada", exact: true })).toHaveCount(2);
    await expect(page.getByText("· parcelas canceladas")).toBeVisible();
    await expect(await medioNaPiscicultura(page)).toContainText("19,5 kg");
  });

  test("fatura de novo, entrega e desfaz a entrega", async ({ page }) => {
    await page.goto(pedido);
    await page.getByRole("button", { name: "Faturar agora" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Faturado");
    await page.getByRole("button", { name: "Marcar como entregue" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Entregue");
    await confirmar(page, "Desfazer entrega");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Faturado");
    await expect(await medioNaPiscicultura(page)).toContainText("17,5 kg");
  });

  test("recebe e o faturamento não pode mais ser desfeito", async ({ page }) => {
    await page.goto(pedido);
    await abrirLancamento(page, "Recebi o pagamento");
    await page.getByRole("combobox", { name: "Conta" }).selectOption({ label: "Banco E2E" });
    await page.getByRole("button", { name: "Registrar R$ 24,00" }).click();
    await expect(page.getByText("· quitado")).toBeVisible();
    await confirmar(page, "Desfazer faturamento");
    await expect(page.getByText(/já tem recebimento/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Faturado");
  });
});
