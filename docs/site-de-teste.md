# Site de teste (preview do `Teste-Desevolvimento`)

Para ver as mudanças antes da produção sem rodar nada na máquina, o branch `Teste-Desevolvimento` vira um site na
Vercel ligado a um **Supabase só de teste**. Cada push no `Teste-Desevolvimento` atualiza o site sozinho. A produção
(`master`, com o Supabase da produção) não é tocada. O `npm run local` ([rodar-local.md](rodar-local.md)) continua
valendo para quem quiser.

| | Site de teste | Produção |
|---|---|---|
| Branch | `Teste-Desevolvimento` | `master` |
| Endereço | domínio fixo do branch na Vercel (sugestão: `balbina-teste.vercel.app`) | o domínio de produção da Vercel |
| Banco | projeto Supabase de teste | projeto Supabase da produção (Reference ID em `BALBINA_REF_PRODUCAO`) |
| Migrations | Action "Migrations no Supabase" no push do `Teste-Desevolvimento` que mexe em migration (secret `SUPABASE_DB_URL_TESTES`) | só no push do `master` (consolidado) |
| Quem vê | só quem está logado na Vercel do projeto (Deployment Protection) | todos |
| 2º fator | opcional (o e-mail padrão do Supabase manda poucos códigos por hora) | obrigatório para master/financeiro/administrativo |

## Travas para não misturar com a produção

- `scripts/vercel-ignorar.sh` (o `ignoreCommand` do `vercel.json`): o preview só é construído no branch
  `Teste-Desevolvimento`, só com `BALBINA_AMBIENTE=testes` nas variáveis de Preview e é recusado se
  `NEXT_PUBLIC_SUPABASE_URL` for a da produção (`BALBINA_REF_PRODUCAO`, o Reference ID do projeto Supabase da
  produção; vários separados por vírgula). Os outros branches continuam sem preview.
- Faixa amarela "Site de teste" no topo (`src/components/aviso-ambiente.tsx`); vira vermelha se, por engano,
  o site apontar para o banco de produção (`src/lib/ambiente.ts`, também pelo `BALBINA_REF_PRODUCAO`).
- O workflow de migrations recusa `SUPABASE_DB_URL_TESTES` igual ou parecido com o da produção (variável
  `BALBINA_REF_PRODUCAO` do repositório), e o "zerar" só roda no banco de teste.
- Asaas de produção é recusado fora da produção (`src/lib/asaas-mapa.ts`). As rotinas (crons) da Vercel só
  rodam na produção.

## O que configurar (uma vez)

1. **Supabase: projeto de teste.** Crie um projeto Supabase só para o teste (o plano grátis serve), de preferência
   em São Paulo, como a produção.
   - Authentication > URL Configuration: Site URL = endereço do site de teste; em Redirect URLs, o mesmo endereço
     com `/**`. Sem captcha (Attack Protection) neste projeto.
   - Authentication > Sign In / Providers > Email: desligue **Confirm email** (cadastro novo entra direto).
   - Se o projeto estiver pausado, clique em Restore.
2. **GitHub: secret e variável.** Settings > Secrets and variables > Actions:
   - secret `SUPABASE_DB_URL_TESTES` = connection string "Session pooler" do projeto de teste (Connect > Session
     pooler, com a senha do banco);
   - variável `BALBINA_REF_PRODUCAO` = Reference ID do projeto da produção (Project Settings > General).
   Depois: Actions > Migrations no Supabase > Run workflow, banco **testes**. A primeira vez aplica todas as
   migrations (alguns minutos).
3. **Vercel: variáveis de Preview.** Settings > Environment Variables > Add, ambiente **Preview** e, em
   "Preview Branch", **Teste-Desevolvimento**:

   | Variável | Valor |
   |---|---|
   | `BALBINA_AMBIENTE` | `testes` |
   | `BALBINA_REF_PRODUCAO` | Reference ID do projeto Supabase da produção |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto de teste |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave `sb_publishable_` do projeto de teste |
   | `SUPABASE_SECRET_KEY` | chave `sb_secret_` do projeto de teste |
   | `BALBINA_CHAVE_CRIPTO` | uma chave nova (64 caracteres hexadecimais), **diferente** da produção: assim chaves de Asaas/Pluggy copiadas da produção não abrem no teste |
   | `NEXT_PUBLIC_SITE_URL` | endereço do site de teste |
   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (chave de teste da Cloudflare que sempre passa; a Vercel não aceita vazio) |
   | `ANTHROPIC_API_KEY` | opcional: liga o chat de manejo e a leitura por IA do `/campo` no site de teste |

   Confira que as outras variáveis da produção estão marcadas só em **Production**. Uma variável em
   "All Environments" também vale no site de teste.
4. **Vercel: endereço fixo.** Settings > Domains > Add `balbina-teste.vercel.app` (ou outro nome livre) e, em
   "Connect to an environment", escolha **Preview** com o Git branch **Teste-Desevolvimento**.
5. **Primeiro deploy.** Deployments > o último do `Teste-Desevolvimento` > Redeploy (ou espere o próximo push).
   No log do build aparece "Construindo o site de teste (Teste-Desevolvimento)."
6. **Primeiro acesso.** Abra o endereço, faça o cadastro com o seu e-mail e crie a piscicultura de teste, ou gere
   a conta de teste cheia (abaixo).

## Operação

- **Atualizar:** automático a cada push no `Teste-Desevolvimento`. Migration nova vai para o banco de teste
  pelo Action (só roda quando uma migration muda).
- **Recomeçar do zero:** Actions > Migrations no Supabase > Run workflow, banco **testes**, marque
  "Zerar o banco de TESTE antes". Apaga dados e contas do banco de teste e reaplica tudo.
- **Conta de teste cheia:** Actions > Migrations no Supabase > Run workflow, banco **testes**, marque
  "Criar (ou recriar) a conta de teste cheia". Cria uma piscicultura completa ("Piscicultura Boa Engorda") com
  ~60 dias de dados em todos os módulos: viveiros de engorda e berçário com lotes de tambaqui em fases diferentes,
  trato diário com qualidade da água, biometrias, despescas, pedidos, PDV, títulos, extrato bancário e custo do kg.
  Antes disso, cada lote tem o trato, as mortes e uma biometria por mês desde o povoamento, para a conversão
  alimentar e o custo do ciclo contarem o ciclo inteiro (o financeiro desses meses fica vazio).
  Entrar com **nicolasduarte.s@gmail.com** (mesma senha do banco de teste, ou `Balbina@teste1` se a conta for nova).
  Logins sem e-mail: `gerente.teste`, `viveiro.teste`, `racao.teste` (senha `Balbina@teste1`). Rodar de novo
  recria a conta do zero. Código: `supabase/seed/conta-teste.sql`.
- **Projeto pausado:** o Supabase Free pausa o projeto após 7 dias sem uso. Se o site de teste der erro de
  conexão, abra o projeto de teste no Supabase e clique em Restore.
- **Preview sempre pulado** com "falta BALBINA_AMBIENTE=testes": confira o passo 3 (ambiente Preview,
  branch `Teste-Desevolvimento`).
