# Rodar o Balbina na sua máquina

Para ver cada alteração na hora, sem commit (o que já está no `Teste-Desevolvimento` aparece também no [site de teste](site-de-teste.md)). Você salva o arquivo no VS Code e a
página no navegador se atualiza sozinha.

> **Por que não o Live Server do VS Code?** O Live Server só serve páginas HTML prontas. O Balbina é um app
> Next.js: as telas são montadas por um servidor Node e os dados vêm do Supabase. O equivalente do Live
> Server aqui é o `npm run dev` (dentro do `npm run local`), que já recarrega a página a cada vez que você salva.

## O banco: Supabase local, no Docker

O `npm run local` sobe uma cópia do Supabase (banco, login e API) dentro do Docker, na sua máquina, com
todas as migrations do repositório. Nada vai para a nuvem e nada encosta na produção.

| | Supabase local (o padrão) | Projeto Supabase de dev na nuvem |
|---|---|---|
| Custo | grátis | grátis (o plano Free permite 2 projetos) |
| Precisa de | Docker Desktop (uns 3 GB de disco e 2 GB de memória livres) | só internet |
| Migrations | aplicadas sozinhas a cada `npm run local` | você aplica com `scripts/aplicar-migracoes.sh` |
| Dados | só na sua máquina; `npm run local:zerar` recomeça do zero em segundos | ficam na nuvem, iguais em qualquer computador |
| Risco de mexer na produção | nenhum | baixo, mas é mais uma chave para não confundir |

Escolhemos o local porque é o mesmo banco que os testes automáticos (E2E) usam no CI, não depende de
ninguém configurar nada no painel do Supabase e pode ser apagado sem medo. Se o Docker pesar demais no seu
computador, use um projeto de dev na nuvem (seção no fim).

## Uma vez só: instalar

1. **Node.js 22 LTS**: https://nodejs.org (botão LTS). Confira no terminal: `node -v` mostra `v22...`.
2. **Docker Desktop**: https://www.docker.com/products/docker-desktop. No Windows ele pede o WSL 2;
   aceite e reinicie se pedir. Abra o Docker Desktop e espere o ícone ficar verde ("Engine running").
3. **Git** e **VS Code**, se ainda não tiver.
4. Baixe o código e instale as dependências (no terminal do VS Code: menu Terminal > New Terminal):

   ```bash
   git clone https://github.com/Lucas-Martins920/balbina_agro.git
   cd balbina_agro
   git checkout Teste-Desevolvimento
   npm install
   ```

## Todo dia: rodar

Com o Docker Desktop aberto, no terminal do VS Code, dentro da pasta do projeto:

```bash
git pull            # pega o que entrou no Teste-Desevolvimento
npm run local
```

O `npm run local` faz quatro coisas, e mostra cada uma (antes, se o `package-lock.json` mudou desde a última
vez, ele roda o `npm install` sozinho):

1. sobe o Supabase local (na primeira vez baixa as imagens do Docker, leva de 3 a 10 minutos);
2. aplica as migrations novas;
3. escreve no `.env.local` o endereço e as chaves do banco local (o resto do arquivo é mantido) e, se ainda
   não existir, cria a conta de teste (veja Primeiro acesso);
4. abre o `npm run dev`.

Quando aparecer `✓ Ready`, abra **http://localhost:3000** no navegador. Pronto: edite qualquer arquivo em
`src/`, salve (Ctrl+S) e a tela atualiza sozinha.

Para parar: **Ctrl+C** no terminal. O banco continua ligado no Docker (rápido para a próxima vez);
para desligar também: `npm run local:parar`. Os dados ficam guardados.

### Primeiro acesso: já existe uma conta pronta

O banco local é separado da produção: sua conta de verdade não existe nele. Por isso o `npm run local` cria,
na primeira vez, uma **conta de teste** já confirmada, dona de uma piscicultura de teste (vazia):

| | |
|---|---|
| E-mail | `admin@balbina.local` |
| Senha | `balbina1234` |
| Piscicultura | Piscicultura Teste (CNPJ 11.222.333/0001-81), você é o master |

Abra http://localhost:3000, digite esse e-mail e essa senha e clique em **Entrar**. Não pede confirmação de
e-mail nem código do 2º fator. Os mesmos dados aparecem no terminal quando o `npm run local` abre o app.

Essa conta só existe no Docker da sua máquina; na produção ela não existe e nada muda lá (confirmação de
e-mail e 2º fator continuam obrigatórios na produção). Se você rodar `npm run local:zerar`, tudo é apagado e o
próximo `npm run local` cria a conta de teste de novo.

**Já tinha o banco local e travou no e-mail/código?** Rode uma vez `npm run local:zerar` e depois `npm run local`.

#### Por que no local não pede o 2º fator

Na produção o banco só entrega dados depois do 2º fator. No banco local, ao criar a conta de teste, o
`npm run local` liga a chave de emergência que já existe no banco (`exigir_2fa = 'nao'`, tabela
`app.parametros`): o 2º fator vira opcional, só para quem cadastrar o app autenticador. Isso é feito por dentro
do contêiner do Docker, então não tem como alcançar a produção.

Quer testar o 2º fator na sua máquina? No Supabase Studio local (http://127.0.0.1:54323), em SQL Editor, rode
`update app.parametros set valor = 'sim' where chave = 'exigir_2fa';`. Ele fica ligado até o próximo
`npm run local:zerar`. Com ele ligado, o código chega por e-mail na caixa local: http://127.0.0.1:54324 (Mailpit).

#### Criar outra conta pela tela

Também dá para criar contas pela tela (qualquer e-mail inventado, por exemplo `nicolas@teste.local`; nenhum
e-mail sai da máquina): **Ainda não tem conta? Criar conta**, e-mail, senha de 8 caracteres ou mais, aceite e
**Criar conta**. Não há e-mail de confirmação nem captcha no local. O assistente de primeiros passos guia o
cadastro da piscicultura (setores, viveiros, lotes); para ter dados parecidos com os reais, use a importação pela planilha modelo.

Para ver ou editar as tabelas direto: **http://127.0.0.1:54323** (Supabase Studio local).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run local` | sobe o banco local (e-mails em http://127.0.0.1:54324), aplica migrations novas, ajusta o `.env.local` e roda o app |
| `npm run local:parar` | desliga o banco local (os dados ficam) |
| `npm run dev:iniciar` / `npm run dev:parar` | modo leve para notebook de 8 GB no Linux, e desligar tudo (Docker e VS Code juntos): `docs/ambiente-leve.md` |
| `npm run local:zerar` | apaga os dados do banco local e reaplica todas as migrations (o próximo `npm run local` recria a conta de teste) |
| `npm run dev` | só o app, se o banco local já estiver ligado |
| `npm test`, `npm run lint`, `npm run typecheck` | as conferências que o CI também roda |

## O `.env.local`

Fica só na sua máquina (o git ignora). O `npm run local` cria a partir do `.env.example` e preenche:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`: banco local
  (`http://127.0.0.1:54321` e as chaves de demonstração do Supabase local, que só valem na sua máquina);
- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`;
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` vazio (sem captcha);
- `BALBINA_CHAVE_CRIPTO`: gerada uma vez, depois nunca troca.

Asaas, Focus NFe e Pluggy ficam vazios: as telas abrem, só a integração não funciona. Para testar uma
delas, cole no `.env.local` as chaves de **sandbox/homologação** (nunca as de produção: fora da produção o app
recusa o Asaas de produção). Depois de mudar o `.env.local`, pare (Ctrl+C) e rode `npm run local` de novo.

Se o `.env.local` apontava para o banco de produção, o `npm run local` guarda uma cópia em
`.env.local.producao.bak` antes de trocar. Se algum dia o app rodando na sua máquina estiver ligado ao
banco de produção, aparece uma faixa vermelha no topo avisando.

## Problemas

- **"O Docker não está rodando"**: abra o Docker Desktop e espere ficar verde.
- **Porta ocupada (54321, 54322, 54323 ou 3000)**: outro programa usa a porta. `npm run local:parar` e feche
  outros `npm run dev`; se for outro projeto Supabase, rode `npx supabase stop --all`.
- **A tela pede confirmação de e-mail ou código e não chega nada**: `npm run local:zerar` e depois
  `npm run local`; entre com `admin@balbina.local` / `balbina1234`.
- **"Module not found: Can't resolve ..."**: falta instalar um pacote novo. O `npm run local` instala
  sozinho quando o `package-lock.json` muda; se você usa só `npm run dev`, rode `npm install` antes.
- **Migration falhou / banco estranho**: `npm run local:zerar` e depois `npm run local`.
- **Tela não atualiza ao salvar**: confira se salvou o arquivo e se o terminal mostra `Compiled`. No Windows,
  deixe o projeto numa pasta comum (por exemplo `C:\projetos\balbina_agro`), não dentro do OneDrive.

## Alternativa sem Docker: projeto Supabase de dev na nuvem

1. No Supabase, crie um projeto (por exemplo `balbina-dev`), região South America (São Paulo).
2. Em Authentication > URL Configuration: Site URL `http://localhost:3000` e Redirect URL
   `http://localhost:3000/**`. Em Authentication > Sign In, desligue "Confirm email" se quiser entrar sem e-mail.
3. Aplique as migrations (Connect > Session pooler copia o endereço):
   `DATABASE_URL="<connection string>" ./scripts/aplicar-migracoes.sh` (no Windows, pelo Git Bash).
4. `cp .env.example .env.local` e preencha URL, chave publicável e chave secreta desse projeto,
   `NEXT_PUBLIC_SITE_URL=http://localhost:3000` e um `BALBINA_CHAVE_CRIPTO` aleatório.
5. `npm run dev` e abra http://localhost:3000. Repita o passo 3 quando entrarem migrations novas.
