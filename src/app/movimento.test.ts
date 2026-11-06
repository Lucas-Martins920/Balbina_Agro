import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function blocoMovimentoReduzido(): string {
  const inicio = css.indexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(inicio >= 0, "globals.css precisa do bloco prefers-reduced-motion");
  return css.slice(inicio, css.indexOf("\n}\n", inicio));
}

// Com "reduzir movimento" ligado (Windows com efeitos de animação desligados, economia de bateria, macOS),
// encurtar a duração sem limitar as repetições fazia toda animação infinita, como o reflexo do esqueleto
// das tabelas, rodar milhares de vezes por segundo e piscar.
test("movimento reduzido não deixa animação infinita disparar", () => {
  assert.match(blocoMovimentoReduzido(), /animation-iteration-count:\s*1\s*!important/);
});

test("movimento reduzido tira o reflexo do esqueleto", () => {
  assert.match(blocoMovimentoReduzido(), /\.esqueleto::after\s*\{[^}]*display:\s*none/);
});
