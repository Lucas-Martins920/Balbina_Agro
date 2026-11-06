# Product

<!-- impeccable:product-schema 1 -->

<!-- Escrito a partir dos pedidos do Nicolas (a especificação do Balbina Campo e a decisão de usar o FINAVI como base), sem entrevista ao vivo: fatos inferidos estão marcados como (inferido). -->

## Platform

web (com o app de campo `/campo` instalável no celular e o app nativo em `mobile/`)

## Users

Donos e gerentes de pisciculturas de tambaqui e outros peixes redondos, muitas no Amazonas (inferido), e a equipe de campo que trata os peixes todo dia. O dono olha caixa, custo do kg e planejamento de povoamentos e despescas no computador; o tratador lança a ração, as mortes e a água pelo celular, na beira do viveiro, muitas vezes sem sinal.

## Product Purpose

Balbina é um ERP para piscicultura: viveiros, lotes, ração, biometria, despesca, estoque de pescado em kg, vendas, financeiro, cobrança e nota fiscal num só lugar, vendido por assinatura em quatro planos (Basic, Vendas, Fiscal, Gestão). Sucesso é o produtor saber, sem planilha, quanto custa o kg de cada lote, quando despescar e se o caixa fecha.

## Positioning

O custo do kg é calculado por lote sobre o financeiro real da piscicultura (ração, alevinos, insumos, energia, mão de obra), e o campo lança conversando: texto ou voz viram um cartão para confirmar ("coloquei 2 sacos de ração no tanque 02"), com as dúvidas de manejo respondidas pela base técnica da Embrapa.

## Operating Context

- Uso diário no escritório (desktop) e na beira do viveiro (celular), com sol forte, mão molhada e sinal fraco ou nenhum (tema dia, noturno ou do aparelho).
- Peixe vendido por kg (balança) ou em caixa de 20 kg, por classe de tamanho (Pequeno, Médio, Grande, Extra, Inteiro).
- Ração dada em sacos (de 25 kg, o padrão) ou kg, pela tabela de arraçoamento da fase; qualidade da água (oxigênio, temperatura, pH, amônia) medida de manhã.
- Referências que o dono conhece: Embrapa (manuais do tambaqui), NIBO (financeiro).

## Capabilities and Constraints

- Next.js + Supabase, multiempresa, interface em português do Brasil.
- Regras de negócio críticas ficam no banco; módulos travados por plano.
- Planejamento: do povoamento à despesca pela curva de crescimento da espécie e o peso de abate; carência de medicamento trava a despesca; vazio (secagem e calagem) entre um lote e outro.

## Brand Commitments

- Nome Balbina, marca com o azul-petróleo da água do viveiro como cor própria e o tambaqui no ícone.
- Visual herdado do FINAVI: clean, de vidro/cristal no tema Liquid Glass (iOS 26), telas sucintas, só com o essencial, como o Nicolas pediu para o FINAVI.
- O app de campo segue a linha do Emil Kowalski: toques grandes, movimento curto com propósito, nada que atrapalhe a mão molhada.
- O Nicolas prefere telas com dados e alguma cor a minimalismo seco (inferido do histórico do FINAVI).

## Evidence on Hand

Sem dados reais de clientes ainda. Capturas usam o banco local de `npm run local` ou a conta de teste cheia (`supabase/seed/conta-teste.sql`). Não inventar números de clientes, depoimentos ou métricas de mercado.

## Product Principles

1. A tela responde primeiro a pergunta do dia (o que fazer agora); detalhe fica um clique abaixo.
2. Cada piscicultura tem a sua realidade: o sistema sugere (tabela de arraçoamento, curva, peso de despesca), não impõe.
3. Funciona no celular da beira do viveiro, sem sinal, tão bem quanto no computador.
4. Número de dinheiro, de kg e de peixes sempre legível e alinhado.

## Accessibility & Inclusion

Contraste AA no texto nos dois temas, `prefers-reduced-motion` e `prefers-reduced-transparency` respeitados, uso com dedo no celular (alvos de 40px+; 44px+ no `/campo`).
