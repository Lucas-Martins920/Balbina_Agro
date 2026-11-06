## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

## Projeto

- Domínio: piscicultura (tambaqui e outros peixes redondos). Vocabulário, regras e referências técnicas (Embrapa) em `docs/piscicultura.md`; o app de campo (`/campo`) também está descrito lá.
- Banco: migrations em `supabase/migrations/`, testes em `supabase/tests/` (`npm run test:db`). Regras de negócio críticas ficam no banco (triggers/constraints) e têm teste.
- Toda tabela nova com `empresa_id` precisa de RLS + policy `membros`, e a migration termina com `select app.travar_referencias();` (confere que as chaves estrangeiras apontam para a mesma empresa; o teste `99_isolamento_empresas.sql` falha sem isso).
- Interface em português do Brasil.
- Visual: siga `DESIGN.md` (tokens de globals.css e primitivos de `src/components/ui.tsx`, sem cores fixas).
- App nativo (Expo) em `mobile/`: cores só pelos tokens (`npm run tokens:celular` na raiz), regras puras compartilhadas com o site por `@regras/` (`mobile/README.md`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
