#!/usr/bin/env node
// Confere se o que o site (src/) e o app (mobile/src/) pedem ao banco existe depois das migrations:
// as tabelas de .from("..."), as colunas de .from("...").select("...") (com os embutidos, como
// "lotes(codigo)") e as funções de .rpc("..."). Pega o nome antigo que ficou no código depois de uma
// migration renomear ou apagar uma coluna: o Supabase só devolveria erro na hora, e a tela, vazia.
// Roda dentro do npm run test:db, logo depois das migrations. Uso: node scripts/conferir-consultas.mjs <DATABASE_URL>
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2];
if (!url) {
  console.error("uso: node scripts/conferir-consultas.mjs <DATABASE_URL>");
  process.exit(2);
}

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PASTAS = ["src", "mobile/src"];
const IGNORAR = new Set(["node_modules", ".next", ".expo"]);

function consultar(sql) {
  return execFileSync("psql", [url, "-X", "-A", "-t", "-c", sql], { encoding: "utf8" }).trim();
}

// Colunas de cada tabela e visão do schema public, e os nomes das funções do public
const colunas = new Map(
  Object.entries(JSON.parse(consultar(
    "select coalesce(json_object_agg(table_name, cols), '{}') from (select table_name, json_agg(column_name::text) cols " +
    "from information_schema.columns where table_schema = 'public' group by 1) x",
  ))).map(([t, c]) => [t, new Set(c)]),
);
const funcoes = new Set(consultar(
  "select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
).split("\n").filter(Boolean));

const arquivos = [];
function andar(pasta) {
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) andar(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) arquivos.push(p);
  }
}
for (const p of PASTAS) andar(path.join(raiz, p));

// Divide "a, b(c, d), e" nas vírgulas de fora dos parênteses
function itens(lista) {
  const out = [];
  let nivel = 0, atual = "";
  for (const c of lista) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) { out.push(atual.trim()); atual = ""; } else atual += c;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}

const problemas = [];
let selects = 0;

function conferirSelect(tabela, lista, onde) {
  const deTabela = colunas.get(tabela);
  if (!deTabela) return;
  for (const bruto of itens(lista)) {
    const item = bruto.replace(/\s+/g, " ").replace(/^\.\.\./, "").trim();
    if (!item || item === "*") continue;
    // embutido: "rel(...)", "apelido:rel(...)", "rel!fk(...)", "rel!inner(...)"
    const emb = item.match(/^(?:[a-z_0-9]+:)?([a-z_0-9]+)(?:![a-z_0-9]+)*\s*\(([\s\S]*)\)$/);
    if (emb) {
      const [, rel, dentro] = emb;
      if (rel === "count") continue;
      if (colunas.has(rel)) conferirSelect(rel, dentro, `${onde} > ${rel}`);
      else if (!deTabela.has(rel)) problemas.push(`${onde}: "${rel}" não é tabela nem coluna de ${tabela}`);
      continue;
    }
    const coluna = item
      .replace(/^[a-z_0-9]+:/, "") // apelido
      .replace(/::[a-z_0-9]+$/, "") // conversão de tipo
      .replace(/->.*$/, "") // campo do json
      .replace(/\.(sum|avg|min|max|count)\(\)$/, "") // agregação
      .trim();
    if (coluna === "count()" || coluna === "count") continue;
    if (!/^[a-z_0-9]+$/.test(coluna)) problemas.push(`${onde}: não entendi "${item}"`);
    else if (!deTabela.has(coluna)) problemas.push(`${onde}: a coluna "${coluna}" não existe em ${tabela}`);
  }
}

for (const arquivo of arquivos) {
  const texto = readFileSync(arquivo, "utf8");
  const nome = path.relative(raiz, arquivo);
  const linha = (i) => texto.slice(0, i).split("\n").length;

  for (const m of texto.matchAll(/(?<!storage|Array|Buffer)\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g)) {
    if (!colunas.has(m[1])) problemas.push(`${nome}:${linha(m.index)}: a tabela "${m[1]}" não existe`);
  }
  for (const m of texto.matchAll(/(?<!storage|Array|Buffer)\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)\s*\.select\(\s*(["'`])([\s\S]*?)\2/g)) {
    if (m[3].includes("${")) continue;
    selects++;
    conferirSelect(m[1], m[3], `${nome}:${linha(m.index)}`);
  }
  for (const m of texto.matchAll(/\.rpc\(\s*["'`]([a-z_0-9]+)["'`]/g)) {
    if (!funcoes.has(m[1])) problemas.push(`${nome}:${linha(m.index)}: a função "${m[1]}" não existe`);
  }
}

if (problemas.length) {
  for (const p of problemas) console.log(`FALHOU - consulta do código: ${p}`);
  process.exit(1);
}
console.log(`ok - as consultas do código batem com o banco (${selects} selects em ${arquivos.length} arquivos)`);
