import { expect, lerDados, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Chave da API pública criada na tela, usada por outro sistema e revogada.
test("API pública: chave com escopos, recusa sem chave e depois de revogada", async ({ page, request }) => {
  const { dono } = lerDados();
  await page.goto("/configuracoes/api");
  await page.locator("#nome").fill("Integração E2E");
  await page.locator('input[name="escopos"][value="estoque.ver"]').check();
  await page.getByRole("button", { name: "Criar chave", exact: true }).click();
  const codigo = page.locator("code", { hasText: /^balbina_/ });
  await expect(codigo).toBeVisible();
  const token = (await codigo.textContent())!.trim();
  const comChave = { Authorization: `Bearer ${token}` };

  const me = await request.get("/api/v1/me", { headers: comChave });
  expect(me.status()).toBe(200);
  const corpo = await me.json();
  expect(corpo.dados.empresa.cnpj).toBe(dono.cnpj);
  expect(corpo.dados.escopos).toEqual(["estoque.ver"]);

  const estoque = await request.get("/api/v1/estoque?tipo=peixe", { headers: comChave });
  expect(estoque.status()).toBe(200);
  expect((await estoque.json()).dados.some((p: { nome: string }) => p.nome === "Peixe médio (kg)")).toBe(true);

  expect((await request.get("/api/v1/contatos", { headers: comChave })).status()).toBe(403);
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  expect((await request.get("/api/v1/me", { headers: { Authorization: "Bearer balbina_invalida" } })).status()).toBe(401);

  await page.reload();
  await page.getByRole("row", { name: /Integração E2E/ }).getByRole("button", { name: "Revogar" }).click();
  await expect.poll(async () => (await request.get("/api/v1/me", { headers: comChave })).status()).toBe(401);
});
