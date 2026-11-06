

**Versão:** 1.0  
**Status:** Desenvolvimento com primeira versao funcional em andamento  
**Foco:** ÚNICA E EXCLUSIVAMENTE PISCICULTURA (TAMBAQUI) 

---

## ⚠️ REGRA DE OURO — LEIA PRIMEIRO

**ISTO É V1.**

Toda decisão neste documento é **EXCLUSIVA PARA V1**.

Se em algum lugar disser "depois na V1.1" ou "em V2" — **ignore**. Isso é PRÓXIMO, não agora.

**A IA que for programar DEVE saber:** você está fazendo V1. Nada de V1.1+.

---

## 🎯 O QUE É V1

**V1 é um MVP (Produto Mínimo Viável) que prova:**

- ✅ Chat com IA funciona (usuário conversa, IA entende, salva)
- ✅ Offline-first funciona (sítio sem internet = tudo normal)
- ✅ Caixa funciona (entrada/saída, saldo em tempo real)
- ✅ Lotes funcionam (abre lote, vincula gasto, calcula custo/kg)
- ✅ Estoque básico funciona (entrada/saída de peixe)
- ✅ Contas a pagar funcionam (alerta antes vencer)

**V1 = Piscicultura de tambaqui. Só isso. Nada mais.**

---

## ✅ O QUE ENTRA NO V1

### Core (não negociável)

- Chat de texto (não voz)
- Lançamento de receita/despesa via conversa
- Caixa (entradas, saídas, saldo)
- Lotes com custo por kg
- Estoque de peixe e ração
- Contas a pagar com notificação
- **Offline-first** (funciona sem internet, sincroniza depois)

### Conhecimento técnico

- EMBRAPA Tambaqui (parâmetros, alimentação, doenças, manejo)
- Integração com IA (Ollama com structured output)

### Plataforma

- App web React/Vite
- App Android via Capacitor
- Backend local Node.js + Express
- SQLite local
- Sincronizacao opcional com PostgreSQL via `DATABASE_URL`

### Dados fictícios (pra validar)

- 3 lotes de tambaqui (viveiro 1, viveiro 2, viveiro 3)
- Gastos fictícios (alevino, ração, medicamento)
- Vendas fictícas
- Contas a pagar fictícias
---

## 📊 Escopo de User Stories — V1 APENAS

**US-001:** Abrir lote de peixe  
**US-002:** Lançar compra de insumo (ração, alevino, medicamento)  
**US-003:** Consultar saldo de caixa  
**US-004:** Abrir/fechar lote e calcular custo/kg  
**US-005:** Tela de Produção (visualizar lotes — SÓ PEIXE)  
**US-006:** Registrar venda (receita)  
**US-007:** Contas a pagar com alerta  
**US-008:** Estoque de peixe — entrada/saída  
**US-009:** Chat — perguntas sobre lucro/custo  
**US-010:** Offline-first e sincronização

**TOTAL: 10 user stories, pronto.**

Nada além disso.

---

## 🗂️ Banco de dados — V1 APENAS

**Tabelas que ENTRAM:**

- usuarios
- lotes
- colheitas
- transacoes
- estoque
- movimentos_estoque
- contas_a_pagar

**Tabelas que NÃO ENTRAM agora:**

- notas_fiscais (V1.1)
- fornecedores (V1.3)
- histórico_crescimento (V2.1)

**Campos que NÃO ENTRAM:**

- tipo_producao != "peixe" (granja, gado vêm depois)
- sensores_iot (V2.1)
- manejo_diario (V2.1)

**Schema é 100% V1. Ponto.**

---

## 📱 Interface — V1 APENAS

**Telas que ENTRAM:**

- Chat (mensagens com IA)
- Tela de Produção (cards de peixe, SÓ PEIXE)
- Detalhe de Lote (mostra custo/kg, margem)
- Caixa (entradas/saídas/saldo)

**Telas que NÃO ENTRAM:**

- Comparação de fornecedores (V1.3)
- Projeção de vendas (V1.4)
- Integração bancária (V1.5)
- Manejo diário (V2.1)
- Sensores (V2.1)
- Outras produções (V2)

**Botões desabilitados:**

- "🍇 Fruteiras (Em breve)"
- "🐔 Granja (Em breve)"
- "🐄 Gado (Em breve)"
- "🥬 Estufas (Em breve)"

Isso é VISUAL apenas. Nenhuma funcionalidade.

---

## 🚀 Stack — V1 APENAS

**App implementado:**

- React + TypeScript + Vite
- Capacitor Android
- Cliente autenticado com JWT

**Backend implementado:**

- Node.js + Express + TypeScript
- SQLite local com `better-sqlite3`
- Worker opcional de sincronizacao PostgreSQL com `pg`
- Login via variaveis de ambiente e token JWT

**IA:**

- Ollama via API
- Structured output (tool use)
- Conhecimento: tambaqui, ps

**NÃO inclui:**

- Voz (V1.2)
- Visão computacional (V1.1, V2.1)
- Sensores (V2.1)
- Múltiplas produções (V2)
---

## 💰 Dados fictícios — V1

Para testar sem dados reais:

**Lotes de teste:**

```
Viveiro 1 — Tambaqui — Ativo desde 01/03/2026
Viveiro 2 — Pacu — Encerrado (340kg colhidos)
Viveiro 3 — Tambaqui — Ativo desde 15/06/2026
```

**Gastos fictícios (por lote):**

```
Viveiro 1:
  - 1.000 alevinos: R$ 250
  - 4 sacos ração: R$ 700
  - Medicamento: R$ 80
  - Combustível (alocado): R$ 200
  Total: R$ 1.230
  
Viveiro 2 (FECHADO):
  Mesmo padrão, colheu 340kg
  → Custo: R$ 3,62/kg
```

**Vendas fictícias:**

```
Viveiro 2 — 30kg tambaqui — R$ 540 (R$ 18/kg)
Viveiro 2 — 40kg pacu — R$ 480 (R$ 12/kg)
```

**Contas fictícias:**

```
Ração pro João: R$ 700, vence 15/08/2026
Combustível Manaus: R$ 200, vence 30/08/2026
```

---

## 🔒 O que a IA DEVE saber

Quando você passar o projeto pra IA programar:

**Antes de TUDO, diga:**

```
"Isto é V1 EXCLUSIVAMENTE.

Você vai programar APENAS isso:
- Chat com IA
- Lotes + custo/kg
- Caixa
- Estoque básico
- Contas a pagar
- Offline-first

NENHUMA das versões futuras (V1.1, V1.2, V2, etc).

Se eu pedir algo de V1.1+ durante desenvolvimento,
responda: 'Isso é V1.1+, fora do V1. Deixo pra depois.'

Escopo está FECHADO. Ponto final."
```

---

## ✅ Checklist de conclusão — V1

- [ ] Login funciona com `JWT_SECRET`, `AUTH_USER` e `AUTH_PASSWORD`.
- [ ] Chat funciona 100% (texto, confirmacao, salva).
- [ ] Offline funciona (usuario sem internet consegue usar dados locais).
- [ ] Sincronizacao PostgreSQL funciona quando `DATABASE_URL` esta configurado.
- [ ] Lotes funcionam (abre, vincula gasto, fecha, calcula).
- [ ] Custo/kg está correto (formula: soma gasto / kg colhido).
- [ ] Caixa está correto (entrada - saida = saldo).
- [ ] Estoque básico funciona (entrada/saida registra).
- [ ] Contas a pagar funciona (alerta antes vencer).
- [ ] Tela de Produção mostra lotes + categorias futuras desabilitadas.
- [ ] App roda em Android Galaxy S25 FE.
- [ ] Dados fictícios testam tudo sem erro.
- [ ] IA foi testada com tambaqui.txt (respostas especificas).

**Quando tudo estiver ✅ = V1 pronto. Aí vai pra V1.1.**

---

## 🚫 O que RECUSAR durante V1

Se alguém pedir:

- ❌ "Adiciona voz" → V1.2
- ❌ "Lê QR Code" → V1.1
- ❌ "Adiciona granja" → V2
- ❌ "Exporta pra Excel" → V1.3+
- ❌ "Integra com banco" → V1.5
- ❌ "Mostra projeção de venda" → V1.4

**Resposta padrão:** "Isso é pós-V1. V1 é só peixe, chat, lotes, caixa."

---

## 📞 Conclusão

**V1 = Tambaqui + Chat + Caixa + Lotes + Offline**

Nada além disso.

Quando estiver pronto (tudo ✅), você começa a testar com dados reais.

Aí sim, depois que estiver validado, vem V1.1, V1.2, V2, etc.

**Mas primeiro, V1. Só V1. Exatamente V1.**

---

**Criado:** Julho 2026  
**Status:** Escopo congelado  
**Próximo:** Validacao e fechamento da V1  
**Depois:** V1.1 (semanas 9-10)
