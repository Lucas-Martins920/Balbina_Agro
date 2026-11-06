# App Balbina (iOS e Android)

React Native com Expo. Faz o lançamento do viveiro (ração, mortes, qualidade da água, checklist e medicação, sem
sinal), os pedidos e o caixa de balcão (peixe por kg ou em caixa), o estoque e o painel do dia. O app de campo
completo, com o chat de manejo, a biometria e a despesca, é o `/campo` do site, que se instala no celular como
aplicativo (PWA). Plano, fases e passos das lojas em `../docs/app-celular.md`; como o código funciona em
`../docs/codigo/arquitetura.md` > "App nativo".

```bash
npm install
cp .env.example .env.local   # preencha o endereço do site, o Supabase e EXPO_PUBLIC_SUPABASE_KEY
npx expo start
```

Antes de subir: `npm run lint`, `npm run typecheck`, `npm test`. Cores: nunca à mão, rode `npm run tokens:celular` na raiz.

## Primeira versão nas lojas

O projeto ainda não tem conta nem projeto no EAS. Antes do primeiro `eas build`:

1. `npx eas login` e `npx eas init`: cria o projeto do Balbina e grava o `owner` e o `extra.eas.projectId` no `app.json`.
2. Em `eas.json`, troque os endereços marcados com `SEU-` pelos do site e do Supabase de teste (perfil `teste`) e de
   produção (perfil `producao`).
3. Cadastre `EXPO_PUBLIC_SUPABASE_KEY` (e, no perfil de teste, `EXPO_PUBLIC_VERCEL_BYPASS`) nas variáveis do EAS.
