import { randomBytes } from "node:crypto";
import { abrirLancamento, expect, lerDados, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Roda depois de producao-vendas (ordem alfabética): usa o peixe médio que sobrou na piscicultura (27,5 kg).
// Cadastra um ponto de venda, manda peixe com frete e vende por kg no PDV do ponto.
test.describe.serial("ponto de venda", () => {
  const nome = `Loja E2E ${randomBytes(2).toString("hex")}`;

  test("cadastra o ponto de venda", async ({ page }) => {
    await page.goto("/pontos-de-venda");
    await expect(page.getByRole("heading", { name: "Pontos de venda" })).toBeVisible();
    await abrirLancamento(page, "Novo ponto");
    await page.locator("#nome_novo").fill(nome);
    await page.locator("#municipio_novo").fill("Manaus");
    await page.locator("#uf_novo").fill("am");
    await page.getByRole("button", { name: "Cadastrar ponto" }).click();
    await expect(page.getByText(`Ponto ${nome} cadastrado`)).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(nome) })).toBeVisible();
  });

  test("transfere 8 kg de peixe médio da piscicultura com frete", async ({ page }) => {
    const { classeMedioId } = lerDados();
    await page.goto("/pontos-de-venda/transferencias");
    await abrirLancamento(page, "Nova transferência");
    await page.locator("#destino_id").selectOption({ label: nome });
    await page.locator(`#classe_${classeMedioId}`).fill("8");
    await page.locator("#frete").fill("12,00");
    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    await expect(page.getByText("8 kg de peixe transferidos.")).toBeVisible();
    await page.reload();
    await expect(page.getByText(new RegExp(`Piscicultura → ${nome}`)).first()).toBeVisible();
  });

  test("vende no PDV do ponto e baixa o estoque do ponto", async ({ page }) => {
    await page.goto("/vendas/pdv");
    await page.getByRole("combobox", { name: "Ponto de venda" }).selectOption({ label: nome });
    await page.getByRole("button", { name: "Trocar ponto" }).click();
    await expect(page.getByRole("heading", { name: `PDV · ${nome}` })).toBeVisible();
    const medio = page.getByRole("button", { name: /^Peixe médio \(kg\)/ });
    await expect(medio).toContainText("8 kg");
    await medio.click();
    await page.getByRole("button", { name: "Receber (F2)" }).click();
    await page.getByRole("button", { name: "Exato" }).click();
    await page.getByRole("button", { name: "Finalizar venda (F2)" }).click();
    await expect(page.getByText(/Venda nº \d+ concluída/)).toBeVisible();

    await page.goto("/vendas/pdv");
    await expect(page.getByRole("button", { name: /^Peixe médio \(kg\)/ })).toContainText("7 kg");
    // volta o caixa para a piscicultura
    await page.getByRole("combobox", { name: "Ponto de venda" }).selectOption({ label: "Piscicultura" });
    await page.getByRole("button", { name: "Trocar ponto" }).click();
    await expect(page.getByRole("heading", { name: "PDV · Piscicultura" })).toBeVisible();
  });
});
