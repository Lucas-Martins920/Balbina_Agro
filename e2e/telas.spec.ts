import { expect, SESSAO_DONO, test } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Teste de fumaça: o dono abre cada tela do menu e nenhuma quebra (erro 500, erro de JavaScript na
// página ou "Página não encontrada"). Não confere o conteúdo; os fluxos ficam nos outros arquivos.
const TELAS = [
  "/painel", "/pendencias", "/previsoes", "/primeiros-passos", "/piscicultura", "/lotes", "/lotes/especies", "/despescas", "/apontamentos", "/apontamentos/checklist",
  "/cadastros", "/relatorios/indicadores", "/sanidade", "/medicamentos", "/racao", "/planejamento", "/planejamento/parametros",
  "/planejamento/viabilidade", "/estoque", "/produtos", "/insumos", "/custo-do-kg",
  "/vendas", "/vendas/nova", "/vendas/pdv", "/vendas/pdv/caixa", "/vendas/precos", "/relatorios/vendas", "/vendas/fixos", "/vendas/links",
  "/tabelas-de-preco", "/pontos-de-venda", "/pontos-de-venda/transferencias", "/contatos",
  "/contas-a-pagar", "/contas-a-pagar/documentos", "/contas-a-pagar/pagamentos", "/contas-a-receber", "/contas-a-receber/regua", "/fluxo-de-caixa", "/contas", "/cartoes", "/categorias",
  "/centros-de-custo", "/conciliacao", "/conciliacao/bancos", "/conciliacao/regras", "/cobrancas", "/notas", "/notas/recebidas",
  "/relatorios", "/relatorios/dre", "/relatorios/contas", "/relatorios/periodo", "/relatorios/aging", "/relatorios/orcamento", "/relatorios/contador",
  "/historico", "/configuracoes", "/configuracoes/usuarios", "/configuracoes/api",
  "/configuracoes/importar", "/configuracoes/automacoes", "/configuracoes/zerar-financeiro", "/configuracoes/zerar-sistema", "/seguranca", "/assinatura", "/campo", "/vendedor",
];

test.describe("todas as telas abrem", () => {
  for (const tela of TELAS) {
    test(tela, async ({ page }) => {
      const erros: string[] = [];
      page.on("pageerror", (e) => erros.push(e.message));
      const resposta = await page.goto(tela);
      expect(resposta?.status() ?? 0, `status de ${tela}`).toBeLessThan(500);
      await expect(page.locator("body")).not.toContainText(/Application error|Página não encontrada|Internal Server Error/);
      await page.waitForLoadState("networkidle").catch(() => {});
      expect(erros, `erros de JavaScript em ${tela}`).toEqual([]);
    });
  }
});

test("master cria um cargo e ele aparece para convidar", async ({ page }) => {
  await page.goto("/configuracoes/usuarios?aba=cargos");
  await page.getByRole("button", { name: "Novo cargo" }).click();
  await page.locator("#cargo-novo-nome").fill("Veterinário E2E");
  await page.locator("#cargo-novo-base").selectOption("tratador");
  await page.getByRole("button", { name: "Criar cargo", exact: true }).click();
  await expect(page.getByText("Cargo Veterinário E2E criado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Veterinário E2E/ })).toBeVisible();
  await page.goto("/configuracoes/usuarios");
  await page.getByRole("button", { name: "Novo usuário" }).click();
  await page.getByRole("button", { name: "Convite por e-mail" }).click();
  await expect(page.locator("#conv_cargo option", { hasText: "Veterinário E2E" })).toHaveCount(1);
});
