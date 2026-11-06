// Gera mobile/src/tema/tokens.ts a partir dos tokens de src/app/globals.css (blocos :root e
// :root[data-theme="dark"]), para o app de celular usar exatamente as mesmas cores do site.
// Uso: npm run tokens:celular            (gera)
//      npm run tokens:celular -- --conferir  (sai com erro se o arquivo estiver desatualizado)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(raiz, "src/app/globals.css"), "utf8");
const destino = join(raiz, "mobile/src/tema/tokens.ts");

function bloco(seletor) {
  const inicio = css.indexOf(`${seletor} {`);
  if (inicio < 0) throw new Error(`Bloco ${seletor} não encontrado em globals.css`);
  const fim = css.indexOf("}", inicio);
  const tokens = {};
  for (const m of css.slice(inicio, fim).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, nome, valor] = m;
    // cores apenas: sombras e curvas de animação são do CSS e não valem no React Native
    if (/^(#|rgb)/.test(valor.trim())) tokens[nome.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = valor.trim();
  }
  return tokens;
}

// "rgb(255 255 255 / 0.4)" → "rgba(255, 255, 255, 0.4)", que o React Native entende
function corRN(v) {
  const m = v.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${m[4]})` : v;
}

const claro = bloco(":root");
const escuro = bloco(':root[data-theme="dark"]');
const nomes = Object.keys(claro).filter((n) => n in escuro);
const linhas = (t) => nomes.map((n) => `    ${n}: ${JSON.stringify(corRN(t[n]))},`).join("\n");
const saida = `// Gerado por scripts/tokens-celular.mjs a partir de src/app/globals.css. Não edite à mão:
// mude a cor no globals.css e rode \`npm run tokens:celular\` na raiz do repositório.
export const CORES = {
  claro: {
${linhas(claro)}
  },
  escuro: {
${linhas(escuro)}
  },
} as const;

export type Cores = { [K in keyof (typeof CORES)["claro"]]: string };
`;

if (process.argv.includes("--conferir")) {
  let atual = "";
  try {
    atual = readFileSync(destino, "utf8");
  } catch {}
  if (atual !== saida) {
    console.error("mobile/src/tema/tokens.ts está desatualizado: rode npm run tokens:celular");
    process.exit(1);
  }
  console.log("Tokens do celular em dia.");
} else {
  writeFileSync(destino, saida);
  console.log(`Gerado ${destino} (${nomes.length} cores).`);
}
