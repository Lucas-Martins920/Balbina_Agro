# Asaas em produção

O Balbina fala com o Asaas em dois papéis. Os dois funcionam em sandbox hoje; este documento diz o que o código já garante e o que falta fazer fora do código para ligar a produção.

| Uso | Conta Asaas | Variáveis | Webhook |
| --- | --- | --- | --- |
| Assinatura do Balbina (mensalidade das pisciculturas) | conta do fornecedor (CNPJ do Balbina) | `BALBINA_ASAAS_API_KEY`, `BALBINA_ASAAS_AMBIENTE`, `BALBINA_ASAAS_WEBHOOK_TOKEN` | `/api/webhooks/assinatura`, cadastrado à mão no painel |
| Cobrança das pisciculturas aos clientes (boleto e Pix) | uma por piscicultura: subconta aberta pelo Balbina ou conta própria | chave cifrada em `contas_asaas_segredos` (`BALBINA_CHAVE_CRIPTO`) | `/api/webhooks/asaas?perfil=<id>`, cadastrado pelo Balbina ao ligar a conta |

## O que o código garante

**Ambiente.** `ambienteAsaas()` aceita `producao`, `produção` ou `production`; qualquer outro valor é sandbox. Chaves novas do Asaas dizem o ambiente no prefixo (`$aact_prod_`, `$aact_hmlg_`): se a chave não bate com o ambiente configurado, a chamada para com uma mensagem clara em vez de um 401 genérico. Ao colar a chave própria da piscicultura, o prefixo decide o ambiente (chaves antigas, sem prefixo, ainda são testadas nos dois).

**Fora da produção nunca se cobra de verdade.** Rodando na máquina (`npm run dev`, `npm run local`) ou num preview da Vercel, qualquer chamada ao Asaas de produção é recusada, tanto a do Balbina quanto a das pisciculturas. Lá só se usa sandbox.

**Webhooks conferem na API.** O aviso do Asaas só diz *qual* cobrança ou assinatura mudou. O valor, a data e a situação são lidos em `GET /payments/{id}` (ou `GET /subscriptions/{id}`) com a chave da conta certa. Um token de webhook vazado não libera acesso nem baixa título com valor inventado, e aviso fora de ordem (um `PAYMENT_CREATED` atrasado depois do pagamento) não desfaz nada, porque vale a situação atual.

- Assinatura: `RECEIVED`, `CONFIRMED` (cartão) e `RECEIVED_IN_CASH` liberam um ciclo; `OVERDUE` marca atraso; estorno e chargeback desfazem o período; assinatura `INACTIVE`, `EXPIRED`, apagada ou não encontrada (404) cancela.
- Cobrança da piscicultura: só `RECEIVED`/`RECEIVED_IN_CASH` baixa o título (boleto `CONFIRMED` ainda não caiu na conta). Pagamento sem `id_externo` gravado é achado pela `externalReference` (id da cobrança).

**Idempotência.**

- Webhook: o id do evento é único em `webhook_eventos`; repetido só reprocessa se a tentativa anterior deu erro. A baixa (`baixar_cobranca`) e a extensão do período (`registrar_evento_assinatura`, com `greatest`) aceitam o mesmo aviso duas vezes.
- Emitir boleto/Pix: um título só tem uma cobrança aberta (índice único). Se a rede cai ou o tempo esgota ao criar o pagamento, o servidor procura no Asaas pela `externalReference` antes de marcar erro, para não deixar emitir um segundo boleto.
- Clientes no Asaas (do Balbina e das pisciculturas): antes de criar, procura pela `externalReference` (empresa ou contato), para uma tentativa que caiu não deixar cliente duplicado.
- Assinar: antes de criar a assinatura, procura uma ativa do mesmo cliente com a mesma empresa e a atualiza, para clique duplo ou queda não cobrar duas vezes.

**Erros.** Toda chamada tem tempo máximo (20 s nas telas, 5 s nos webhooks, porque o Asaas pausa a fila de quem demora). Resposta que não é JSON (Asaas fora do ar) vira mensagem legível; 401 explica chave inválida ou de outro ambiente; 429 pede para tentar em alguns minutos. Falha no webhook devolve 500 e o Asaas manda de novo.

## O que depende do Nicolas

1. **Conta Asaas de produção do Balbina**, no CNPJ do fornecedor (ME, não MEI; subconta exige conta-pai CNPJ). Enviar documentos e esperar a aprovação.
2. **Chave da API de produção** (Integrações > Chaves de API) e um token aleatório para o webhook. Cadastrar só no ambiente **Production** da Vercel:
   - `BALBINA_ASAAS_API_KEY` = chave `$aact_prod_...`
   - `BALBINA_ASAAS_AMBIENTE` = `producao`
   - `BALBINA_ASAAS_WEBHOOK_TOKEN` = token aleatório (32+ caracteres)
   - Conferir que `BALBINA_CHAVE_CRIPTO`, `SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SITE_URL=https://<domínio do Balbina>` existem em Production.
   - No `.env.local` da máquina, só chaves de **sandbox**: o código recusa produção fora da Vercel de produção.
3. **Webhook da conta do Balbina** (Integrações > Webhooks > Adicionar): URL `https://<domínio do Balbina>/api/webhooks/assinatura`, token igual ao `BALBINA_ASAAS_WEBHOOK_TOKEN`, API v3, envio sequencial, eventos:
   `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`.
4. **Cartão de crédito na assinatura**: habilitar cartão na conta (o Asaas pede análise). A fatura usa `billingType: UNDEFINED`, então a piscicultura escolhe Pix, boleto ou cartão.
5. **Subcontas para as pisciculturas (homologação BaaS)**: em produção o Asaas dá um período de avaliação (até 10 subcontas, R$ 2.000 em cobranças por subconta, 60 dias). Depois, gerenciar a chave das subcontas exige pedir a homologação BaaS ao gerente de conta do Asaas. Até lá, pisciculturas grandes podem usar "Já tenho conta no Asaas" (colam a chave `$aact_prod_` delas).
6. **Webhook legado removido do código em 2026-11-02**: a chave única do servidor (`ASAAS_API_KEY`, `ASAAS_AMBIENTE`, `ASAAS_WEBHOOK_TOKEN`) não é mais lida. Apagar essas variáveis da Vercel e o webhook antigo (sem `?perfil=`) no painel do Asaas.
7. **Teste de ponta a ponta em produção** depois de ligar: assinar o plano Basic com a empresa do próprio Balbina, pagar a fatura com Pix de R$ 149 e conferir o acesso liberado; depois estornar pelo painel e conferir que o período volta.

## Conferir depois de ligar

- `webhook_eventos` com `provedor = 'asaas_balbina'` e `erro is null` para os avisos do teste.
- No painel do Asaas, Webhooks: fila sem pausa e sem eventos com falha.
