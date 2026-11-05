import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(path.join(tmpdir(), "balbina-test-"));
let server: ChildProcess;
let token = "";

async function api(endpoint: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      DB_PATH: path.join(dir, "test.db"),
      JWT_SECRET: "segredo-de-teste",
      AUTH_USER: "admin",
      AUTH_PASSWORD: "senha-teste",
      DATABASE_URL: "",
      DOTENV_CONFIG_PATH: path.join(dir, "inexistente.env"),
      IA_API_URL: "http://127.0.0.1:9/indisponivel",
    },
    stdio: "ignore",
  });

  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("servidor não subiu");
});

after(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

test("login rejeita senha errada e aceita a correta", async () => {
  const errado = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "x" }),
  });
  assert.equal(errado.status, 401);

  const certo = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username: "admin", password: "senha-teste" }),
  });
  assert.equal(certo.status, 200);
  token = certo.body.token;
});

test("rotas exigem token", async () => {
  const salvo = token;
  token = "";
  const r = await api("/api/lotes");
  token = salvo;
  assert.equal(r.status, 401);
});

test("ciclo do lote: abrir, gastar, fechar, vender", async () => {
  // A IA está indisponível, então o parser local interpreta a mensagem.
  const aberto = await api("/api/abrir-lote", {
    method: "POST",
    body: JSON.stringify({
      message: "Abrir lote L-01 com 500 alevinos de tambaqui no tanque TQ-1 em 2026-09-01",
    }),
  });
  assert.equal(aberto.status, 201, JSON.stringify(aberto.body));
  assert.equal(aberto.body.loteId, "L-01");

  const duplicado = await api("/api/abrir-lote", {
    method: "POST",
    body: JSON.stringify({
      message: "Abrir lote L-01 com 500 alevinos de tambaqui no tanque TQ-1 em 2026-09-01",
    }),
  });
  assert.equal(duplicado.status, 409);

  const gasto = await api("/api/caixa/movimento", {
    method: "POST",
    body: JSON.stringify({
      tipo: "saida",
      valor: 1000,
      descricao: "Ração",
      dataMovimento: "2026-09-10",
      loteId: "L-01",
    }),
  });
  assert.equal(gasto.status, 201);

  const vendaAntes = await api("/api/vendas", {
    method: "POST",
    body: JSON.stringify({ loteId: "L-01", dataVenda: "2026-10-01", kgVendidos: 10, valorTotal: 200 }),
  });
  assert.equal(vendaAntes.status, 400, "lote ativo não pode vender");

  const fechado = await api("/api/lotes/L-01/fechar", {
    method: "POST",
    body: JSON.stringify({ kgColhidos: 400, dataFechamento: "2026-10-01" }),
  });
  assert.equal(fechado.status, 200, JSON.stringify(fechado.body));
  assert.equal(fechado.body.custoPorKg, 2.5);

  const venda = await api("/api/vendas", {
    method: "POST",
    body: JSON.stringify({ loteId: "L-01", dataVenda: "2026-10-02", kgVendidos: 150, valorTotal: 1500 }),
  });
  assert.equal(venda.status, 201, JSON.stringify(venda.body));

  const excesso = await api("/api/vendas", {
    method: "POST",
    body: JSON.stringify({ loteId: "L-01", dataVenda: "2026-10-03", kgVendidos: 300, valorTotal: 3000 }),
  });
  assert.equal(excesso.status, 400);

  const vendas = await api("/api/vendas");
  assert.equal(vendas.body.length, 1, "venda recusada não pode ficar gravada");

  const saldo = await api("/api/caixa/saldo");
  assert.deepEqual(saldo.body, { saldo: 500, entradas: 1500, saidas: 1000 });

  const lotes = await api("/api/lotes");
  assert.equal(lotes.body[0].status, "fechado");
  assert.equal(lotes.body[0].kg_vendidos, 150);

  const estoque = await api("/api/estoque");
  assert.equal(estoque.body[0].saldo, 250);
});

test("contas a pagar: criar e pagar uma vez só", async () => {
  const conta = await api("/api/contas-pagar", {
    method: "POST",
    body: JSON.stringify({ descricao: "Energia", valor: 320, vencimento: "2026-11-05" }),
  });
  assert.equal(conta.status, 201);

  const id = conta.body.conta.id;
  const paga = await api(`/api/contas-pagar/${id}/pagar`, { method: "PATCH", body: "{}" });
  assert.equal(paga.status, 200);

  const deNovo = await api(`/api/contas-pagar/${id}/pagar`, { method: "PATCH", body: "{}" });
  assert.equal(deNovo.status, 400);
});

test("resumo de sync nunca devolve null", async () => {
  const r = await api("/api/sync/summary");
  assert.equal(typeof r.body.pending, "number");
  assert.equal(typeof r.body.error, "number");
});
