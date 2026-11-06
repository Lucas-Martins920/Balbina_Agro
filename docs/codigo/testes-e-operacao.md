# Testes e operação

## Os quatro tipos de teste

| Comando | O que testa | Onde | Precisa |
|---|---|---|---|
| `npm test` | Regras puras em TypeScript (`node:test`) | `src/lib/**/*.test.ts` | Só Node |
| `npm run test:db` | Todas as migrations num Postgres limpo + as regras do banco (triggers, RLS, funções) | `supabase/tests/*.sql` | `DATABASE_URL` de um Postgres descartável (o `npm run local` já sobe um) |
| `npm run test:e2e` | O app inteiro no navegador, com Supabase Auth e banco de verdade | `e2e/*.spec.ts` ([README](../../e2e/README.md)) | Supabase local + Playwright |
| `npm run lint`, `npm run typecheck`, `npm run build` | Estilo, tipos e build do Next | — | — |

Antes de enviar uma mudança, rode os que cobrem o que você mexeu. Mudou o banco: `test:db`. Mudou uma tela: `lint`, `typecheck` e `build`, e o E2E se o fluxo muda.

### Como é um teste do banco

`scripts/test-db.sh` cria um banco temporário, roda `00_prelude_postgres.sql` (que imita o `auth` do Supabase), aplica as migrations em ordem e executa cada `supabase/tests/[1-9]*.sql`. Cada arquivo:

```sql
\set ON_ERROR_STOP on
create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void ... -- "ok - mensagem" ou FALHOU
create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) ...      -- confere a mensagem do erro
insert into auth.users (id, email, email_confirmed_at) values ('...', 'master@x.com', now());
set role authenticated;
set request.jwt.claim.sub = '...';   -- age como esse usuário, passando pelo RLS
select pg_temp.ok(..., 'regra X vale');
select pg_temp.espera_erro($$ insert ... $$, 'mensagem esperada');
```

Testes que valem para o sistema inteiro e costumam falhar com tabela nova:

- `99_isolamento_empresas.sql`: toda FK presa à mesma empresa (`app.travar_referencias()`).
- `99_lapidacao.sql`: índice em toda FK, `(select auth.uid())` nas policies, uma policy permissiva por ação.
- `99_desempenho.sql`: funções usadas linha a linha não refazem o RLS.
- `99_funcoes_sem_anon.sql`: `anon` não executa função nenhuma.
- `99_historico.sql`: o histórico está ligado nas tabelas da empresa.

## Onde o código roda

| Ambiente | App | Banco |
|---|---|---|
| Local (`npm run local`) | `next dev` na porta 3000 | Supabase no Docker, com a conta de teste (`admin@balbina.local`). `npm run local:zerar` recria. Guia: [`docs/rodar-local.md`](../rodar-local.md) |
| Site de teste | preview da Vercel do branch `Teste-Desevolvimento`, atualizado a cada push | Supabase só de teste. Guia: [`docs/site-de-teste.md`](../site-de-teste.md) |
| Produção | Vercel, branch `master` (região `gru1`) | Supabase da produção (`BALBINA_REF_PRODUCAO`), em `sa-east-1` |

Os previews dos outros branches ficam desligados (`scripts/vercel-ignorar.sh`). Para criar a produção e o teste do
zero (o Balbina não usa nada do FINAVI: banco, domínio e contas são novos), siga [`docs/colocar-no-ar.md`](../colocar-no-ar.md).

## Do commit à produção

Resumo de [`docs/fluxo-de-trabalho.md`](../fluxo-de-trabalho.md):

1. Branch a partir do `Teste-Desevolvimento`. Verificação local completa. Push direto no `Teste-Desevolvimento`, sem PR por feature. O site de teste se atualiza sozinho (e o `migracoes.yml` leva migration nova ao banco de teste).
2. **Consolidado** com o "pode" do Nicolas: PR `Teste-Desevolvimento → master`. O Action **Verificação** (`.github/workflows/verificacao.yml`) roda lint, tipos, testes, build, `test:db`, E2E e NF-e em homologação. Depois vem o merge com **squash**.
3. O push no `master` faz a Vercel publicar e o workflow `migracoes.yml` aplicar as migrations novas na produção (`scripts/aplicar-migracoes.sh`). Ele só aplica se o PR mesclado passou na Verificação.
4. O `master` volta para o `Teste-Desevolvimento` por push direto.

Nunca se faz push nem merge no `master` fora desse fluxo.

## Workflows do GitHub Actions

| Workflow | Quando | Faz |
|---|---|---|
| `verificacao.yml` | PR para o `master`, rótulos `verificar`/`e2e`, à mão | Toda a verificação |
| `migracoes.yml` | push no `master` ou no `Teste-Desevolvimento` que mexe em migration, à mão | Aplica as migrations na produção (`master`) ou no banco do site de teste (`Teste-Desevolvimento`, `SUPABASE_DB_URL_TESTES`) |
| `backup.yml` | diário | Backup cifrado do banco (`scripts/backup-banco.sh`) + teste de restauração (`scripts/test-backup.sh`). Ver [`docs/backup.md`](../backup.md) |
| `webhooks.yml` | diário | Reserva da entrega dos webhooks da API |

Os minutos do Actions são contados. Por isso a Verificação não roda em cada push.

## Ferramentas de navegação no código

- **Mapa do código** (`npm run mapa` → [`docs/mapa-codigo/`](../mapa-codigo/README.md)): onde está cada coisa e quem usa. Rode de novo ao criar, renomear ou apagar tela, função exportada ou objeto do banco. `npm run mapa -- --conferir` só confere.
- **graphify** (`graphify-out/`, fora do git): grafo para perguntas do tipo "o que chama o quê" (`graphify query`, `graphify path`).
- **Supabase MCP** (só leitura): conferir schema e advisors da produção. Configurado em `.mcp.json`.

## Operação e emergências

| Situação | Onde |
|---|---|
| Tirar o app do ar para manutenção (telas e APIs respondem 503) | `BALBINA_MANUTENCAO=1` na Vercel (`src/lib/manutencao.ts`) |
| Restaurar o banco | [`docs/backup.md`](../backup.md) e `scripts/restaurar-backup.sh`. Recadastre os segredos do Vault (`balbina_url`, `cron_secret`) |
| Trocar o banco de servidor | O caminho usado no FINAVI: [`docs/legado/finavi/migrar-sao-paulo.md`](../legado/finavi/migrar-sao-paulo.md) (backup, restauração e troca das chaves) |
| Domínio próprio | [`docs/dominio-proprio.md`](../dominio-proprio.md) |
| Asaas de produção | [`docs/asaas-producao.md`](../asaas-producao.md) |
| Segurança (captcha, MFA, alarmes, auditorias) | [`docs/seguranca-e-assinatura.md`](../seguranca-e-assinatura.md); verificação com a skill `verificacao-seguranca` |
