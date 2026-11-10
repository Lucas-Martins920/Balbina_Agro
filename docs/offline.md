# Balbina sem internet

O Balbina foi feito para a fazenda: o sinal some na beira do viveiro e às vezes na sede inteira. Este documento
explica o que funciona sem internet, onde os dados ficam no aparelho, como eles voltam para o servidor e como ligar a
IA local (Ollama).

## O que funciona sem internet

| Onde | Sem internet |
|---|---|
| App de campo (`/campo`) | Tudo: lançar ração, mortes, água, insumos, biometria, abrir e fechar lote. Fica na fila do aparelho e vai sozinho. O chat responde pela IA local (se ligada) ou pela base de manejo guardada no celular. |
| App do vendedor (`/vendedor`) | Fazer pedido. Fica na fila e vai sozinho. |
| Escritório (painel, lotes, financeiro, estoque, relatórios...) | Consultar: toda tela aberta com internet fica guardada, e as telas do menu são guardadas de antemão (uma vez a cada 12 h). Um aviso no topo diz que é a última versão guardada. Gravar algo nessas telas ainda precisa de internet. |
| Tela nunca aberta neste aparelho | Mostra "Sem internet" com a lista das telas guardadas. |

Quando a internet volta, o aviso some, a tela busca os números novos sozinha e as filas são enviadas.

## Onde os dados ficam: IndexedDB (`src/lib/db/indexeddb.ts`)

- Banco `balbina`, loja `dados`, chave e texto (JSON), igual ao que antes ficava no `localStorage`.
- O React lê de uma cópia em memória (o IndexedDB só responde de forma assíncrona); cada gravação muda a memória na hora
  e vai para o banco logo em seguida. Outras abas ficam sabendo pelo `BroadcastChannel`.
- Na primeira abertura, o que estava no `localStorage` com prefixo `balbina:campo:` ou `balbina:vendedor:` (filas,
  enviados, conversa do chat, aba e kg do saco) passa para o IndexedDB e sai do `localStorage`. Nada se perde.
- Continuam no `localStorage` só as preferências lidas antes de a página desenhar (tema, lateral recolhida, versão
  completa), o aviso de cookies, os tutoriais vistos e o caixa do PDV.
- Sem IndexedDB (aba anônima de navegador antigo), o armazém cai para o `localStorage`.
- `navigator.storage.persist()` pede ao navegador para não apagar esses dados quando faltar espaço.

## Como os dados voltam: sincronização (`src/lib/sync/`)

- `detector.ts`: tem internet de verdade? O `navigator.onLine` diz "online" no Wi-Fi da sede mesmo sem internet; o
  detector confirma com um pedido pequeno ao servidor e, sem resposta, confere de novo a cada 10 s.
- `worker.ts`: cada tela com fila registra uma tarefa. Com internet, roda a cada **5 s** as que têm algo pronto, e na
  hora em que a internet volta ou a tela volta para a frente. Uma tarefa nunca roda duas vezes ao mesmo tempo.
- `queue.ts`: tentativas com limite. Erro temporário do servidor (5xx, 429) espera 5 s, 10 s, 20 s... até 5 min entre
  tentativas e, depois de **8**, o item para com "toque em Reenviar". Dado recusado (4xx) para na hora e espera a
  pessoa. Falta de sinal não conta como tentativa.
- **Background Sync** (Chrome do Android): ao sair do app com algo na fila, o aparelho registra o sync
  `balbina-envios`. Quando a internet volta, o service worker acorda: com uma tela do Balbina aberta, pede para ela
  sincronizar; sem tela aberta, ele mesmo lê a fila no IndexedDB e envia, com as mesmas regras. Cada envio leva um
  `client_id`, então o servidor ignora o repetido se a tela e o service worker mandarem o mesmo item.

## Telas guardadas: service worker (`public/sw.js`)

No `npm run dev` o service worker fica desligado (e o que um dev antigo deixou registrado é removido): o "aquecer"
obrigava o Turbopack a compilar todas as telas do menu. Para testar o offline, use `npm run build && npm run start`
(é o que o E2E faz) ou ponha `NEXT_PUBLIC_SW_DEV=1` no `.env.local`. Detalhes em `docs/ambiente-leve.md`.

- Arquivos estáticos (`/_next/static`, ícones): cache primeiro.
- Toda navegação de página (menos `/api`, `/auth`, `/login` e as telas de cadastro/assinatura): rede primeiro, e se a
  rede cair ou demorar (6 s no campo/vendedor, 8 s no escritório), a última versão guardada.
- O app pede para guardar as telas do menu de antemão (`src/components/offline.tsx`), uma de cada vez.
- Ao abrir a tela de login (sair da conta), as telas guardadas são apagadas: eram da pessoa anterior. As filas não são
  apagadas, para não perder lançamento que ainda não foi enviado.
- Ao mudar a forma do cache, suba a versão em `ESTATICO` ou `TELAS`.

## IA sem internet: Ollama (`src/lib/ai/offline-chat.ts`)

O chat do campo tenta, nesta ordem:

1. **Claude** no servidor (`ANTHROPIC_API_KEY`), com internet e dentro do limite do mês.
2. **Ollama** de um computador da fazenda: pelo servidor (`OLLAMA_URL`) ou, sem internet nenhuma, direto do aparelho
   (`NEXT_PUBLIC_OLLAMA_URL`). Usa as mesmas instruções e o mesmo formato do Claude, então também gera os cartões de
   lançamento para conferir. Não conta no limite do mês.
3. **Base do celular**: a base de manejo do tambaqui (Embrapa) e a leitura da frase em cartão, que sempre respondem.

`GET /api/chat` mostra quem está respondendo agora (Claude ligado, Ollama ligado e com o modelo baixado).

### Ligar o Ollama no computador da sede

1. Instale o Ollama: https://ollama.com/download (Windows, macOS ou Linux).
2. Baixe o modelo e deixe o Ollama rodando:

   ```bash
   ollama pull mistral        # ou: ollama pull neural-chat
   ollama serve               # no Windows/macOS o aplicativo já deixa rodando
   ```

3. **Balbina rodando no mesmo computador** (`npm run local` ou `npm run start`): no `.env.local`,

   ```bash
   OLLAMA_URL=http://127.0.0.1:11434
   OLLAMA_MODELO=mistral
   ```

   O servidor pergunta ao Ollama quando o Claude não responde (por exemplo, a sede sem internet).

4. **Navegador do próprio computador sem internet** (site na nuvem aberto do cache): o navegador só deixa o site https
   falar com `http://localhost` ou com outro endereço https. Para o próprio computador:

   ```bash
   NEXT_PUBLIC_OLLAMA_URL=http://localhost:11434   # na Vercel, vale a partir do próximo build
   OLLAMA_ORIGINS=https://SEU-DOMINIO ollama serve # libera o site no Ollama (ou variável de ambiente do sistema)
   ```

5. **Celulares no Wi-Fi da sede**: o Ollama precisa de um endereço https na rede da fazenda (por exemplo um proxy com
   certificado, como Caddy, na frente do Ollama), e esse endereço vai em `NEXT_PUBLIC_OLLAMA_URL`. Sem isso, o celular
   responde pela base guardada nele.

O modelo `mistral` (7B) roda em computador com uns 8 GB de memória; numa máquina mais fraca, a resposta demora, e
passados 45 s (60 s no servidor) o chat responde pela base do celular.

## Testes

- `npm test`: armazém (`src/lib/db/indexeddb.test.ts`, com `fake-indexeddb`), tentativas e relógio de 5 s
  (`src/lib/sync/sync.test.ts`), Ollama com um servidor de mentira (`src/lib/ai/offline-chat.test.ts`) e a fila do campo.
- `e2e/offline.spec.ts` (Playwright, navegador de verdade com o Supabase local): telas guardadas, tela nunca aberta,
  sair apaga as telas, fila no IndexedDB enviada sozinha ao voltar a internet e chat sem internet.
