# Ferramentas do Claude Code neste repositório

O que já vem configurado quando o Claude Code abre este projeto (local ou na nuvem), e o que depende de você.

| Ferramenta | Situação | Onde |
|---|---|---|
| Agent Skills (anthropics/skills) | `frontend-design` e `webapp-testing` instaladas; o resto do catálogo fica disponível em `/plugin` | `.claude/skills/`, `.claude/settings.json` |
| Context7 | Ativo, funciona sem chave (com limite) | `.mcp.json` |
| Graphify | Ativo: o hook de início de sessão instala (na nuvem) e gera o grafo em `graphify-out/` | `.claude/hooks/`, `CLAUDE.md` |
| 21st.dev Magic | Configurado, precisa da sua chave | `.mcp.json` |
| Superpowers (obra/superpowers, MIT) | Plugin ativo: TDD, planos, depuração sistemática, revisão de código, verificação antes de concluir; o uso está em `CLAUDE.md` | `.claude/settings.json` |
| Claude Code Setup | Plugin ativo (`/claude-code-setup:claude-automation-recommender`) | `.claude/settings.json` |
| Supabase MCP (sugestão do Claude Code Setup) | Configurado em modo só leitura, no projeto de `BALBINA_SUPABASE_REF`; pede login no primeiro uso | `.mcp.json` |
| Proteção do `.env` (sugestão do Claude Code Setup) | Hook que impede o Claude de editar `.env*` | `.claude/hooks/protege-env.sh` |
| Claude Mem | Disponível, não ativado (ver abaixo) | `.claude/settings.json` |
| Headroom | Já ativo na sua conta do Claude; proxy local é opcional | — |
| Task Observer | Não instalado (ver abaixo) | — |
| OmniRoute | Não instalado (ver abaixo) | — |
| FreeLLMAPI | Não instalado no repo; só faz sentido no seu computador (ver abaixo) | — |

## Skills do ecossistema (find-skills)

Instaladas com o CLI da Vercel (`npx skills add ... -a claude-code --copy`), revisadas antes e registradas em `skills-lock.json`. Para atualizar todas: `npx skills update -p`. Para procurar outras: peça ao Claude ou rode `npx skills find <tema>` (a busca usa o skills.sh, que a rede da nuvem bloqueia; no seu computador funciona).

| Skill | Fonte | Para quê |
|---|---|---|
| `find-skills` | vercel-labs/skills | Procura e instala skills novas quando aparecer uma necessidade |
| `vercel-react-best-practices` | vercel-labs/agent-skills | Regras de desempenho de React e Next.js (waterfalls, bundle, server components) |
| `supabase` | supabase/agent-skills | Auth, RLS, SSR com `@supabase/ssr`, checklist de segurança do Supabase |
| `supabase-postgres-best-practices` | supabase/agent-skills | Schema, índices, migrations, RLS e desempenho de consultas no Postgres |
| `differential-review` | trailofbits/skills | Revisão de segurança focada no diff de um PR |
| `sharp-edges` | trailofbits/skills | Acha APIs e configurações perigosas por padrão (cripto, auth, defaults inseguros) |
| `supply-chain-risk-auditor` | trailofbits/skills | Audita as dependências do npm: vulnerabilidades por versão, pacotes abandonados e scripts de instalação |
| `entry-point-analyzer` | trailofbits/skills | Lista as portas de entrada do sistema (rotas, server actions, webhooks, RPCs) para auditar uma a uma |
| `semgrep` | trailofbits/skills | Varredura estática com Semgrep (as regras vêm do GitHub `semgrep/semgrep-rules`, porque semgrep.dev é bloqueado na nuvem) |
| `variant-analysis` | trailofbits/skills | Depois de achar uma falha, procura o mesmo padrão no resto do código |
| `fp-check` | trailofbits/skills | Confirma se um achado de segurança é real antes de corrigir |
| `security-audit` | cloudflare/security-audit-skill (MIT, Cloudflare) | Auditoria de segurança completa (reconhecimento, caça por fronteira, validação e relatório) ou revisão pontual. Instalada em 2026-10-28 (PR #56); conferida de novo e escaneada com o SkillSpector em 2026-11-02 (ver "Verificação de segurança") |

Ficaram de fora: `web-design-guidelines` (já cobrimos design com as skills existentes), `deploy-to-vercel` e `vercel-cli-with-tokens` (o deploy já é automático pelo Git), `vercel-optimize` (precisa de token da Vercel e só vale com tráfego real; reavaliar depois). Economia de tokens já vem do Graphify e do Headroom. As skills `systematic-debugging` e `verification-before-completion` saíram daqui porque agora vêm do plugin Superpowers completo (pedido do Nicolas em 2026-10-27).

## Skills de auditoria e mapa (2026-10-28)

Pedido do Nicolas a partir de um post (Draw.io, Ponytail, Improve, SkillSpector; o Handy ficou de fora a pedido). Todas vêm do repositório oficial do autor, foram escaneadas com o SkillSpector da NVIDIA antes de instalar e nenhuma pede cookie, login ou chave.

| Skill | Fonte | Para quê |
|---|---|---|
| `skill-inspector` | NVIDIA/SkillSpector | Revisa uma skill antes de instalar: roda o `skillspector scan --no-llm` e lê o código. Use antes de qualquer skill nova |
| `drawio` | jgraph/drawio-mcp (dono do draw.io) | Desenha diagramas `.drawio` (fluxo, arquitetura, ER). |
| `improve` | shadcn/improve | Audita o código e escreve planos de correção (pasta `plans/`, criada quando a skill roda) para um modelo mais barato executar. Não altera código |
| `ponytail` | DietrichGebert/ponytail | Escreve só o código que a tarefa precisa, sem cortar validação, erro, segurança ou acessibilidade |
| `ponytail-audit`, `ponytail-review`, `ponytail-debt` | DietrichGebert/ponytail | Auditoria do repo inteiro, revisão de diff e lista de atalhos marcados com `ponytail:` |

**SkillSpector.** Na nuvem o hook de início de sessão instala o CLI em segundo plano. No seu computador: `uv tool install git+https://github.com/NVIDIA/skillspector.git`, depois `skillspector scan <pasta-ou-url> --no-llm`. A análise por LLM é opcional e fica desligada.

**Resultado do scan (2026-10-28).** As 10 skills novas e as 26 já instaladas foram escaneadas. O scanner marcou como crítico `improve`, `graphify`, `impeccable`, `improve-animations`, `semgrep`, `sharp-edges`, `supabase` e `supply-chain-risk-auditor`; todos os alertas foram lidos à mão e são falsos positivos: são skills de segurança que citam os padrões que elas mesmas procuram ("ignore previous instructions", `rm -rf /`, "bypass security"), um `rm -f` no próprio cache do graphify, espaços de largura zero para escapar blocos de código num modelo, e menções a "access token" e cookies na documentação do Supabase. Nenhuma faz chamada de rede escondida nem lê credenciais. O `drawio` só baixa o índice público de formas do draw.io. Ficou de fora o `drawio-skill` da Agents365 (versão de terceiros com 30 scripts; a oficial do draw.io basta).

## Verificação de segurança (2026-11-02)

Pedido do Nicolas: usar a `security-audit` da Cloudflare junto com as skills da Trail of Bits/NVIDIA e a `security-review` do Claude Code nas verificações de segurança. A skill do projeto **`verificacao-seguranca`** (`.claude/skills/verificacao-seguranca/`) é a rotina que junta todas: peça "verificação de segurança" (do PR ou completa) e ela chama, em ordem, `security-review`, `differential-review`, `security-audit`, `sharp-edges`; na completa também `entry-point-analyzer`, `semgrep`, `supply-chain-risk-auditor`, `npm audit` e as skills do Supabase; e fecha com `variant-analysis` e `fp-check`. O relatório segue o padrão dos anteriores em `docs/` (semáforo, achado por ferramenta).

**Origem da `security-audit`.** Repositório oficial `github.com/cloudflare/security-audit-skill`, licença MIT (Copyright Cloudflare, Inc.), commit `c1c8a8c` de 2026-09-14. A cópia em `.claude/skills/security-audit/` é idêntica à do repositório nesse commit (conferido com `diff -r`).

**SkillSpector (2026-11-02, `--no-llm`).** O scanner deu nota de risco 100 e "DO_NOT_INSTALL" por 14 alertas (10 HIGH, 3 MEDIUM, 1 LOW). Todos foram lidos à mão e são falsos positivos, como nas outras skills de segurança:

- "Credential Access": o checklist pergunta se há `credentials.json`, `.env` ou `*.pem` no repositório e cita "keychain ACLs" como controle; os testes dos validadores usam `/etc/passwd` como exemplo de caminho **recusado**.
- "Memory Poisoning": o texto orienta revisar quem pode apagar a memória de um agente de IA (é o que a auditoria procura).
- "analysis-evasion": o scanner não terminou de ler arquivos grandes (`VALIDATION-AND-REPORTING.md` e os validadores); foram lidos à mão.
- Os dois validadores (`validate-findings.cjs`, `validate-coverage-ledger.cjs`) só importam `fs`, `path` e `util`, abrem arquivos em modo somente leitura (`O_RDONLY | O_NOFOLLOW`) e não usam rede, `child_process` nem variáveis de ambiente. Nenhum caractere invisível nos arquivos.

## Caveman (só no FINAVI)

O FINAVI usava o plugin caveman (respostas curtas no chat) a pedido do Nicolas. O Balbina começou sem ele; para
ligar, é só adicionar de novo o marketplace `JuliusBrussee/caveman` e o plugin em `.claude/settings.json`.

## Skills de relatório no padrão Power BI (2026-10-30)

Pedido do Nicolas: "instalar a skill powerbiskills". Não existe skill com esse nome exato. A coleção mais confiável de skills de Power BI é `data-goblin/power-bi-agentic-development` (Kurt Buhler, data-goblins.com, GPL-3.0, commit `26ae0b0` de 2026-10-28). Quase tudo nela opera arquivos do Power BI Desktop e do Fabric (CLI `pbir`, TMDL, DAX, scripts Python e PowerShell, hooks), o que não serve ao Balbina e rodaria código de fora. Por isso **não** foi instalado o plugin inteiro, só duas skills que são texto puro (markdown, sem scripts nem hooks), cada uma com a licença do autor:

| Skill | Para quê |
|---|---|
| `pbi-report-design` | Cânone de design de relatório: regra 3-30-300 (o mais importante em cima à esquerda), uma pergunta por página, cor de destaque só para o que pede atenção, escolha de gráfico, KPI com comparação e o "design gate" final |
| `creating-good-dashboards` | Few/Tufte aplicados a painel: todo KPI com base de comparação e tendência, visão geral → zoom → detalhe, bloco "o que fazer agora" apoiado nos dados, evitar visual genérico de IA |

Os exemplos em bash dentro delas são comandos do `pbir` (Power BI) e não se aplicam aqui: use só os princípios. Revisão manual em 2026-10-30: nenhum download, nenhuma instrução escondida, nenhum caractere invisível. O SkillSpector não rodou (instalação bloqueada pela política da nuvem nesta sessão). Foram aplicadas em Relatórios > Análise do período e na apresentação exportada.

## O que depende de você

**21st.dev Magic.** Pegue a chave grátis em https://21st.dev/settings/api-keys e exporte `API_KEY_21ST` no seu terminal (ou cadastre como variável do ambiente na nuvem do Claude Code). O plano grátis dá 2 componentes por dia.

**Context7 (opcional).** Sem chave funciona com limite. Para mais, crie a chave em https://context7.com/dashboard e exporte `CONTEXT7_API_KEY`.

**Supabase MCP.** Exporte `BALBINA_SUPABASE_REF` com o Reference ID do projeto Supabase do Balbina (o da produção ou o de teste) no seu terminal ou nas variáveis do ambiente na nuvem do Claude Code. No primeiro uso o Claude Code abre o login do Supabase. Ele fica em `read_only`: consulta schema e dados, não altera nada. Mudanças continuam indo por migration.

**Graphify no seu computador.** Na nuvem é automático. Local: `uv tool install 'graphifyy[sql]'` (ou `pipx install 'graphifyy[sql]'`). Sem ele instalado, os hooks simplesmente não fazem nada.

## O que ficou de fora e por quê

**Strix.** O workflow manual de teste de invasão (`strix.yml`) saiu em 2026-11-02, na limpeza do repositório: nunca rodou (o gateway do LLM pedia cartão) e a skill `verificacao-seguranca` cobre a verificação.

**Claude Mem.** Grava tudo que o Claude faz numa base local e injeta nas sessões seguintes. Na nuvem cada sessão começa num contêiner novo, então a base se perde; a versão "cowork" manda o histórico para o servidor deles (cmem.ai), o que inclui trechos de código e dados do ERP. O projeto já tem memória própria. Se quiser no seu computador: adicione o marketplace `thedotmack/claude-mem` em `/plugin` e instale de lá.

**Headroom.** O plugin (skills `headroom` e `headroom:peek`) já está ativo na sua conta e aparece em todas as sessões. O proxy de compressão (`pip install headroom-ai` e `headroom wrap claude`) só faz sentido no seu computador.

**Task Observer.** A própria lista sugere instalar depois de ter skills próprias. Ele se ativa antes da primeira ação de toda sessão e grava observações numa pasta fixa da máquina, que na nuvem some ao fim da sessão. Vale reavaliar quando o projeto tiver skills nossas para melhorar. Instalação: `npx -y skills add rebelytics/one-skill-to-rule-them-all --skill task-observer --agent claude-code`.

**OmniRoute.** É um proxy que reparte as chamadas do Claude Code entre centenas de provedores para driblar limite de cota. Manda o código do ERP para terceiros desconhecidos, pode violar os termos dos provedores e teve vulnerabilidade publicada (CVE-2026-49352). Não recomendo.

**FreeLLMAPI (tashfeenahmed/freellmapi, MIT).** Servidor que você hospeda e que junta os planos grátis de ~34 provedores (Google, Groq, Cerebras, Mistral, OpenRouter...) atrás de um endereço único, trocando de provedor quando um bate o limite. Não foi instalado no repo porque:

1. Ele não troca o modelo do Claude quando a cota acaba. Para o Claude Code usar, você aponta `ANTHROPIC_BASE_URL` para o servidor, e aí **todas** as respostas passam a vir dos modelos grátis, não do Claude. Não existe "Claude até acabar e depois o grátis continuando o mesmo raciocínio".
2. Na nuvem (e nas threads deste projeto) o modelo é servido pela Anthropic e não dá para redirecionar; também não há onde deixar um servidor rodando.
3. O código do ERP e dados de clientes iriam para dezenas de provedores, e vários planos grátis usam o que recebem para treino. O próprio projeto diz que é para experimento, não produção.

O que já existe: quando o modelo principal fica indisponível, a sessão cai para outro modelo Claude sem perder a conversa. Se quiser testar no seu computador, num projeto sem dados reais: `docker compose up` no repositório dele, cadastre as chaves no painel e rode `npx freellmapi setup-claude`. Para voltar ao Claude, remova o `ANTHROPIC_BASE_URL`.
