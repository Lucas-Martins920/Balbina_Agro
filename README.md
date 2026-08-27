# Balbina Agro V1

<<<<<<< HEAD
=======
Sistema operacional local-first para piscicultura de tambaqui, com API Node/Express,
SQLite, IA para chat operacional, painel React/Vite e app Android via Capacitor.

## Estrutura

```text
Balbina_Agro/
├── backend/   # API Node.js/Express, SQLite, auth, IA e sync PostgreSQL
├── frontend/  # Painel React/Vite e projeto Android Capacitor
├── app/       # Exemplos e materiais operacionais auxiliares
└── docs/      # Documentacao consolidada da V1
```

## Backend

```bash
cd backend
npm install
```

Variaveis principais:

```bash
PORT=3000
HOST=0.0.0.0
DB_PATH=/caminho/para/balbina_v1.db
JWT_SECRET=troque-por-um-segredo-forte
AUTH_USER=admin
AUTH_PASSWORD=senha-local
IA_API_KEY=opcional
DATABASE_URL=postgres://usuario:senha@host:5432/banco
```

Rodar a API:

```bash
npm run dev
```

A API fica em `http://localhost:3000` por padrao.

Na raiz do repositorio, os atalhos equivalentes sao `npm run dev:backend` e
`npm run dev:frontend`. O comando `npm run dev` inicia o frontend.

### PostgreSQL no Render

Crie um PostgreSQL no Render e cadastre a connection string como
`DATABASE_URL` nas variaveis de ambiente do servico backend. Nunca commite a
URL com senha. O backend usa SQLite local como fila e persistencia principal e
envia as operacoes para o PostgreSQL quando essa variavel existe.

Depois de publicar, valide `GET /api/health`, faça login e confirme a fila em
`GET /api/sync/summary`. A verificacao final dos dados pode ser feita no Shell
do banco Render com `SELECT * FROM lotes;`.

## Frontend web

```bash
cd frontend
npm install
```

Variavel opcional:

```bash
VITE_API_URL=http://localhost:3000
```

Rodar:

```bash
npm run dev
```

## Android

O app Android Capacitor fica em `frontend/android`, porque o Capacitor espera essa pasta dentro do projeto frontend.

```bash
cd frontend
npm run android:sync
npm run android:open
```

Para rodar no emulador ou aparelho:

```bash
npm run android:run
```

Esse script faz o build, sincroniza o Capacitor, executa `adb reverse tcp:3000 tcp:3000` e inicia o app.

## Funcionalidades atuais

- Login com token JWT.
- Dashboard com saldo do caixa, lotes, estoque, alertas e status de sync.
- Chat para abrir lote, registrar insumo e consultar saldo.
- Fechamento de lote com calculo de custo total e custo por kg.
- Venda de peixe com entrada no caixa e baixa de estoque.
- Contas a pagar com alerta de vencimento em ate 7 dias.
- Fila local de sincronizacao em SQLite.
- Sincronizacao opcional para PostgreSQL quando `DATABASE_URL` estiver configurado.

## Documentacao

Documento principal:

```text
docs/DOCUMENTACAO_COMPLETA_V1.md
```
>>>>>>> 5daa222 (organiza caixa e contas)
