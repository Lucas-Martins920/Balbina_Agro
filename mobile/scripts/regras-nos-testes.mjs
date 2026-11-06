// Nos testes (node --test), resolve o atalho @regras/ para ../src/lib, como o metro.config.js faz no app.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
const raiz = ${JSON.stringify(new URL("../../src/lib/", import.meta.url).href)};
export async function resolve(nome, contexto, proximo) {
  if (nome.startsWith("@regras/")) return proximo(raiz + nome.slice("@regras/".length), contexto);
  return proximo(nome, contexto);
}`),
);
