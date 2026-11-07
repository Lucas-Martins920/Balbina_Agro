import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { COMPONENTES_CUSTO } from "./titulos.ts";

// A tela de categorias grava categorias.componente_custo com as chaves de COMPONENTES_CUSTO: elas têm de ser
// as que a regra do banco aceita (vale a última migration que define a regra). Com uma chave a mais, salvar
// dava erro; com uma a menos, a categoria de alevinos abria sem a opção e trocava de componente ao salvar.
test("componentes do custo do kg batem com a regra do banco", () => {
  const pasta = "supabase/migrations";
  let banco: string[] = [];
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) {
    for (const m of readFileSync(`${pasta}/${arquivo}`, "utf8").matchAll(/check \(componente_custo in \(([^)]*)\)\)/g)) {
      banco = [...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]);
    }
  }
  assert.ok(banco.length > 0, "regra de categorias.componente_custo não encontrada nas migrations");
  assert.deepEqual(Object.keys(COMPONENTES_CUSTO).sort(), banco.sort());
});
