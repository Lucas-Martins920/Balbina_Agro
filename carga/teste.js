// Teste de carga do Balbina com k6 (carga/README.md). Só no site de teste ou no local, NUNCA na produção.
//
//   k6 run -e BASE=https://<site-de-teste>.vercel.app -e PRODUCAO=<site da produção>,<ref do Supabase da produção> -e USUARIOS=100 carga/teste.js
//
// Cada usuário virtual é uma pessoa da piscicultura: abre o painel, uma lista (contas, estoque, lançamentos,
// fluxo de caixa, conciliação, vendas) e às vezes lança o trato de um viveiro pelo app de campo, com pausas de
// leitura entre um clique e outro. As sessões vêm de carga/.sessoes.json (node carga/preparar.mjs).
// Um cenário à parte mede o login (senha no Supabase Auth) num ritmo baixo, para não bater no limite por IP.
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = (__ENV.BASE || "").replace(/\/$/, "");
const USUARIOS = Number(__ENV.USUARIOS || 100);
const SUBIDA = __ENV.SUBIDA || "2m";
const PLATO = __ENV.PLATO || "5m";
// Endereço do site e Reference ID do Supabase da produção, separados por vírgula: o teste recusa os dois.
const PRODUCAO = (__ENV.PRODUCAO || "").split(",").map((p) => p.trim()).filter(Boolean);

if (!BASE) throw new Error("Informe -e BASE=https://<site-de-teste>.vercel.app (ou http://localhost:3000).");
if (!PRODUCAO.length && !/\/\/(127\.0\.0\.1|localhost)[:/]/.test(BASE)) {
  throw new Error("Informe -e PRODUCAO=<site da produção>,<ref do Supabase da produção> para o teste recusar a produção.");
}
if (PRODUCAO.some((p) => BASE.includes(p))) throw new Error("Esse é o endereço da PRODUÇÃO. Teste de carga só no site de teste ou no local.");

const sessoes = JSON.parse(open("./.sessoes.json"));
if (PRODUCAO.some((p) => sessoes.supabase.includes(p))) throw new Error("As sessões são do banco da produção.");

const erros = new Rate("erros");
const foiProLogin = new Rate("sessao_perdida");
const tempoLogin = new Trend("login_ms", true);

const LISTAS = ["/contas-a-pagar", "/contas-a-receber", "/estoque", "/apontamentos", "/fluxo-de-caixa", "/conciliacao", "/vendas", "/lotes"];

export const options = {
  scenarios: {
    navegacao: {
      executor: "ramping-vus",
      exec: "navegacao",
      startVUs: 0,
      stages: [
        { duration: SUBIDA, target: USUARIOS },
        { duration: PLATO, target: USUARIOS },
        { duration: "1m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
    login: {
      executor: "constant-arrival-rate",
      exec: "login",
      rate: Number(__ENV.LOGINS_POR_MIN || 6),
      timeUnit: "1m",
      duration: "8m",
      preAllocatedVUs: 2,
    },
  },
  thresholds: {
    "http_req_duration{tipo:pagina}": ["p(95)<3000"],
    "http_req_duration{tipo:api}": ["p(95)<2000"],
    erros: ["rate<0.02"],
    sessao_perdida: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

let comCookies = false;

function prepararSessao() {
  const u = sessoes.usuarios[(__VU - 1) % sessoes.usuarios.length];
  if (!comCookies) {
    const jar = http.cookieJar();
    for (const c of u.cookies) jar.set(BASE, c.name, c.value, { path: "/" });
    comCookies = true;
  }
  return u;
}

function pagina(caminho, nome) {
  const r = http.get(`${BASE}${caminho}`, { tags: { tipo: "pagina", name: nome }, redirects: 3, timeout: "60s" });
  const perdeu = /\/(login|auth\/mfa|onboarding)/.test(r.url);
  foiProLogin.add(perdeu);
  const bom = check(r, { "página 200": (x) => x.status === 200, "continua logado": () => !perdeu });
  erros.add(!bom);
  return r;
}

function hojeManaus() {
  return new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
}

function uuid() {
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20)}`;
}

export function navegacao() {
  const u = prepararSessao();
  group("painel", () => pagina("/painel", "/painel"));
  sleep(3 + Math.random() * 5);
  const lista = LISTAS[Math.floor(Math.random() * LISTAS.length)];
  group("lista", () => pagina(lista, lista));
  sleep(3 + Math.random() * 5);
  if (Math.random() < 0.3) {
    group("lancar trato do viveiro", () => {
      const corpo = {
        client_id: uuid(), viveiro_id: u.viveiros[Math.floor(Math.random() * u.viveiros.length)], data: hojeManaus(),
        turno: Math.random() < 0.5 ? "manha" : "tarde", mortes: 1, descartes: 0,
        racao_kg: 60 + Math.floor(Math.random() * 30), observacoes: "teste de carga", forcar: true,
      };
      const r = http.post(`${BASE}/api/apontamentos`, JSON.stringify(corpo), {
        headers: { "Content-Type": "application/json" }, tags: { tipo: "api", name: "POST /api/apontamentos" }, timeout: "60s",
      });
      const bom = check(r, { "apontamento salvo": (x) => x.status === 200 });
      erros.add(!bom);
    });
    sleep(2 + Math.random() * 3);
  }
}

export function login() {
  const u = sessoes.usuarios[Math.floor(Math.random() * sessoes.usuarios.length)];
  const r = http.post(`${sessoes.supabase}/auth/v1/token?grant_type=password`, JSON.stringify({ email: u.email, password: u.senha }), {
    headers: { "Content-Type": "application/json", apikey: sessoes.anon },
    tags: { tipo: "auth", name: "login (Supabase Auth)" },
  });
  tempoLogin.add(r.timings.duration);
  const bom = check(r, { "login 200": (x) => x.status === 200 });
  erros.add(!bom);
}
