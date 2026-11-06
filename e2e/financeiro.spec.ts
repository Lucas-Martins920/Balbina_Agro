import { expect, hojeManaus, lerDados, SESSAO_DONO, test, abrirLancamento } from "./apoio";

test.use({ storageState: SESSAO_DONO });

// Extrato OFX com um pagamento de R$ 250,00 feito hoje.
function ofx(dataISO: string) {
  const d = dataISO.replaceAll("-", "");
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0001<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>${d}120000[-4:AMT]
<TRNAMT>-250.00
<FITID>E2E-${d}-1
<MEMO>PAG BOLETO RACAO E2E
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
}

test.describe.serial("financeiro", () => {
  test("conta a pagar agendada", async ({ page }) => {
    await page.goto("/contas-a-pagar");
    await abrirLancamento(page, "Nova conta a pagar");
    await page.locator("#descricao").fill("Ração E2E");
    await page.locator("#contato_id").selectOption({ label: "Fornecedor de Ração E2E" });
    await page.locator("#valor").fill("250,00");
    await page.locator('select[name="rateio_categoria"]').filter({ visible: true }).first().selectOption({ index: 1 });
    await page.getByRole("button", { name: "Agendar", exact: true }).click();
    await expect(page.getByText("Ração E2E agendado.")).toBeVisible();
  });

  test("extrato OFX importado e conciliado com a conta a pagar", async ({ page }) => {
    const { contaBancoId } = lerDados();
    await page.goto(`/conciliacao?conta=${contaBancoId}`);
    // O botão abre a janela de arquivos; escolhido o arquivo, a importação começa sozinha.
    const [janela] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Importar arquivo OFX" }).click()]);
    await janela.setFiles({ name: "extrato-e2e.ofx", mimeType: "application/x-ofx", buffer: Buffer.from(ofx(hojeManaus())) });
    await expect(page.getByText("1 lançamentos importados.")).toBeVisible();

    await expect(page.getByText("PAG BOLETO RACAO E2E").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("Ração E2E").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Conciliar", exact: true }).click();
    await expect(page.getByText("Tudo conciliado nesta conta.")).toBeVisible();

    await page.getByRole("link", { name: "Conciliados e ignorados" }).click();
    await expect(page.getByText("PAG BOLETO RACAO E2E").filter({ visible: true }).first()).toBeVisible();
  });
});
