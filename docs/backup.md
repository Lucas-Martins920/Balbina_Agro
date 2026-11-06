# Backup do banco

## Política

| Camada | O que é | Retenção | Depende de |
|---|---|---|---|
| Backup próprio (GitHub Actions) | Dump cifrado de todo o banco do Balbina, todo dia às 03:00 de Brasília (`.github/workflows/backup.yml`) | 30 dias; o de domingo, 90 dias | secrets `SUPABASE_DB_URL` e `BACKUP_SENHA` |
| Cópia externa (opcional) | O mesmo arquivo enviado a um bucket S3, Cloudflare R2 ou Backblaze B2 | a regra de ciclo de vida do bucket (sugestão: 1 ano) | secrets `BACKUP_S3_*` |
| Backup do Supabase | Backup diário gerenciado pelo Supabase; PITR é um add-on pago | 7 dias no Pro | plano Pro (o Free não oferece backup restaurável) |

- **Perda máxima aceitável (RPO):** 24 horas só com o backup próprio; minutos com PITR.
- **Teste de restauração:** toda execução sobe um Supabase vazio no próprio runner (`supabase start` sem migrations: mesma versão do Postgres, `pg_cron`, `pg_net`, Vault e o auth do GoTrue, como um projeto novo) e faz nele a restauração completa, igual à de um desastre: logins, Balbina e rotinas do `pg_cron`. Confere a contagem de linhas de cada tabela com a do momento do backup e exige linhas em `empresas`, `usuarios_empresa` e `balbina_meta.migracoes`. Qualquer erro (extensão faltando, comando que falhou, contagem diferente, backup vazio) faz o job falhar e o GitHub avisa por e-mail. O resumo da execução mostra tabelas, linhas, diferenças e rotinas reagendadas.
- **Por que assim (2026-11-02):** até então o teste restaurava num Postgres puro, sem `pg_cron`; a restauração parava no começo e o passo ficava verde mesmo assim, porque o `| tee` engolia o código de erro. Os backups estavam íntegros (cifrados, com sha256), mas a restauração não estava provada.
- **No CI:** `scripts/test-backup.sh` faz backup e restauração de um banco com todas as migrations, para uma migration nova não quebrar a restauração sem ninguém ver.
- **Cifra:** AES-256 com `BACKUP_SENHA` (gpg). O arquivo tem dados pessoais (LGPD) e hashes de senha; sem a senha ninguém lê, nem quem baixa o artefato.

## O que o backup leva

- `app.dump`: todos os schemas do Balbina (`public`, `app`, `balbina_meta` e os que surgirem), com estrutura, dados, RLS, triggers e funções. Ficam de fora só os schemas que o Supabase mantém (`auth`, `storage`, `realtime` etc.).
- `auth.dump`: os dados de login (`auth.users`, `auth.identities`, `auth.mfa_factors`), para ninguém precisar se cadastrar de novo.
- `cron-jobs.csv`: as rotinas do `pg_cron` (webhooks, automações, recorrências), que ficam no schema `cron`, fora do `app.dump`. A restauração as agenda de novo com o mesmo nome.
- `extensoes.txt` (extensão e schema), `contagens.tsv`, `manifesto.txt` (sha256 dos dumps).

O backup **não** leva, e precisa ser guardado à parte num cofre de senhas:

- `BACKUP_SENHA`. Sem ela, os backups não abrem.
- Os segredos do Vault do Supabase (`balbina_url` e `cron_secret`). As rotinas do `pg_cron` voltam com o backup, mas só chamam o site depois que esses dois forem cadastrados no Vault do projeto novo.
- `BALBINA_CHAVE_CRIPTO` (Vercel). Sem ela, as chaves Asaas das pisciculturas que estão no banco não decifram e as contas precisam ser ligadas de novo.
- As outras variáveis da Vercel (Supabase, Asaas, Focus NFe, Turnstile).

## Configurar (uma vez)

1. Gere uma senha longa (ex.: `openssl rand -base64 32`) e guarde no cofre de senhas.
2. GitHub > Settings > Secrets and variables > Actions > New repository secret: `BACKUP_SENHA` com essa senha. `SUPABASE_DB_URL` já existe.
3. Actions > Backup do banco > Run workflow, para ver o primeiro passar.
4. Opcional, cópia externa: crie um bucket (o R2 tem 10 GB grátis) com regra de ciclo de vida e cadastre `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` e, fora da AWS, `BACKUP_S3_ENDPOINT` (no R2: `https://<conta>.r2.cloudflarestorage.com`).
5. Opcional: plano Pro do Supabase para ter o backup gerenciado e, se quiser perder no máximo minutos, o add-on PITR.

## Restaurar

1. Baixe o arquivo: Actions > Backup do banco > a execução do dia > Artifacts (ou do bucket).
2. Crie um projeto Supabase novo (ou use um vazio). Não restaure por cima do banco em uso.
3. Rode, com a connection string "Session pooler" do projeto novo:

   ```sh
   DATABASE_URL='postgresql://...' BACKUP_SENHA='...' ./scripts/restaurar-backup.sh balbina-AAAAMMDD-HHMM.tar.gpg
   ```

   O script confere o sha256, recusa banco que já tenha tabelas em `public` ou usuários em `auth.users`, restaura os logins e depois o Balbina numa transação só e compara as contagens (se algo falhar, nada fica gravado). Com `--ensaio` no fim faz tudo e desfaz, para conferir antes. A troca de região usa esse mesmo caminho (como na do FINAVI: `docs/legado/finavi/migrar-sao-paulo.md`).
4. Aponte a Vercel (`NEXT_PUBLIC_SUPABASE_URL` e chaves) para o projeto novo e, no Supabase Auth, ajuste Site URL e redirects para o endereço do Balbina.
5. No painel do Supabase > Vault do projeto novo, cadastre `balbina_url` e `cron_secret` (os mesmos do cofre de senhas). As rotinas do `pg_cron` já voltaram com o backup e começam a chamar o site assim que os dois existirem.
6. Registre as migrations como aplicadas: o `balbina_meta.migracoes` já vem no backup, então o workflow de migrations só aplica as que forem mais novas.

Para só olhar os dados sem restaurar: `gpg -d arquivo.tar.gpg | tar -x` e `pg_restore -f - app.dump | less`.
