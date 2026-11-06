import { randomBytes } from "node:crypto";
import { codigoTotp } from "./totp";
import { expect, SESSAO_DONO, test } from "./apoio";

// Login por usuário e senha (sem e-mail), criado pelo master: tratador liberado sem 2º fator cai no
// apontamento do celular; financeiro por login cadastra o app autenticador no primeiro acesso.
const sufixo = randomBytes(3).toString("hex");
const tratador = { login: `ze.e2e${sufixo}`, senha: `Inicial!${sufixo}9`, nova: `Minha!senha${sufixo}` };
const financeiro = { login: `fin.e2e${sufixo}`, senha: `Inicial!${sufixo}8`, nova: `Outra!senha${sufixo}` };

test.describe.serial("login por usuário", () => {
  test.describe("master", () => {
    test.use({ storageState: SESSAO_DONO });

    test("cria os logins pela tela de usuários", async ({ page }) => {
      await page.goto("/configuracoes/usuarios");
      await page.getByRole("button", { name: "Novo usuário" }).click();
      await page.locator("#loc_nome").fill("Zé do Viveiro E2E");
      await page.locator("#loc_login").fill(tratador.login);
      await page.locator("#loc_senha").fill(tratador.senha);
      await page.locator("#loc_cargo").selectOption("tratador");
      await expect(page.getByLabel(/Liberar sem 2º fator/)).toBeChecked();
      await page.getByRole("button", { name: "Criar login" }).click();
      await expect(page.getByText(`entra com o usuário ${tratador.login}`)).toBeVisible();
      await expect(page.getByRole("cell", { name: new RegExp(tratador.login) })).toBeVisible();

      // financeiro mexe em dinheiro: a tela já tira a dispensa do 2º fator (o banco recusaria)
      await page.getByRole("button", { name: "Novo usuário" }).click();
      await page.locator("#loc_nome").fill("Financeiro E2E");
      await page.locator("#loc_login").fill(financeiro.login);
      await page.locator("#loc_senha").fill(financeiro.senha);
      await page.locator("#loc_cargo").selectOption("financeiro");
      await expect(page.getByLabel(/Liberar sem 2º fator/)).toBeDisabled();
      await expect(page.getByLabel(/Liberar sem 2º fator/)).not.toBeChecked();
      await page.getByRole("button", { name: "Criar login" }).click();
      await expect(page.getByText(`entra com o usuário ${financeiro.login}`)).toBeVisible();
    });
  });

  test("tratador entra só com usuário e senha, troca a senha e cai no apontamento", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(tratador.login);
    await page.locator("#senha").fill(`${tratador.senha}x`);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Usuário ou senha incorretos.")).toBeVisible();

    await page.locator("#email").fill(tratador.login);
    await page.locator("#senha").fill(tratador.senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/primeiro-acesso/);
    await page.locator("#senha").fill(tratador.nova);
    await page.locator("#confirmacao").fill(tratador.nova);
    await page.getByRole("button", { name: "Salvar senha e entrar" }).click();
    await expect(page).toHaveURL(/\/aceitar-termos/);
    await page.locator("input[name=aceite]").check();
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
    await expect(page).toHaveURL(/\/campo/);

    // a senha inicial não vale mais
    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator("#email").fill(tratador.login);
    await page.locator("#senha").fill(tratador.senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Usuário ou senha incorretos.")).toBeVisible();
  });

  test("financeiro por usuário cadastra o app autenticador antes de entrar", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(financeiro.login);
    await page.locator("#senha").fill(financeiro.senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/mfa/);
    const segredo = (await page.locator("code").innerText()).trim();
    await page.locator("#codigo").fill(codigoTotp(segredo));
    await page.getByRole("button", { name: "Confirmar e entrar" }).click();
    await expect(page).toHaveURL(/\/auth\/primeiro-acesso/);
    await page.locator("#senha").fill(financeiro.nova);
    await page.locator("#confirmacao").fill(financeiro.nova);
    await page.getByRole("button", { name: "Salvar senha e entrar" }).click();
    await expect(page).toHaveURL(/\/aceitar-termos/);
  });
});
