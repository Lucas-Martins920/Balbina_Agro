# Integrações

Os serviços externos seguem três regras:

1. **Credencial só no servidor.** Variáveis sem `NEXT_PUBLIC_`, arquivos com `import "server-only"`. A lista completa e comentada está em [`.env.example`](../../.env.example).
2. **Webhook não é confiável por si só.** Ele confere um token e depois **relê o estado na API do provedor** com as nossas credenciais antes de gravar. Quem descobrir o endereço não consegue marcar um boleto como pago nem uma nota como autorizada. Cada evento é gravado uma vez só (`webhook_eventos`, único por provedor + id).
3. **Sem a chave, a função some.** Integração não configurada esconde o botão em vez de quebrar (`lib/integracoes.ts`).

Toda chamada externa tem tempo limite (`AbortSignal.timeout`), para não prender a tela.

## Asaas

Há **duas contas Asaas** diferentes:

| Conta | Para quê | Código | Variáveis |
|---|---|---|---|
| A de cada piscicultura | Boleto e Pix das contas a receber; pagamento de boleto (Pague Contas) | `lib/asaas.ts`, `lib/asaas-mapa.ts`, `lib/cobranca.ts`, `lib/pagamentos-asaas.ts`, `(app)/cobrancas` | Chave por perfil de cobrança, cifrada em `contas_asaas_segredos` (`BALBINA_CHAVE_CRIPTO`); a chave única do servidor (`ASAAS_*`) saiu em 2026-11-02 |
| A do fornecedor (Balbina) | Assinatura do sistema pelas pisciculturas (planos Basic a Gestão) | `lib/assinatura.ts`, `src/app/assinatura`, `/api/webhooks/assinatura` | `BALBINA_ASAAS_*` |

- **Cobrança**: `preparar_cobranca` (banco) abre o registro, o app chama o Asaas e grava o boleto e o Pix. Se a rede cair, ele confere no Asaas antes de marcar erro, porque o boleto pode ter sido criado mesmo assim.
- **Baixa**: `/api/webhooks/asaas?perfil=<id>` (token por conta, guardado como hash; sem `perfil` responde 401) confere o pagamento na API e chama `baixar_cobranca`. O desconto até o vencimento vira desconto da baixa.
- **Régua de cobrança** (`lib/regua-cobranca.ts`, `/contas-a-receber/regua`): lembretes por WhatsApp em fases (antes, no dia, atrasado).
- O Asaas de **produção** só é aceito no ambiente Production da Vercel ([`docs/asaas-producao.md`](../asaas-producao.md)).

## Focus NFe (NF-e, NFC-e, notas recebidas)

`lib/focus.ts`, `lib/focus-mapa.ts`, `(app)/notas`, `/api/webhooks/focus`, `/api/notas/*`. Guia completo em [`docs/nfe.md`](../nfe.md).

- Cada piscicultura é um **emitente** cadastrado pela conta revenda do Balbina (`FOCUS_NFE_TOKEN_REVENDA`), com o certificado A1 dela. O token do emitente fica em `focus_emitentes_segredos`.
- `preparar_nfe` / `preparar_nfce` (banco) abrem a nota de um pedido faturado. `lib/focus-mapa` monta o JSON. O webhook relê a situação na Focus.
- **Notas recebidas** (compras): a automação busca na SEFAZ pela Focus (`registrar_nfes_recebidas`), e também chegam por XML via e-mail (`lib/nfe-xml.ts`). `lancar_nfe_recebida` vira conta a pagar.
- `scripts/focus-homologacao.ts` testa a emissão em homologação (roda na Verificação).

## Pluggy (Open Finance)

`lib/open-finance.ts`, `lib/open-finance-mapa.ts`, `/api/webhooks/pluggy`, `/api/cron/open-finance`, `(app)/conciliacao/bancos`. O widget conecta o banco. O webhook (token na URL) só avisa qual conexão mudou: os lançamentos são relidos na API e entram por `importar_extrato` como um OFX. O cron diário da Vercel é a reserva. A decisão de 2026-11-02 foi manter o Pluggy por ora (estudo em [`docs/estudos/open-finance-alternativas.md`](../estudos/open-finance-alternativas.md)).

## IA (Anthropic)

`lib/ia.ts` com `ANTHROPIC_API_KEY`. É usada para ler boletos e notas por foto ou PDF (`lib/documento-recebido.ts`), para contar mortes por foto no apontamento e no chat do app de campo (`lib/campo/chat.ts`, `POST /api/chat/manejo`), que responde dúvidas de manejo pela base da Embrapa (`lib/campo/conhecimento-tambaqui.ts`) e pelos dados do dia e transforma uma frase em cartões de lançamento. **Tudo é proposta**: a pessoa confere antes de salvar. A linha digitável só é aceita se os dígitos conferirem (`lib/boleto.ts`). Cada uso é contado por empresa e mês, com limite (`registrar_uso_ia`, `ia_uso`): as leituras dividem `ia_limite_mes` (padrão 200) e o chat tem o dele, `ia_chat_limite_mes` (padrão 300), os dois em Configurações › Automações. Sem chave, sem sinal ou passado o limite, o chat do celular responde pela base de manejo que leva consigo.

## WhatsApp (Meta Cloud API)

`lib/whatsapp.ts`, `lib/whatsapp-texto.ts`, `/api/entrada/whatsapp`. Um número do Balbina atende todas as pisciculturas, e cada pessoa se vincula ao número dela (`whatsapp_vinculos`). Fora da janela de 24 h, só vão modelos aprovados (`balbina_aviso`, `balbina_cobranca`). Recebe foto ou PDF de documento e manda lembretes e cobranças. Variáveis `WHATSAPP_*`, explicadas em [`docs/automacoes.md`](../automacoes.md).

## E-mail de entrada (Postmark Inbound)

`/api/entrada/email`: cada piscicultura tem um endereço `entrada+<token>@...`. Anexos (XML de NF-e, PDF ou foto de boleto) viram documento recebido. Variáveis `ENTRADA_EMAIL_*`.

## Avisos no celular (Web Push)

`lib/push.ts`, `components/avisos-push.tsx`, `/api/push`. Usa as chaves VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Manda lembrete de apontamento, resumo do dia e alertas. Inscrições em `push_inscricoes`.

## Captcha (Cloudflare Turnstile)

`components/captcha.tsx` no login, no cadastro e no "esqueci a senha". A chave pública é `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; a secreta fica no painel do Supabase Auth.

## API pública e webhooks de saída

`/api/v1/*`, `lib/api/*`. Referência completa em [`docs/api.md`](../api.md).

- Autenticação pela chave no cabeçalho, gerada só pelo master em Configurações > API, com escopos e validade de 7 dias (`api_chaves`, guardada como hash).
- `lib/api/servidor.ts` cria o contexto. O cliente usa a chave de serviço, por isso **toda consulta filtra por `empresaId`**. As travas entre empresas e os triggers continuam valendo. O limite é de 300 chamadas por minuto por chave.
- Regra de negócio violada responde 422 com a mensagem do banco; o resto responde 500 sem detalhes.
- **Webhooks de saída**: eventos entram numa fila (`app.api_enfileirar_evento`) e saem a cada 5 min (`api_webhook_entregas`, `lib/api/webhooks.ts`).

## Dados públicos (BrasilAPI e CEP)

`lib/consulta-publica.ts`: preenche o cadastro pelo CNPJ e pelo CEP. Roda no navegador e só preenche campo vazio.
