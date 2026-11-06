# Mapa do código do Balbina

> Gerado automaticamente por `scripts/mapa-codigo.mjs`. **Não edite à mão**: depois de mudar o código, rode `npm run mapa` e a pasta `docs/mapa-codigo/` é refeita. Em conflito de merge nesses arquivos, rode `npm run mapa` de novo e aceite o resultado.

Resumo: 520 arquivos TypeScript em `src/`, 87 telas, 55 rotas de API, 2124 funções/componentes/tipos, 352 funções do banco, 108 tabelas, 31 views, 79 triggers, 177 policies, 120 migrations.

**Versão com busca (recomendada):** abra [mapa.html](mapa.html) no navegador (duplo clique no arquivo `docs/mapa-codigo/mapa.html`). Nas páginas Markdown, use Ctrl+F.

## Sumário

- [Como usar (achar e renomear)](#como-usar-achar-e-renomear)
- [Pastas](#pastas)
- [Telas (menu → arquivo)](#telas-menu--arquivo)
- [Rotas de API](#rotas-de-api)
- [Código por domínio](codigo-por-dominio.md): cada arquivo, o que faz e as funções/componentes que define, por área do sistema
- [Banco de dados](banco.md): funções, tabelas, views, triggers, policies e migrations
- [Testes, workflows, scripts e docs](testes-e-scripts.md)
- [Índice alfabético](indice.md): todo nome exportado → `arquivo:linha`

## Como usar (achar e renomear)

- **Achar uma função ou componente:** procure o nome no [índice alfabético](indice.md) (ou na busca do HTML). A coluna *Onde* diz `arquivo:linha`; no VS Code, Ctrl+P e cole o caminho, ou Ctrl+clique no caminho dentro do terminal.
- **Achar a tela de um item do menu:** veja [Telas](#telas-menu--arquivo). A tela é o `page.tsx`; o que os botões e formulários gravam fica no `actions.ts` da mesma pasta.
- **Renomear uma função/componente em TypeScript:** no VS Code, clique no nome e aperte **F2** (Renomear símbolo): ele troca na definição e em todos os arquivos que importam. A coluna *Usado em* mostra quais arquivos vão mudar. Depois rode `npm run typecheck`, `npm test` e `npm run mapa`.
- **Renomear uma função do banco (SQL):** nunca edite uma migration antiga. Crie uma migration nova em `supabase/migrations/` com `alter function antigo rename to novo;` (ou recrie com o novo nome), e troque o nome nos arquivos listados em *Chamada por* (`supabase.rpc("nome")`) e em `supabase/tests/`. Rode `npm run test:db`.
- **Renomear uma tabela:** igual ao SQL acima (`alter table ... rename to ...`), mais os arquivos em *Usada por* (`.from("tabela")`), as views que a usam e os testes do banco.
- **Tipos:** *ação* = server action (roda no servidor, chamada por formulário); *componente* = pedaço de tela React; *função* = regra ou utilitário; *hook* = função React `use...`; *tipo* = tipo do TypeScript; *constante* = valor fixo exportado. Itens *internos* (não exportados) só são usados dentro do próprio arquivo.

## Pastas

| Pasta | Arquivos | O que tem |
|---|---:|---|
| `.github` | 4 | Configuração do GitHub (workflows do Actions, Dependabot). |
| `.github/workflows` | 4 | GitHub Actions: Verificação (lint, tipos, testes, build, test:db, E2E e NF-e), migrations, backup e webhooks. |
| `docs` | 181 | Documentação do projeto (fluxo de trabalho, guias, estudos, auditorias). |
| `docs/codigo` | 7 | Documentação do código: arquitetura, convenções, banco, módulos, integrações, testes e operação. |
| `docs/estudos` | 1 |  |
| `docs/legado` | 156 | Referência que não vale mais: o código antigo do Balbina e os documentos do FINAVI (plano original e troca de servidor). |
| `docs/legado/balbina-backend` | 30 |  |
| `docs/legado/balbina-backend/db` | 1 |  |
| `docs/legado/balbina-backend/src` | 21 |  |
| `docs/legado/balbina-backend/src/repositories` | 7 |  |
| `docs/legado/balbina-backend/src/services` | 4 |  |
| `docs/legado/balbina-backend/src/types` | 1 |  |
| `docs/legado/balbina-backend/test` | 1 |  |
| `docs/legado/balbina-campo` | 91 |  |
| `docs/legado/balbina-campo/android` | 68 |  |
| `docs/legado/balbina-campo/android/app` | 53 |  |
| `docs/legado/balbina-campo/android/app/src` | 49 |  |
| `docs/legado/balbina-campo/android/app/src/androidTest` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/androidTest/java` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/androidTest/java/com` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/androidTest/java/com/getcapacitor` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/androidTest/java/com/getcapacitor/myapp` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main` | 47 |  |
| `docs/legado/balbina-campo/android/app/src/main/assets` | 9 |  |
| `docs/legado/balbina-campo/android/app/src/main/assets/public` | 7 |  |
| `docs/legado/balbina-campo/android/app/src/main/assets/public/assets` | 2 |  |
| `docs/legado/balbina-campo/android/app/src/main/java` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/java/br` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/java/br/com` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/java/br/com/balbinaagro` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/java/br/com/balbinaagro/app` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res` | 36 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable` | 2 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-land-hdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-land-mdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-land-xhdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-land-xxhdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-land-xxxhdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-port-hdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-port-mdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-port-xhdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-port-xxhdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-port-xxxhdpi` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/drawable-v24` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/layout` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/mipmap-anydpi-v26` | 2 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/mipmap-hdpi` | 3 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/mipmap-mdpi` | 3 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/mipmap-xhdpi` | 3 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/mipmap-xxhdpi` | 3 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/mipmap-xxxhdpi` | 3 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/values` | 3 |  |
| `docs/legado/balbina-campo/android/app/src/main/res/xml` | 2 |  |
| `docs/legado/balbina-campo/android/app/src/test` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/test/java` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/test/java/com` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/test/java/com/getcapacitor` | 1 |  |
| `docs/legado/balbina-campo/android/app/src/test/java/com/getcapacitor/myapp` | 1 |  |
| `docs/legado/balbina-campo/android/capacitor-cordova-android-plugins` | 5 |  |
| `docs/legado/balbina-campo/android/capacitor-cordova-android-plugins/src` | 3 |  |
| `docs/legado/balbina-campo/android/capacitor-cordova-android-plugins/src/main` | 3 |  |
| `docs/legado/balbina-campo/android/capacitor-cordova-android-plugins/src/main/java` | 1 |  |
| `docs/legado/balbina-campo/android/capacitor-cordova-android-plugins/src/main/res` | 1 |  |
| `docs/legado/balbina-campo/android/gradle` | 2 |  |
| `docs/legado/balbina-campo/android/gradle/wrapper` | 2 |  |
| `docs/legado/balbina-campo/public` | 2 |  |
| `docs/legado/balbina-campo/src` | 9 |  |
| `docs/legado/balbina-campo/src/api` | 1 |  |
| `docs/legado/balbina-campo/src/assets` | 3 |  |
| `docs/legado/balbina-campo/src/components` | 1 |  |
| `docs/legado/balbina-campo/src/lib` | 1 |  |
| `docs/legado/balbina-gestao` | 22 |  |
| `docs/legado/balbina-gestao/public` | 2 |  |
| `docs/legado/balbina-gestao/src` | 9 |  |
| `docs/legado/balbina-gestao/src/api` | 1 |  |
| `docs/legado/balbina-gestao/src/assets` | 3 |  |
| `docs/legado/balbina-gestao/src/components` | 1 |  |
| `docs/legado/balbina-gestao/src/lib` | 1 |  |
| `docs/legado/balbina-v1` | 8 |  |
| `docs/legado/finavi` | 4 |  |
| `docs/legado/finavi/replica` | 3 |  |
| `e2e` | 18 | Testes de ponta a ponta com Playwright (npm run test:e2e). |
| `public` | 6 | Arquivos estáticos (ícones, service worker do modo offline). |
| `scripts` | 11 | Scripts de apoio: rodar local, backup, testes do banco, aplicar migrations, este mapa. |
| `src` | 522 | Todo o código do app Next.js (telas, componentes, regras em TypeScript). |
| `src/app` | 255 | Rotas do Next.js: cada pasta é um endereço; page.tsx é a tela, route.ts é API, actions.ts são as ações de formulário (server actions). |
| `src/app/(app)` | 165 | Telas do sistema logado (com menu lateral). O nome entre parênteses não aparece na URL. |
| `src/app/(app)/_cadastro-rapido` | 1 | Endereço /_cadastro-rapido. |
| `src/app/(app)/_titulos` | 3 | Código compartilhado por Contas a pagar e Contas a receber (lista, página e ações). |
| `src/app/(app)/apontamentos` | 7 | Tela /apontamentos (Produção > Apontamento diário). |
| `src/app/(app)/apontamentos/checklist` | 1 | Endereço /apontamentos/checklist. |
| `src/app/(app)/cartoes` | 2 | Tela /cartoes (Financeiro > Cartões de crédito). |
| `src/app/(app)/categorias` | 3 | Tela /categorias (Cadastros > Categorias). |
| `src/app/(app)/centros-de-custo` | 3 | Tela /centros-de-custo (Cadastros > Centros de custo). |
| `src/app/(app)/cobrancas` | 4 | Tela /cobrancas (Financeiro > Cobranças). |
| `src/app/(app)/conciliacao` | 12 | Tela /conciliacao (Financeiro > Conciliação). |
| `src/app/(app)/conciliacao/bancos` | 1 | Endereço /conciliacao/bancos. |
| `src/app/(app)/conciliacao/regras` | 1 | Endereço /conciliacao/regras. |
| `src/app/(app)/configuracoes` | 22 | Tela /configuracoes (Configurações > Configurações gerais). |
| `src/app/(app)/configuracoes/api` | 3 | Endereço /configuracoes/api. |
| `src/app/(app)/configuracoes/automacoes` | 2 | Endereço /configuracoes/automacoes. |
| `src/app/(app)/configuracoes/importar` | 4 | Endereço /configuracoes/importar. |
| `src/app/(app)/configuracoes/importar/modelo` | 1 | Endereço /configuracoes/importar/modelo. |
| `src/app/(app)/configuracoes/usuarios` | 3 | Endereço /configuracoes/usuarios. |
| `src/app/(app)/configuracoes/zerar-financeiro` | 4 | Endereço /configuracoes/zerar-financeiro. |
| `src/app/(app)/configuracoes/zerar-financeiro/backup` | 1 | Endereço /configuracoes/zerar-financeiro/backup. |
| `src/app/(app)/configuracoes/zerar-sistema` | 4 | Endereço /configuracoes/zerar-sistema. |
| `src/app/(app)/configuracoes/zerar-sistema/backup` | 1 | Endereço /configuracoes/zerar-sistema/backup. |
| `src/app/(app)/contas` | 3 | Tela /contas (Financeiro > Contas e saldos). |
| `src/app/(app)/contas-a-pagar` | 6 | Tela /contas-a-pagar (Financeiro > Contas a pagar). |
| `src/app/(app)/contas-a-pagar/documentos` | 3 | Endereço /contas-a-pagar/documentos. |
| `src/app/(app)/contas-a-pagar/pagamentos` | 2 | Endereço /contas-a-pagar/pagamentos. |
| `src/app/(app)/contas-a-receber` | 2 | Tela /contas-a-receber (Financeiro > Contas a receber). |
| `src/app/(app)/contas-a-receber/regua` | 1 | Endereço /contas-a-receber/regua. |
| `src/app/(app)/contatos` | 3 | Tela /contatos (Cadastros > Clientes e fornecedores). |
| `src/app/(app)/custo-do-kg` | 2 | Tela /custo-do-kg (Gestão > Custo do kg). |
| `src/app/(app)/despescas` | 2 | Tela /despescas (Produção > Despescas). |
| `src/app/(app)/estoque` | 2 | Tela /estoque (Estoque > Estoque). |
| `src/app/(app)/fluxo-de-caixa` | 1 | Tela /fluxo-de-caixa (Financeiro > Fluxo de caixa). |
| `src/app/(app)/historico` | 1 | Tela /historico (Configurações > Histórico de alterações). |
| `src/app/(app)/insumos` | 1 | Tela /insumos (Cadastros > Insumos da piscicultura). |
| `src/app/(app)/lotes` | 7 | Tela /lotes (Produção > Lotes). |
| `src/app/(app)/lotes/[id]` | 3 | Endereço /lotes/[id]. |
| `src/app/(app)/lotes/especies` | 1 | Endereço /lotes/especies. |
| `src/app/(app)/medicamentos` | 3 | Tela /medicamentos (Cadastros > Medicamentos e vitaminas). |
| `src/app/(app)/notas` | 5 | Tela /notas (Comercial > Notas fiscais). |
| `src/app/(app)/notas/recebidas` | 3 | Endereço /notas/recebidas. |
| `src/app/(app)/notas/recebidas/[id]` | 1 | Endereço /notas/recebidas/[id]. |
| `src/app/(app)/notas/recebidas/[id]/xml` | 1 | Endereço /notas/recebidas/[id]/xml. |
| `src/app/(app)/painel` | 1 | Endereço /painel. |
| `src/app/(app)/pendencias` | 1 | Endereço /pendencias. |
| `src/app/(app)/piscicultura` | 3 | Tela /piscicultura (Produção > Viveiros). |
| `src/app/(app)/planejamento` | 7 | Tela /planejamento (Gestão > Planejamento). |
| `src/app/(app)/planejamento/parametros` | 2 | Endereço /planejamento/parametros. |
| `src/app/(app)/planejamento/viabilidade` | 1 | Endereço /planejamento/viabilidade. |
| `src/app/(app)/pontos-de-venda` | 5 | Tela /pontos-de-venda (Estoque > Pontos de venda). |
| `src/app/(app)/pontos-de-venda/[id]` | 1 | Endereço /pontos-de-venda/[id]. |
| `src/app/(app)/pontos-de-venda/transferencias` | 1 | Endereço /pontos-de-venda/transferencias. |
| `src/app/(app)/previsoes` | 1 | Tela /previsoes (Gestão > Previsões e alertas). |
| `src/app/(app)/primeiros-passos` | 2 | Endereço /primeiros-passos. |
| `src/app/(app)/produtos` | 4 | Tela /produtos (Cadastros > Produtos de venda). |
| `src/app/(app)/racao` | 3 | Tela /racao (Estoque > Ração e insumos). |
| `src/app/(app)/relatorios` | 18 | Endereço /relatorios. |
| `src/app/(app)/relatorios/aging` | 1 | Endereço /relatorios/aging. |
| `src/app/(app)/relatorios/apresentacao` | 1 | Endereço /relatorios/apresentacao. |
| `src/app/(app)/relatorios/contador` | 4 | Endereço /relatorios/contador. |
| `src/app/(app)/relatorios/contador/baixar` | 1 | Endereço /relatorios/contador/baixar. |
| `src/app/(app)/relatorios/contador/lcdpr` | 1 | Endereço /relatorios/contador/lcdpr. |
| `src/app/(app)/relatorios/contas` | 1 | Endereço /relatorios/contas. |
| `src/app/(app)/relatorios/dre` | 2 | Endereço /relatorios/dre. |
| `src/app/(app)/relatorios/exportar` | 1 | Endereço /relatorios/exportar. |
| `src/app/(app)/relatorios/indicadores` | 1 | Endereço /relatorios/indicadores. |
| `src/app/(app)/relatorios/orcamento` | 2 | Endereço /relatorios/orcamento. |
| `src/app/(app)/relatorios/periodo` | 1 | Endereço /relatorios/periodo. |
| `src/app/(app)/relatorios/vendas` | 1 | Endereço /relatorios/vendas. |
| `src/app/(app)/sanidade` | 2 | Tela /sanidade (Produção > Sanidade). |
| `src/app/(app)/seguranca` | 4 | Endereço /seguranca. |
| `src/app/(app)/sem-acesso` | 1 | Endereço /sem-acesso. |
| `src/app/(app)/sondas` | 1 | Tela /sondas (Produção > Sondas IoT). |
| `src/app/(app)/tabelas-de-preco` | 3 | Tela /tabelas-de-preco (Cadastros > Tabelas de preço). |
| `src/app/(app)/vendas` | 11 | Tela /vendas (Comercial > Vendas). |
| `src/app/(app)/vendas/[id]` | 1 | Endereço /vendas/[id]. |
| `src/app/(app)/vendas/fixos` | 2 | Endereço /vendas/fixos. |
| `src/app/(app)/vendas/links` | 2 | Endereço /vendas/links. |
| `src/app/(app)/vendas/nova` | 1 | Endereço /vendas/nova. |
| `src/app/(app)/vendas/pdv` | 2 | Tela /vendas/pdv (Comercial > PDV (balcão)). |
| `src/app/(app)/vendas/pdv/caixa` | 1 | Endereço /vendas/pdv/caixa. |
| `src/app/(app)/vendas/precos` | 1 | Endereço /vendas/precos. |
| `src/app/aceitar-termos` | 3 | Endereço /aceitar-termos. |
| `src/app/api` | 46 | Rotas de API do servidor (JSON). |
| `src/app/api/abrir-lote` | 1 | API /api/abrir-lote. |
| `src/app/api/apontamentos` | 1 | API /api/apontamentos. |
| `src/app/api/app` | 11 | API /api/app. |
| `src/app/api/app/apontamentos` | 1 | API /api/app/apontamentos. |
| `src/app/api/app/campo` | 1 | API /api/app/campo. |
| `src/app/api/app/estoque` | 2 | API /api/app/estoque. |
| `src/app/api/app/estoque/movimentar` | 1 | API /api/app/estoque/movimentar. |
| `src/app/api/app/login` | 1 | API /api/app/login. |
| `src/app/api/app/mfa` | 1 | API /api/app/mfa. |
| `src/app/api/app/painel` | 1 | API /api/app/painel. |
| `src/app/api/app/pdv` | 2 | API /api/app/pdv. |
| `src/app/api/app/pdv/vender` | 1 | API /api/app/pdv/vender. |
| `src/app/api/app/pedidos` | 1 | API /api/app/pedidos. |
| `src/app/api/app/vendas` | 1 | API /api/app/vendas. |
| `src/app/api/biometrias` | 1 | API /api/biometrias. |
| `src/app/api/chat` | 1 | API /api/chat. |
| `src/app/api/chat/manejo` | 1 | API /api/chat/manejo. |
| `src/app/api/cron` | 3 | Rotas chamadas por agendador (Open Finance, fila de webhooks). |
| `src/app/api/cron/automacoes` | 1 | API /api/cron/automacoes. |
| `src/app/api/cron/open-finance` | 1 | API /api/cron/open-finance. |
| `src/app/api/cron/webhooks` | 1 | API /api/cron/webhooks. |
| `src/app/api/entrada` | 2 | API /api/entrada. |
| `src/app/api/entrada/email` | 1 | API /api/entrada/email. |
| `src/app/api/entrada/whatsapp` | 1 | API /api/entrada/whatsapp. |
| `src/app/api/lancar-insumos` | 1 | API /api/lancar-insumos. |
| `src/app/api/lotes` | 1 | API /api/lotes. |
| `src/app/api/lotes/[id]` | 1 | API /api/lotes/[id]. |
| `src/app/api/lotes/[id]/fechar` | 1 | API /api/lotes/[id]/fechar. |
| `src/app/api/notas` | 1 | API /api/notas. |
| `src/app/api/notas/[id]` | 1 | API /api/notas/[id]. |
| `src/app/api/notas/[id]/[tipo]` | 1 | API /api/notas/[id]/[tipo]. |
| `src/app/api/pedidos` | 1 | API /api/pedidos. |
| `src/app/api/push` | 1 | API /api/push. |
| `src/app/api/v1` | 17 | API pública /api/v1 (chave gerada pelo master em Configurações > API). |
| `src/app/api/v1/categorias` | 1 | API /api/v1/categorias. |
| `src/app/api/v1/centros-de-custo` | 1 | API /api/v1/centros-de-custo. |
| `src/app/api/v1/contas` | 1 | API /api/v1/contas. |
| `src/app/api/v1/contatos` | 2 | API /api/v1/contatos. |
| `src/app/api/v1/contatos/[id]` | 1 | API /api/v1/contatos/[id]. |
| `src/app/api/v1/estoque` | 1 | API /api/v1/estoque. |
| `src/app/api/v1/lancamentos` | 3 | API /api/v1/lancamentos. |
| `src/app/api/v1/lancamentos/[id]` | 2 | API /api/v1/lancamentos/[id]. |
| `src/app/api/v1/lancamentos/[id]/baixas` | 1 | API /api/v1/lancamentos/[id]/baixas. |
| `src/app/api/v1/me` | 1 | API /api/v1/me. |
| `src/app/api/v1/movimentos` | 1 | API /api/v1/movimentos. |
| `src/app/api/v1/produtos` | 2 | API /api/v1/produtos. |
| `src/app/api/v1/produtos/[id]` | 1 | API /api/v1/produtos/[id]. |
| `src/app/api/v1/sondas` | 1 | API /api/v1/sondas. |
| `src/app/api/v1/sondas/leituras` | 1 | API /api/v1/sondas/leituras. |
| `src/app/api/v1/vendas` | 2 | API /api/v1/vendas. |
| `src/app/api/v1/vendas/[id]` | 1 | API /api/v1/vendas/[id]. |
| `src/app/api/webhooks` | 4 | Recebe avisos de fora (Asaas, Focus NFe, Pluggy). |
| `src/app/api/webhooks/asaas` | 1 | API /api/webhooks/asaas. |
| `src/app/api/webhooks/assinatura` | 1 | API /api/webhooks/assinatura. |
| `src/app/api/webhooks/focus` | 1 | API /api/webhooks/focus. |
| `src/app/api/webhooks/pluggy` | 1 | API /api/webhooks/pluggy. |
| `src/app/app-captcha` | 2 | Endereço /app-captcha. |
| `src/app/assinatura` | 2 | Tela de assinatura/plano do Balbina. |
| `src/app/auth` | 16 | Fluxos de autenticação: MFA, convite, primeiro acesso, nova senha. |
| `src/app/auth/confirmar` | 1 | Endereço /auth/confirmar. |
| `src/app/auth/convite` | 2 | Endereço /auth/convite. |
| `src/app/auth/mfa` | 8 | Endereço /auth/mfa. |
| `src/app/auth/mfa/email` | 2 | Endereço /auth/mfa/email. |
| `src/app/auth/nova-senha` | 2 | Endereço /auth/nova-senha. |
| `src/app/auth/primeiro-acesso` | 3 | Endereço /auth/primeiro-acesso. |
| `src/app/campo` | 1 | Apontamento pelo celular, versão simples (funciona offline). |
| `src/app/cookies` | 1 | Endereço /cookies. |
| `src/app/login` | 3 | Tela de login (entrar, criar conta, esqueci a senha). |
| `src/app/onboarding` | 3 | Criação da primeira empresa depois do cadastro. |
| `src/app/pedido` | 3 | Endereço /pedido. |
| `src/app/pedido/[token]` | 3 | Endereço /pedido/[token]. |
| `src/app/privacidade` | 1 | Endereço /privacidade. |
| `src/app/termos` | 1 | Endereço /termos. |
| `src/app/vendedor` | 1 | App do vendedor (pedidos no celular). |
| `src/components` | 62 | Componentes React reutilizados pelas telas. ui.tsx tem os primitivos visuais (botões, cartões, tabelas). |
| `src/components/campo` | 17 |  |
| `src/components/vendas` | 9 | Componentes de vendas: PDV, nova venda, NFC-e, app do vendedor. |
| `src/lib` | 204 | Regras e utilitários em TypeScript (cálculos puros, consultas, integrações). Arquivo .test.ts ao lado = teste. |
| `src/lib/api` | 6 | Setor da API pública: catálogo de endpoints, consultas, regras e envio de webhooks. |
| `src/lib/app-celular` | 3 |  |
| `src/lib/campo` | 16 |  |
| `src/lib/supabase` | 8 | Clientes do Supabase: server.ts (servidor com sessão), client.ts (navegador), admin.ts (chave de serviço), proxy.ts (sessão no proxy). |
| `supabase` | 210 | Banco de dados Supabase (Postgres). |
| `supabase/.branches` | 1 |  |
| `supabase/.temp` | 1 |  |
| `supabase/migrations` | 120 | Migrations SQL em ordem de data. Tabelas, views, funções, triggers e policies (RLS). Nunca editar uma antiga: criar outra. |
| `supabase/seed` | 1 |  |
| `supabase/templates` | 1 |  |
| `supabase/tests` | 85 | Testes do banco (npm run test:db): regras de negócio, triggers e isolamento entre empresas. |

## Telas (menu → arquivo)

| Endereço | Menu | Tela (page.tsx) | Ações do servidor |
|---|---|---|---|
| `/` |  | [src/app/page.tsx](../../src/app/page.tsx) | — |
| `/aceitar-termos` |  | [src/app/aceitar-termos/page.tsx](../../src/app/aceitar-termos/page.tsx) | [src/app/aceitar-termos/actions.ts](../../src/app/aceitar-termos/actions.ts) |
| `/apontamentos` | Produção > Apontamento diário | [src/app/(app)/apontamentos/page.tsx](../../src/app/(app)/apontamentos/page.tsx) | [src/app/(app)/apontamentos/actions.ts](../../src/app/(app)/apontamentos/actions.ts), [src/app/(app)/apontamentos/foto-mortes-action.ts](../../src/app/(app)/apontamentos/foto-mortes-action.ts) |
| `/apontamentos/checklist` |  | [src/app/(app)/apontamentos/checklist/page.tsx](../../src/app/(app)/apontamentos/checklist/page.tsx) | — |
| `/app-captcha` |  | [src/app/app-captcha/page.tsx](../../src/app/app-captcha/page.tsx) | — |
| `/assinatura` |  | [src/app/assinatura/page.tsx](../../src/app/assinatura/page.tsx) | [src/app/assinatura/actions.ts](../../src/app/assinatura/actions.ts) |
| `/auth/convite` |  | [src/app/auth/convite/page.tsx](../../src/app/auth/convite/page.tsx) | — |
| `/auth/mfa` |  | [src/app/auth/mfa/page.tsx](../../src/app/auth/mfa/page.tsx) | [src/app/auth/mfa/actions.ts](../../src/app/auth/mfa/actions.ts) |
| `/auth/mfa/email` |  | [src/app/auth/mfa/email/page.tsx](../../src/app/auth/mfa/email/page.tsx) | — |
| `/auth/nova-senha` |  | [src/app/auth/nova-senha/page.tsx](../../src/app/auth/nova-senha/page.tsx) | — |
| `/auth/primeiro-acesso` |  | [src/app/auth/primeiro-acesso/page.tsx](../../src/app/auth/primeiro-acesso/page.tsx) | [src/app/auth/primeiro-acesso/actions.ts](../../src/app/auth/primeiro-acesso/actions.ts) |
| `/campo` |  | [src/app/campo/page.tsx](../../src/app/campo/page.tsx) | — |
| `/cartoes` | Financeiro > Cartões de crédito | [src/app/(app)/cartoes/page.tsx](../../src/app/(app)/cartoes/page.tsx) | [src/app/(app)/cartoes/actions.ts](../../src/app/(app)/cartoes/actions.ts) |
| `/categorias` | Cadastros > Categorias | [src/app/(app)/categorias/page.tsx](../../src/app/(app)/categorias/page.tsx) | [src/app/(app)/categorias/actions.ts](../../src/app/(app)/categorias/actions.ts) |
| `/centros-de-custo` | Cadastros > Centros de custo | [src/app/(app)/centros-de-custo/page.tsx](../../src/app/(app)/centros-de-custo/page.tsx) | [src/app/(app)/centros-de-custo/actions.ts](../../src/app/(app)/centros-de-custo/actions.ts) |
| `/cobrancas` | Financeiro > Cobranças | [src/app/(app)/cobrancas/page.tsx](../../src/app/(app)/cobrancas/page.tsx) | [src/app/(app)/cobrancas/actions.ts](../../src/app/(app)/cobrancas/actions.ts), [src/app/(app)/cobrancas/conta-actions.ts](../../src/app/(app)/cobrancas/conta-actions.ts) |
| `/conciliacao` | Financeiro > Conciliação | [src/app/(app)/conciliacao/page.tsx](../../src/app/(app)/conciliacao/page.tsx) | [src/app/(app)/conciliacao/actions.ts](../../src/app/(app)/conciliacao/actions.ts), [src/app/(app)/conciliacao/open-finance-actions.ts](../../src/app/(app)/conciliacao/open-finance-actions.ts) |
| `/conciliacao/bancos` |  | [src/app/(app)/conciliacao/bancos/page.tsx](../../src/app/(app)/conciliacao/bancos/page.tsx) | — |
| `/conciliacao/regras` |  | [src/app/(app)/conciliacao/regras/page.tsx](../../src/app/(app)/conciliacao/regras/page.tsx) | — |
| `/configuracoes` | Configurações > Configurações gerais | [src/app/(app)/configuracoes/page.tsx](../../src/app/(app)/configuracoes/page.tsx) | [src/app/(app)/configuracoes/actions.ts](../../src/app/(app)/configuracoes/actions.ts) |
| `/configuracoes/api` |  | [src/app/(app)/configuracoes/api/page.tsx](../../src/app/(app)/configuracoes/api/page.tsx) | [src/app/(app)/configuracoes/api/actions.ts](../../src/app/(app)/configuracoes/api/actions.ts) |
| `/configuracoes/automacoes` |  | [src/app/(app)/configuracoes/automacoes/page.tsx](../../src/app/(app)/configuracoes/automacoes/page.tsx) | [src/app/(app)/configuracoes/automacoes/actions.ts](../../src/app/(app)/configuracoes/automacoes/actions.ts) |
| `/configuracoes/importar` |  | [src/app/(app)/configuracoes/importar/page.tsx](../../src/app/(app)/configuracoes/importar/page.tsx) | [src/app/(app)/configuracoes/importar/actions.ts](../../src/app/(app)/configuracoes/importar/actions.ts) |
| `/configuracoes/usuarios` |  | [src/app/(app)/configuracoes/usuarios/page.tsx](../../src/app/(app)/configuracoes/usuarios/page.tsx) | [src/app/(app)/configuracoes/usuarios/actions.ts](../../src/app/(app)/configuracoes/usuarios/actions.ts) |
| `/configuracoes/zerar-financeiro` |  | [src/app/(app)/configuracoes/zerar-financeiro/page.tsx](../../src/app/(app)/configuracoes/zerar-financeiro/page.tsx) | [src/app/(app)/configuracoes/zerar-financeiro/actions.ts](../../src/app/(app)/configuracoes/zerar-financeiro/actions.ts) |
| `/configuracoes/zerar-sistema` |  | [src/app/(app)/configuracoes/zerar-sistema/page.tsx](../../src/app/(app)/configuracoes/zerar-sistema/page.tsx) | [src/app/(app)/configuracoes/zerar-sistema/actions.ts](../../src/app/(app)/configuracoes/zerar-sistema/actions.ts) |
| `/contas` | Financeiro > Contas e saldos | [src/app/(app)/contas/page.tsx](../../src/app/(app)/contas/page.tsx) | [src/app/(app)/contas/actions.ts](../../src/app/(app)/contas/actions.ts) |
| `/contas-a-pagar` | Financeiro > Contas a pagar | [src/app/(app)/contas-a-pagar/page.tsx](../../src/app/(app)/contas-a-pagar/page.tsx) | — |
| `/contas-a-pagar/documentos` |  | [src/app/(app)/contas-a-pagar/documentos/page.tsx](../../src/app/(app)/contas-a-pagar/documentos/page.tsx) | [src/app/(app)/contas-a-pagar/documentos/actions.ts](../../src/app/(app)/contas-a-pagar/documentos/actions.ts) |
| `/contas-a-pagar/pagamentos` |  | [src/app/(app)/contas-a-pagar/pagamentos/page.tsx](../../src/app/(app)/contas-a-pagar/pagamentos/page.tsx) | [src/app/(app)/contas-a-pagar/pagamentos/actions.ts](../../src/app/(app)/contas-a-pagar/pagamentos/actions.ts) |
| `/contas-a-receber` | Financeiro > Contas a receber | [src/app/(app)/contas-a-receber/page.tsx](../../src/app/(app)/contas-a-receber/page.tsx) | — |
| `/contas-a-receber/regua` |  | [src/app/(app)/contas-a-receber/regua/page.tsx](../../src/app/(app)/contas-a-receber/regua/page.tsx) | — |
| `/contatos` | Cadastros > Clientes e fornecedores | [src/app/(app)/contatos/page.tsx](../../src/app/(app)/contatos/page.tsx) | [src/app/(app)/contatos/actions.ts](../../src/app/(app)/contatos/actions.ts) |
| `/cookies` |  | [src/app/cookies/page.tsx](../../src/app/cookies/page.tsx) | — |
| `/custo-do-kg` | Gestão > Custo do kg | [src/app/(app)/custo-do-kg/page.tsx](../../src/app/(app)/custo-do-kg/page.tsx) | [src/app/(app)/custo-do-kg/actions.ts](../../src/app/(app)/custo-do-kg/actions.ts) |
| `/despescas` | Produção > Despescas | [src/app/(app)/despescas/page.tsx](../../src/app/(app)/despescas/page.tsx) | [src/app/(app)/despescas/actions.ts](../../src/app/(app)/despescas/actions.ts) |
| `/estoque` | Estoque > Estoque | [src/app/(app)/estoque/page.tsx](../../src/app/(app)/estoque/page.tsx) | [src/app/(app)/estoque/actions.ts](../../src/app/(app)/estoque/actions.ts) |
| `/fluxo-de-caixa` | Financeiro > Fluxo de caixa | [src/app/(app)/fluxo-de-caixa/page.tsx](../../src/app/(app)/fluxo-de-caixa/page.tsx) | — |
| `/historico` | Configurações > Histórico de alterações | [src/app/(app)/historico/page.tsx](../../src/app/(app)/historico/page.tsx) | — |
| `/insumos` | Cadastros > Insumos da piscicultura | [src/app/(app)/insumos/page.tsx](../../src/app/(app)/insumos/page.tsx) | — |
| `/login` |  | [src/app/login/page.tsx](../../src/app/login/page.tsx) | [src/app/login/actions.ts](../../src/app/login/actions.ts) |
| `/lotes` | Produção > Lotes | [src/app/(app)/lotes/page.tsx](../../src/app/(app)/lotes/page.tsx) | [src/app/(app)/lotes/actions.ts](../../src/app/(app)/lotes/actions.ts) |
| `/lotes/[id]` |  | [src/app/(app)/lotes/[id]/page.tsx](../../src/app/(app)/lotes/%5Bid%5D/page.tsx) | — |
| `/lotes/especies` |  | [src/app/(app)/lotes/especies/page.tsx](../../src/app/(app)/lotes/especies/page.tsx) | — |
| `/medicamentos` | Cadastros > Medicamentos e vitaminas | [src/app/(app)/medicamentos/page.tsx](../../src/app/(app)/medicamentos/page.tsx) | [src/app/(app)/medicamentos/actions.ts](../../src/app/(app)/medicamentos/actions.ts) |
| `/notas` | Comercial > Notas fiscais | [src/app/(app)/notas/page.tsx](../../src/app/(app)/notas/page.tsx) | [src/app/(app)/notas/actions.ts](../../src/app/(app)/notas/actions.ts) |
| `/notas/recebidas` |  | [src/app/(app)/notas/recebidas/page.tsx](../../src/app/(app)/notas/recebidas/page.tsx) | [src/app/(app)/notas/recebidas/actions.ts](../../src/app/(app)/notas/recebidas/actions.ts) |
| `/onboarding` |  | [src/app/onboarding/page.tsx](../../src/app/onboarding/page.tsx) | [src/app/onboarding/actions.ts](../../src/app/onboarding/actions.ts) |
| `/painel` |  | [src/app/(app)/painel/page.tsx](../../src/app/(app)/painel/page.tsx) | — |
| `/pedido/[token]` |  | [src/app/pedido/[token]/page.tsx](../../src/app/pedido/%5Btoken%5D/page.tsx) | [src/app/pedido/[token]/actions.ts](../../src/app/pedido/%5Btoken%5D/actions.ts) |
| `/pendencias` |  | [src/app/(app)/pendencias/page.tsx](../../src/app/(app)/pendencias/page.tsx) | — |
| `/piscicultura` | Produção > Viveiros | [src/app/(app)/piscicultura/page.tsx](../../src/app/(app)/piscicultura/page.tsx) | [src/app/(app)/piscicultura/actions.ts](../../src/app/(app)/piscicultura/actions.ts) |
| `/planejamento` | Gestão > Planejamento | [src/app/(app)/planejamento/page.tsx](../../src/app/(app)/planejamento/page.tsx) | [src/app/(app)/planejamento/actions.ts](../../src/app/(app)/planejamento/actions.ts) |
| `/planejamento/parametros` |  | [src/app/(app)/planejamento/parametros/page.tsx](../../src/app/(app)/planejamento/parametros/page.tsx) | — |
| `/planejamento/viabilidade` |  | [src/app/(app)/planejamento/viabilidade/page.tsx](../../src/app/(app)/planejamento/viabilidade/page.tsx) | — |
| `/pontos-de-venda` | Estoque > Pontos de venda | [src/app/(app)/pontos-de-venda/page.tsx](../../src/app/(app)/pontos-de-venda/page.tsx) | [src/app/(app)/pontos-de-venda/actions.ts](../../src/app/(app)/pontos-de-venda/actions.ts) |
| `/pontos-de-venda/[id]` |  | [src/app/(app)/pontos-de-venda/[id]/page.tsx](../../src/app/(app)/pontos-de-venda/%5Bid%5D/page.tsx) | — |
| `/pontos-de-venda/transferencias` |  | [src/app/(app)/pontos-de-venda/transferencias/page.tsx](../../src/app/(app)/pontos-de-venda/transferencias/page.tsx) | — |
| `/previsoes` | Gestão > Previsões e alertas | [src/app/(app)/previsoes/page.tsx](../../src/app/(app)/previsoes/page.tsx) | — |
| `/primeiros-passos` |  | [src/app/(app)/primeiros-passos/page.tsx](../../src/app/(app)/primeiros-passos/page.tsx) | [src/app/(app)/primeiros-passos/actions.ts](../../src/app/(app)/primeiros-passos/actions.ts) |
| `/privacidade` |  | [src/app/privacidade/page.tsx](../../src/app/privacidade/page.tsx) | — |
| `/produtos` | Cadastros > Produtos de venda | [src/app/(app)/produtos/page.tsx](../../src/app/(app)/produtos/page.tsx) | [src/app/(app)/produtos/actions.ts](../../src/app/(app)/produtos/actions.ts) |
| `/racao` | Estoque > Ração e insumos | [src/app/(app)/racao/page.tsx](../../src/app/(app)/racao/page.tsx) | [src/app/(app)/racao/actions.ts](../../src/app/(app)/racao/actions.ts) |
| `/relatorios` |  | [src/app/(app)/relatorios/page.tsx](../../src/app/(app)/relatorios/page.tsx) | — |
| `/relatorios/aging` |  | [src/app/(app)/relatorios/aging/page.tsx](../../src/app/(app)/relatorios/aging/page.tsx) | — |
| `/relatorios/contador` |  | [src/app/(app)/relatorios/contador/page.tsx](../../src/app/(app)/relatorios/contador/page.tsx) | [src/app/(app)/relatorios/contador/actions.ts](../../src/app/(app)/relatorios/contador/actions.ts) |
| `/relatorios/contas` |  | [src/app/(app)/relatorios/contas/page.tsx](../../src/app/(app)/relatorios/contas/page.tsx) | — |
| `/relatorios/dre` |  | [src/app/(app)/relatorios/dre/page.tsx](../../src/app/(app)/relatorios/dre/page.tsx) | [src/app/(app)/relatorios/dre/actions.ts](../../src/app/(app)/relatorios/dre/actions.ts) |
| `/relatorios/indicadores` |  | [src/app/(app)/relatorios/indicadores/page.tsx](../../src/app/(app)/relatorios/indicadores/page.tsx) | — |
| `/relatorios/orcamento` |  | [src/app/(app)/relatorios/orcamento/page.tsx](../../src/app/(app)/relatorios/orcamento/page.tsx) | [src/app/(app)/relatorios/orcamento/actions.ts](../../src/app/(app)/relatorios/orcamento/actions.ts) |
| `/relatorios/periodo` |  | [src/app/(app)/relatorios/periodo/page.tsx](../../src/app/(app)/relatorios/periodo/page.tsx) | — |
| `/relatorios/vendas` |  | [src/app/(app)/relatorios/vendas/page.tsx](../../src/app/(app)/relatorios/vendas/page.tsx) | — |
| `/sanidade` | Produção > Sanidade | [src/app/(app)/sanidade/page.tsx](../../src/app/(app)/sanidade/page.tsx) | [src/app/(app)/sanidade/actions.ts](../../src/app/(app)/sanidade/actions.ts) |
| `/seguranca` |  | [src/app/(app)/seguranca/page.tsx](../../src/app/(app)/seguranca/page.tsx) | [src/app/(app)/seguranca/actions.ts](../../src/app/(app)/seguranca/actions.ts), [src/app/(app)/seguranca/whatsapp-actions.ts](../../src/app/(app)/seguranca/whatsapp-actions.ts) |
| `/sem-acesso` |  | [src/app/(app)/sem-acesso/page.tsx](../../src/app/(app)/sem-acesso/page.tsx) | — |
| `/sondas` | Produção > Sondas IoT | [src/app/(app)/sondas/page.tsx](../../src/app/(app)/sondas/page.tsx) | — |
| `/tabelas-de-preco` | Cadastros > Tabelas de preço | [src/app/(app)/tabelas-de-preco/page.tsx](../../src/app/(app)/tabelas-de-preco/page.tsx) | [src/app/(app)/tabelas-de-preco/actions.ts](../../src/app/(app)/tabelas-de-preco/actions.ts) |
| `/termos` |  | [src/app/termos/page.tsx](../../src/app/termos/page.tsx) | — |
| `/vendas` | Comercial > Vendas | [src/app/(app)/vendas/page.tsx](../../src/app/(app)/vendas/page.tsx) | [src/app/(app)/vendas/actions.ts](../../src/app/(app)/vendas/actions.ts) |
| `/vendas/[id]` |  | [src/app/(app)/vendas/[id]/page.tsx](../../src/app/(app)/vendas/%5Bid%5D/page.tsx) | — |
| `/vendas/fixos` |  | [src/app/(app)/vendas/fixos/page.tsx](../../src/app/(app)/vendas/fixos/page.tsx) | [src/app/(app)/vendas/fixos/actions.ts](../../src/app/(app)/vendas/fixos/actions.ts) |
| `/vendas/links` |  | [src/app/(app)/vendas/links/page.tsx](../../src/app/(app)/vendas/links/page.tsx) | [src/app/(app)/vendas/links/actions.ts](../../src/app/(app)/vendas/links/actions.ts) |
| `/vendas/nova` |  | [src/app/(app)/vendas/nova/page.tsx](../../src/app/(app)/vendas/nova/page.tsx) | — |
| `/vendas/pdv` | Comercial > PDV (balcão) | [src/app/(app)/vendas/pdv/page.tsx](../../src/app/(app)/vendas/pdv/page.tsx) | — |
| `/vendas/pdv/caixa` |  | [src/app/(app)/vendas/pdv/caixa/page.tsx](../../src/app/(app)/vendas/pdv/caixa/page.tsx) | — |
| `/vendas/precos` |  | [src/app/(app)/vendas/precos/page.tsx](../../src/app/(app)/vendas/precos/page.tsx) | — |
| `/vendedor` | Comercial > App do vendedor | [src/app/vendedor/page.tsx](../../src/app/vendedor/page.tsx) | — |

## Rotas de API

| Métodos | Endereço | Arquivo | O que faz |
|---|---|---|---|
| POST | `/api/abrir-lote` | [src/app/api/abrir-lote/route.ts](../../src/app/api/abrir-lote/route.ts) |  |
| POST | `/api/apontamentos` | [src/app/api/apontamentos/route.ts](../../src/app/api/apontamentos/route.ts) |  |
| POST | `/api/app/apontamentos` | [src/app/api/app/apontamentos/route.ts](../../src/app/api/app/apontamentos/route.ts) |  |
| POST | `/api/app/campo` | [src/app/api/app/campo/route.ts](../../src/app/api/app/campo/route.ts) |  |
| POST | `/api/app/estoque` | [src/app/api/app/estoque/route.ts](../../src/app/api/app/estoque/route.ts) |  |
| POST | `/api/app/estoque/movimentar` | [src/app/api/app/estoque/movimentar/route.ts](../../src/app/api/app/estoque/movimentar/route.ts) |  |
| POST | `/api/app/login` | [src/app/api/app/login/route.ts](../../src/app/api/app/login/route.ts) |  |
| POST | `/api/app/mfa` | [src/app/api/app/mfa/route.ts](../../src/app/api/app/mfa/route.ts) |  |
| POST | `/api/app/painel` | [src/app/api/app/painel/route.ts](../../src/app/api/app/painel/route.ts) |  |
| POST | `/api/app/pdv` | [src/app/api/app/pdv/route.ts](../../src/app/api/app/pdv/route.ts) |  |
| POST | `/api/app/pdv/vender` | [src/app/api/app/pdv/vender/route.ts](../../src/app/api/app/pdv/vender/route.ts) |  |
| POST | `/api/app/pedidos` | [src/app/api/app/pedidos/route.ts](../../src/app/api/app/pedidos/route.ts) |  |
| POST | `/api/app/vendas` | [src/app/api/app/vendas/route.ts](../../src/app/api/app/vendas/route.ts) |  |
| POST | `/api/biometrias` | [src/app/api/biometrias/route.ts](../../src/app/api/biometrias/route.ts) |  |
| POST | `/api/chat/manejo` | [src/app/api/chat/manejo/route.ts](../../src/app/api/chat/manejo/route.ts) |  |
| GET | `/api/cron/automacoes` | [src/app/api/cron/automacoes/route.ts](../../src/app/api/cron/automacoes/route.ts) |  |
| GET | `/api/cron/open-finance` | [src/app/api/cron/open-finance/route.ts](../../src/app/api/cron/open-finance/route.ts) |  |
| GET | `/api/cron/webhooks` | [src/app/api/cron/webhooks/route.ts](../../src/app/api/cron/webhooks/route.ts) |  |
| POST | `/api/entrada/email` | [src/app/api/entrada/email/route.ts](../../src/app/api/entrada/email/route.ts) |  |
| GET, POST | `/api/entrada/whatsapp` | [src/app/api/entrada/whatsapp/route.ts](../../src/app/api/entrada/whatsapp/route.ts) |  |
| POST | `/api/lancar-insumos` | [src/app/api/lancar-insumos/route.ts](../../src/app/api/lancar-insumos/route.ts) |  |
| POST | `/api/lotes/[id]/fechar` | [src/app/api/lotes/[id]/fechar/route.ts](../../src/app/api/lotes/%5Bid%5D/fechar/route.ts) |  |
| GET | `/api/notas/[id]/[tipo]` | [src/app/api/notas/[id]/[tipo]/route.ts](../../src/app/api/notas/%5Bid%5D/%5Btipo%5D/route.ts) |  |
| POST | `/api/pedidos` | [src/app/api/pedidos/route.ts](../../src/app/api/pedidos/route.ts) |  |
| POST, DELETE | `/api/push` | [src/app/api/push/route.ts](../../src/app/api/push/route.ts) |  |
| GET | `/api/v1` | [src/app/api/v1/route.ts](../../src/app/api/v1/route.ts) |  |
| GET | `/api/v1/categorias` | [src/app/api/v1/categorias/route.ts](../../src/app/api/v1/categorias/route.ts) |  |
| GET | `/api/v1/centros-de-custo` | [src/app/api/v1/centros-de-custo/route.ts](../../src/app/api/v1/centros-de-custo/route.ts) |  |
| GET | `/api/v1/contas` | [src/app/api/v1/contas/route.ts](../../src/app/api/v1/contas/route.ts) |  |
| GET, POST | `/api/v1/contatos` | [src/app/api/v1/contatos/route.ts](../../src/app/api/v1/contatos/route.ts) |  |
| GET, PATCH | `/api/v1/contatos/[id]` | [src/app/api/v1/contatos/[id]/route.ts](../../src/app/api/v1/contatos/%5Bid%5D/route.ts) |  |
| GET | `/api/v1/estoque` | [src/app/api/v1/estoque/route.ts](../../src/app/api/v1/estoque/route.ts) |  |
| GET, POST | `/api/v1/lancamentos` | [src/app/api/v1/lancamentos/route.ts](../../src/app/api/v1/lancamentos/route.ts) |  |
| GET | `/api/v1/lancamentos/[id]` | [src/app/api/v1/lancamentos/[id]/route.ts](../../src/app/api/v1/lancamentos/%5Bid%5D/route.ts) |  |
| POST | `/api/v1/lancamentos/[id]/baixas` | [src/app/api/v1/lancamentos/[id]/baixas/route.ts](../../src/app/api/v1/lancamentos/%5Bid%5D/baixas/route.ts) |  |
| GET | `/api/v1/me` | [src/app/api/v1/me/route.ts](../../src/app/api/v1/me/route.ts) |  |
| GET | `/api/v1/movimentos` | [src/app/api/v1/movimentos/route.ts](../../src/app/api/v1/movimentos/route.ts) |  |
| GET, POST | `/api/v1/produtos` | [src/app/api/v1/produtos/route.ts](../../src/app/api/v1/produtos/route.ts) |  |
| GET, PATCH | `/api/v1/produtos/[id]` | [src/app/api/v1/produtos/[id]/route.ts](../../src/app/api/v1/produtos/%5Bid%5D/route.ts) |  |
| POST | `/api/v1/sondas/leituras` | [src/app/api/v1/sondas/leituras/route.ts](../../src/app/api/v1/sondas/leituras/route.ts) |  |
| GET | `/api/v1/vendas` | [src/app/api/v1/vendas/route.ts](../../src/app/api/v1/vendas/route.ts) |  |
| GET | `/api/v1/vendas/[id]` | [src/app/api/v1/vendas/[id]/route.ts](../../src/app/api/v1/vendas/%5Bid%5D/route.ts) |  |
| POST | `/api/webhooks/asaas` | [src/app/api/webhooks/asaas/route.ts](../../src/app/api/webhooks/asaas/route.ts) |  |
| POST | `/api/webhooks/assinatura` | [src/app/api/webhooks/assinatura/route.ts](../../src/app/api/webhooks/assinatura/route.ts) |  |
| POST | `/api/webhooks/focus` | [src/app/api/webhooks/focus/route.ts](../../src/app/api/webhooks/focus/route.ts) |  |
| POST | `/api/webhooks/pluggy` | [src/app/api/webhooks/pluggy/route.ts](../../src/app/api/webhooks/pluggy/route.ts) |  |
| GET | `/auth/confirmar` | [src/app/auth/confirmar/route.ts](../../src/app/auth/confirmar/route.ts) |  |
| GET | `/configuracoes/importar/modelo` | [src/app/(app)/configuracoes/importar/modelo/route.ts](../../src/app/(app)/configuracoes/importar/modelo/route.ts) |  |
| GET | `/configuracoes/zerar-financeiro/backup` | [src/app/(app)/configuracoes/zerar-financeiro/backup/route.ts](../../src/app/(app)/configuracoes/zerar-financeiro/backup/route.ts) |  |
| GET | `/configuracoes/zerar-sistema/backup` | [src/app/(app)/configuracoes/zerar-sistema/backup/route.ts](../../src/app/(app)/configuracoes/zerar-sistema/backup/route.ts) |  |
| GET | `/notas/recebidas/[id]/xml` | [src/app/(app)/notas/recebidas/[id]/xml/route.ts](../../src/app/(app)/notas/recebidas/%5Bid%5D/xml/route.ts) |  |
| GET | `/relatorios/apresentacao` | [src/app/(app)/relatorios/apresentacao/route.ts](../../src/app/(app)/relatorios/apresentacao/route.ts) |  |
| GET | `/relatorios/contador/baixar` | [src/app/(app)/relatorios/contador/baixar/route.ts](../../src/app/(app)/relatorios/contador/baixar/route.ts) |  |
| GET | `/relatorios/contador/lcdpr` | [src/app/(app)/relatorios/contador/lcdpr/route.ts](../../src/app/(app)/relatorios/contador/lcdpr/route.ts) |  |
| GET | `/relatorios/exportar` | [src/app/(app)/relatorios/exportar/route.ts](../../src/app/(app)/relatorios/exportar/route.ts) |  |
