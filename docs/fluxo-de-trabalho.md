# Fluxo de trabalho: Teste-Desevolvimento → produção

O Balbina herdou do FINAVI a regra de que nada vai direto para a produção. O trabalho se acumula no branch
`Teste-Desevolvimento` e só vai para o `master` (produção) no consolidado, num commit único, com a aprovação do Nicolas.

Para ver as alterações antes da produção há o **site de teste**: o branch `Teste-Desevolvimento` publicado na Vercel
com um Supabase só de teste, atualizado a cada push ([docs/site-de-teste.md](site-de-teste.md)). Quem preferir roda
na própria máquina com um banco local: [docs/rodar-local.md](rodar-local.md) (`npm run local`).

| | Teste | Produção |
|---|---|---|
| Branch | `Teste-Desevolvimento` | `master` |
| Onde ver | site de teste (preview do `Teste-Desevolvimento`, [site-de-teste.md](site-de-teste.md)) ou na sua máquina: http://localhost:3000 (`npm run local`) | o endereço de produção da Vercel (variável `BALBINA_URL` do repositório) |
| Banco | Supabase de teste (site de teste) ou local no Docker | projeto Supabase da produção (o Reference ID fica em `BALBINA_REF_PRODUCAO`) |
| Migrations | no banco de teste pelo Action no push do `Teste-Desevolvimento` (`SUPABASE_DB_URL_TESTES`); no local pelo `npm run local`; a Verificação testa todas no consolidado (`test:db` e E2E com Supabase local) | só no push do `master`, conferindo que o PR do consolidado passou na Verificação (secret `SUPABASE_DB_URL`) |
| Quem leva o código | a própria thread, com merge direto (sem PR), depois de verificar na máquina | só com o "pode" do Nicolas, um commit único (squash) por consolidado |

A Vercel publica o `master` (produção) e o `Teste-Desevolvimento` (site de teste); o `vercel.json` (`ignoreCommand`,
`scripts/vercel-ignorar.sh`) pula o preview dos outros branches.

## Como cada thread trabalha (sem PR por feature)

Menos Actions e menos PRs: do mesmo jeito que os merges para a produção são consolidados, a verificação completa no
GitHub roda uma vez só, no PR do consolidado.

1. Comece do `Teste-Desevolvimento` atualizado (`git fetch origin Teste-Desevolvimento`) e crie o branch da thread a partir dele.
2. Verifique tudo na máquina antes de levar: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
   e `npm run test:db` (e `npx playwright test` com `npm run local` ligado, se mexeu em fluxo crítico). Mexeu no
   app nativo? `cd mobile && npm run lint && npm run typecheck && npm test`.
3. **Não abra PR.** Mescle direto no `Teste-Desevolvimento` e faça um push só:
   `git fetch origin Teste-Desevolvimento && git rebase origin/Teste-Desevolvimento` no branch da thread, depois
   `git push origin HEAD:Teste-Desevolvimento` (se o push for recusado porque outra thread entrou antes, repita o rebase).
   A mensagem do commit é o registro da feature (o que mudou e por quê), já que não há PR.
4. Se a thread não conseguir fazer push no `Teste-Desevolvimento`, abre um PR com base `Teste-Desevolvimento` e mescla;
   ele não roda Actions (sem rótulo), então pode mesclar sem esperar check.
5. Mudança arriscada que precisa do GitHub para ser testada (E2E de login, PDV, financeiro, API, que a máquina
   não consegue rodar)? Aí sim um PR para o `Teste-Desevolvimento` com o rótulo **`verificar`** (sem E2E) ou **`e2e`** (com E2E).
6. **Nunca** mescle nem faça push no `master`. O consolidado é feito por uma thread só, com o "pode" do Nicolas:
   abrir o PR `Teste-Desevolvimento → master` com a lista do que entrou (os commits desde o último consolidado),
   esperar a Verificação verde (que roda tudo, com E2E) e mesclar com **squash**. Se a Verificação falhar,
   a correção vai para o `Teste-Desevolvimento` antes do merge.
7. Logo depois, a volta do `master` para o `Teste-Desevolvimento` também é sem PR:
   `git fetch origin && git checkout -B volta origin/Teste-Desevolvimento && git merge origin/master && git push origin HEAD:Teste-Desevolvimento`
   (merge simples, sem force push). As migrations do consolidado rodam no banco de produção no push do `master`.
8. Correção urgente na produção: só com pedido explícito do Nicolas; branch a partir do `master`, PR para o `master`
   com a Verificação verde (as migrations só rodam se ela passou) e depois a volta do `master` para o `Teste-Desevolvimento`.

## Minutos do GitHub Actions

O repositório é privado: os minutos do Actions são uma cota mensal. No FINAVI, de onde o Balbina veio, o E2E (~7 min
cobrados por rodada) e o CI (~5 min) eram ~90% do gasto, com 2 ou 3 Actions por PR. Por isso fica um Action só:

| Workflow | Quando roda |
|---|---|
| Verificação (`verificacao.yml`) | Um Action só, jobs `app` (tipos, lint, testes, build, E2E e NF-e quando cabem) e `banco` (test:db). Roda no PR `Teste-Desevolvimento → master` (tudo, com E2E), em PR com rótulo `verificar` (sem E2E) ou `e2e` (com E2E) e à mão. Não roda em rascunho, em PR sem rótulo para o `Teste-Desevolvimento`, em mudança só de documentação nem no push do `master`. Push novo no PR cancela o anterior. O teste da NF-e só entra quando `src/lib/focus-mapa.ts` ou `scripts/focus-homologacao.ts` mudam no PR. |
| Migrations (`migracoes.yml`) | push do `master` que mexe em `supabase/migrations/` (produção, depois de conferir que o PR mesclado passou nos jobs `app` e `banco`); push do `Teste-Desevolvimento` que mexe em migration (banco do site de teste, ~1 min); e à mão (escolhendo o banco). |
| Backup (`backup.yml`) | 1x por dia (03:00 de Brasília). Fica separado: é agendado e usa os segredos da produção. Sem os secrets, avisa e não faz nada. |
| Webhooks (`webhooks.yml`) | reserva 1x por dia (quem entrega a cada 5 min é o pg_cron do Supabase, com a rotina da Vercel de reserva). Sem a variável `BALBINA_URL`, não faz nada. |
| Dependabot | mensal, com base no `Teste-Desevolvimento`, sem rebase automático. O PR dele não roda Actions sozinho: a thread que juntar as atualizações verifica na máquina (ou põe o rótulo `verificar`). |

Regras:

1. Nada de workflow temporário (de diagnóstico, por exemplo): cada push num branch com ele é uma rodada. Diagnostique na máquina.
2. O que mais economiza é o ritmo: cada consolidado custa ~10 min (Verificação com E2E + migrations).
3. PR só de documentação não roda nada.

## O que configurar no GitHub (uma vez)

**Proteger o `master`**: Settings > Rules > Rulesets > New branch ruleset, alvo `master`:
marque "Restrict deletions", "Block force pushes" e "Require a pull request before merging"
com 1 aprovação. Opcional: Settings > General > Default branch = `Teste-Desevolvimento`, para PRs novos já nascerem com a base certa.

**Secrets e variáveis do repositório** (Settings > Secrets and variables > Actions):

| Nome | Tipo | Para quê |
|---|---|---|
| `SUPABASE_DB_URL` | secret | migrations e backup da produção |
| `SUPABASE_DB_URL_TESTES` | secret | migrations do banco do site de teste |
| `BACKUP_SENHA` | secret | cifra o backup diário ([backup.md](backup.md)) |
| `BALBINA_URL` | variável | endereço da produção, para a reserva diária dos webhooks |

As rotinas da Vercel (`vercel.json`), o backup diário e a entrega de webhooks são só da produção (o site de teste não tem).
