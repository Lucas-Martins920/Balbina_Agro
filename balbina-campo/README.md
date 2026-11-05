# Frontend - Balbina Agro V1

Painel operacional React, TypeScript e Vite para a V1 da Balbina Agro. O mesmo
projeto gera o app Android via Capacitor.

## Funcionalidades

- Tela de login com credenciais do backend.
- Armazenamento do token JWT em `localStorage`.
- Dashboard operacional com lotes em engorda, estoque e sincronização do viveiro.
- Chat operacional para abrir lotes, registrar insumos e orientar as ações do dia a dia.
- Atalhos de biometria e operação rápida de viveiro.
- Formulários para fechar lote e movimentar estoque.
- Atualização automática do painel a cada 5 segundos enquanto autenticado.
- App Android em `android/` com Capacitor.

## Rodar web

```bash
npm install
npm run dev
```

Por padrao, o frontend chama a API em:

```text
http://localhost:3000
```

Para apontar para outro backend:

```bash
VITE_API_URL=https://seu-backend.onrender.com
```

No deploy, configure `VITE_API_URL` com a URL pública do serviço backend antes
de executar o build. Sem essa variável, o frontend local usa `http://localhost:3000`.

## Scripts

```bash
npm run dev           # servidor Vite
npm run build         # typecheck + build de producao
npm run preview       # preview do build
npm run lint          # oxlint
npm run android:sync  # build + sync Capacitor Android
npm run android:open  # abre o Android Studio
npm run android:run   # sync, adb reverse e executa no Android
```

## Android

Configuracao Capacitor atual:

```text
appId: br.com.balbinaagro.app
appName: Balbina Agro
webDir: dist
android.allowMixedContent: true
```

Para usar o backend local no Android, mantenha o backend rodando na porta `3000`.
O script `android:run` aplica `adb reverse tcp:3000 tcp:3000` antes de iniciar o app.
