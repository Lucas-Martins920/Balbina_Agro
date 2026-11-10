#!/usr/bin/env node
// Limites rígidos de RAM e CPU nos contêineres do Supabase local (docs/ambiente-leve.md).
// O supabase/config.toml não tem campo para isso, e o supabase stop apaga os contêineres (os limites iriam junto),
// então o npm run local chama este script logo depois do supabase start. Também roda sozinho:
//   node scripts/limites-docker.mjs           aplica os limites
//   node scripts/limites-docker.mjs --ver     só mostra o consumo atual (docker stats)
// Medido em 2026-11-10 com o banco de teste: tudo parado ocupa ~600 MB (db ~95, kong ~95, studio ~235,
// postgres-meta ~150, auth/rest/mailpit ~10 cada). Os tetos abaixo dão folga para migrations e relatórios.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const windows = process.platform === "win32";

// serviço (sufixo do nome do contêiner) -> [memória, CPUs]
export const LIMITES = {
  db: ["1g", "1.5"],
  kong: ["256m", "0.5"],
  auth: ["128m", "0.5"],
  rest: ["128m", "0.5"],
  studio: ["512m", "0.5"],
  pg_meta: ["256m", "0.5"],
  inbucket: ["64m", "0.25"],
};

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf8", shell: windows });
}

export function aplicarLimites({ silencioso = false } = {}) {
  const projeto = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const ligados = new Set(docker(["ps", "--format", "{{.Names}}"]).stdout?.split(/\r?\n/).filter(Boolean) ?? []);
  for (const [servico, [memoria, cpus]] of Object.entries(LIMITES)) {
    const nome = `supabase_${servico}_${projeto}`;
    if (!ligados.has(nome)) continue;
    // --memory-swap igual à memória: o contêiner não empurra o resto do notebook para o swap
    const r = docker(["update", "--memory", memoria, "--memory-swap", memoria, "--cpus", cpus, nome]);
    if (!silencioso) console.log(`  ${r.status === 0 ? "✓" : "✖"} ${servico.padEnd(9)} ${memoria.padStart(5)} RAM, ${cpus} CPU${r.status === 0 ? "" : `  (${r.stderr.trim()})`}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--ver")) aplicarLimites();
  spawnSync("docker", ["stats", "--no-stream", "--format", "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"], { stdio: "inherit", shell: windows });
}
