import { test } from "node:test";
import assert from "node:assert/strict";
import eslintConfig from "../../eslint.config.mjs";

test("eslint bloqueia app em src/lib", () => {
  const configs = Array.isArray(eslintConfig) ? eslintConfig : [eslintConfig];
  const cfg = configs.find((entry) => entry && typeof entry === "object" && "files" in entry && Array.isArray(entry.files) && entry.files.some((file) => file.includes("src/lib")));

  assert.ok(cfg, "configuração de src/lib encontrada");
  const regra = cfg?.rules?.["no-restricted-imports"];
  const texto = JSON.stringify(regra ?? {});
  assert.match(texto, /@\/app|src\/app/);
});
