# Mudar o servidor para São Paulo

Hoje o app (Vercel, região `pdx1`) e o banco (Supabase, `us-west-2`) estão em Oregon, nos EUA. A ideia é levar os dois para São Paulo: Vercel `gru1` e Supabase `sa-east-1`. Os dois mudam **juntos**: app em São Paulo falando com banco em Oregon fica mais lento que hoje, porque cada tela faz várias consultas e cada uma atravessaria o continente.

## Vale fazer agora?

Sim. O banco tem cerca de 1 MB e só a conta de teste usa o sistema, então a cópia leva minutos e quase ninguém é afetado. Com muitas granjas a janela cresce e o risco também.

| | Hoje (Oregon) | Depois (São Paulo) |
|---|---|---|
| Ida e volta de Manaus até o servidor | cerca de 150 a 200 ms | cerca de 50 a 70 ms |
| Cada clique que vai ao servidor | referência | uns 0,1 a 0,4 s mais rápido |
| Dados das granjas | nos EUA | no Brasil (melhor para LGPD e para a conversa de venda) |
| Custo no plano atual | | igual (Vercel Hobby e Supabase cobram o mesmo nessas regiões; no Vercel Pro, São Paulo custa um pouco mais por uso) |

Os números de latência são estimativas de rede, não medição: o proxy deste ambiente não alcança a produção.

## O que muda para o usuário

- O sistema fica fora do ar uns 20 a 40 minutos, com uma página "FINAVI em manutenção".
- Todo mundo precisa entrar de novo depois (o projeto novo tem outras chaves de sessão). Senha e app autenticador continuam os mesmos, porque usuários, senhas e fatores de MFA são copiados.
- Apontamento feito no celular sem sinal fica no aparelho e sobe depois.
- Webhooks do Asaas, Focus NFe e Pluggy não mudam de endereço (continuam no endereço de produção do FINAVI). Durante a manutenção eles recebem "503, tente depois" e reenviam.

## Por que o banco dá mais trabalho

O Supabase não muda a região de um projeto. É preciso criar um projeto novo em São Paulo, copiar o banco e trocar as chaves no app. A cópia é feita pelo workflow **Migrar banco para São Paulo** (`.github/workflows/migrar-sao-paulo.yml`, apagado em 2026-11-02 depois da migração concluída; está no histórico do git), que usava os mesmos scripts do backup diário:

- **Só lê** o banco de Oregon. Ele fica intacto e serve de volta atrás.
- Restaura tudo **numa transação só**: ou entra tudo com as contagens de linhas batendo, ou nada fica gravado.
- Tem o modo **ensaio**, que faz a cópia completa, confere e desfaz no fim. Pode rodar quantas vezes quiser, sem tirar o sistema do ar.
- Recusa destino que não seja `sa-east-1`, destino igual à origem ou destino que já tenha dados.
- Tira sozinho espaços e quebras de linha que vêm junto ao colar o endereço pelo celular (também os já codificados, `%0A` e `%20`), e mostra o formato do endereço sem mostrar a senha quando o login falha.
- Não copia as permissões que são do próprio Supabase (o projeto novo já as tem e o Postgres recusa recriá-las).
- No modo definitivo, copia os segredos `finavi_url` e `cron_secret` do Vault e reagenda a rotina de webhooks do pg_cron. Vault e pg_cron ficam fora da cópia do banco: o Vault é cifrado com a chave de cada projeto.

## Quem faz o quê

| Você (Nicolas), nas suas contas | A frente, no repositório |
|---|---|
| Criar o projeto Supabase em São Paulo e copiar as configurações do Auth | Workflow de cópia com ensaio, modo manutenção, scripts de backup corrigidos (pronto) |
| Cadastrar o secret `SUPABASE_DB_URL_SAO_PAULO` no GitHub e rodar o ensaio | Ler o resultado do ensaio e corrigir o que falhar |
| No dia: ligar a manutenção, rodar o definitivo, trocar variáveis e secret | PR da virada: `vercel.json` em `gru1` e o Supabase MCP no projeto novo |
| Conferir o login e desligar a manutenção | Conferir o backup e as migrations no banco novo no dia seguinte |
| Depois de uns 7 dias tranquilos, apagar o projeto antigo | Atualizar docs e memória |

## Parte 1: preparar (qualquer dia, sem tirar nada do ar)

1. **Supabase: criar o projeto novo.** Em supabase.com, **New project**, na mesma organização. Nome: `finavi-sao-paulo`. Região: **South America (São Paulo)**. Crie uma senha forte de banco e guarde no cofre.
   - Se aparecer limite de projetos gratuitos, pause ou apague o antigo banco de testes (já aposentado).
2. **Supabase: copiar as configurações do Auth** do projeto antigo para o novo. Abra os dois lado a lado:
   - Authentication > URL Configuration: Site URL e Redirect URLs iguais às do antigo (o endereço de produção e o mesmo com `/**`).
   - Authentication > Emails > SMTP Settings: os mesmos dados do SMTP próprio.
   - Authentication > Emails > Templates: copie o texto de cada modelo que foi mudado.
   - Authentication > Attack Protection: ligue o captcha (Turnstile) com a mesma chave secreta.
   - Authentication > Multi-Factor: TOTP ligado, igual ao antigo.
   - Authentication > Sign In / Providers e Policies: senha mínima e o que mais estiver diferente do padrão.
   - Project Settings > Data API (ou API): "Max rows" 1000, schemas expostos iguais ao antigo.
3. **Supabase: pegar o endereço do banco novo.** No projeto novo, botão **Connect** > **Session pooler**. Copie a URI (tem `sa-east-1` no meio) e troque `[YOUR-PASSWORD]` pela senha do passo 1.
4. **GitHub: cadastrar o secret.** Repositório > Settings > Secrets and variables > Actions > New repository secret. Nome `SUPABASE_DB_URL_SAO_PAULO`, valor a URI do passo 3. Não cole a URI aqui no chat.
5. **GitHub: rodar o ensaio.** Actions > **Migrar banco para São Paulo** > Run workflow > branch `main`, modo `ensaio`. Em 2 a 5 minutos o resumo mostra `diferenças: 0` e "ensaio: tudo desfeito". Me avise o resultado (verde ou vermelho); se ficar vermelho, eu leio e corrijo.
   - Feito em 30/10: ensaio verde com 98 tabelas e 24.691 linhas, `diferenças: 0`.
6. **Me mande o "Reference ID" do projeto novo** (Project Settings > General). Não é segredo, está no endereço do projeto. Com ele eu preparo o PR da virada.

## Parte 2: o dia da troca (de preferência à noite, junto do merge das 22h)

Tempo total: uns 30 a 45 minutos. Faça na ordem.

1. **Vercel: ligar a manutenção.** Projeto > Settings > Environment Variables > Add: `FINAVI_MANUTENCAO` = `1`, só em Production. Depois Deployments > o deploy de produção mais recente > ⋯ > **Redeploy**. Em 1 a 2 minutos o site mostra "FINAVI em manutenção".
2. **GitHub: copiar de verdade.** Actions > Migrar banco para São Paulo > Run workflow: modo `definitivo`, confirmação `MIGRAR`. Espere ficar verde com `diferenças: 0`.
3. **Supabase (projeto novo): pegar as chaves.** Project Settings > API Keys: a **publishable** e a **secret**.
4. **Vercel: trocar as variáveis** (Settings > Environment Variables, ambiente Production):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<reference-id-novo>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = a publishable do passo 3
   - `SUPABASE_SECRET_KEY` = a secret do passo 3
   - **Não mexa** em `FINAVE_CHAVE_CRIPTO`. Ela abre as chaves do Asaas gravadas no banco; trocar quebra todas.
   - Apague `FINAVI_MANUTENCAO`.
5. **GitHub: apontar backup e migrations para o banco novo.** Edite o secret `SUPABASE_DB_URL` e cole a URI de São Paulo (a mesma do `SUPABASE_DB_URL_SAO_PAULO`). Depois apague o `SUPABASE_DB_URL_SAO_PAULO`.
6. **Dar o "pode" no merge das 22h** com o PR da virada junto. O deploy que sai dele já vem em `gru1`, com as variáveis novas e sem manutenção.
7. **Conferir:** entre no FINAVI, veja o painel, um título a pagar e o estoque. Na Vercel, Settings > Functions deve mostrar São Paulo (gru1).
8. **Asaas:** no painel do Asaas, Integrações > Webhooks: se a fila aparecer pausada por causa dos 503, reative.

### Se algo der errado no dia

O banco de Oregon não foi tocado. Volte as três variáveis da Vercel e o `SUPABASE_DB_URL` para os valores antigos, apague `FINAVI_MANUTENCAO` e faça Redeploy. O sistema volta como estava. Decida isso no mesmo dia: depois que os usuários gravarem no banco novo, voltar significa perder essas gravações.

## Parte 3: depois

- No dia seguinte eu confiro o backup das 03:00 e o workflow de migrations, os dois já no banco novo.
- Depois de uns 7 dias sem problema, pause e depois apague o projeto antigo (Project Settings > General). A cópia cifrada da migração fica 30 dias nos Artifacts do workflow.

## O que a frente já deixou pronto

- `scripts/restaurar-backup.sh`: restaura numa transação só, traz os logins antes do app (tabelas como `sessoes_2fa` e `dispositivos_confiaveis` apontam para `auth.users`; antes a restauração num projeto novo falhava nessas chaves), ignora gatilhos de evento e publicações do próprio Supabase e ganhou o modo `--ensaio`.
- `scripts/backup-banco.sh`: guarda também id e e-mail dos usuários, para a restauração de teste do backup diário não falhar nas mesmas chaves.
- `scripts/test-backup.sh` (CI): testa ensaio e restauração completa num destino com auth.
- Modo manutenção: `FINAVI_MANUTENCAO=1` faz telas e APIs responderem 503 sem tocar o banco (`src/lib/manutencao.ts`).
- O aviso "app local ligado ao banco de produção" reconhece qualquer projeto Supabase na nuvem, então continua valendo com o projeto novo.
