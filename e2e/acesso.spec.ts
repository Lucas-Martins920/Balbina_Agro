import { codigoTotp } from "./totp";
import { entrar, entrarComSenha, expect, lerDados, test } from "./apoio";

// Login, segundo fator e bloqueio por assinatura, sempre a partir de um navegador sem sessão.
test.describe("acesso", () => {
  test("sem sessão, as telas do app levam ao login", async ({ page }) => {
    await page.goto("/apontamentos");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#email")).toBeVisible();
  });

  test("senha errada não entra", async ({ page }) => {
    const { dono } = lerDados();
    await entrarComSenha(page, { email: dono.email, senha: `${dono.senha}x` });
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("5 senhas erradas seguidas travam a conta por 15 minutos", async ({ page }) => {
    const alvo = { email: `trava-${Date.now()}@exemplo.com`, senha: "senha-errada-1" };
    for (let i = 0; i < 5; i++) {
      await entrarComSenha(page, alvo);
      await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    }
    await entrarComSenha(page, alvo);
    await expect(page.getByText(/Muitas tentativas com senha errada/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("a senha sozinha não abre os dados: pede o código do autenticador", async ({ page }) => {
    const { dono } = lerDados();
    await entrarComSenha(page, dono);
    await expect(page).toHaveURL(/\/auth\/mfa/);
    await page.goto("/painel");
    await expect(page).toHaveURL(/\/auth\/mfa/);
  });

  test("código errado do autenticador é recusado", async ({ page }) => {
    const { dono } = lerDados();
    await entrarComSenha(page, dono);
    await expect(page).toHaveURL(/\/auth\/mfa/);
    // basta ser diferente do código atual: não precisa esperar um código novo (30 s)
    const certo = codigoTotp(dono.totp);
    await page.locator("#codigo").fill(certo === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText(/Código inválido ou expirado/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/mfa/);
  });

  // Bug relatado em 2026-10-30: a resposta do "Esqueci minha senha" ficava presa na tela ao voltar para o login.
  for (const [tela, viewport] of [["computador", { width: 1280, height: 800 }], ["celular", { width: 390, height: 844 }]] as const) {
    test(`no ${tela}, a mensagem do esqueci minha senha some ao voltar para o login`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const naoCadastrado = { email: `ninguem-${Date.now()}@exemplo.com`, senha: "senha-qualquer-1" };
      await entrarComSenha(page, naoCadastrado);
      const erro = page.getByText("E-mail ou senha incorretos.");
      await expect(erro).toBeVisible();

      await page.getByRole("button", { name: "Esqueci minha senha" }).click();
      await expect(erro).toBeHidden();
      await page.locator("#email").fill(naoCadastrado.email);
      await page.getByRole("button", { name: "Enviar link" }).click();
      const resposta = page.getByText(/Se houver uma conta com esse e-mail/);
      await expect(resposta).toBeVisible();

      await page.getByRole("button", { name: "Já tem conta? Entrar" }).click();
      await expect(resposta).toBeHidden();
      // nem na tela de criar conta
      await page.getByRole("button", { name: "Ainda não tem conta? Criar conta" }).click();
      await expect(resposta).toBeHidden();
      await page.getByRole("button", { name: "Já tem conta? Entrar" }).click();
      await page.locator("#email").fill(naoCadastrado.email);
      await page.locator("#senha").fill(naoCadastrado.senha);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(erro).toBeVisible();
      await expect(resposta).toBeHidden();
    });
  }

  test("criar conta com e-mail já cadastrado não revela que a conta existe", async ({ page }) => {
    const { dono } = lerDados();
    await page.goto("/login");
    await page.getByRole("button", { name: "Ainda não tem conta? Criar conta" }).click();
    await page.locator("#email").fill(dono.email);
    await page.locator("#senha").fill("outra-senha-123");
    await page.locator("#confirmacao").fill("outra-senha-123");
    await page.locator('input[name="aceite"]').check();
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await expect(page.getByText(/Se esse e-mail ainda não tiver conta/)).toBeVisible();
    await expect(page.getByText(/already|já existe|já cadastrad/i)).toBeHidden();
  });

  test("teste grátis vencido leva para a assinatura", async ({ page }) => {
    const { bloqueado } = lerDados();
    await entrar(page, bloqueado);
    await expect(page).toHaveURL(/\/assinatura/);
    await expect(page.getByText("O teste grátis terminou.")).toBeVisible();
    await page.goto("/apontamentos");
    await expect(page).toHaveURL(/\/assinatura/);
  });
});
