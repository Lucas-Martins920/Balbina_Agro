# NF-e e NFC-e (Focus NFe)

O Balbina emite as notas pela [Focus NFe](https://focusnfe.com.br). Fica no módulo **Notas fiscais**, que entra nos planos Fiscal e Gestão (`app.plano_inclui(empresa, 'notas')`). Toda mudança em `notas_fiscais` e `inutilizacoes_nfe` fica no Histórico, com quem fez.

## O que o app faz

| Operação | Onde | Endpoint da Focus |
|---|---|---|
| Emitir NF-e (modelo 55) do pedido faturado | Notas fiscais, página do pedido | `POST /v2/nfe?ref=` (assíncrona; aviso automático ou "Atualizar situação") |
| Emitir NFC-e (modelo 65) da venda de balcão, com CPF na nota | PDV, depois de concluir a venda | `POST /v2/nfce?ref=` (síncrona) |
| Consultar | botão "Atualizar situação" | `GET /v2/nfe/{ref}` ou `/v2/nfce/{ref}` |
| Cancelar (justificativa de 15 a 255 caracteres) | "Cancelar nota" | `DELETE /v2/nfe/{ref}` ou `/v2/nfce/{ref}` |
| Carta de correção (só NF-e) | "Carta de correção" | `POST /v2/nfe/{ref}/carta_correcao` |
| Inutilizar numeração | Notas fiscais › Inutilizar numeração | `POST /v2/nfe/inutilizacao` ou `/v2/nfce/inutilizacao` |
| DANFE, XML, XML do cancelamento, CC-e, XML da inutilização | links da nota | baixados pelo app em `/api/notas/{id}/{tipo}` |
| Cadastrar a piscicultura como emitente, com o certificado A1 | Notas fiscais › Emitente na Focus | `POST/PUT https://api.focusnfe.com.br/v2/empresas` |

A referência da nota na Focus (`balbina-<id sem hífens>`) é sempre calculada do id (`refDaNota`), nunca lida de coluna editável.

## Emitente por empresa

Cada piscicultura se cadastra como emitente pelo próprio app: dados do emitente na configuração fiscal (endereço completo, IE, regime) e o certificado A1 (.pfx) com a senha. O certificado e a senha vão direto para a Focus e não são gravados no Balbina. A Focus devolve os tokens dessa piscicultura, que ficam cifrados (`BALBINA_CHAVE_CRIPTO`) em `focus_emitentes_segredos`, sem acesso pela API do Supabase. `focus_emitentes` guarda só a situação (id na Focus, validade do certificado, NFC-e ligada) e só o servidor grava nela.

Sem cadastro, o app usa o token único do servidor (`FOCUS_NFE_TOKEN`), que só emite para os documentos da conta Focus dona do token (o modo antigo, de uma empresa só).

## Produtor rural pessoa física

Produtor rural com CPF emite NF-e com `cpf_emitente` e a inscrição estadual (obrigatória no cadastro). Padrões: ICMS CST 40, PIS/COFINS CST 08 e o texto do Funrural nas informações complementares. NFC-e exige CNPJ: o banco recusa (`preparar_nfce`) e o PDV não mostra o botão.

## Regras no banco

- `preparar_nfe` e `preparar_nfce` abrem a nota; um pedido só tem uma nota ativa (rascunho, processando, autorizada, cancelando).
- NF-e e NFC-e têm séries próprias (`serie` e `serie_nfce` na configuração fiscal).
- `inutilizacoes_nfe`: não inutiliza número já usado por nota (que não foi rejeitada) nem faixa já inutilizada; a faixa não muda depois de pedida; não se apaga. Exige `vendas.cancelar` e o plano com notas.
- `pagamentos_do_pedido` devolve como a venda foi paga (troco descontado) para os meios de pagamento da NFC-e.

Testes: `supabase/tests/96_nfe.sql`, `supabase/tests/99_nfe_completa.sql` e `src/lib/focus-mapa.test.ts`.

## Variáveis do servidor

| Variável | Para quê |
|---|---|
| `FOCUS_NFE_AMBIENTE` | `homologacao` (padrão, notas sem valor fiscal) ou `producao` |
| `FOCUS_NFE_TOKEN_REVENDA` | token principal da conta Focus do Balbina, para cadastrar emitentes |
| `FOCUS_NFE_TOKEN` | opcional: token único, para empresa que não se cadastrou pelo app |
| `FOCUS_NFE_WEBHOOK_TOKEN` | token que a Focus manda no aviso automático (`/api/webhooks/focus`) |
| `BALBINA_CHAVE_CRIPTO` | cifra os tokens das pisciculturas (já usada pelo Asaas) |

## Teste em homologação

`scripts/focus-homologacao.ts` emite uma NF-e de teste, espera a autorização, baixa DANFE e XML, manda carta de correção, cancela e inutiliza um número; com `FOCUS_NFCE=1` faz o mesmo com uma NFC-e. Roda no GitHub Actions, dentro do Action **Verificação** (`verificacao.yml`), quando o código da nota (`src/lib/focus-mapa.ts` ou o próprio script) muda num PR verificado, ou à mão (Run workflow com "Testar a NF-e"), com os secrets `FOCUS_NFE_TOKEN_HOMOLOGACAO` (token de homologação da empresa emitente) e `FOCUS_EMITENTE_DOC` (CNPJ ou CPF), e a variável `FOCUS_EMITENTE_UF` (padrão AM). Sem os secrets o job só avisa. O ambiente da nuvem do Claude não alcança a Focus; o teste vive no Actions por isso.

## Antes de ir para produção

- Contador confirmar CFOP, CST/CSOSN, Funrural e eventual diferimento de ICMS no Amazonas.
- Certificado A1 válido da piscicultura e, para NFC-e, o CSC de produção gerado na SEFAZ-AM.
- `FOCUS_NFE_AMBIENTE=producao` só na Vercel de produção; na máquina (`.env.local`) fica em homologação.
