@AGENTS.md

## Fluxo de trabalho: nada direto na produção

O `master` é produção e só recebe merge com aprovação do Nicolas. O teste fica no `Teste-Desevolvimento`. Detalhes e
configuração em `docs/fluxo-de-trabalho.md`.

- Crie o branch da thread a partir do `Teste-Desevolvimento` atualizado. **Sem PR por feature**: verifique tudo na máquina (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:db`; e `cd mobile && npm run lint && npm run typecheck && npm test` se mexeu no app nativo), faça rebase no `Teste-Desevolvimento` e leve com um push só (`git push origin HEAD:Teste-Desevolvimento`). A mensagem do commit é o registro da feature. Se o push no `Teste-Desevolvimento` for recusado, abra um PR com base `Teste-Desevolvimento` sem rótulo (não roda Actions) e mescle. O Nicolas vê as mudanças no **site de teste**: o `Teste-Desevolvimento` publicado na Vercel com um Supabase só de teste, atualizado a cada push (`docs/site-de-teste.md`); `npm run local` (`docs/rodar-local.md`) continua como opção.
- **Nunca** mescle, faça push ou abra merge automático no `master`, mesmo com a autonomia total do projeto. O consolidado é feito por uma thread só, com o "pode" do Nicolas: PR `Teste-Desevolvimento → master`, Action **Verificação** verde (roda tudo, com E2E) e merge com **squash** (um único commit); depois o `master` volta para o `Teste-Desevolvimento` por push direto (merge simples, sem PR e sem force push).
- Actions (`docs/fluxo-de-trabalho.md` > "Minutos do GitHub Actions"): um Action único, **Verificação** (`verificacao.yml`), roda só no PR para o `master`, em PR com rótulo `verificar` (sem E2E) ou `e2e` (com E2E) e à mão. Nada de workflow temporário de diagnóstico. Backup, migrations e webhooks seguem separados.
- Migrations rodam no banco de produção só no push do `master`, e só se o PR mesclado passou na Verificação; antes disso elas são testadas na máquina, vão para o banco do site de teste no push do `Teste-Desevolvimento` e passam na Verificação do consolidado (test:db e E2E com Supabase local).

## Domínio

O Balbina nasceu do ERP de avicultura FINAVI: a gestão, o financeiro, o fiscal, as vendas e o planejamento vieram de lá, e tudo o que era da granja virou piscicultura (tambaqui e outros peixes redondos). O vocabulário e as regras do peixe estão em `docs/piscicultura.md` (viveiro, lote, povoamento, trato, biometria, despesca, kg por classe, carência). Não traga de volta termos da granja (galpão, ave, ovo, cartela, postura, classificação de ovos). O código antigo do Balbina (`balbina-backend`, `balbina-campo`, `balbina-gestao`) fica só como referência em `docs/legado/`.

## Ferramentas do Claude Code

Configuradas em `.mcp.json` e `.claude/settings.json`; o que cada uma faz e o que precisa de chave está em `docs/ferramentas-claude.md`.

- **Context7** (MCP): antes de escrever código com Next.js 16, Supabase ou outra biblioteca, consulte a documentação atual pelo Context7.
- **Supabase** (MCP, só leitura): use para conferir schema, dados e advisors do banco (projeto em `BALBINA_SUPABASE_REF`). Mudança de schema continua sendo migration em `supabase/migrations/`.

## Superpowers (plugin)

O plugin `superpowers@claude-plugins-official` (obra/superpowers, MIT) fica ativo em `.claude/settings.json`. Toda thread usa as skills dele pelo fluxo que ele define:

- Antes de agir, confira se alguma skill `superpowers:*` se aplica e use (`superpowers:using-superpowers` explica a regra).
- Feature ou mudança de comportamento: `brainstorming` → `writing-plans` → `executing-plans` ou `subagent-driven-development`, com `test-driven-development` (teste vermelho antes do código).
- Bug ou teste falhando: `systematic-debugging` antes de propor correção.
- Antes de dizer que terminou, abrir PR ou fazer merge: `verification-before-completion` (rodar `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:db` conforme o que mudou) e `requesting-code-review`.
- Comentário de revisão recebido: `receiving-code-review`.
- Verificação ou auditoria de segurança (do PR ou do sistema): skill do projeto `verificacao-seguranca`, que roda a `security-audit` da Cloudflare junto com as da Trail of Bits/NVIDIA e a `security-review` do Claude Code.
- As regras deste arquivo e de AGENTS.md continuam valendo: subagentes só quando a skill pede, em português, e as perguntas de `brainstorming` respondidas pela própria thread quando o usuário não estiver (autonomia total do projeto).

## graphify

O grafo do código fica em graphify-out/ (fora do git; o hook de início de sessão o regenera).

- Quando graphify-out/graph.json existir, rode `graphify query "<pergunta>"` antes do primeiro grep ou leitura de arquivo numa pergunta sobre o código, e repita esta regra no prompt de todo subagente que explore código. Leia arquivos crus só nas linhas que o grafo ou uma leitura anterior já localizou. Use `graphify path "<A>" "<B>"` para relações e `graphify explain "<conceito>"` para um conceito.
- graphify-out/GRAPH_REPORT.md só para revisão ampla de arquitetura.
- Depois de mudar código, rode `graphify update .` (só AST, sem custo de API).

## Documentação do código

`docs/codigo/` explica como o código funciona (arquitetura, convenções para tela/ação/migration, banco e RLS, módulos, integrações, testes e operação). Leia `docs/codigo/convencoes.md` antes de criar tela, ação ou migration. Ao mudar um fluxo descrito lá (ex.: uma regra do banco, uma integração), atualize o arquivo no mesmo commit.

## Mapa do código

`docs/mapa-codigo/` (abrir `mapa.html` no navegador, com busca) diz onde fica cada tela, função, componente, rota de API e objeto do banco, e quem usa cada um. É gerado por `npm run mapa` (`scripts/mapa-codigo.mjs`); não edite à mão.

- Rode `npm run mapa` ao criar, renomear ou apagar telas, funções exportadas ou objetos do banco, e no consolidado para o `master`.
- Conflito de merge em `docs/mapa-codigo/`: rode `npm run mapa` de novo e aceite o resultado.
- `npm run mapa -- --conferir` só confere se está em dia (sai com erro se não).
