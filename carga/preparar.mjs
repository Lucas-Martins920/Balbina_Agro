#!/usr/bin/env node
// Prepara o teste de carga (carga/README.md): cria pisciculturas e usuários de teste no banco do SITE DE TESTE
// (ou no Supabase local), com dados de uns 30 dias, entra com cada um (senha + app autenticador) e grava
// os cookies de sessão em carga/.sessoes.json para o k6 usar. O k6 não faz login a cada usuário virtual:
// o Supabase Auth limita logins por IP e o teste mediria o limite, não o sistema.
//
// Uso: CARGA_SUPABASE_URL=... CARGA_SUPABASE_ANON=... CARGA_SUPABASE_SECRET=... node carga/preparar.mjs
//   CARGA_USUARIOS=20   quantas pisciculturas/usuários (padrão 20; os usuários virtuais do k6 se dividem entre eles)
//   BALBINA_REF_PRODUCAO  Reference ID do projeto Supabase da produção (vários separados por vírgula): o script
//                         recusa esse banco. Obrigatório fora do Supabase local.
//   --renovar           não cria nada: só entra de novo com os usuários já gravados (sessão vale ~1 h)
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Projeto Supabase da PRODUÇÃO. Carga nele derruba o sistema das pisciculturas.
const PRODUCAO = (process.env.BALBINA_REF_PRODUCAO ?? "").split(",").map((r) => r.trim()).filter(Boolean);
const ARQUIVO = new URL("./.sessoes.json", import.meta.url);

const URL_SB = process.env.CARGA_SUPABASE_URL;
const ANON = process.env.CARGA_SUPABASE_ANON;
const SECRET = process.env.CARGA_SUPABASE_SECRET;
const N = Number(process.env.CARGA_USUARIOS ?? 20);
const renovar = process.argv.includes("--renovar");

function parar(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!URL_SB || !ANON || (!SECRET && !renovar)) parar("Defina CARGA_SUPABASE_URL, CARGA_SUPABASE_ANON e CARGA_SUPABASE_SECRET (do banco de TESTE).");
if (PRODUCAO.some((ref) => URL_SB.includes(ref))) parar("Esse é o banco da PRODUÇÃO. Teste de carga só no banco do site de teste ou no local.");
if (!PRODUCAO.length && !/\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_SB)) {
  parar("Defina BALBINA_REF_PRODUCAO com o Reference ID do Supabase da produção, para o script conferir que este banco não é ele.");
}

const OPCOES = { auth: { persistSession: false, autoRefreshToken: false } };

function codigoTotp(segredo, quando = Date.now()) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredo.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const chave = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const passo = Buffer.alloc(8);
  passo.writeBigUInt64BE(BigInt(Math.floor(quando / 1000 / 30)));
  const hmac = createHmac("sha1", chave).update(passo).digest();
  const d = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(d) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

function cnpjAleatorio() {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (nums) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = nums.reduce((s, n, i) => s + n * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  base.push(dv(base));
  base.push(dv(base));
  return base.join("");
}

function dia(n) {
  const d = new Date(Date.now() - 4 * 3600_000); // Manaus
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function ok(r, oQue) {
  if (r.error) throw new Error(`${oQue}: ${r.error.message}`);
  return r.data;
}

// Cliente igual ao do servidor do app (@supabase/ssr): o que ele grava nos cookies é o que o navegador mandaria.
function clienteComCookies() {
  const pote = new Map();
  const db = createServerClient(URL_SB, ANON, {
    cookies: {
      getAll: () => [...pote].map(([name, value]) => ({ name, value })),
      setAll: (lista) => {
        for (const { name, value } of lista) value ? pote.set(name, value) : pote.delete(name);
      },
    },
  });
  return { db, pote };
}

// Entra com senha e, se a pessoa tem app autenticador, sobe a sessão para aal2 (como a tela /auth/mfa).
async function entrar(email, senha, totp) {
  const { db, pote } = clienteComCookies();
  ok(await db.auth.signInWithPassword({ email, password: senha }), `entrar como ${email}`);
  if (totp) {
    const fatores = ok(await db.auth.mfa.listFactors(), "listar fatores");
    const fator = fatores.totp[0];
    ok(await db.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigoTotp(totp) }), "confirmar o código");
  }
  return { db, cookies: [...pote].map(([name, value]) => ({ name, value })) };
}

async function criarUsuario(admin, i) {
  const email = `carga-${String(i).padStart(3, "0")}-${randomBytes(3).toString("hex")}@balbina.test`;
  const senha = `Carga!${randomBytes(9).toString("base64url")}`;
  const termos = readFileSync(new URL("../src/lib/termos.ts", import.meta.url), "utf8").match(/VERSAO_TERMOS = "([^"]+)"/)?.[1];
  ok(await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: termos ? { termos_versao: termos, termos_aceitos_em: new Date().toISOString() } : {},
  }), `criar ${email}`);

  // app autenticador: o master nunca fica sem 2º fator no site de teste
  const { db } = clienteComCookies();
  ok(await db.auth.signInWithPassword({ email, password: senha }), `entrar como ${email}`);
  const fator = ok(await db.auth.mfa.enroll({ factorType: "totp", friendlyName: "Carga" }), "cadastrar autenticador");
  ok(await db.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigoTotp(fator.totp.secret) }), "confirmar autenticador");

  const empresa = ok(await db.rpc("criar_empresa", { p_cnpj: cnpjAleatorio(), p_razao_social: `Piscicultura Carga ${i} Ltda`, p_nome_fantasia: `Piscicultura Carga ${i}` }), "criar empresa");
  const setor = ok(await db.from("setores").insert({ empresa_id: empresa, nome: "Sede" }).select("id").single(), "setor");
  const especie = ok(await db.from("especies").select("id").is("empresa_id", null).eq("nome", "Tambaqui").single(), "espécie");
  const viveiros = [];
  for (const v of ["V1", "V2", "V3"]) {
    const viveiro = ok(await db.from("viveiros").insert({
      empresa_id: empresa, setor_id: setor.id, nome: v, finalidade: "engorda", sistema: "escavado", capacidade_peixes: 20000, area_m2: 10000,
    }).select("id").single(), "viveiro");
    ok(await db.rpc("povoar_lote", {
      p_empresa: empresa, p_codigo: `C${i}-${v}`, p_especie: especie.id, p_povoamento: dia(90), p_viveiro: viveiro.id, p_qtd: 15000, p_peso_inicial_g: 30,
    }), "povoar lote");
    viveiros.push(viveiro.id);
  }

  // ~30 dias de trato nos 3 viveiros (manhã e tarde) e títulos a pagar/receber, para as telas terem o que somar
  for (let d = 30; d >= 1; d--) {
    for (const v of viveiros) {
      for (const turno of ["manha", "tarde"]) {
        ok(await db.rpc("registrar_lancamento_campo", {
          p_empresa: empresa, p_viveiro: v, p_data: dia(d), p_turno: turno,
          p_mortes: Math.floor(Math.random() * 4), p_racao_kg: 60 + Math.floor(Math.random() * 30), p_client_id: randomUUID(),
        }), "lançamento do viveiro");
      }
    }
  }
  const cats = ok(await db.from("categorias").select("id, sentido, parent_id").eq("empresa_id", empresa).not("parent_id", "is", null), "categorias");
  const saida = cats.find((c) => c.sentido === "saida");
  const entrada = cats.find((c) => c.sentido === "entrada");
  for (let t = 0; t < 40; t++) {
    const pagar = t % 2 === 0;
    const cat = pagar ? saida : entrada;
    if (!cat) break;
    const valor = 10_000 + Math.floor(Math.random() * 500_000);
    ok(await db.rpc("agendar_titulo", {
      p_empresa: empresa, p_tipo: pagar ? "pagar" : "receber", p_descricao: `${pagar ? "Ração" : "Venda de peixe"} ${t}`,
      p_vencimento: dia(15 - t), p_competencia: dia(15 - t), p_valor_cents: valor,
      p_rateio: [{ categoria_id: cat.id, centro_custo_id: null, valor_cents: valor }],
    }), "título");
  }
  await db.auth.signOut({ scope: "local" });
  return { email, senha, totp: fator.totp.secret, empresa, viveiros };
}

const salvo = existsSync(ARQUIVO) ? JSON.parse(readFileSync(ARQUIVO, "utf8")) : null;
if (salvo && salvo.supabase !== URL_SB) parar(`carga/.sessoes.json é de outro banco (${salvo.supabase}). Apague o arquivo para recomeçar.`);
let usuarios = salvo?.usuarios ?? [];

if (!renovar) {
  const admin = createClient(URL_SB, SECRET, OPCOES);
  for (let i = usuarios.length + 1; i <= N; i++) {
    process.stdout.write(`Criando piscicultura/usuário ${i}/${N}... `);
    usuarios.push(await criarUsuario(admin, i));
    console.log("ok");
  }
}

// a sessão vale ~1 h: entra de novo com todos logo antes de rodar o k6
for (const u of usuarios) {
  const { cookies } = await entrar(u.email, u.senha, u.totp);
  u.cookies = cookies;
}
writeFileSync(ARQUIVO, JSON.stringify({ supabase: URL_SB, anon: ANON, geradoEm: new Date().toISOString(), usuarios }, null, 1));
console.log(`\nPronto: ${usuarios.length} sessões em carga/.sessoes.json (valem ~1 h; depois rode de novo com --renovar).`);
