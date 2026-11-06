import { entrar, expect, lerDados, SESSAO_DONO, test as preparo } from "./apoio";

// Login completo (senha + app autenticador). A sessão fica salva para os outros fluxos.
preparo("entra com senha e código do autenticador", async ({ page }) => {
  const { dono } = lerDados();
  await entrar(page, dono);
  await expect(page).toHaveURL(/\/painel/);
  await expect(page.getByText("Piscicultura E2E").filter({ visible: true }).first()).toBeVisible();
  await page.context().storageState({ path: SESSAO_DONO });
});
