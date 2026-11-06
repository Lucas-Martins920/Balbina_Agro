import { expect, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Cadastro da piscicultura: os setores (com a licença ambiental) e os viveiros de cada um na mesma tela.
test("setor com licença ambiental aparece na lista, na busca e no formulário", async ({ page }) => {
  await page.goto("/piscicultura");
  const abas = page.getByRole("group", { name: "Cadastro" });
  // a piscicultura do teste já tem o setor Sede: a tela abre nos viveiros e o setor aparece na aba dele
  await expect(abas.getByRole("button", { name: /^Viveiros/ })).toHaveAttribute("aria-pressed", "true");
  await abas.getByRole("button", { name: /^Setores/ }).click();
  await expect(page.getByRole("row").filter({ hasText: "Sede" })).toBeVisible();

  const nome = `Setor E2E ${Date.now() % 100000}`;
  await page.getByRole("button", { name: "Novo setor" }).click();
  await page.locator("#n_nome").fill(nome);
  await page.locator("#n_licenca").fill("LO 0457/2026");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: nome })).toBeVisible();

  // a busca acha o setor pela licença, e o formulário dele traz a licença salva
  await page.getByPlaceholder("Buscar setor").fill("LO 0457");
  await expect(page.getByRole("row").filter({ hasText: nome })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Sede" })).toHaveCount(0);
  await page.getByRole("row").filter({ hasText: nome }).click();
  await expect(page.locator("#n_licenca")).toHaveValue("LO 0457/2026");
});
