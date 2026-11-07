import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import { codigoTotp, passoTotp } from "./totp";

// test com um extra: quando um teste falha, o log do CI mostra o endereço e o texto da tela.
export const test = base.extend<{ telaNoErro: void }>({
  // o aviso de cookies cobre os botões de baixo da tela do celular: já marca como visto em cada teste
  page: async ({ page }, usar) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("balbina.aviso-cookies", new Date().toISOString());
      } catch {}
    });
    await usar(page);
  },
  telaNoErro: [async ({ page }, usar, info) => {
    await usar();
    if (info.status !== info.expectedStatus) {
      const texto = await page.locator("body").innerText({ timeout: 2000 }).catch(() => "(sem tela)");
      console.log(`\n--- tela no erro (${page.url()}) ---\n${texto.replace(/\n{2,}/g, "\n").slice(0, 3000)}\n---`);
    }
  }, { auto: true }],
});
export { expect };

// Espera o service worker controlar a página: só a partir daí as telas passam por ele e ficam guardadas.
export async function comServiceWorker(page: Page, caminho: string) {
  await page.goto(caminho);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

// Fila guardada no aparelho: o armazém do Balbina no IndexedDB (src/lib/db/indexeddb.ts). Espera a gravação, que é
// assíncrona, e devolve o texto da primeira chave com o prefixo (null se não houver).
export async function filaGuardada(page: Page, prefixo: string): Promise<string | null> {
  let achado: string | null = null;
  await expect.poll(async () => {
    achado = await page.evaluate(async (p) => {
      const db = await new Promise<IDBDatabase>((ok, falha) => {
        const r = indexedDB.open("balbina");
        r.onsuccess = () => ok(r.result);
        r.onerror = () => falha(r.error);
      });
      try {
        if (!db.objectStoreNames.contains("dados")) return null;
        const loja = db.transaction("dados").objectStore("dados");
        const chaves = await new Promise<IDBValidKey[]>((ok) => { const r = loja.getAllKeys(); r.onsuccess = () => ok(r.result); });
        const chave = chaves.find((k) => typeof k === "string" && k.startsWith(p));
        if (!chave) return null;
        const valor = await new Promise<unknown>((ok) => { const r = db.transaction("dados").objectStore("dados").get(chave); r.onsuccess = () => ok(r.result); });
        return typeof valor === "string" && valor !== "[]" ? valor : null;
      } finally {
        db.close();
      }
    }, prefixo);
    return achado;
  }, { timeout: 10_000 }).not.toBeNull();
  return achado;
}

// Arquivos gerados pelo preparo (e2e/preparar.ts); ficam fora do git.
export const PASTA_ESTADO = path.join(__dirname, ".estado");
export const ARQUIVO_DADOS = path.join(PASTA_ESTADO, "dados.json");
export const SESSAO_DONO = path.join(PASTA_ESTADO, "sessao-dono.json");

export type Usuario = { email: string; senha: string; totp: string };
export type Dados = {
  dono: Usuario & { cnpj: string };
  bloqueado: Usuario;
  contaBancoId: string;
  classeMedioId: string;
};

export function lerDados(): Dados {
  return JSON.parse(readFileSync(ARQUIVO_DADOS, "utf8")) as Dados;
}

export function gravarDados(dados: Dados) {
  mkdirSync(PASTA_ESTADO, { recursive: true });
  writeFileSync(ARQUIVO_DADOS, JSON.stringify(dados, null, 2));
}

// O mesmo código do autenticador não deve ser usado duas vezes: guarda o último passo de 30 s usado
// por segredo e, se o atual já foi, espera o próximo.
export async function codigoNovo(segredo: string) {
  mkdirSync(PASTA_ESTADO, { recursive: true });
  const arquivo = path.join(PASTA_ESTADO, `totp-${segredo.slice(0, 8)}.txt`);
  const usado = existsSync(arquivo) ? Number(readFileSync(arquivo, "utf8")) : -1;
  while (passoTotp() <= usado) await new Promise((r) => setTimeout(r, 1000));
  writeFileSync(arquivo, String(passoTotp()));
  return codigoTotp(segredo);
}

export async function entrarComSenha(page: Page, u: Pick<Usuario, "email" | "senha">, voltar?: string) {
  await page.goto(voltar ? `/login?voltar=${encodeURIComponent(voltar)}` : "/login");
  await page.locator("#email").fill(u.email);
  await page.locator("#senha").fill(u.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

// Login completo: senha e código do app autenticador.
export async function entrar(page: Page, u: Usuario, voltar?: string) {
  await entrarComSenha(page, u, voltar);
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await page.locator("#codigo").fill(await codigoNovo(u.totp));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

// Lançamentos abrem na gaveta da direita pelo botão no alto da tela (src/components/lancamento.tsx).
export async function abrirLancamento(page: Page, botao: string | RegExp) {
  await page.getByRole("button", { name: botao, exact: typeof botao === "string" }).first().click();
  await page.getByRole("dialog").locator("form").waitFor();
}

// Checklist do viveiro (o trigger checklist_padrao cria sim/não obrigatórios em toda empresa nova):
// abre o <details> fechado da tela do celular e marca "ok" em cada item.
export async function preencherChecklist(page: Page) {
  for (const fechado of await page.locator("details:not([open]):has(input[type='radio'][required])").all()) {
    await fechado.locator("summary").first().click();
  }
  for (const ok of await page.locator("label:has(input[type='radio'][required][value='ok'])").all()) await ok.click();
}

export function hojeManaus() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(new Date());
}
