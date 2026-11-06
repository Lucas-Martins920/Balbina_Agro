# Testes de ponta a ponta (Playwright)

Testam o app inteiro pelo navegador, com Supabase Auth e banco de verdade:

| Arquivo | Fluxo |
|---|---|
| `login.setup.ts` | login com senha + código do app autenticador (a sessão fica salva para os outros) |
| `acesso.spec.ts` | sem sessão vai ao login, senha errada, senha sem 2º fator não abre dados, código errado, teste grátis vencido leva à assinatura |
| `producao-vendas.spec.ts` | lançamento do viveiro (ração, mortes e causa) → despesca parcial com kg por classe → venda por kg no PDV com troco → caixa do dia e estoque |
| `apontamento-lixeira.spec.ts` | lançamento da tarde no computador: editar, excluir (lixeira, os peixes mortos voltam à conta do viveiro) e restaurar |
| `financeiro.spec.ts` | conta a pagar agendada → extrato OFX importado → conciliado com a sugestão |
| `api.spec.ts` | chave da API criada na tela, escopos (200/403), sem chave e chave inválida (401), revogada (401) |
| `login-local.spec.ts` | login por usuário criado pelo master: tratador sem 2º fator cai no `/campo`, financeiro cadastra o autenticador |
| `tela-celular.spec.ts` | trato do turno na aba Ração do `/campo` com sinal, sem sinal (fila no aparelho) e depois de recarregar a tela; conflito de turno resolvido na aba Envios |
| `rotina.spec.ts` | Rotina do dia marca sozinha o lançamento do viveiro e deixa a biometria atrasada pendente; o link `?lancar=` abre a gaveta do lançamento; "+ Novo produto" cadastra de dentro da entrada e já escolhe |
| `telas.spec.ts` | fumaça: cada tela do menu abre sem erro 500 nem erro de JavaScript; master cria cargo |
| `vendas-pontos.spec.ts` | ponto de venda: cadastro, transferência de kg de peixe com frete e venda no PDV do ponto |
| `vendas-prazo.spec.ts` | venda a prazo 14/28: faturar, desfazer faturamento, entregar, desfazer entrega, receber e recusa de desfazer com recebimento |
| `vendedor.spec.ts` | app do vendedor: pedido com sinal e sem sinal (fila no aparelho) |

Os arquivos rodam em ordem alfabética, um de cada vez, na mesma piscicultura: `vendas-pontos` e `vendas-prazo` usam o
peixe médio que sobra da despesca de `producao-vendas` (27,5 kg). O checklist do viveiro (sim/não obrigatórios de toda empresa nova) é marcado por
`preencherChecklist` (`apoio.ts`). Tela nova no menu entra na lista de `telas.spec.ts`.

O preparo (`preparar.ts`) cria, a cada execução, pessoas e pisciculturas novas pelo próprio Supabase Auth e pelas
funções do banco: a dona com app autenticador (segredo TOTP guardado só em `e2e/.estado/`, fora do git), uma
piscicultura no teste grátis com o viveiro V1 povoado com 10.000 tambaquis (lote E2E-1), preço do kg do peixe médio
(R$ 12,00), conta bancária, cliente e fornecedor, e uma segunda pessoa com o teste grátis vencido.

## No CI

O job `app` do Action **Verificação** (`.github/workflows/verificacao.yml`) roda o E2E no PR `Teste-Desevolvimento → master` (o consolidado), em PR com o rótulo `e2e` e à mão (economia de minutos, `docs/fluxo-de-trabalho.md`): sobe um Supabase local
(`supabase start`, com `supabase/config.toml` e todas as migrations), compila o app deste commit e roda os
testes. Nada sai do runner. Se falhar, o log mostra o texto da tela no momento do erro e o relatório do
Playwright fica no artefato `relatorio-e2e`.

## Na máquina

Com o banco local ligado (`npm run local`, ou `npx supabase start`) e o `.env.local` que ele escreve:

```bash
set -a; . ./.env.local; set +a
npm run build && npx playwright test           # sobe o app sozinho em localhost:3000
```
