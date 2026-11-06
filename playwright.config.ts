import { defineConfig } from "@playwright/test";

// Testes de ponta a ponta (e2e/). Sem E2E_BASE_URL sobe o app local (npm run start, depois do build);
// com E2E_BASE_URL testa um app que já está rodando (por exemplo o npm run local). Como rodar: e2e/README.md.
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/preparar.ts",
  // os fluxos dividem a mesma piscicultura: um de cada vez, na ordem
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Manaus",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "login", testMatch: /login\.setup\.ts/ },
    { name: "fluxos", testMatch: /\.spec\.ts/, dependencies: ["login"] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: BASE_URL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
