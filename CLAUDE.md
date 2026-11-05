# Arquitetura Monorepo - Balbina Agro
- **`balbina-backend/`**: API REST em Node.js/TypeScript e Express, persistência SQLite local e sincronização PostgreSQL, além do serviço de IA para chat operacional e manejo.
- **`balbina-campo/`**: Aplicação front-end React/Vite com Capacitor para Android, focada exclusivamente nas operações de viveiro, tanques, lançamentos de ração, biometria e chat operacional de campo.
- **`balbina-gestao/`**: Aplicação front-end React/Vite de retaguarda, focada no painel financeiro, controle de caixa, contas a pagar/receber, DRE e relatórios consolidados de custo por kg[cite: 1].
