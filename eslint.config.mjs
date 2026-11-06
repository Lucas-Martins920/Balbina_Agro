import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Skills de design instaladas para o Claude Code (código de terceiros).
    ".claude/**",
    // App de celular (Expo): tem lint e tsconfig próprios em mobile/.
    "mobile/**",
    // Código antigo do Balbina, guardado só como referência (na raiz ficaram os builds dele:
    // balbina-campo/android e os dist, código gerado que não é nosso para corrigir).
    "docs/legado/**",
    "balbina-backend/**",
    "balbina-campo/**",
    "balbina-gestao/**",
  ]),
]);

export default eslintConfig;
