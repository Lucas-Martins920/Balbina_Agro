import { expect, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Rotina do dia: checklist por área, marcado sozinho pelo que já entrou (roda depois de producao-vendas, que
// lançou o trato do viveiro), e o link do item abre a gaveta do lançamento na tela certa.
test("rotina do dia marca o que entrou e leva direto ao lançamento", async ({ page }) => {
  await page.goto("/pendencias");
  await expect(page.getByRole("heading", { name: "Rotina do dia" })).toBeVisible();
  const viveiro = page.getByRole("listitem").filter({ hasText: /Apontamento · V1/ }).first();
  await expect(viveiro).toContainText("(feito)");
  // o lote foi povoado há 60 dias e ninguém pesou: a biometria fica pendente
  const biometria = page.getByRole("listitem").filter({ hasText: "Biometria dos viveiros" });
  await expect(biometria).toContainText("1 viveiro está há mais de 30 dias sem pesagem");
  await expect(biometria).not.toContainText("(feito)");

  await page.goto("/apontamentos?lancar=Novo%20apontamento");
  await expect(page.getByRole("dialog", { name: "Novo lançamento" })).toBeVisible();
  await expect(page).toHaveURL(/\/apontamentos$/);
});

test("cadastro rápido de dentro do lançamento já deixa o novo escolhido", async ({ page }) => {
  await page.goto("/racao");
  await page.getByRole("button", { name: "Entrada de ração" }).click();
  const gaveta = page.getByRole("dialog", { name: "Entrada de ração" });
  await gaveta.getByRole("button", { name: "Novo produto" }).click();
  await gaveta.getByPlaceholder("Nome").fill("Ração E2E");
  await gaveta.getByPlaceholder("Nome").press("Enter");
  await expect(gaveta.locator("#er_produto option:checked")).toHaveText("Ração E2E (kg)");
  await expect(gaveta).toBeVisible();
});
