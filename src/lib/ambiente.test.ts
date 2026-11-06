import { test } from "node:test";
import assert from "node:assert/strict";
import { ambiente } from "./ambiente.ts";

const BANCO_LOCAL = "http://127.0.0.1:54321";
const REF_PRODUCAO = "producaobalbina00000";
const BANCO_PRODUCAO = `https://${REF_PRODUCAO}.supabase.co`;
const BANCO_TESTE = "https://abcdefghijklmnopqrst.supabase.co";

test("produção na Vercel e build local (next start) não contam como fora da produção", () => {
  assert.deepEqual(ambiente({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: BANCO_PRODUCAO }), {
    foraDaProducao: false,
    bancoProducao: true,
    siteTeste: false,
  });
  assert.equal(ambiente({ NODE_ENV: "production" }).foraDaProducao, false);
});

test("npm run dev na máquina é fora da produção", () => {
  assert.deepEqual(ambiente({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: BANCO_LOCAL }), {
    foraDaProducao: true,
    bancoProducao: false,
    siteTeste: false,
  });
});

test("preview da Vercel é fora da produção", () => {
  assert.equal(ambiente({ NODE_ENV: "production", VERCEL_ENV: "preview" }).foraDaProducao, true);
});

test("avisa quando a máquina aponta para o banco de produção", () => {
  assert.equal(ambiente({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: BANCO_PRODUCAO }).bancoProducao, true);
});

test("sem a marca de site de teste, qualquer projeto Supabase na nuvem conta como produção", () => {
  assert.equal(ambiente({ NODE_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: BANCO_TESTE }).bancoProducao, true);
});

test("site de teste: preview com BALBINA_AMBIENTE=testes ligado ao banco de teste", () => {
  assert.deepEqual(ambiente({ NODE_ENV: "production", VERCEL_ENV: "preview", BALBINA_AMBIENTE: "testes", NEXT_PUBLIC_SUPABASE_URL: BANCO_TESTE }), {
    foraDaProducao: true,
    bancoProducao: false,
    siteTeste: true,
  });
});

test("site de teste ligado por engano ao banco de produção continua avisando", () => {
  const r = ambiente({ NODE_ENV: "production", VERCEL_ENV: "preview", BALBINA_AMBIENTE: "testes", BALBINA_REF_PRODUCAO: REF_PRODUCAO, NEXT_PUBLIC_SUPABASE_URL: BANCO_PRODUCAO });
  assert.equal(r.bancoProducao, true);
  // sem o ref de produção cadastrado, a marca de teste decide
  assert.equal(ambiente({ VERCEL_ENV: "preview", BALBINA_AMBIENTE: "testes", NEXT_PUBLIC_SUPABASE_URL: BANCO_PRODUCAO }).bancoProducao, false);
});

test("vários refs de produção separados por vírgula", () => {
  const env = { VERCEL_ENV: "preview", BALBINA_AMBIENTE: "testes", BALBINA_REF_PRODUCAO: ` outroref000, ${REF_PRODUCAO} ` };
  assert.equal(ambiente({ ...env, NEXT_PUBLIC_SUPABASE_URL: BANCO_PRODUCAO }).bancoProducao, true);
  assert.equal(ambiente({ ...env, NEXT_PUBLIC_SUPABASE_URL: BANCO_TESTE }).bancoProducao, false);
});

test("a marca de site de teste não vale na produção", () => {
  const r = ambiente({ NODE_ENV: "production", VERCEL_ENV: "production", BALBINA_AMBIENTE: "testes", NEXT_PUBLIC_SUPABASE_URL: BANCO_PRODUCAO });
  assert.equal(r.siteTeste, false);
  assert.equal(r.bancoProducao, true);
});
