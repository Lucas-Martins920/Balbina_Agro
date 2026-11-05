# Balbina Agro V1 - Documentacao Completa

**Versao:** 1.0  
**Status:** V1 em desenvolvimento, organizada em monorepo
**Escopo:** piscicultura, autenticacao, caixa, lotes, estoque, contas a pagar, chat operacional e sincronizacao assincrona  
**Data da ultima revisao:** 04/11/2026

---

## 1. Visao geral

Balbina Agro V1 e um sistema operacional para piscicultura, com controle financeiro e produtivo de lotes de peixe e conhecimento tecnico local voltado a tambaqui. O campo especie e configuravel e o backend nao restringe os lotes a uma unica especie. O repositorio esta dividido em tres aplicacoes: API compartilhada, app de campo e painel de gestao.

A V1 implementa os seguintes pilares:

- registrar operacoes por chat com IA;
- controlar caixa com entradas, saidas e saldo;
- abrir e fechar lotes, calculando custo por kg;
- controlar estoque basico de peixe e racao;
- persistir dados e fila de sincronizacao em SQLite no backend;
- sincronizar opcionalmente os registros para PostgreSQL;
- disponibilizar um app de campo React/Vite com suporte Android via Capacitor;
- disponibilizar um painel web separado para gestao financeira e relatorios.

O termo local-first descreve a persistencia SQLite no backend e o envio remoto assincrono. O frontend ainda depende de conectividade com a API para carregar e gravar dados; nao ha banco/cache local no dispositivo para continuar operando quando a API estiver indisponivel. A V1 nao cobre sensores, voz, notas fiscais, fornecedores completos, integracao bancaria, visao computacional ou multi-producao.

---

## 2. Estrutura do projeto

```text
Balbina_Agro/
├── balbina-backend/             # API Node.js/Express, SQLite, IA e sync PostgreSQL
│   ├── src/
│   │   ├── server.ts             # API REST principal
│   │   ├── auth.ts               # Login, JWT e protecao de rotas
│   │   ├── db.ts                 # Inicializacao do SQLite e schema local
│   │   ├── repositories/         # Persistencia SQLite por dominio
│   │   └── services/             # Producao, manejo e sincronizacao
│   ├── conhecimento_tambaqui.txt
│   └── package.json
├── balbina-campo/                # App React/Vite das operacoes de viveiro
│   ├── src/App.tsx               # Login, operacao de campo e chat
│   ├── src/api/client.ts         # Cliente HTTP autenticado
│   ├── src/components/           # Acoes de producao
│   ├── capacitor.config.ts       # Configuracao do Capacitor
│   └── android/                  # Projeto Android
├── balbina-gestao/               # Painel React/Vite financeiro e administrativo
│   ├── src/App.tsx               # Caixa, contas, vendas e visao gerencial
│   └── src/api/client.ts         # Cliente HTTP autenticado
├── docs/                         # Documentacao funcional e tecnica
├── CLAUDE.md                     # Resumo das responsabilidades do monorepo
└── README.md                     # Guia rapido e documentacao
```

Arquivos de planejamento ja existentes:

- `docs/V1 — ESCOPO FECHADO — Sistema.md`
- `docs/# Índice de Documentação — V1.md`

As antigas pastas `backend/`, `frontend/` e `app/` foram removidas. Os projetos ativos sao `balbina-backend/`, `balbina-campo/` e `balbina-gestao/`. Esta documentacao descreve a V1 conforme implementada nesses projetos.

O arquivo SQLite e criado em tempo de execucao (por padrao, em `balbina-backend/balbina_v1.db`) e nao e um artefato necessario no repositorio.

---

## 3. Stack tecnica

### Backend

- Node.js
- TypeScript
- Express 5
- better-sqlite3
- pg
- Zod
- uuid
- dotenv

### Frontend

- React
- TypeScript
- Vite
- Capacitor 7
- App Android via projeto `balbina-campo/android`
- Painel de gestao web separado em `balbina-gestao/`

### IA

- API local compativel com OpenAI Chat Completions
- Padrao atual: `http://localhost:11434/v1/chat/completions`
- Modelo padrao do chat operacional: `qwen2.5:0.5b`
- Modelo padrao do manejo tecnico: `qwen2.5:1.5b`
- Uso principal:
  - extrair JSON estruturado para abertura de lote;
  - extrair JSON estruturado para lancamento de insumo;
  - responder perguntas de manejo usando conhecimento local.

### Banco local

- SQLite em `balbina-backend/balbina_v1.db`
- Caminho configuravel por `DB_PATH`
- Schema criado automaticamente em `balbina-backend/src/db.ts`

### Autenticacao

- Login em `/api/login`
- Token JWT assinado com `JWT_SECRET`
- Validade do token: 7 dias
- Todos os endpoints `/api`, exceto `/api/login` e `/api/health`, exigem `Authorization: Bearer <token>`

---

## 4. Como rodar localmente

### 4.1. Requisitos

- Node.js instalado
- npm instalado
- Ollama rodando localmente, se os endpoints de chat forem usados
- Modelo `qwen2.5:0.5b` para o chat operacional e, se usado, `qwen2.5:1.5b` para manejo; ambos podem ser configurados por variaveis de ambiente
- Android Studio e SDK Android, se for rodar no emulador/celular

### 4.2. Backend

Dentro de `balbina-backend/`:

```bash
cd balbina-backend
npm install
npm run dev
```

Servidor padrao:

```text
http://localhost:3000
```

Variaveis de ambiente suportadas:

```bash
PORT=3000
HOST=0.0.0.0
DB_PATH=./balbina_v1.db
JWT_SECRET=troque-por-um-segredo-forte
AUTH_USER=admin
AUTH_PASSWORD=senha-local
IA_API_KEY=opcional
DATABASE_URL=postgres://usuario:senha@host:5432/banco
```

Observacoes:

- `IA_API_KEY` e opcional para uma instalacao Ollama local sem autenticacao; quando definida, e enviada como `Authorization: Bearer ...`.
- `IA_API_URL` e `IA_MODEL` configuram URL e modelo do chat operacional.
- `IA_MANEJO_URL` e `IA_MANEJO_MODEL` configuram URL e modelo do endpoint de manejo; por padrao, herdam a URL do chat e usam `qwen2.5:1.5b`.
- `DATABASE_URL` ativa a sincronizacao remota com PostgreSQL por meio de um worker em segundo plano.

### 4.3. Frontend web

Dentro de `balbina-campo/` para o app de campo:

```bash
npm install
npm run dev
```

Variavel de ambiente opcional:

```bash
VITE_API_URL=http://localhost:3000
```

Se `VITE_API_URL` nao for definida, o app usa `http://localhost:3000`.

Para iniciar o painel de gestao, use outro terminal e execute os mesmos comandos dentro de `balbina-gestao/`. Ambos os frontends aceitam `VITE_API_URL` e, por padrao, usam a API local na porta 3000.

### 4.4. Android com Capacitor

Dentro de `balbina-campo/`:

```bash
npm run android:sync
npm run android:open
```

Para rodar no dispositivo/emulador:

```bash
npm run android:run
```

O script `android:run` executa:

- build do frontend;
- sync do Capacitor;
- `adb reverse tcp:3000 tcp:3000`;
- execucao no Android.

Configuracao Capacitor atual:

```ts
appId: "br.com.balbinaagro.app"
appName: "Balbina Agro"
webDir: "dist"
android.allowMixedContent: true
```

---

## 5. Modulos da V1

### 5.1. Chat operacional

O chat no frontend aceita mensagens em texto e decide localmente o fluxo:

- se a mensagem contem `saldo` ou `caixa`, consulta `/api/caixa/saldo`;
- se contem termos de insumo, envia para `/api/lancar-insumo`;
- se contem `abrir lote`, `novo lote` ou `criar lote`, envia para `/api/abrir-lote`;
- caso contrario, informa que pode abrir lote, registrar insumo ou consultar saldo.

O backend usa `ChatService` para chamar o modelo e validar a resposta com Zod. A abertura de lote tem fallback de interpretacao local quando a IA falha ou retorna JSON invalido; o lancamento de insumo depende de uma resposta valida da IA. O frontend nao encaminha perguntas gerais para o endpoint de manejo tecnico: mensagens sem uma intencao reconhecida recebem uma orientacao de uso.

### 5.1.1. Login e sessao

Antes de acessar o painel, o usuario passa pela tela de login do frontend.

Fluxo:

1. Frontend envia usuario e senha para `POST /api/login`.
2. Backend valida contra `AUTH_USER` e `AUTH_PASSWORD`.
3. Backend devolve um JWT valido por 7 dias.
4. Frontend salva o token em `localStorage`.
5. `apiFetch` inclui `Authorization: Bearer <token>` nas chamadas seguintes.
6. Se a API responder `401`, o token local e removido e a tela volta para login.

### 5.2. Manejo tecnico

Endpoint dedicado:

```text
POST /api/chat/manejo
```

Ele carrega `balbina-backend/conhecimento_tambaqui.txt` e instrui a IA a responder somente com base nesse conhecimento. Se nao houver informacao local suficiente, a resposta esperada e:

```text
Não há informação cadastrada para essa pergunta.
```

### 5.3. Lotes

Funcionalidades:

- abertura de lote via chat;
- listagem de lotes;
- fechamento manual de lote;
- calculo de custo total;
- calculo de custo por kg;
- entrada automatica de peixe no estoque quando o lote e fechado.

Formula:

```text
custo_por_kg = soma das saidas de caixa vinculadas ao lote / kg_colhidos
```

### 5.4. Insumos

O lancamento de insumo ocorre via chat e cria registro em `insumos`.

Quando `precoUnitario` vem preenchido, o backend tambem cria uma saida no caixa:

```text
total = precoUnitario * quantidade
```

### 5.5. Caixa

O caixa registra:

- entradas;
- saidas;
- descricao;
- referencia de origem;
- lote relacionado, quando houver.

O painel tambem permite lancamento manual de entrada/saida e mostra o historico dos movimentos. Compras de insumo com preco unitario geram automaticamente uma saida no caixa; vendas geram uma entrada.

Saldo:

```text
saldo = total de entradas - total de saidas
```

### 5.6. Vendas

Regras implementadas:

- exige lote existente;
- exige lote com status `fechado`;
- impede vender mais quilos do que o saldo colhido ainda disponivel no lote;
- registra venda;
- cria saida de estoque de peixe;
- cria entrada de caixa;
- grava venda, movimento de estoque, movimento de caixa e fila de sincronizacao em uma transacao atomica.

### 5.7. Estoque

Categorias aceitas:

- `racao`
- `peixe`

Tipos de movimento:

- `entrada`
- `saida`

O estoque e calculado pela soma dos movimentos:

```text
saldo = entradas - saidas
```

Saidas maiores que o saldo disponivel sao bloqueadas.

### 5.8. Contas a pagar

Funcionalidades:

- criar conta a pagar;
- listar contas;
- listar alertas de contas abertas com vencimento nos proximos 7 dias, incluindo contas vencidas ainda abertas;
- marcar conta como paga.

Status:

- `aberta`
- `paga`

Marcar como paga atualiza o status e a data de pagamento; nao cria automaticamente um movimento de saida no caixa.

### 5.9. Persistencia local e sincronizacao remota

As operacoes suportadas gravam primeiro no SQLite do backend e registram a sincronizacao pendente na mesma transacao quando aplicavel. Isso nao torna o frontend offline: o aplicativo precisa acessar a API para consultar ou enviar operacoes.

Depois, o sistema insere uma entrada em `sync_queue` com:

- entidade;
- operacao;
- payload JSON;
- status;
- tentativas;
- ultimo erro.

Quando `DATABASE_URL` esta configurado, o `PostgresSyncWorker` roda a cada 5 segundos por padrao, processa lotes de ate 10 itens e tenta cada registro no maximo 5 vezes:

- garante a existencia das tabelas remotas no PostgreSQL;
- busca um lote de pendencias locais;
- converte nomes camelCase para snake_case quando necessario;
- faz `INSERT ... ON CONFLICT (id) DO UPDATE`;
- marca a fila como `synced` quando da certo;
- incrementa tentativas quando falha;
- marca como `error` ao atingir o limite.

Sem `DATABASE_URL`, a sincronizacao remota fica desativada, mas as operacoes continuam sendo gravadas no SQLite e enfileiradas. O resumo da fila e local ao backend.

---

## 6. API REST

Base local:

```text
http://localhost:3000
```

### 6.0. Autenticacao

```http
POST /api/login
Content-Type: application/json
```

Payload:

```json
{
  "username": "admin",
  "password": "senha-local"
}
```

Resposta:

```json
{
  "token": "jwt",
  "expiresIn": "7d"
}
```

Todos os endpoints abaixo, exceto `/api/health`, exigem:

```http
Authorization: Bearer <token>
```

### 6.1. Saude

```http
GET /api/health
```

Resposta:

```json
{ "ok": true }
```

### 6.2. Lotes

```http
GET /api/lotes
```

Lista lotes cadastrados.

```http
POST /api/abrir-lote
Content-Type: application/json
```

Payload:

```json
{
  "message": "Abrir um lote de 1500 alevinos de tambaqui no tanque 02 hoje"
}
```

Resposta de sucesso:

```json
{
  "ok": true,
  "loteId": "LOTE-001",
  "avisos": []
}
```

```http
POST /api/lotes/:id/fechar
Content-Type: application/json
```

Payload:

```json
{
  "kgColhidos": 340,
  "dataFechamento": "2026-08-20"
}
```

Resposta:

```json
{
  "ok": true,
  "loteId": "LOTE-001",
  "status": "fechado",
  "dataFechamento": "2026-08-20",
  "kgColhidos": 340,
  "custoTotal": 1230,
  "custoPorKg": 3.6176470588235294
}
```

### 6.3. Insumos

```http
POST /api/lancar-insumo
Content-Type: application/json
```

Payload:

```json
{
  "message": "Comprei 4 sacos de ração por 700 reais para o tanque 02 hoje"
}
```

Resposta:

```json
{
  "ok": true,
  "insumoId": "INS-123",
  "avisos": []
}
```

Se a IA retornar `precoUnitario`, o sistema registra automaticamente uma saida no caixa.

### 6.4. Caixa

```http
GET /api/caixa/saldo
```

Resposta:

```json
{
  "saldo": 540,
  "entradas": 540,
  "saidas": 0
}
```

```http
GET /api/caixa/movimentos
```

Lista os movimentos de caixa ordenados por data e criacao, do mais recente para o mais antigo.

```http
POST /api/caixa/movimento
Content-Type: application/json
```

Payload:

```json
{
  "tipo": "saida",
  "valor": 200,
  "descricao": "Combustivel",
  "referenciaId": "ABAST-001",
  "loteId": "LOTE-001",
  "dataMovimento": "2026-08-20"
}
```

Campos:

- `tipo`: `entrada` ou `saida`;
- `valor`: numero positivo;
- `descricao`: opcional;
- `referenciaId`: opcional;
- `loteId`: opcional;
- `dataMovimento`: data valida.

### 6.5. Vendas

```http
POST /api/vendas
Content-Type: application/json
```

Payload:

```json
{
  "loteId": "LOTE-001",
  "dataVenda": "2026-08-20",
  "kgVendidos": 30,
  "valorTotal": 540,
  "comprador": "Cliente local"
}
```

Regras:

- `loteId` e obrigatorio;
- lote deve existir;
- lote deve estar fechado;
- `kgVendidos` nao pode ultrapassar `kg_colhidos` menos os quilos ja vendidos;
- `kgVendidos` e `valorTotal` devem ser positivos.

O registro da venda, baixa do estoque, entrada no caixa e enfileiramento para sync ocorre em uma unica transacao SQLite.

```http
GET /api/vendas
```

Lista vendas com dados do lote relacionado.

### 6.6. Contas a pagar

```http
POST /api/contas-pagar
Content-Type: application/json
```

Payload:

```json
{
  "descricao": "Ração pro João",
  "fornecedor": "João",
  "valor": 700,
  "vencimento": "2026-08-30"
}
```

```http
GET /api/contas-pagar
```

Lista todas as contas.

```http
GET /api/contas-pagar/alertas
```

Lista contas abertas com vencimento ate 7 dias a frente; contas vencidas que continuam abertas tambem podem aparecer.

```http
PATCH /api/contas-pagar/:id/pagar
Content-Type: application/json
```

Payload opcional:

```json
{
  "pagoEm": "2026-08-20"
}
```

### 6.7. Estoque

```http
POST /api/estoque/movimentos
Content-Type: application/json
```

Payload:

```json
{
  "item": "tambaqui",
  "categoria": "peixe",
  "quantidade": 30,
  "unidade": "kg",
  "tipoMovimento": "saida",
  "referenciaId": "VENDA-001",
  "dataMovimento": "2026-08-20"
}
```

Campos:

- `categoria`: `racao` ou `peixe`;
- `tipoMovimento`: `entrada` ou `saida`;
- `quantidade`: numero positivo;
- `unidade`: obrigatoria;
- `dataMovimento`: data valida.

```http
GET /api/estoque
```

Lista saldo agregado por item, categoria e unidade.

```http
GET /api/estoque/movimentos
```

Lista movimentos de estoque.

### 6.8. Manejo com IA

```http
POST /api/chat/manejo
Content-Type: application/json
```

Payload:

```json
{
  "pergunta": "Qual o pH ideal para tambaqui?"
}
```

Resposta:

```json
{
  "ok": true,
  "resposta": "Resposta baseada no conhecimento local.",
  "conhecimentoDisponivel": true
}
```

### 6.9. Sincronizacao

```http
GET /api/sync/summary
```

Resposta:

```json
{
  "pending": 2,
  "synced": 10,
  "error": 0
}
```

---

## 7. Banco de dados SQLite

O schema e criado automaticamente em `balbina-backend/src/db.ts`.

### 7.1. `lotes`

Guarda lotes de producao.

Campos principais:

- `id`
- `especie`
- `tanque_id`
- `data_inicio`
- `estoque_inicial`
- `unidade`
- `observacoes`
- `manejo_json`
- `status`
- `data_fechamento`
- `kg_colhidos`
- `custo_total`
- `custo_por_kg`
- `criado_em`

### 7.2. `insumos`

Guarda compras/lancamentos de insumos.

Campos:

- `id`
- `tipo`
- `descricao`
- `quantidade`
- `unidade`
- `preco_unitario`
- `fornecedor`
- `tanque_id`
- `lote_id`
- `data_compra`
- `criado_em`

### 7.3. `caixa`

Guarda movimentos financeiros.

Campos:

- `id`
- `tipo`
- `valor`
- `descricao`
- `referencia_id`
- `lote_id`
- `data_movimento`
- `criado_em`

### 7.4. `sync_queue`

Fila local para sincronizacao.

Campos:

- `id`
- `entity`
- `operation`
- `payload_json`
- `status`
- `attempts`
- `last_error`
- `created_at`
- `updated_at`

### 7.5. `vendas`

Registra vendas de peixe.

Campos:

- `id`
- `lote_id`
- `data_venda`
- `kg_vendidos`
- `valor_total`
- `comprador`
- `criado_em`

### 7.6. `contas_pagar`

Registra compromissos financeiros.

Campos:

- `id`
- `descricao`
- `fornecedor`
- `valor`
- `vencimento`
- `status`
- `pago_em`
- `criado_em`

### 7.7. `estoque`

Registra todos os movimentos de estoque.

Campos:

- `id`
- `item`
- `categoria`
- `quantidade`
- `unidade`
- `tipo_movimento`
- `referencia_id`
- `data_movimento`
- `criado_em`

---

## 8. Fluxos principais

### 8.1. Abrir lote via chat

1. Usuario envia mensagem no frontend.
2. Frontend identifica intencao de lote.
3. Frontend envia `POST /api/abrir-lote`.
4. Backend chama IA.
5. IA retorna JSON estruturado.
6. Zod valida o payload.
7. `structuredOutputHandler` valida regras com conhecimento local.
8. Lote e salvo em `lotes`.
9. Operacao entra em `sync_queue`.
10. Frontend recarrega dashboard.

### 8.2. Registrar insumo via chat

1. Usuario informa compra de racao, alevino, medicamento ou insumo.
2. Frontend envia `POST /api/lancar-insumo`.
3. Backend chama IA e valida JSON.
4. Insumo e salvo.
5. Se houver preco unitario, cria saida no caixa.
6. Insumo e caixa entram na fila de sync.

### 8.3. Fechar lote

1. Usuario abre formulario "Fechar lote".
2. Informa lote, kg colhidos e data.
3. Backend valida lote e status.
4. Backend soma saidas de caixa vinculadas ao lote.
5. Calcula custo por kg.
6. Atualiza lote como `fechado`.
7. Registra entrada de peixe no estoque.
8. Operacao entra na fila de sync.

### 8.4. Registrar venda

1. Usuario informa lote fechado, data, kg vendidos, valor total e comprador.
2. Backend valida lote existente e fechado.
3. Venda e registrada.
4. Estoque recebe saida de peixe.
5. Caixa recebe entrada.
6. Venda, estoque e caixa entram na fila de sync.

### 8.5. Contas a pagar

1. Usuario cria uma conta.
2. Conta nasce como `aberta`.
3. Alertas mostram contas abertas com vencimento ate 7 dias no futuro, incluindo as vencidas ainda abertas.
4. Conta pode ser marcada como `paga`.
5. Criacao e pagamento entram na fila de sync.

---

## 9. Interface da V1

A aplicacao web e Android compartilham a interface React. O painel atual oferece:

- login e manutencao de sessao JWT no navegador;
- navegacao por Visao geral, Caixa e Contas;
- indicadores de saldo e situacao de conectividade/sincronizacao;
- listagem de lotes ativos e fechados, com dados de colheita e custo/kg quando disponiveis;
- resumo do estoque e alertas de contas a pagar;
- historico de movimentos de caixa;
- chat operacional para abrir lote, lancar insumo ou consultar saldo;
- formularios de fechamento de lote, venda, movimentacao de estoque, conta a pagar e movimento manual de caixa;
- acao para marcar uma conta aberta como paga.

As telas consultam a API. Se a API falhar, o painel informa indisponibilidade; nao ha armazenamento offline no frontend. Nao ha navegacao funcional para fruteiras, granja, gado ou outras producoes.

---

## 10. Regras de validacao

### Datas

Datas devem ser strings reconhecidas por `Date.parse`.

### Numeros positivos

Campos financeiros, kg e quantidades operacionais usam numero positivo:

- `valor`
- `kgColhidos`
- `kgVendidos`
- `valorTotal`
- `quantidade`

### Caixa

`tipo` deve ser:

- `entrada`
- `saida`

### Estoque

`categoria` deve ser:

- `racao`
- `peixe`

`tipoMovimento` deve ser:

- `entrada`
- `saida`

### Venda

Venda so pode ocorrer para lote fechado.

### Conta a pagar

Conta paga nao pode ser paga novamente.

---

## 11. Structured output da IA

### 11.1. Abrir lote

Schema esperado:

```json
{
  "action": "abrir_lote",
  "payload": {
    "loteId": "LOTE-001",
    "especie": "tambaqui",
    "tanqueId": "02",
    "dataInicio": "2026-08-20",
    "estoqueInicial": 1500,
    "unidade": "peixes",
    "observacoes": "opcional",
    "manejo": {}
  }
}
```

### 11.2. Lancar insumo

Schema esperado:

```json
{
  "action": "lancar_insumo",
  "payload": {
    "insumoId": "INS-123",
    "tipo": "racao",
    "descricao": "Ração inicial",
    "quantidade": 50,
    "unidade": "kg",
    "precoUnitario": 4.5,
    "fornecedor": "AgroPet",
    "tanqueId": "02",
    "dataCompra": "2026-08-20"
  }
}
```

Tipos de insumo aceitos:

- `racao`
- `alevino`
- `medicamento`
- `outro`

---

## 12. Conhecimento local de tambaqui

O arquivo `balbina-backend/conhecimento_tambaqui.txt` e carregado por `knowledgeLoader.ts`.

Formatos aceitos:

- JSON completo;
- linhas simples no formato `chave: valor`.

Linhas vazias e linhas iniciadas com `#` sao ignoradas.

Uso atual:

- suporte a respostas tecnicas no endpoint de manejo;
- validacao simples de densidade na abertura de lote, se existirem `densidadeMaximaPorM3` e `manejo.volumeM3`.

---

## 13. Sincronizacao remota

Cada operacao local importante chama `enqueueOperation`.

Entidades usadas na fila:

- `lote`
- `insumo`
- `caixa`
- `venda`
- `estoque`
- `conta_pagar`

Mapeamento de entidades para tabelas PostgreSQL no worker:

```text
lote         -> lotes
insumo       -> insumos
caixa        -> caixa
venda        -> vendas
estoque      -> estoque
conta_pagar  -> contas_pagar
```

Operacoes:

- `create` e `update` usam upsert em PostgreSQL;
- `delete` remove por `id`;
- campos desconhecidos no payload sao ignorados;
- `manejo` e salvo como `manejo_json`.

Limites padrao:

- intervalo: 5000 ms;
- lote: 10 itens;
- maximo de tentativas: 5.

---

## 14. Checklist de aceite da V1

Esta lista e um roteiro de validacao manual; caixas desmarcadas nao significam que os recursos nao estejam implementados nem atestam que foram testados.

Use esta lista para validar a primeira versao:

- [ ] Backend sobe com `npm run dev` dentro de `balbina-backend/`.
- [ ] App de campo sobe com `npm run dev` dentro de `balbina-campo/`.
- [ ] Painel de gestao sobe com `npm run dev` dentro de `balbina-gestao/`.
- [ ] `GET /api/health` retorna `{ "ok": true }`.
- [ ] Login retorna token quando `JWT_SECRET` e `AUTH_PASSWORD` estao configurados.
- [ ] Endpoints protegidos recusam chamadas sem `Authorization: Bearer <token>`.
- [ ] Chat abre lote com mensagem em linguagem natural.
- [ ] Chat registra insumo com mensagem em linguagem natural.
- [ ] Compra de insumo com preco gera saida no caixa.
- [ ] Saldo do caixa mostra entradas, saidas e saldo correto.
- [ ] Lote pode ser fechado com kg colhidos.
- [ ] Fechamento calcula custo total e custo por kg.
- [ ] Fechamento gera entrada de peixe no estoque.
- [ ] Venda exige lote fechado.
- [ ] Venda gera entrada no caixa.
- [ ] Venda gera saida no estoque.
- [ ] Estoque bloqueia saida maior que saldo disponivel.
- [ ] Conta a pagar pode ser criada.
- [ ] Alertas mostram contas abertas vencendo em ate 7 dias.
- [ ] Conta pode ser marcada como paga.
- [ ] Operacoes entram em `sync_queue`.
- [ ] `GET /api/sync/summary` mostra pendentes/sincronizados/erros.
- [ ] App Android sincroniza build com Capacitor.

---

## 15. Limitacoes conhecidas da implementacao atual

- O app de campo e o painel de gestao sao projetos independentes que compartilham a API em `balbina-backend/`.
- O estado e os fluxos de cada frontend ficam principalmente em `balbina-campo/src/App.tsx` e `balbina-gestao/src/App.tsx`; acoes de producao ficam nos componentes correspondentes de cada projeto.
- O frontend depende da API para leitura e escrita; a fila SQLite no backend nao oferece modo offline no aparelho.
- O endpoint de lancamento de insumo tenta vincular o custo ao lote ativo do tanque informado; se nao houver lote ativo para o tanque, o movimento de caixa fica sem `lote_id`.
- Sem `DATABASE_URL`, o worker PostgreSQL nao inicia e a sincronizacao remota fica desativada.
- A suite automatizada de API cobre fluxos principais com SQLite temporario, mas nao verifica sincronizacao PostgreSQL nem chamadas reais a um modelo de IA.
- A autenticacao atual e simples, baseada em um usuario/senha via variaveis de ambiente, sem cadastro de usuarios no banco.
- Nao ha API remota separada implementada neste repositorio; a sincronizacao opcional escreve diretamente em PostgreSQL.
- O chat embutido no frontend nao encaminha perguntas tecnicas para `POST /api/chat/manejo`; esse endpoint precisa ser chamado separadamente.
- O lancamento de insumo depende de IA disponivel e de uma resposta estruturada valida; somente a abertura de lote possui fallback de interpretacao local.
- Marcar conta a pagar como paga nao gera automaticamente saida no caixa.
- O worker PostgreSQL configura `ssl.rejectUnauthorized: false`; em ambientes de producao, a politica de validacao TLS deve ser revista conforme o provedor.

---

## 16. Fora do escopo da V1

Nao implementar nesta versao:

- voz;
- sensores IoT;
- visao computacional;
- notas fiscais;
- fornecedores completos;
- integracao bancaria;
- comparacao de fornecedores;
- projecao de vendas;
- granja;
- gado;
- fruteiras;
- estufas;
- manejo diario avancado;
- multiplas fazendas;
- usuarios e permissoes completos.

---

## 17. Comandos uteis

Cada aplicacao possui seu proprio `package.json`; execute os comandos a partir da raiz do repositorio usando o diretorio do respectivo projeto.

Iniciar a API:

```bash
cd balbina-backend
npm install
npm run dev
```

Iniciar o app de campo:

```bash
cd balbina-campo
npm install
npm run dev
```

Iniciar o painel de gestao (em outro terminal):

```bash
cd balbina-gestao
npm install
npm run dev
```

Build e testes do backend:

```bash
cd balbina-backend
npm run build
npm test
```

Build e lint do app de campo:

```bash
cd balbina-campo
npm run build
npm run lint
```

Build e lint do painel de gestao:

```bash
cd balbina-gestao
npm run build
npm run lint
```

Sincronizar Android:

```bash
cd balbina-campo
npm run android:sync
```

Abrir Android Studio:

```bash
cd balbina-campo
npm run android:open
```

Rodar Android:

```bash
cd balbina-campo
npm run android:run
```

---

## 18. Exemplos de uso manual com curl

### Consultar saude

```bash
curl http://localhost:3000/api/health
```

### Fazer login

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "senha-local"
  }'
```

### Consultar saldo

```bash
curl http://localhost:3000/api/caixa/saldo \
  -H "Authorization: Bearer SEU_TOKEN"
```

### Criar movimento de caixa

```bash
curl -X POST http://localhost:3000/api/caixa/movimento \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "saida",
    "valor": 200,
    "descricao": "Combustivel",
    "loteId": "LOTE-001",
    "dataMovimento": "2026-08-20"
  }'
```

### Criar conta a pagar

```bash
curl -X POST http://localhost:3000/api/contas-pagar \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "descricao": "Racao pro Joao",
    "fornecedor": "Joao",
    "valor": 700,
    "vencimento": "2026-08-30"
  }'
```

### Movimentar estoque

```bash
curl -X POST http://localhost:3000/api/estoque/movimentos \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "item": "racao",
    "categoria": "racao",
    "quantidade": 50,
    "unidade": "kg",
    "tipoMovimento": "entrada",
    "dataMovimento": "2026-08-20"
  }'
```

---

## 19. Criterio de pronto da primeira versao

A V1 pode ser considerada pronta quando:

1. todos os fluxos do checklist de aceite passarem;
2. o app web e Android conseguirem operar enquanto alcancam a API;
3. o SQLite mantiver dados locais e a operacao continuar quando apenas a sincronizacao remota estiver indisponivel, desde que a API local esteja acessivel;
4. a fila de sincronizacao armazenar pendencias corretamente;
5. o chat conseguir abrir lote e registrar insumo com JSON valido;
6. o custo por kg for conferido manualmente em pelo menos um lote fechado;
7. contas a pagar e alertas forem validados com datas reais;
8. a equipe aceitar formalmente que tudo fora da secao "Fora do escopo da V1" fica para versoes futuras.
