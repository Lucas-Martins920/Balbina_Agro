<h1 align="center">Balbina</h1>
<p align="center"><strong>ERP de piscicultura</strong></p>

<p align="center">
  Viveiros · Campo · Estoque · Comercial · Fiscal · Financeiro · Gestão
</p>

---

O **Balbina** é um ERP completo para pisciculturas de tambaqui e outros peixes redondos. Ele integra toda a operação, do trato diário nos viveiros até a nota fiscal da despesca, num só sistema. O diferencial é calcular o **custo real do kg de peixe por lote**, cruzando o que o campo lança (ração, mortes, biometria, insumos) com o financeiro.

A base é o ERP de avicultura FINAVI: a gestão, o financeiro, o fiscal, as vendas e o planejamento foram mantidos, e tudo o que era da granja de postura virou piscicultura. As pastas do Balbina antigo (`balbina-backend`, `balbina-campo`, `balbina-gestao`) estão em `docs/legado/`.

## Funcionalidades

| Área | O que faz |
|---|---|
| **Viveiros** | Setores e viveiros (escavado, tanque-rede, berçário) com área, volume e capacidade; lotes por fase (alevinagem, recria, engorda) com espécie, povoamento, peso inicial e meta de despesca |
| **Campo** (`/campo`, celular, funciona sem sinal) | Chat operacional com IA (texto ou voz: "coloquei 2 sacos de ração no tanque 02" vira um cartão para confirmar; dúvidas de manejo do tambaqui respondidas pela base da Embrapa), painel dos viveiros, ração do dia pela tabela de arraçoamento, insumos (calagem, adubação, medicamento), biometria com curva de crescimento, abrir e fechar lote (despesca) e a fila de envios |
| **Indicadores** | Biomassa, peso médio estimado pela curva entre biometrias, ganho por dia, conversão alimentar, sobrevivência, densidade, qualidade da água (oxigênio, temperatura, pH, amônia) com alertas |
| **Estoque** | Peixe em kg por classe (Pequeno, Médio, Grande...), ração e insumos com custo médio, pontos de venda com depósito e caixa próprios, transferência com frete e quebra |
| **Comercial** | Pedidos, faturamento, entrega, PDV de balcão (por kg ou em caixa), app do vendedor (offline), link de pedido para o cliente, tabelas de preço por cliente com vigência |
| **Fiscal** | NF-e e NFC-e pela Focus NFe, notas recebidas (SEFAZ e XML por e-mail), produtor rural PF com Funrural |
| **Financeiro** | Contas a pagar e a receber, parcelas, recorrências, conciliação bancária (OFX e Open Finance), cartões, fluxo de caixa, fechamento do mês, DRE, LCDPR |
| **Gestão** | Custo do kg por lote, planejamento de povoamentos e despescas, viabilidade, previsões e alertas, central de relatórios |
| **Configurações** | Multiempresa, cargos e permissões, importação (NIBO, planilha), API pública com webhooks, automações (WhatsApp, e-mail, push), assinatura por plano |

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | [Next.js 16](https://nextjs.org/) (App Router) · React 19 · TypeScript · Tailwind CSS 4 |
| Campo | PWA em `/campo` (fila no aparelho, service worker) e app nativo em `mobile/` (Expo) |
| Back-end | Next.js API Routes · Server Actions |
| Banco de dados | [Supabase](https://supabase.com/) (PostgreSQL com RLS por empresa, Auth, Vault, `pg_cron`) |
| Hospedagem | [Vercel](https://vercel.com/) (região `gru1`, São Paulo) |
| Integrações | Anthropic (chat de manejo e leitura por IA) · Asaas (cobrança) · Focus NFe (notas fiscais) · Pluggy (Open Finance) · Meta Cloud API (WhatsApp) · Postmark (e-mail) · Cloudflare Turnstile (captcha) |

## Começar

### Pré-requisitos

- **Node.js 22+**
- **Docker Desktop** (para o Supabase local)

### Instalação

```bash
git clone https://github.com/Lucas-Martins920/balbina_agro.git
cd balbina_agro
npm install
npm run local
```

O `npm run local` sobe um Supabase no Docker com todas as migrations, preenche o `.env.local` e abre o Next.js em **http://localhost:3000**. Passo a passo completo e a alternativa sem Docker: [`docs/rodar-local.md`](docs/rodar-local.md).

### Login local

| Campo | Valor |
|---|---|
| E-mail | `admin@balbina.local` |
| Senha | `balbina1234` |

O seed cria uma piscicultura com dados de exemplo. Para recomeçar do zero: `npm run local:zerar`.

## Testes

```bash
npm run lint                # ESLint
npm run typecheck           # Verificação de tipos
npm test                    # Testes unitários (node:test)
npm run build               # Build completo do Next.js

# Testes do banco (precisa de Postgres; o npm run local já sobe um)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db

# Testes de ponta a ponta (precisa de Supabase local + Playwright)
npm run test:e2e

# App nativo
cd mobile && npm run lint && npm run typecheck && npm test
```

| Tipo | O que verifica | Localização |
|---|---|---|
| Unitários | Regras puras em TypeScript | `src/lib/**/*.test.ts`, `mobile/src/**/*.test.ts` |
| Banco | Migrations, triggers, RLS, isolamento entre empresas | `supabase/tests/*.sql` |
| E2E | Fluxos completos no navegador | `e2e/*.spec.ts` |

Antes de enviar qualquer mudança, rode os testes que cobrem o que você alterou. Detalhes em [`docs/codigo/testes-e-operacao.md`](docs/codigo/testes-e-operacao.md).

## Fluxo de trabalho

```
branch da tarefa ──push──▶ Teste-Desevolvimento ──PR aprovado──▶ master (produção)
                                    ▲                                  │
                                    └────────── merge simples ─────────┘
```

1. Crie um branch a partir do `Teste-Desevolvimento`. Verifique localmente (lint, tipos, testes, build, test:db).
2. Leve ao `Teste-Desevolvimento`. O [site de teste](docs/site-de-teste.md) se atualiza sozinho.
3. A produção recebe um PR `Teste-Desevolvimento → master` com aprovação explícita. O Action **Verificação** roda a suíte completa (incluindo E2E).
4. As migrations são aplicadas na produção automaticamente após o merge no `master`.

Detalhes, regras e workflows do GitHub Actions: [`docs/fluxo-de-trabalho.md`](docs/fluxo-de-trabalho.md).

O Balbina tem banco, domínio e contas próprios, separados do FINAVI. Para criar tudo pela primeira vez (Supabase, Vercel,
GitHub, integrações e lojas): [`docs/colocar-no-ar.md`](docs/colocar-no-ar.md).

## Estrutura do projeto

```
src/
  proxy.ts                   sessão e redirecionamento (substitui middleware no Next 16)
  app/
    (app)/<módulo>/          telas: page.tsx, actions.ts, componentes
    api/                     rotas: v1 (API pública), app de campo, webhooks, cron, entrada
    campo/                   app de campo (PWA, funciona sem sinal)
    vendedor/                app do vendedor (offline)
    pedido/[token]/          portal de pedido para o cliente (sem login)
  components/                componentes reutilizáveis; ui.tsx = primitivos (DESIGN.md); campo/ = app de campo
  lib/                       regras de negócio em TypeScript; campo/ = fila, propostas, chat e indicadores do campo
mobile/                      app nativo (Expo) para iOS e Android
supabase/
  migrations/                schema completo, em ordem de data (piscicultura a partir de 20261105000001)
  tests/                     testes do banco (npm run test:db)
e2e/                         testes de ponta a ponta (Playwright)
scripts/                     rodar local, backup, testes, mapa do código
docs/                        documentação; o domínio da piscicultura está em docs/piscicultura.md
```
