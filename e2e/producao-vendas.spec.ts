import { abrirLancamento, expect, lerDados, preencherChecklist, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Do viveiro ao caixa: o trato do dia, a despesca que põe o peixe no estoque e a venda por kg no PDV.
test.describe.serial("do viveiro até a venda", () => {
  test("lançamento do viveiro com ração, mortes e causa", async ({ page }) => {
    await page.goto("/apontamentos");
    await expect(page.getByRole("heading", { name: "Apontamento diário" })).toBeVisible();
    await abrirLancamento(page, "Novo apontamento");
    await expect(page.locator("#viveiro_id")).toContainText("E2E-1");
    await page.locator("#turno").selectOption("manha");
    await page.locator("#mortes").fill("3");
    await page.locator("#descartes").fill("0");
    await page.locator("#racao_kg").fill("12,5");
    await page.getByText("Causa das mortes e descartes (opcional)").click();
    await page.locator("#causa_oxigenio").fill("2");
    await preencherChecklist(page);
    await page.getByRole("button", { name: "Salvar apontamento" }).click();
    await expect(page.getByText(/salvo: 12,5 kg de ração/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "Manhã" }).first()).toContainText("12,5");
  });

  test("despesca parcial põe os kg no estoque por classe", async ({ page }) => {
    const { classeMedioId } = lerDados();
    await page.goto("/despescas");
    await abrirLancamento(page, "Lançar despesca");
    await page.locator("#d_viveiro").selectOption({ index: 1 });
    await page.locator("#d_tipo").selectOption("parcial");
    await page.locator("#d_kg").fill("50");
    await page.locator("#d_peixes").fill("40");
    // 30 kg separados como médio; os outros 20 kg entram como peixe inteiro
    await page.locator(`#d_classe_${classeMedioId}`).fill("30");
    await page.getByRole("dialog").getByRole("button", { name: "Lançar despesca" }).click();
    await expect(page.getByText(/Despesca parcial de 50 kg \(40 peixes\) lançada/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: "E2E-1" }).first()).toContainText("Médio 30 kg");
  });

  test("venda de balcão por kg no PDV com troco em dinheiro", async ({ page }) => {
    await page.goto("/vendas/pdv");
    const medio = page.getByRole("button", { name: /^Peixe médio \(kg\)/ });
    await expect(medio).toContainText("30 kg");
    await medio.click();
    // o peso da balança: 2,5 kg a R$ 12,00
    await page.getByRole("textbox", { name: "Quantidade de Peixe médio (kg)" }).fill("2,5");
    // o carrinho já tira do estoque: os 2,5 kg saem na hora, antes de receber
    await expect(medio).toContainText("27,5 kg");
    await page.getByRole("button", { name: "Receber (F2)" }).click();
    await page.getByRole("textbox", { name: "Outro valor" }).fill("50");
    await page.getByRole("button", { name: "Somar" }).click();
    await page.getByRole("button", { name: "Finalizar venda (F2)" }).click();
    await expect(page.getByText(/Venda nº \d+ concluída/)).toBeVisible();
    await expect(page.getByText(/Troco: R\$\s*20,00/)).toBeVisible();

    await page.goto("/vendas/pdv/caixa");
    await expect(page.getByText(/\+R\$\s*30,00/).filter({ visible: true }).first()).toBeVisible();
    await page.goto("/vendas/pdv");
    await expect(page.getByRole("button", { name: /^Peixe médio \(kg\)/ })).toContainText("27,5 kg");
  });
});
