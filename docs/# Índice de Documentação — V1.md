# Indice de Documentacao - V1

**Versao:** 1.0  
**Atualizado em:** 25/08/2026  
**Escopo:** Piscicultura de tambaqui, chat, caixa, lotes, estoque, contas a pagar, autenticacao e offline-first

---

## Ordem de leitura

### 1. `DOCUMENTACAO_COMPLETA_V1.md`

Documento consolidado da implementacao atual.

Inclui:

- visao geral da V1;
- stack tecnica;
- setup de backend, frontend e Android;
- autenticacao JWT;
- modulos implementados;
- API REST;
- schema SQLite;
- sincronizacao PostgreSQL via `DATABASE_URL`;
- regras de validacao;
- checklist de aceite;
- limitacoes conhecidas.

Publico: product owner, dev backend, dev frontend, QA e IA de desenvolvimento.

### 2. `V1 — ESCOPO FECHADO — Sistema.md`

Documento de escopo do MVP.

Use para confirmar o que entra e o que fica fora da V1:

- chat de texto;
- caixa;
- lotes;
- custo por kg;
- estoque de peixe e racao;
- contas a pagar;
- offline-first;
- somente piscicultura/tambaqui.

Publico: product owner e qualquer pessoa tomando decisao de escopo.

### 3. `backend/conhecimento_tambaqui.txt`

Base local de conhecimento usada pela IA de manejo.

Uso atual:

- carregada por `knowledgeLoader.ts`;
- usada pelo endpoint `POST /api/chat/manejo`;
- usada em validacoes simples de manejo no structured output.

---

## Documentos operacionais fora de `docs`

- `README.md`: visao geral do projeto e comandos principais.
- `backend/README.md`: rotas, variaveis, autenticacao e sync do backend.
- `frontend/README.md`: painel web, scripts Vite e Android Capacitor.
- `app/README.md`: arquivos auxiliares e exemplos.

---

## Fora do escopo da V1

Nao documentar como funcionalidade atual:

- voz;
- QR Code;
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
- multiplas fazendas.
