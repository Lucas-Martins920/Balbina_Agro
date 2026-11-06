---
name: verificacao-seguranca
description: Rotina de verificação de segurança do Balbina que roda juntas a security-audit da Cloudflare, as skills da Trail of Bits/NVIDIA e a security-review do Claude Code. Use quando pedirem verificação, auditoria, revisão ou checagem de segurança do sistema, de um PR ou antes de um consolidado para o master.
---

# Verificação de segurança do Balbina

Rotina do projeto (pedido do Nicolas em 2026-11-02). Junta numa só passada as ferramentas de segurança instaladas, sem trocar nenhuma delas: cada uma é chamada pela própria skill e segue as instruções dela.

Responda e escreva o relatório em português. Não altere o banco de produção nem rode ataque contra a produção.

## 1. Escolha o tamanho

| Pedido | Escopo |
|---|---|
| PR, diff ou "antes do consolidado" | **Diff**: só o que mudou em relação ao `master` (ou à base do PR) |
| "Verificação total", "auditoria", "pentest", relatório | **Completa**: o repositório inteiro |

Na dúvida, faça a do diff e diga que existe a completa.

## 2. Ferramentas, em ordem

Comum às duas:

1. **`security-review`** (embutida no Claude Code): revisão das mudanças pendentes do branch.
2. **`differential-review`** (Trail of Bits): raio de impacto do diff, regressões de correções antigas, código mudado sem teste.
3. **`security-audit`** (Cloudflare, `cloudflare/security-audit-skill`):
   - Diff: modo de revisão pontual da skill, focado nas fronteiras que o diff toca (auth, RLS, rotas, webhooks, server actions).
   - Completa: o fluxo completo da skill (reconhecimento, caça por fronteira, validação, relatório). Valide o relatório com os validadores dela:
     `node .claude/skills/security-audit/validate-findings.cjs <findings.json>` e `node .claude/skills/security-audit/validate-coverage-ledger.cjs <ledger.json>` (só leem arquivos, sem rede).
4. **`sharp-edges`** (Trail of Bits): defaults perigosos em cripto, auth e configuração.

Só na completa:

5. **`entry-point-analyzer`**: lista rotas, server actions, webhooks e RPCs; use como mapa para a caça da `security-audit`.
6. **`semgrep`**: varredura estática.
7. **`supply-chain-risk-auditor`** + `npm audit`: dependências.
8. **`supabase`** / **`supabase-postgres-best-practices`**: RLS, policies `membros`, funções `security definer` (revogar de `public, anon`), `app.travar_referencias()`. Rode também os advisors pelo Supabase MCP (só leitura).

Fechamento (sempre):

9. **`variant-analysis`**: para cada falha real, procure o mesmo padrão no resto do código.
10. **`fp-check`**: confirme cada achado antes de chamá-lo de real. Achado sem confirmação vai como "a confirmar".

Skill nova que apareça no caminho passa antes pelo **`skill-inspector`** (SkillSpector da NVIDIA).

## 3. Testes que sustentam a conclusão

Rode conforme o que a verificação tocou: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` (inclui `99_isolamento_empresas.sql` e `99_funcoes_sem_anon.sql`).

## 4. Relatório

- Semáforo (verde, amarelo, vermelho) e uma tabela por achado: ferramenta que achou, gravidade, arquivo:linha, confirmado pelo `fp-check` ou não, correção.
- Diga quais ferramentas rodaram e quais não (e por quê, por exemplo rede bloqueada).
- Verificação completa: salve em `docs/verificacao-seguranca-AAAA-MM-DD.html` (mesmo padrão das anteriores em `docs/`) e copie para `/mnt/project-files/seguranca/`.
- Correção vai para o `Teste-Desevolvimento` (sem PR, ver `docs/fluxo-de-trabalho.md`), com teste que trava a regressão. Nada vai para o `master` sem o "pode" do Nicolas.
