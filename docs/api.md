# API pública do Balbina (v1)

Para outros sistemas (ERP, contabilidade, loja virtual, BI) lerem e lançarem dados de uma empresa no Balbina e receberem avisos quando algo muda. A integração com o NIBO é separada e vale só para a conta teste; qualquer outro sistema entra por esta API.

## Visão geral

- Endereço base: `https://<domínio do Balbina>/api/v1`.
- Índice sem chave: `GET /api/v1` lista os endpoints.
- JSON em UTF-8. Valores em **centavos** (inteiros), datas `AAAA-MM-DD`, data e hora em ISO 8601 com fuso.
- Listas são paginadas: `?pagina=1&por_pagina=100` (máximo 500). A resposta traz `dados`, `pagina`, `por_pagina`, `total` e `proxima_pagina` (null na última).
- Erros: `{"erro": {"codigo": "...", "mensagem": "..."}}` com o status HTTP.
- Limite: 300 chamadas por minuto por chave (status 429 acima disso).

## Chaves e escopos

O usuário master cria as chaves em **Configurações > API e integrações**. O token (`balbina_` + 43 caracteres) aparece uma vez só; o Balbina guarda apenas o hash SHA-256. Cada chave tem nome e escopos e **vale 7 dias** (regra do banco, sem exceção): antes de vencer, o master cria outra e o sistema integrado troca. Só o master cria e revoga; se ele perde o papel de master, é bloqueado ou sai da empresa, as chaves que criou são revogadas na hora. Revogada ou vencida, a chave passa a receber 401.

Envie a chave em `Authorization: Bearer balbina_...` (ou `X-API-Key: balbina_...`).

| Escopo | Libera |
| --- | --- |
| `contas-a-pagar.ver` / `.editar` | ler / lançar e baixar contas a pagar |
| `contas-a-receber.ver` / `.editar` | ler / lançar e baixar contas a receber |
| `contas.ver` | contas, saldos e extrato |
| `categorias.ver`, `centros-de-custo.ver` | cadastros usados ao lançar títulos |
| `contatos.ver` / `.editar` | clientes, fornecedores, funcionários e sócios |
| `produtos.ver` / `.editar` | produtos e insumos |
| `vendas.ver` | pedidos de venda com itens |
| `estoque.ver` | saldo de estoque |

`.editar` inclui `.ver`. O plano da empresa vale por cima da chave: no Balbina Basic, por exemplo, os escopos financeiros respondem 403 mesmo marcados. Assinatura suspensa responde 402.

O que a API grava aparece no Histórico de alterações como `API: <nome da chave>`.

## Endpoints

| Método | Caminho | Escopo | Filtros |
| --- | --- | --- | --- |
| GET | `/me` | qualquer | |
| GET | `/lancamentos` | `contas-a-*.ver` | `tipo` (pagar, receber), `status` (aberto, parcial, quitado, perda, cancelado), `vencimento_de`, `vencimento_ate`, `competencia_de`, `competencia_ate`, `contato_id`, `atualizado_desde` |
| GET | `/lancamentos/{id}` | `contas-a-*.ver` | traz `baixas` |
| POST | `/lancamentos` | `contas-a-*.editar` | |
| POST | `/lancamentos/{id}/baixas` | `contas-a-*.editar` | |
| GET | `/contas` | `contas.ver` | |
| GET | `/movimentos` | `contas.ver` | `conta_id`, `de`, `ate` |
| GET | `/categorias` | `categorias.ver` | `ordem` = posição entre irmãos (mesmo pai; principais dentro do grupo) |
| GET | `/centros-de-custo` | `centros-de-custo.ver` | `ordem` = posição entre irmãos (mesmo pai) |
| GET | `/contatos` | `contatos.ver` | `tipo`, `cpf_cnpj`, `busca` (nome), `arquivado`, `atualizado_desde` |
| GET | `/contatos/{id}` | `contatos.ver` | |
| POST | `/contatos` | `contatos.editar` | |
| PATCH | `/contatos/{id}` | `contatos.editar` | só os campos enviados |
| GET | `/produtos` | `produtos.ver` | `tipo`, `ativo`, `atualizado_desde` |
| GET | `/produtos/{id}` | `produtos.ver` | |
| POST | `/produtos` | `produtos.editar` | |
| PATCH | `/produtos/{id}` | `produtos.editar` | só os campos enviados |
| GET | `/vendas` | `vendas.ver` | `status`, `de`, `ate`, `cliente_id`, `atualizado_desde` |
| GET | `/vendas/{id}` | `vendas.ver` | |
| GET | `/estoque` | `estoque.ver` | `tipo` |

Sem `tipo`, `GET /lancamentos` devolve os tipos que a chave pode ler. Cada lançamento traz `saldo_cents` (valor − desconto − pago) e `situacao` (`vencido` quando aberto ou parcial depois do vencimento, no fuso da empresa).

Para sincronizar, guarde a hora da última leitura e peça só o que mudou com `atualizado_desde=2026-10-28T12:00:00-04:00`.

### Incluir título

```http
POST /api/v1/lancamentos
Authorization: Bearer balbina_...
Content-Type: application/json

{
  "tipo": "pagar",
  "descricao": "Ração engorda 28% - NF 1234",
  "vencimento": "2026-11-10",
  "competencia": "2026-11-01",
  "valor_cents": 1250000,
  "categoria_id": "<id de GET /categorias>",
  "centro_custo_id": "<opcional>",
  "contato_id": "<opcional>",
  "referencia": "NF 1234",
  "parcelas": 1,
  "forma_pagamento": "boleto"
}
```

Para ratear entre categorias, troque `categoria_id` por `"rateio": [{"categoria_id": "...", "centro_custo_id": null, "valor_cents": 750000}, ...]`, que precisa somar `valor_cents`. Com `parcelas` > 1, o valor é dividido em parcelas mensais (centavos que sobram ficam na primeira). A resposta (201) traz as parcelas criadas. `forma_pagamento`: boleto, pix, ted, dinheiro, cartao, debito_automatico ou cheque.

### Baixar título

```http
POST /api/v1/lancamentos/{id}/baixas
{"conta_id": "<id de GET /contas>", "data": "2026-11-10", "valor_cents": 1250000, "juros_cents": 0, "multa_cents": 0, "desconto_cents": 0}
```

Aceita baixa parcial. Mês fechado no Balbina recusa a baixa (422).

### Contato

```http
POST /api/v1/contatos
{"tipos": ["cliente"], "nome": "Mercado Bom Preço", "cpf_cnpj": "12345678000190", "uf": "AM", "cidade": "Manaus", "produtor_rural": false}
```

Campos: `tipos` (cliente, fornecedor, funcionario, socio), `nome`, `cpf_cnpj`, `inscricao_estadual`, `email`, `telefone`, `cidade`, `uf`, `produtor_rural`, `observacoes`, `arquivado`. CPF/CNPJ repetido na empresa responde 409.

### Produto

`tipo` (alevino, racao, insumo_racao, corretivo, embalagem, medicamento, vacina, outro), `nome`, `unidade`, `sku`, `ncm`, `estoque_minimo`, `observacoes`, `ativo`, `para_venda`. Produtos de peixe (kg e caixa de 20 kg) nascem das classes de pescado no Balbina e não são criados pela API.

## Códigos de erro

| Status | `codigo` | Quando |
| --- | --- | --- |
| 400 | `parametro_invalido`, `json_invalido` | filtro ou corpo malformado |
| 401 | `nao_autenticado`, `chave_invalida` | sem chave, ou chave revogada/vencida |
| 402 | `assinatura_inativa` | assinatura da empresa suspensa |
| 403 | `sem_escopo` | escopo não dado ou módulo fora do plano |
| 404 | `nao_encontrado` | id que não existe nesta empresa |
| 409 | `duplicado` | registro repetido (CPF/CNPJ) |
| 415 | `formato` | corpo sem `Content-Type: application/json` |
| 422 | `dados_invalidos`, `regra_de_negocio`, `referencia_invalida` | validação ou regra do Balbina (mês fechado, rateio, título quitado) |
| 429 | `limite` | mais de 300 chamadas por minuto |

## Webhooks

O master cadastra endereços `https` públicos e escolhe os eventos:

| Evento | Quando |
| --- | --- |
| `lancamento.criado` / `lancamento.alterado` | título incluído / alterado (baixa, edição, exclusão para a lixeira, perda) |
| `venda.criada` / `venda.alterada` | pedido incluído / alterado (faturado, entregue, cancelado) |
| `contato.criado` / `contato.alterado` | cliente ou fornecedor |
| `produto.criado` / `produto.alterado` | produto |
| `estoque.movimentado` | entrada, saída, produção ou ajuste de estoque |

Vale para o que muda pela tela, pela API ou por outra integração. Eventos de módulos fora do plano não saem.

Cada aviso é um POST:

```http
POST https://seu-sistema/webhooks/balbina
Content-Type: application/json
X-Balbina-Evento: lancamento.alterado
X-Balbina-Entrega: <id>
X-Balbina-Assinatura: t=1793193600,v1=5f2b...

{"id": "<id da entrega>", "evento": "lancamento.alterado", "criado_em": "...", "empresa_id": "...", "dados": { ...registro... }}
```

Confira a assinatura antes de confiar no corpo: calcule o HMAC-SHA256 (hex) de `"<t>.<corpo bruto>"` com o segredo do webhook (`whsec_...`, mostrado uma vez no cadastro), compare com `v1` em tempo constante e recuse `t` com mais de 5 minutos de diferença. Exemplo em Node:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function assinaturaValida(corpoBruto, cabecalho, segredo) {
  const { t, v1 } = Object.fromEntries(cabecalho.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const esperado = createHmac("sha256", segredo).update(`${t}.${corpoBruto}`).digest("hex");
  return v1?.length === esperado.length && timingSafeEqual(Buffer.from(v1), Buffer.from(esperado));
}
```

Responda 2xx em até 8 segundos. Falha ou demora volta para a fila: nova tentativa em 1, 2, 4, 8... minutos, até 8 tentativas. O mesmo `id` pode chegar mais de uma vez; use-o para ignorar repetidos. A ordem de chegada não é garantida: compare `updated_at` dos dados.

A fila é entregue logo depois de cada gravação pela API e por uma rotina a cada 5 minutos no pg_cron do Supabase (`supabase/migrations/20261029230000_cron_webhooks_no_banco.sql`, que chama `/api/cron/webhooks` com o `CRON_SECRET`; precisa dos segredos `balbina_url` e `cron_secret` no Vault do Supabase). O `.github/workflows/webhooks.yml` fica de reserva, uma vez por dia. Endereços que resolvem para rede interna são recusados.

## Por dentro

- Banco: `supabase/migrations/20261028233000_api_publica.sql` (tabelas `api_chaves`, `api_chaves_uso`, `api_webhooks`, `api_webhook_entregas`; funções `criar_chave_api`, `revogar_chave_api`, `criar_webhook_api`, `alterar_webhook_api`, `api_autenticar`, `api_reservar_entregas`, `api_registrar_entrega`; triggers `api_webhook`). Testes em `supabase/tests/99_api_publica.sql`.
- App: rotas em `src/app/api/v1`, regras em `src/lib/api/regras.ts` (com testes), autenticação em `src/lib/api/servidor.ts`, entrega em `src/lib/api/webhooks.ts`, tela em `src/app/(app)/configuracoes/api`.
- As rotas usam a chave de serviço do Supabase e filtram sempre pela empresa da chave; as travas `mesma_empresa_*` impedem apontar para registros de outra empresa.
- Escopo novo: some em `app.api_escopos()` (migration nova) e em `ESCOPOS` de `regras.ts`. Evento novo: `app.api_eventos()`, `EVENTOS` e o trigger na tabela.
- Variáveis: `SUPABASE_SECRET_KEY`, `BALBINA_CHAVE_CRIPTO` (cifra o segredo dos webhooks) e `CRON_SECRET` (Vercel e secret do GitHub para a rotina de 5 minutos).
