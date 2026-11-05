# Backend - Balbina Agro V1

API local da V1, escrita em Node.js, Express e TypeScript. Ela persiste dados em
SQLite, protege os endpoints operacionais com JWT, conversa com IA local
compativel com OpenAI Chat Completions e pode sincronizar dados com PostgreSQL.

## Conteudo

```text
backend/
├── src/                         # Codigo TypeScript da API
│   ├── auth.ts                   # Login, JWT e middleware de autenticacao
│   ├── server.ts                 # Rotas REST principais
│   ├── db.ts                     # Schema e migracoes simples do SQLite
│   ├── repositories/             # Persistencia SQLite
│   └── services/                 # Manejo, producao e sync PostgreSQL
├── db/                          # Arquivos SQL auxiliares
├── balbina_v1.db                # SQLite local
├── balbina_v1.backup-*.db       # Backups do SQLite
├── conhecimento_tambaqui.txt    # Conhecimento local usado pela IA
├── package.json
└── package-lock.json
```

## Rodar

```bash
npm install
npm run dev
```

Servidor padrao:

```text
http://localhost:3000
```

## Variaveis

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

Sem `JWT_SECRET` e `AUTH_PASSWORD`, o endpoint `/api/login` retorna `503` e a
interface nao consegue acessar os dados operacionais. `AUTH_USER` e opcional e
assume `admin` quando nao definido.

`DATABASE_URL` e opcional. Quando configurado, o worker `PostgresSyncWorker`
sincroniza a fila local `sync_queue` com tabelas PostgreSQL equivalentes.

## Autenticacao

```http
POST /api/login
Content-Type: application/json
```

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

Todos os endpoints em `/api`, exceto `/api/login` e `/api/health`, exigem:

```http
Authorization: Bearer <token>
```

## Rotas principais

```text
GET    /api/health
POST   /api/login
GET    /api/lotes
POST   /api/abrir-lote
POST   /api/lancar-insumo
GET    /api/caixa/saldo
POST   /api/caixa/movimento
POST   /api/lotes/:id/fechar
POST   /api/vendas
GET    /api/vendas
POST   /api/contas-pagar
GET    /api/contas-pagar
GET    /api/contas-pagar/alertas
PATCH  /api/contas-pagar/:id/pagar
POST   /api/estoque/movimentos
GET    /api/estoque
GET    /api/estoque/movimentos
POST   /api/chat/manejo
GET    /api/sync/summary
```
