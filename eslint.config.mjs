import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "@/app/*"],
              message: "As regras em src/lib não podem importar a camada src/app; isso quebra a fronteira entre negócio e UI/rotas.",
            },
            {
              group: ["src/app/**", "src/app/*"],
              message: "As regras em src/lib não podem depender do código da camada app.",
            },
          ],
        },
      ],
    },
  },
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
    // Código antigo do Balbina, guardado só como referência.
    "docs/legado/**",
  ]),
]);

export default eslintConfig;
