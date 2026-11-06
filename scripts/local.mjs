#!/usr/bin/env node
// Roda o Balbina na sua máquina com um banco Supabase local (Docker), sem tocar na produção.
// Uso (passo a passo em docs/rodar-local.md):
//   npm run local          instala as dependências se o package-lock.json mudou, sobe o banco local, aplica as migrations novas, ajusta o .env.local e abre o npm run dev
//   npm run local:parar    desliga o banco local (os dados ficam guardados para a próxima vez)
//   npm run local:zerar    apaga os dados do banco local e reaplica todas as migrations
// Na primeira vez (e depois de cada local:zerar) cria a conta de teste pronta para entrar (CONTA_TESTE abaixo).
// Funciona no Windows (PowerShell/CMD), no macOS e no Linux; precisa do Node e do Docker Desktop ligado.
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";

// mesma versão do CLI que o CI usa (.github/workflows/verificacao.yml)
const SUPABASE = ["--yes", "supabase@2.122.0"];
// serviços que o app não usa: sobem mais rápido e gastam menos memória (o Studio fica, para ver os dados)
const SEM = "realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor";
const ENV = ".env.local";
// todo projeto Supabase na nuvem é a produção
const BANCO_NA_NUVEM = /https:\/\/[a-z0-9]+\.supabase\.co/;
const windows = process.platform === "win32";
// Conta de teste do banco local (só existe no Docker da sua máquina; a produção não tem esta conta).
const CONTA_TESTE = {
  email: "admin@balbina.local",
  senha: "balbina1234",
  cnpj: "11222333000181",
  razaoSocial: "Piscicultura Teste Local Ltda",
  nomeFantasia: "Piscicultura Teste",
};

function rodar(cmd, args, { saida = "inherit" } = {}) {
  const r = spawnSync(cmd, args, { stdio: ["inherit", saida, "inherit"], shell: windows, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

function supabase(args, opcoes) {
  return rodar("npx", [...SUPABASE, ...args], opcoes);
}

function parar(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function dockerLigado() {
  const r = spawnSync("docker", ["info"], { stdio: "ignore", shell: windows });
  return r.status === 0;
}

// Lê o .env.local, troca só as variáveis do banco e mantém o resto (chaves de sandbox etc.)
function ajustarEnv(valores) {
  const antigo = existsSync(ENV) ? readFileSync(ENV, "utf8") : existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
  if (existsSync(ENV) && BANCO_NA_NUVEM.test(antigo)) {
    copyFileSync(ENV, `${ENV}.producao.bak`);
    console.log(`  O ${ENV} apontava para o banco de produção; cópia guardada em ${ENV}.producao.bak.`);
  }
  const linhas = antigo.split(/\r?\n/);
  for (let [chave, valor] of Object.entries(valores)) {
    const i = linhas.findIndex((l) => l.startsWith(`${chave}=`));
    const atual = i >= 0 ? linhas[i].slice(chave.length + 1) : "";
    // a chave de cifra só é criada uma vez: trocar depois impede abrir o que já foi gravado
    if (valor === null) {
      if (atual) continue;
      valor = randomBytes(32).toString("hex");
    }
    if (i >= 0) linhas[i] = `${chave}=${valor}`;
    else linhas.push(`${chave}=${valor}`);
  }
  writeFileSync(ENV, linhas.join("\n").replace(/\n*$/, "\n"));
}

const comando = process.argv[2] ?? "dev";

if (!dockerLigado()) parar("O Docker não está rodando. Abra o Docker Desktop, espere ficar verde e rode de novo.");

if (comando === "parar") {
  supabase(["stop"]);
  process.exit(0);
}

if (comando === "zerar") {
  console.log("Apagando os dados do banco local e reaplicando todas as migrations...");
  const r = supabase(["db", "reset", "--local"]);
  if (r.status === 0) console.log(`\nPronto. Rode npm run local: ele recria a conta de teste ${CONTA_TESTE.email} (senha ${CONTA_TESTE.senha}).\n`);
  process.exit(r.status ?? 1);
}

// O git pull pode trazer pacote novo no package-lock.json; sem npm install o build quebra com "Module not found".
// Guarda o hash do lockfile dentro do node_modules e reinstala só quando ele muda (ou quando falta o node_modules).
const MARCA_DEPS = "node_modules/.balbina-lock-hash";
function instalarDependencias() {
  const hash = createHash("sha256").update(readFileSync("package-lock.json")).digest("hex");
  if (existsSync(MARCA_DEPS) && readFileSync(MARCA_DEPS, "utf8").trim() === hash) return;
  console.log("0/4 As dependências mudaram desde a última vez: rodando npm install...");
  if (rodar("npm", ["install"]).status !== 0) parar("O npm install falhou. Veja a mensagem acima e rode npm install à mão.");
  writeFileSync(MARCA_DEPS, `${hash}\n`);
}

// Roda SQL como superusuário dentro do contêiner do banco local (supabase_db_<project_id>); não alcança outro banco.
function sqlLocal(sql) {
  const projeto = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const r = spawnSync("docker", ["exec", "-i", `supabase_db_${projeto}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
    shell: windows,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || "psql falhou");
  return r.stdout.trim();
}

// Primeiro acesso sem atrito: cria a conta de teste já confirmada, com a piscicultura (ela fica dona/master), e deixa
// o 2º fator opcional neste banco local (app.parametros exigir_2fa = 'nao', a mesma chave de emergência da
// migration 20261028034500_mfa_obrigatorio.sql). Só roda quando a conta ainda não existe: se você ligar o
// 2º fator de novo no banco local, ele continua ligado. A produção não passa por aqui.
async function prepararContaTeste(url, chavePublica, chaveSecreta) {
  // import só aqui: o pacote pode ter acabado de ser instalado pelo instalarDependencias()
  const { createClient } = await import("@supabase/supabase-js");
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, chaveSecreta, opcoes);
  const termos = readFileSync("src/lib/termos.ts", "utf8").match(/VERSAO_TERMOS = "([^"]+)"/)?.[1];
  const { error: erroCriar } = await admin.auth.admin.createUser({
    email: CONTA_TESTE.email,
    password: CONTA_TESTE.senha,
    email_confirm: true,
    user_metadata: termos ? { termos_versao: termos, termos_aceitos_em: new Date().toISOString() } : {},
  });
  if (erroCriar) {
    if (erroCriar.code === "email_exists" || /already/i.test(erroCriar.message)) return false;
    throw erroCriar;
  }
  sqlLocal("update app.parametros set valor = 'nao' where chave = 'exigir_2fa';");
  const cliente = createClient(url, chavePublica, opcoes);
  const { error: erroEntrar } = await cliente.auth.signInWithPassword({ email: CONTA_TESTE.email, password: CONTA_TESTE.senha });
  if (erroEntrar) throw erroEntrar;
  const { error: erroEmpresa } = await cliente.rpc("criar_empresa", {
    p_cnpj: CONTA_TESTE.cnpj,
    p_razao_social: CONTA_TESTE.razaoSocial,
    p_nome_fantasia: CONTA_TESTE.nomeFantasia,
  });
  if (erroEmpresa && erroEmpresa.code !== "23505") throw erroEmpresa;
  return true;
}

instalarDependencias();

console.log("1/4 Subindo o banco local (na primeira vez baixa as imagens do Docker, leva alguns minutos)...");
if (supabase(["start", "-x", SEM]).status !== 0) parar("O Supabase local não subiu. Veja a mensagem acima (docs/rodar-local.md, seção Problemas).");

console.log("2/4 Aplicando as migrations novas...");
if (supabase(["migration", "up", "--local"]).status !== 0) parar("Uma migration falhou. Se o banco local estiver bagunçado, rode npm run local:zerar.");

console.log(`3/4 Ajustando o ${ENV}...`);
const status = supabase(["status", "-o", "env"], { saida: "pipe" });
const vars = Object.fromEntries(
  status.stdout
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!vars.API_URL || !vars.ANON_KEY || !vars.SERVICE_ROLE_KEY) parar("Não consegui ler o endereço e as chaves do banco local (supabase status).");
ajustarEnv({
  NEXT_PUBLIC_SUPABASE_URL: vars.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: vars.ANON_KEY,
  SUPABASE_SECRET_KEY: vars.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  BALBINA_CHAVE_CRIPTO: null,
});

try {
  if (await prepararContaTeste(vars.API_URL, vars.ANON_KEY, vars.SERVICE_ROLE_KEY)) {
    console.log(`  Conta de teste criada: ${CONTA_TESTE.email} / senha ${CONTA_TESTE.senha} (piscicultura "${CONTA_TESTE.nomeFantasia}", sem 2º fator no banco local).`);
  }
} catch (e) {
  console.log(`  Aviso: não consegui criar a conta de teste (${e.message}). Crie uma pela tela (docs/rodar-local.md, Primeiro acesso).`);
}

console.log("4/4 Abrindo o app. Quando aparecer \"Ready\", abra http://localhost:3000 no navegador.");
console.log(`    Entrar com: ${CONTA_TESTE.email} / senha ${CONTA_TESTE.senha}`);
console.log(`    E-mails (código do 2º fator, se você ligar): ${vars.MAILPIT_URL ?? vars.INBUCKET_URL ?? "http://127.0.0.1:54324"}`);
console.log(`    Dados do banco: ${vars.STUDIO_URL ?? "http://127.0.0.1:54323"} (Supabase Studio). Para sair: Ctrl+C.\n`);
const dev = spawn("npx", ["next", "dev"], { stdio: "inherit", shell: windows });
dev.on("exit", (codigo) => process.exit(codigo ?? 0));
