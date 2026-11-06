# Documentação do código do Balbina

O Balbina é um ERP para pisciculturas de tambaqui e outros peixes redondos. Ele junta produção (viveiros, lotes, trato diário, biometria, despesca), estoque de pescado em kg e de insumos, vendas, fiscal, cobrança e financeiro. O diferencial é calcular o **custo do kg por lote** em cima do financeiro real. Nasceu do ERP de avicultura FINAVI, com a granja trocada pelo peixe; o vocabulário e as regras do peixe estão em [`docs/piscicultura.md`](../piscicultura.md).

Esta pasta explica **como o código funciona e por quê**. Para saber **onde fica** cada função, tela, tabela ou rota, use o mapa gerado automaticamente em [`docs/mapa-codigo/`](../mapa-codigo/README.md): abra `mapa.html` no navegador, que tem busca.

## Por onde começar

| Quero... | Leia |
|---|---|
| Entender as peças e como uma requisição anda pelo sistema | [arquitetura.md](arquitetura.md) |
| Saber como escrever uma tela, uma ação ou uma migration do jeito do projeto | [convencoes.md](convencoes.md) |
| Entender o banco: multiempresa, RLS, permissões, triggers, views e rotinas | [banco.md](banco.md) |
| Ver o que cada módulo faz e quais arquivos e funções o compõem | [modulos.md](modulos.md) |
| Mexer em Asaas, Focus NFe, Pluggy, IA, WhatsApp, avisos, API pública | [integracoes.md](integracoes.md) |
| Rodar testes, publicar, migrations, backup | [testes-e-operacao.md](testes-e-operacao.md) |
| Criar o banco, o site e as contas do zero | [`docs/colocar-no-ar.md`](../colocar-no-ar.md) |

## Primeiros 10 minutos

```bash
npm install
npm run local        # Supabase local no Docker + next dev (docs/rodar-local.md)
# entre com admin@balbina.local / balbina1234 (só no local)
```

Antes de mandar qualquer mudança, rode `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:db`. O fluxo de branches (nada direto no `master`) está em [`docs/fluxo-de-trabalho.md`](../fluxo-de-trabalho.md).

## Mapa das pastas

```
src/
  proxy.ts                 sessão e redirecionamento para /login (o "middleware" do Next 16)
  app/
    (app)/<modulo>/        telas do sistema logado: page.tsx (tela), actions.ts (gravações), componentes da tela
    api/                   rotas JSON: v1 (API pública), app (app de celular), webhooks (Asaas, Focus, Pluggy), cron, entrada (e-mail/WhatsApp)
    auth/ login/ onboarding/ assinatura/   entrada no sistema
    campo/ vendedor/       apps de celular que funcionam sem internet (/campo: chat, viveiros, ração, biometria, envios)
    pedido/[token]/        link de pedido para o cliente (portal sem login)
  components/              componentes reutilizados; ui.tsx = primitivos visuais (DESIGN.md)
  lib/                     regras em TypeScript; o arquivo .test.ts ao lado é o teste
    supabase/              clientes do Supabase (servidor, navegador, admin) e leitura paginada
    api/                   núcleo da API pública e dos webhooks de saída
mobile/                    app nativo iOS e Android (Expo); ver docs/app-celular.md
supabase/
  migrations/              todo o banco, em ordem de data (nunca editar uma antiga)
  tests/                   testes do banco (npm run test:db)
e2e/                       testes de ponta a ponta com Playwright
scripts/                   rodar local, backup/restauração, testes do banco, mapa do código
docs/                      documentação (esta pasta, guias, decisões, estudos)
```

## Outros documentos que continuam valendo

- [`docs/piscicultura.md`](../piscicultura.md): o domínio do peixe (vocabulário, ciclo do lote, tabela de arraçoamento, qualidade da água, estoque em kg, custo do kg, app de campo) e as referências da Embrapa.
- [`docs/legado/finavi/replica/architecture.md`](../legado/finavi/replica/architecture.md): o plano original do FINAVI, de 2026-10-26. Algumas escolhas mudaram no caminho (ver "Diferenças do plano original" em [arquitetura.md](arquitetura.md)).
- [`DESIGN.md`](../../DESIGN.md): o sistema visual (tokens, Liquid Glass, primitivos).
- Por assunto: [`api.md`](../api.md), [`automacoes.md`](../automacoes.md), [`nfe.md`](../nfe.md), [`seguranca-e-assinatura.md`](../seguranca-e-assinatura.md), [`plano-de-categorias.md`](../plano-de-categorias.md), [`pontos-de-venda.md`](../pontos-de-venda.md), [`tutoriais.md`](../tutoriais.md), [`backup.md`](../backup.md).

## Glossário rápido

| Termo | Significado no código |
|---|---|
| empresa | Cada CNPJ ou produtor rural (PF). Quase toda tabela tem `empresa_id`. Um usuário pode estar em várias empresas. |
| master | O dono da conta na empresa. Só ele gerencia usuários, chaves da API, zerar dados, etc. |
| setor / viveiro / lote | Estrutura da piscicultura. Cada um ganha um **centro de custo** automaticamente. O lote é o grupo de peixes povoado num ou mais viveiros. |
| lançamento (apontamento) | O registro do trato do viveiro por dia e turno (ração por tipo, mortes e descartes, qualidade da água, medicação, checklist). |
| biometria | Pesagem por amostra: peso médio, biomassa, ganho por dia e conversão alimentar. |
| despesca | Retirada dos peixes (parcial ou total), em kg por classe; a total esvazia o viveiro. |
| classe do peixe | Tamanho do peixe na despesca (Pequeno, Médio, Grande, Extra), com "Inteiro" para o que não foi separado e "Descarte" para o que não se vende. O estoque é em kg por classe. |
| título | Uma conta a pagar ou a receber (tabela `agendamentos`, view `titulos`). |
| baixa | Pagamento ou recebimento de um título. |
| conciliação | Ligar um movimento do extrato do banco a um título, a uma transferência ou a um título novo. |
| rateio | Um valor dividido entre várias categorias e centros de custo. |
| centavos (`_cents`) | Dinheiro é sempre inteiro em centavos (`bigint`), nunca `float`. |
| hoje | O dia **no fuso da empresa** (padrão Manaus), via `app.hoje(empresa)` no banco e `hojeISO(fuso)` no app. |
