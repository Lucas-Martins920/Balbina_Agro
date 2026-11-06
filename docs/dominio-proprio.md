# Trocar o endereço do app para um domínio próprio

O app nasce no endereço que a Vercel dá ao projeto (`https://<projeto>.vercel.app`). Este guia leva para um domínio próprio
(exemplo: `app.seudominio.com.br`). Tudo aqui é feito nos painéis (Vercel, registrador, Supabase,
Cloudflare, Asaas etc.); o código já lê o endereço de `NEXT_PUBLIC_SITE_URL`.

**O endereço antigo continua funcionando.** A Vercel mantém `<projeto>.vercel.app` ligado ao
projeto, então nada quebra enquanto você troca. Não redirecione o antigo para o novo: webhooks
(Asaas, Focus, Pluggy) mandam POST e não seguem redirecionamento.

## Qual endereço usar

- **Recomendado: um subdomínio**, como `app.seudominio.com.br`. É um registro CNAME só, não mexe
  no site nem no e-mail que já estejam no domínio principal.
- Domínio "pelado" (`seudominio.com.br`) também funciona, com registro A, e a Vercel sugere
  adicionar o `www` junto redirecionando para ele.

## 1. Vercel: adicionar o domínio

1. vercel.com > time do Balbina > projeto do app > **Settings > Domains** > **Add Domain**.
2. Digite o endereço escolhido e confirme (ambiente **Production**).
3. A Vercel mostra o registro DNS que falta. Copie exatamente o que ela mostrar. Normalmente:
   - subdomínio (`app`): **CNAME** `app` → o valor indicado (algo como `xxxx.vercel-dns-0xx.com`
     ou `cname.vercel-dns.com`);
   - domínio principal: **A** `@` → o IP indicado (ex.: `216.198.79.1` ou `76.76.21.21`).
4. Se o domínio já tem um registro **CAA**, inclua `0 issue "letsencrypt.org"`; sem CAA não precisa.

## 2. Registrador (Registro.br, Hostinger, GoDaddy, Cloudflare...)

1. Abra a zona DNS do domínio e crie o registro do passo 1.3 (tipo, nome e valor iguais aos da
   Vercel; TTL padrão).
2. No **Registro.br**: Domínios > o domínio > **Editar zona** (se usar os DNS do Registro.br).
3. Na **Cloudflare**: deixe a nuvem **cinza (DNS only)**, não laranja.
4. Volte em Vercel > Domains e espere ficar **Valid Configuration** (minutos, às vezes até algumas
   horas). O certificado HTTPS é emitido sozinho pela Vercel, sem custo.

## 3. Captcha (Cloudflare Turnstile) — antes de usar o endereço novo

dash.cloudflare.com > **Turnstile** > widget "Balbina" > **Hostname management**: adicione o domínio
novo (mantenha `<projeto>.vercel.app` e `localhost`). Sem isso o login no endereço novo falha no
captcha.

## 4. Vercel: variável do endereço

1. Settings > **Environment Variables** > `NEXT_PUBLIC_SITE_URL` (Production) > editar para
   `https://app.seudominio.com.br` (sem barra no final).
2. **Deployments** > último de produção > **⋯ > Redeploy**. Variáveis `NEXT_PUBLIC_` só valem depois
   de um novo deploy.

Ela monta: links de convite e de e-mail do login/MFA, links de pedido, endereço da API pública e
os webhooks que o app cadastra sozinho (Asaas da piscicultura, Focus NFe, Pluggy).

## 5. Supabase (projeto da produção, o de `BALBINA_REF_PRODUCAO`)

1. **Authentication > URL Configuration**:
   - **Site URL**: `https://app.seudominio.com.br`.
   - **Redirect URLs**: adicione `https://app.seudominio.com.br/**` e **mantenha**
     `https://<projeto>.vercel.app/**` por enquanto.
2. **Vault** (Project Settings > Vault, ou SQL): troque o segredo `balbina_url` para o endereço
   novo. É ele que a rotina de 5 em 5 minutos chama para entregar os webhooks da API pública.

Sem o passo 1, "esqueci minha senha", confirmação de cadastro e código de MFA por e-mail voltam
para o endereço errado.

## 6. Webhooks e serviços externos

Como o endereço antigo continua de pé, isto pode ser feito com calma, mas faça para não depender
dele:

- **Asaas, conta do Balbina (assinaturas)**: Integrações > Webhooks > editar a URL para
  `https://app.seudominio.com.br/api/webhooks/assinatura` (mesmo token).
- **Asaas, conta de cada piscicultura (cobranças)**: o app cadastrou com o endereço antigo. Depois do
  passo 4, no Asaas da piscicultura, Integrações > Webhooks, edite a URL trocando só o começo
  (`.../api/webhooks/asaas?perfil=...` continua igual).
- **Focus NFe**: no app, Notas > configuração fiscal > botão de cadastrar o aviso automático.
  Se a Focus disser que o aviso já existe, apague o antigo no painel da Focus e clique de novo.
- **Pluggy (Open Finance)**: nada a fazer; o app manda o endereço novo a cada conexão.
- **Postmark (caixa de e-mail)** e **WhatsApp (Meta)**, se ligados: troque o host do webhook
  (`/api/entrada/email` e `/api/entrada/whatsapp`).
- **GitHub** > Settings > Secrets and variables > Actions > **Variables**: crie `BALBINA_URL` com o
  endereço novo (usado pela reserva de entrega dos webhooks).

## 7. Conferir

- Abrir o endereço novo, entrar com senha + captcha + MFA.
- "Esqueci minha senha" chega com link para o domínio novo.
- Configurações > API mostra o endereço novo.
- Em Vercel > Domains o domínio aparece **Valid** com cadeado.

Quando tudo estiver no endereço novo por algumas semanas, dá para tirar
`https://<projeto>.vercel.app/**` das Redirect URLs do Supabase e do Turnstile.
