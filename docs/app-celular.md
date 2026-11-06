# App Balbina para iOS e Android

Veio do FINAVI (pedido do Nicolas em 2026-11-03), com a granja trocada pela piscicultura: app nativo nas lojas para os lançamentos do viveiro e as vendas, com as mesmas regras, layout e design do site. O chat, a biometria e a despesca ficam no `/campo` (PWA), que também se instala no celular. O site (inclusive no navegador do celular) continua igual; o app é um canal a mais. Caminho escolhido: **React Native com Expo** (pasta `mobile/`). Como o código funciona: `docs/codigo/arquitetura.md` > "App nativo".

## Fases da v1

1. **Base** (feita): login com e-mail ou usuário, 2º fator (app autenticador ou e-mail, confiar no aparelho por 14 dias), Face ID ou digital, troca de empresa (piscicultura), permissões, abas Início, Apontar, Vender e Mais.
2. **Apontamentos** (feita): rotina do dia e lançamento por viveiro e turno (ração por tipo em kg ou sacos, mortes e descartes com causa, qualidade da água, checklist, medicação), sem internet, chamando `registrar_lancamento_campo` como o `/campo`.
3. **Vendas e pedidos** (feito): aba Vender com dois modos. **Pedido** (permissão `vendas.lancar`): tabela de preço do cliente, "já faturar", funciona sem internet (`criar_pedido`, `faturar_pedido`). **Balcão (PDV)** (permissão `pdv.operar`): seções Por kg e Caixas (o kg aceita o peso da balança, até 3 casas), o carrinho desconta do estoque da classe ao tocar, recebe em dinheiro, Pix e cartão (pode misturar) com troco, escolhe ponto de venda e tabela, e compartilha o cupom não fiscal. O balcão precisa de internet, porque baixa o estoque e recebe na hora (`venda_balcao`); sem sinal, use Pedido.
4. **Painel do dia** (feito, sem push): tela Início com KPIs (viveiros, faltam lançar, entregas), lista de viveiros sem lançamento hoje (toque leva ao Apontar), viveiros já lançados, pedidos faturados para entregar hoje (se o usuário pode ver vendas) e alertas dos lotes (água fora da faixa, mortalidade, crescimento abaixo da curva, biometria atrasada, carência, sanidade, lançamento atrasado, estoque negativo). Pull-to-refresh e recarrega ao voltar para o app. Sem dados financeiros (design: app é só para operação e vendas). Push nativo fica para depois (precisa do Firebase).
5. **Lojas**: textos, prints, envio para revisão.

## O que depende do Nicolas

| Passo | Custo | Para quê |
| --- | --- | --- |
| Conta Expo (expo.dev), grátis | Grátis no plano Free | Compilar o app na nuvem (sem Mac) e instalar as versões de teste |
| Apple Developer | US$ 99 por ano | Instalar no iPhone pelo TestFlight e publicar na App Store |
| Google Play Console | US$ 25, uma vez | Publicar na Play Store. Conta pessoal nova exige teste fechado com 12 pessoas por 14 dias |
| Conta pessoal ou de empresa | Empresa pede número D-U-N-S (grátis, alguns dias) | Quem aparece como dono na loja |
| Projeto Firebase | Grátis | Push no Android (fase 4) |

Na conta Expo, cadastre a variável `EXPO_PUBLIC_SUPABASE_KEY` (a chave publicável do Supabase, a mesma `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` da Vercel) nos ambientes de teste e de produção. Certificados e chaves de assinatura ficam nas contas da Apple, do Google e da Expo, nunca no repositório.

O site de teste fica atrás do Deployment Protection da Vercel, que responde 401 a quem não está logado na Vercel (o app recebia "Erro 401" no login). Para o app de teste passar: na Vercel, Settings > Deployment Protection > **Protection Bypass for Automation**, gere o segredo e cadastre-o na Expo como `EXPO_PUBLIC_VERCEL_BYPASS` (ambiente preview). O app manda o segredo no cabeçalho `x-vercel-protection-bypass` só no perfil de teste; o app da loja nunca usa.

## Versões

- `eas build --profile teste`: app de teste, aponta para o site de teste (`EXPO_PUBLIC_SITE_URL` do perfil `teste` em `mobile/eas.json`) e o banco de teste; mostra a faixa amarela.
- `eas build --profile producao`: app da loja, aponta para o site e o banco oficiais.
- As rotas `/api/app/*` e a página `/app-captcha` precisam estar no site que o app usa: o de teste recebe no push do `Teste-Desevolvimento`; o oficial, só no consolidado.

## Rodar no computador (opcional)

Dentro de `mobile/`: `npm install`, copie `.env.example` para `.env.local`, preencha a chave e rode `npx expo start`. O app Expo Go no celular lê o QR code.
