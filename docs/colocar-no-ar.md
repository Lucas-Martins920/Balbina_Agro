# Colocar o Balbina no ar (do zero)

O Balbina é um aplicativo novo, separado do FINAVI: banco, domínio, contas e chaves próprios. Do FINAVI veio só o
código. Nenhum projeto Supabase, projeto Vercel, domínio, segredo ou conta de integração (Asaas, Focus, Pluggy,
Meta, Expo) do FINAVI serve aqui, e nada no código aponta para eles: tudo é lido das variáveis abaixo.

Este guia é a ordem para criar tudo uma vez. O passo a passo de cada assunto fica no guia dele, linkado em cada item.

## 1. Contas

| Serviço | Para quê | Quando |
|---|---|---|
| Supabase, 2 projetos (produção e teste) | banco, login, arquivos e rotinas (pg_cron) | já |
| Vercel, 1 projeto | o site, o `/campo` e as rotinas diárias | já |
| Domínio (Registro.br ou outro) | endereço próprio; até lá vale o `<projeto>.vercel.app` | quando quiser |
| SMTP (Resend, Postmark, Amazon SES...) | e-mails de cadastro, senha e 2º fator | antes de abrir para clientes |
| Cloudflare Turnstile | captcha do login | antes de abrir para clientes |
| Anthropic (API) | chat de manejo do `/campo` e leitura de boleto, nota e mortes por foto | opcional |
| Asaas (conta do fornecedor do Balbina) | cobrar a assinatura das pisciculturas | quando for cobrar |
| Focus NFe (conta de revenda) | NF-e e NFC-e das pisciculturas | quando for emitir nota |
| Pluggy | extrato bancário automático | opcional |
| Meta (WhatsApp Cloud API) | avisos e lançamentos pelo WhatsApp | opcional |
| Postmark Inbound (ou similar) | caixa de entrada de notas e boletos por e-mail | opcional |
| Expo (EAS), Apple Developer e Google Play Console | app nativo nas lojas | quando for publicar o app |
| Armazenamento S3 (Cloudflare R2, Backblaze...) | cópia do backup fora do GitHub | recomendado |

## 2. Supabase da produção

1. New project, região **São Paulo** (sa-east-1). Guarde a senha do banco.
2. Project Settings > General: copie o **Reference ID** (vai em `BALBINA_REF_PRODUCAO`, no GitHub e no Preview da Vercel).
3. Connect > **Session pooler**: copie a connection string (vai no secret `SUPABASE_DB_URL` do GitHub).
4. Com o secret cadastrado (passo 4 abaixo): Actions > Migrations no Supabase > Run workflow, banco **producao**.
   A primeira vez aplica todas as migrations.
5. Authentication > URL Configuration: Site URL = endereço da produção; Redirect URLs = o mesmo com `/**`.
6. Authentication: SMTP próprio, modelo do e-mail com o código e captcha
   ([seguranca-e-assinatura.md](seguranca-e-assinatura.md), "Login: captcha e verificação em duas etapas").
7. Vault do Supabase (no painel, Vault): crie `balbina_url` = endereço da produção e
   `cron_secret` = o mesmo valor do `CRON_SECRET` da Vercel. Sem os dois, as rotinas `balbina-automacoes`
   (lembretes e avisos, a cada 15 min) e `balbina-webhooks-api` (webhooks da API, a cada 5 min) ficam paradas.
   A `balbina-recorrencias` (contas recorrentes) roda sem eles.

## 3. Supabase do site de teste

Outro projeto, só para o branch `Teste-Desevolvimento`: [site-de-teste.md](site-de-teste.md).

## 4. GitHub (repositório `Lucas-Martins920/Balbina_Agro`)

Settings > Secrets and variables > Actions:

| Nome | Tipo | Valor |
|---|---|---|
| `SUPABASE_DB_URL` | secret | Session pooler da produção (migrations e backup) |
| `SUPABASE_DB_URL_TESTES` | secret | Session pooler do projeto de teste |
| `BALBINA_REF_PRODUCAO` | variável | Reference ID da produção (impede o teste de usar o banco da produção) |
| `BALBINA_URL` | variável | endereço da produção (reserva diária dos webhooks) |
| `CRON_SECRET` | secret | o mesmo da Vercel |
| `BACKUP_SENHA` e `BACKUP_S3_*` | secrets | backup diário cifrado ([backup.md](backup.md)) |

Sem esses nomes, os workflows avisam e não fazem nada. A exceção é o backup: com só um dos dois
(`SUPABASE_DB_URL` ou `BACKUP_SENHA`), ele falha de propósito, então cadastre os dois juntos. Proteção do `master`
e regras do fluxo:
[fluxo-de-trabalho.md](fluxo-de-trabalho.md).

## 5. Vercel

1. Add New > Project > importe `Lucas-Martins920/Balbina_Agro`. Settings > Git > Production Branch = `master`.
   A região (`gru1`, São Paulo) e as rotinas diárias já vêm do `vercel.json`.
2. Settings > Environment Variables, ambiente **Production**. O [`.env.example`](../.env.example) explica cada uma.

   | Grupo | Variáveis |
   |---|---|
   | Obrigatórias | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`, `BALBINA_CHAVE_CRIPTO` (gere com `openssl rand -hex 32` e nunca troque depois), `CRON_SECRET` (texto aleatório) |
   | Páginas legais | `NEXT_PUBLIC_BALBINA_RAZAO_SOCIAL`, `NEXT_PUBLIC_BALBINA_CNPJ`, `NEXT_PUBLIC_BALBINA_EMAIL`, `NEXT_PUBLIC_BALBINA_FORO` |
   | Captcha | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
   | IA | `ANTHROPIC_API_KEY` |
   | Assinatura (Asaas do Balbina) | `BALBINA_ASAAS_API_KEY`, `BALBINA_ASAAS_AMBIENTE`, `BALBINA_ASAAS_WEBHOOK_TOKEN` |
   | Notas (Focus NFe) | `FOCUS_NFE_TOKEN_REVENDA`, `FOCUS_NFE_AMBIENTE`, `FOCUS_NFE_WEBHOOK_TOKEN` |
   | Open Finance (Pluggy) | `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_TOKEN` |
   | WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_NUMERO_ID`, `WHATSAPP_NUMERO`, `WHATSAPP_SEGREDO_APP`, `WHATSAPP_VERIFICACAO` |
   | Avisos no celular | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTATO` (`npx web-push generate-vapid-keys`) |
   | E-mail de entrada | `ENTRADA_EMAIL_ENDERECO`, `ENTRADA_EMAIL_SEGREDO` |

   Grupo vazio = aquela função fica desligada. As variáveis do site de teste vão só no
   **Preview** ([site-de-teste.md](site-de-teste.md)).
3. Domínio próprio: [dominio-proprio.md](dominio-proprio.md). Ao trocar de endereço, atualize `NEXT_PUBLIC_SITE_URL`,
   as URLs do Supabase Auth, o `balbina_url` do Vault, o `BALBINA_URL` do GitHub e os webhooks das integrações.

## 6. Primeiro acesso

Abra o endereço da produção e faça o cadastro: quem cria a empresa vira o master dela e ganha 14 dias de teste
([seguranca-e-assinatura.md](seguranca-e-assinatura.md), "Como o acesso é liberado"). A empresa do próprio
fornecedor pode virar cortesia pelo SQL Editor.

## 7. Integrações, quando for usar

- Assinatura pelo Asaas do Balbina: [asaas-producao.md](asaas-producao.md).
- NF-e e NFC-e: [nfe.md](nfe.md).
- IA, e-mail de entrada, WhatsApp e avisos no celular: [automacoes.md](automacoes.md).
- Pluggy e as demais: [codigo/integracoes.md](codigo/integracoes.md).
- App nas lojas: [app-celular.md](app-celular.md). O `eas init` cria o projeto do Expo do Balbina; preencha os
  endereços do `mobile/eas.json` (hoje `SEU-SITE` e `SEU-PROJETO`). Os identificadores `br.app.balbina` do
  `mobile/app.json` são provisórios: troque antes da primeira publicação, se quiser outro.
