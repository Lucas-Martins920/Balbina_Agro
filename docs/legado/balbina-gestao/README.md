# Balbina Gestão

Painel web desktop de gestão financeira e analítica da Balbina Agro.

## Funcionalidades

- Controle de caixa com saldo, entradas e saídas.
- Histórico de movimentos financeiros do dia a dia.
- Gestão de contas a pagar e receber.
- Alertas de vencimento e acompanhamento de pendências.
- Registro e acompanhamento de vendas.
- Relatórios analíticos de custo por quilo ($/kg$), DRE e consolidação financeira.
- Interface web exclusiva para desktop, sem suporte Android/Capacitor.

## Rodar em ambiente web

```bash
npm install
npm run dev
```

Por padrão, o painel chama a API em:

```text
http://localhost:3000
```

Para apontar para outro backend:

```bash
VITE_API_URL=https://seu-backend.onrender.com
```

## Scripts

```bash
npm run dev     # servidor Vite
npm run build   # typecheck + build de produção
npm run preview # preview do build
npm run lint    # oxlint
```

## Observações

- Este projeto foi desacoplado do Capacitor e não inclui a pasta `android/`.
- A aplicação foi mantida como painel web exclusivo para desktop, com foco em gestão financeira e relatórios operacionais.
