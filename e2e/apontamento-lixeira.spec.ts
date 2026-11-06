import type { Page } from "@playwright/test";
import { abrirLancamento, expect, preencherChecklist, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Lançamento da tarde no computador: editar, excluir (vai para a lixeira e os peixes mortos voltam à conta do
// viveiro) e restaurar. Roda antes de producao-vendas (ordem alfabética) e termina excluído, para não mudar a
// contagem de peixes dela nem ocupar o turno da tarde (um lançamento por turno, viveiro e dia).
const linhaTarde = (page: Page) => page.getByRole("row").filter({ hasText: "Tarde" }).filter({ has: page.getByRole("button", { name: "editar" }) });
// a lista de viveiros do lançamento mostra quantos peixes o lote tem agora (povoados menos mortes e descartes)
const peixesNoViveiro = async (page: Page) => {
  await page.goto("/apontamentos");
  await abrirLancamento(page, "Novo apontamento");
  return page.locator("#viveiro_id");
};

async function excluir(page: Page) {
  await page.goto("/apontamentos");
  await linhaTarde(page).getByRole("button", { name: "excluir" }).click();
  const caixa = page.getByRole("dialog", { name: "Excluir lançamento" });
  await caixa.getByPlaceholder(/lancei no viveiro errado/).fill("teste E2E");
  await caixa.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(linhaTarde(page)).toHaveCount(0);
}

test.describe.serial("lançamento do viveiro: editar, lixeira e restaurar", () => {
  test("lança a tarde e edita as mortes", async ({ page }) => {
    await expect(await peixesNoViveiro(page)).toContainText("10.000 peixes");
    await page.locator("#turno").selectOption("tarde");
    await page.locator("#mortes").fill("5");
    for (const campo of ["#descartes", "#racao_kg"]) await page.locator(campo).fill("0");
    await preencherChecklist(page);
    await page.getByRole("button", { name: "Salvar apontamento" }).click();
    await expect(page.getByText(/Lançamento da tarde de .* salvo/)).toBeVisible();
    await expect(await peixesNoViveiro(page)).toContainText("9.995 peixes");

    await page.goto("/apontamentos");
    await linhaTarde(page).getByRole("button", { name: "editar" }).click();
    const caixa = page.getByRole("dialog", { name: "Editar lançamento" });
    await caixa.locator('input[name="mortes"]').fill("6");
    await caixa.getByRole("button", { name: "Salvar edição" }).click();
    await expect(caixa.getByText("Lançamento editado.")).toBeVisible();
    await expect(await peixesNoViveiro(page)).toContainText("9.994 peixes");
  });

  test("excluir manda para a lixeira e devolve os peixes; restaurar traz de volta", async ({ page }) => {
    await excluir(page);
    await expect(await peixesNoViveiro(page)).toContainText("10.000 peixes");

    await page.goto("/apontamentos");
    await page.getByText(/Lixeira: lançamentos excluídos/).click();
    await page.getByRole("button", { name: "restaurar" }).click();
    await expect(linhaTarde(page)).toHaveCount(1);
    await expect(await peixesNoViveiro(page)).toContainText("9.994 peixes");

    await excluir(page);
  });
});
