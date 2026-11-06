# Arquitetura: ERP Avicultura de Postura

Gerado pelo replica-architect a partir de [recon.md](recon.md) e [features.csv](features.csv). Data: 2026-10-26.
Schema completo: [supabase/migrations/20261026000001_schema.sql](../../supabase/migrations/20261026000001_schema.sql). Ele carrega limpo num Postgres 16 e passou num teste rápido de rateio, baixa parcial/total, mês fechado, galpão duplicado, indicadores e RLS.

## 1. Stack

| camada | escolha | por quê |
| --- | --- | --- |
| Web | Next.js (App Router) + TypeScript | um só código para telas, API e server actions; deploy simples |
| UI | Tailwind + shadcn/ui; tabelas com TanStack Table; gráficos com Recharts | ERP é muita tabela com filtro; componentes prontos e acessíveis |
| App de campo | PWA do próprio Next.js com IndexedDB (Dexie) e fila de sincronização | apontamento no galpão sem internet, sem manter dois apps nativos; vira Expo só se a PWA não bastar |
| Banco | Postgres no Supabase, região São Paulo (sa-east-1) | RLS para multiempresa, auth e storage no mesmo lugar, latência baixa no Brasil |
| ORM | Drizzle | SQL explícito, migrations versionadas, bom com triggers e views que já estão no schema |
| Auth | Supabase Auth (e-mail + magic link; Google opcional) | os perfis e permissões ficam em `usuarios_empresa` |
| Arquivos | Supabase Storage (OFX, PDFs, XML/DANFE, anexos) | mesmo RLS por empresa via path `empresa_id/...` |
| Jobs | Inngest (ou Supabase Cron + Edge Functions) | recorrências, lembretes de cobrança, custo do ovo mensal, importação Open Finance |
| NF-e | provedor de API (Focus NFe, NFE.io ou PlugNotas) | não reimplementar SEFAZ; certificado A1 do cliente fica no provedor |
| Cobrança | Asaas no MVP (boleto + Pix + webhooks); bancos diretos (Inter, Sicredi, Sicoob) depois | Asaas resolve boleto/Pix/lembretes com uma integração; Sicredi/Sicoob são comuns no agro |
| Open Finance | agregador (Pluggy ou Belvo) | V3; até lá, OFX e planilha |
| E-mail / WhatsApp | Resend para e-mail; WhatsApp Cloud API (Meta) para cobrança | envio oficial, sem automação de WhatsApp Web |
| IA (caixa de entrada) | Claude API para extrair dados de PDF/foto de boleto e nota | V3 |
| Hospedagem | Vercel | preview por PR, zero servidor |
| Observabilidade | Sentry + logs do Supabase | |

Um banco, um app, sem microsserviços. Multiempresa desde o dia 1 (um produtor com duas granjas/CNPJs, e o ERP vendável para outras granjas).

## 2. Schema (resumo)

45 tabelas, 2 views, RLS em todas. Convenções: `uuid`, `timestamptz` em UTC, dinheiro em centavos `bigint`, quantidades em `numeric`, `empresa_id` em toda tabela de dados.

| área | tabelas |
| --- | --- |
| Núcleo | empresas, usuarios_empresa, audit_log |
| Cadastros financeiros | contatos, categorias (5 grupos + subgrupos), centros_custo (hierárquicos, tipados: núcleo/galpão/lote/fábrica…), contas_financeiras (inclui cartão) |
| Pagar/receber | agendamentos (vencimento, competência, previsão, status), agendamento_rateios, baixas, transferencias, recorrencias, recorrencia_reajustes, periodos_fechados |
| Conciliação | importacoes_extrato, movimentos_bancarios (único por conta + id externo), conciliacoes (N:N), regras_conciliacao |
| Cobrança/fiscal | perfis_cobranca, cobrancas, webhook_eventos, notas_fiscais, remessas_cnab |
| Planejamento | orcamentos, documentos |
| Avicultura | nucleos, galpoes, linhagens, curvas_padrao, lotes, lote_alocacoes, classes_ovo, apontamentos_diarios, apontamento_lancamentos, classificacoes_ovos, apontamento_ovos (legado), eventos_sanitarios |
| Estoque/ração/vendas | depositos, produtos, movimentos_estoque (+ view saldos_estoque), formulas_racao, formula_itens, ordens_producao_racao, pedidos_venda, pedido_itens, tabelas_preco |
| Custos | custos_lote_mensal (+ view indicadores_lote_dia) |

**Regras que ficaram no banco, não na tela:**
- A soma do rateio tem que fechar com o valor do título (constraint trigger diferido até o commit).
- `pago_cents` e `status` (aberto → parcial → quitado) são recalculados a cada baixa.
- Mês fechado bloqueia criar, alterar ou excluir baixas e transferências com data naquele mês.
- Um galpão não recebe dois lotes no mesmo período (exclusion constraint com `daterange`).
- Um dia por lote + galpão (`apontamentos_diarios`), que soma os lançamentos do dia (`apontamento_lancamentos`, turno manhã ou tarde, só o total de ovos); `client_id` único no lançamento torna o envio offline idempotente.
- No galpão não se sabe o tipo do ovo: a produção entra no estoque na classe "Sem classificação" e passa para cada classe na classificação (`classificar_ovos`). Ovos em carência não podem ser classificados.
- Mortes + eliminadas não podem passar das aves do dia.
- Movimento bancário é único por conta + FITID, então reimportar o mesmo OFX não duplica.
- Webhook único por provedor + id do evento.
- Preço por produto/cliente sem vigências sobrepostas.
- Views com `security_invoker`, então respeitam o RLS.

**A ponte financeiro ↔ avicultura:** todo núcleo, galpão e lote ganha um centro de custo. Qualquer despesa (energia, mão de obra, vacina) rateada para esse centro de custo entra no custo do ovo daquele lote. Ração entra pelo consumo real (apontamento × custo médio do estoque), não pela nota de compra.

## 3. API por fluxo

Server actions do Next.js para o app web; rotas REST `/api/v1/...` para PWA, integrações e a API pública futura. Toda chamada roda com o JWT do usuário, então o RLS filtra por empresa; checagem extra de permissão com `app.tem_permissao`.

**F01 Pagar/receber**
| método rota | o que faz | quem | entrada → saída |
| --- | --- | --- | --- |
| GET /agendamentos | lista com filtros (tipo, status, período por vencimento/competência/previsão, contato, categoria, CC, valor) e paginação | visualização+ | filtros → página + totais |
| POST /agendamentos | cria título (ou N parcelas) com rateio numa transação | financeiro.editar | título + rateio + parcelamento → ids |
| PATCH /agendamentos/:id | edita (bloqueado se quitado em mês fechado) | financeiro.editar | campos → título |
| POST /agendamentos/:id/baixas | baixa total/parcial com juros/multa/desconto | financeiro.editar | conta, data, valores → baixa |
| POST /agendamentos/:id/perda | marca como perda | financeiro.editar | motivo → título |
| POST /agendamentos/lote | ações em lote: baixar, cobrar, excluir, alterar categoria | financeiro.editar | ids + ação → resultado por id |
| POST /transferencias | transferência / pagamento de fatura / aplicação | financeiro.editar | |
| CRUD /recorrencias | contratos fixos; POST /recorrencias/:id/reajustar | financeiro.editar | |

**F02–F03 Extrato e conciliação**
| método rota | o que faz |
| --- | --- |
| POST /contas/:id/importacoes | upload OFX/planilha → parse → insere movimentos (ignora FITID repetido) → aplica regras → calcula sugestões |
| GET /contas/:id/conciliacao | pendentes com sugestão (título aberto com mesmo valor ± dias, mesmo CPF/CNPJ, regra) |
| POST /conciliacoes | concilia 1 movimento com 1..N baixas/transferências existentes ou cria título+baixa na hora |
| POST /conciliacoes/lote | aceita sugestões em lote (mesmo valor + descrição) |
| DELETE /conciliacoes/:id | desconcilia |
| CRUD /regras-conciliacao, PATCH /regras-conciliacao/ordem | regras SE/ENTÃO ordenadas (permissão conciliacao.regras) |

**F04 Cobrança**
| método rota | o que faz |
| --- | --- |
| CRUD /perfis-cobranca | provedor, juros, multa, lembretes, canais |
| POST /agendamentos/:id/cobrar | cria cobrança no provedor (boleto+Pix) e envia |
| POST /cobrancas/:id/reenviar · /cancelar · /regerar | reenviar lembrete; cancelar; nova cobrança com juros e multa atualizados |
| POST /webhooks/asaas | recebe pagamento/visualização → grava em `webhook_eventos` → baixa o título |

**F08 Relatórios**
| GET /relatorios/painel | receita, resultado, investimento, financiamento, balanço resumido; caixa × competência; realizado × agendado × orçado; CC |
| GET /relatorios/fluxo-caixa | projetado (aberto + vencido + futuro) por dia/semana/mês |
| GET /relatorios/dre | DRE gerencial por competência a partir dos 5 grupos; análise vertical e horizontal |
| GET /relatorios/aging?tipo= | faixas 0–30/31–60/61–90/90+ |
| GET/PUT /orcamentos?ano=&cc= | grade categoria × mês; import/export xlsx |
| POST /periodos-fechados | fecha mês (admin); DELETE reabre (admin, com audit_log) |

**F10–F11 Avicultura**
| método rota | o que faz |
| --- | --- |
| CRUD /nucleos, /galpoes | estrutura (cria o centro de custo junto) |
| CRUD /lotes, POST /lotes/:id/alocacoes | alojar, transferir recria → produção, dividir; muda fase |
| GET /lotes/:id/painel | indicadores dia/semana/acumulado + curva padrão da linhagem na mesma idade + alertas |
| PUT /apontamentos (lote, galpão, data) | upsert idempotente por `client_id`; servidor calcula `aves_inicio_dia` |
| POST /sync | PWA envia fila de apontamentos/pedidos offline; resposta por item (ok, conflito, erro) |
| GET /sync/bootstrap | dados mínimos para o app offline: lotes ativos, galpões, classes, causas de morte |
| CRUD /eventos-sanitarios | vacinas, medicações (com carência), pesagens |

**F12–F13 Ração, estoque, vendas, NF-e**
| método rota | o que faz |
| --- | --- |
| CRUD /produtos, /depositos, /formulas | cadastro |
| POST /estoque/movimentos | entrada de compra (gera título a pagar), ajuste, transferência, perda |
| POST /ordens-racao, POST /ordens-racao/:id/produzir | baixa insumos pela fórmula, entra ração com custo médio |
| CRUD /pedidos, POST /pedidos/:id/faturar | faturar: emite NF-e, baixa estoque de ovos, gera títulos a receber pelas parcelas |
| POST /notas/:id/cancelar · /carta-correcao | via provedor |
| POST /webhooks/nfe | retorno assíncrono da SEFAZ (autorizada/rejeitada) |
| GET /relatorios/vendas | ABC, por produto/cidade/UF/período, clientes sem comprar há 60+ dias, margem |

**F14 Custo do ovo**
| GET /custos/lotes?mes= | tabela de `custos_lote_mensal` com R$/dz e margem |
| POST /custos/recalcular?mes= | dispara o job (admin) |

**Jobs agendados**
| job | quando | faz |
| --- | --- | --- |
| provisionar-recorrencias | diário 02:00 | gera títulos futuros até `meses_provisionados` |
| reajustar-recorrencias | diário | aplica reajuste na data, grava histórico |
| lembretes-cobranca | diário 08:00 BRT | e-mail/WhatsApp conforme `lembretes_dias` |
| expirar-cobrancas | diário | marca expiradas para regerar |
| custo-ovo-mensal | dia 1 e sob demanda | calcula `custos_lote_mensal` do mês anterior |
| custo-recria | mensal | acumula custos da recria no lote até entrar em produção |
| alertas-zootecnicos | após cada sync | postura abaixo da curva, mortalidade acima do limite, carência ativa |
| importar-open-finance | diário (V3) | puxa extrato via agregador |
| reprocessar-webhooks | a cada 10 min | eventos com erro |

## 4. As partes que mordem

- **Fuso e datas:** datas de negócio (vencimento, apontamento) são `date` no fuso da granja (America/Sao_Paulo); só carimbos técnicos em `timestamptz`. Jobs rodam em horário de Brasília.
- **Offline:** o app guarda a fila no IndexedDB; cada item tem `client_id`; o servidor faz upsert idempotente e devolve conflitos (ex.: dois apontadores no mesmo galpão/dia → último vence, com histórico no audit_log).
- **Webhooks duplicados:** `webhook_eventos` único por id; processar dentro de transação.
- **Concorrência na baixa:** baixa e conciliação em transação com `select ... for update` no título.
- **Custo médio de estoque:** recalcular custo médio ponderado na entrada; saídas usam o custo do momento. Retroativos exigem reprocessar o mês, então bloquear com mês fechado.
- **NF-e:** certificado A1, homologação, rejeições e contingência são do provedor; nós guardamos status, XML e DANFE. Cadastro de NCM/CFOP/CST certo para ovo (isenções de ICMS variam por estado: validar com o contador).
- **Reforma tributária (IBS/CBS):** a partir de 2026 a NF-e já traz campos novos; o provedor deve cuidar, mas o cadastro de produto precisa dos campos.
- **Multiempresa:** RLS em tudo, teste automatizado que tenta ler dados de outra empresa em cada rota.
- **Permissões finas:** apontador só vê o núcleo dele (`centros_custo_permitidos`), vendedor só os próprios pedidos.
- **Volume:** 1 apontamento por galpão/dia é pouco; extratos e movimentos de estoque crescem mais. Índices já cobrem os filtros principais; particionar só se passar de milhões de linhas.
- **LGPD:** exportar e apagar dados de contatos pessoa física; logs sem dados sensíveis.
- **Backups:** dump diário cifrado com teste de restauração (GitHub Actions), cópia externa opcional e backup do Supabase no plano Pro. Ver `docs/backup.md`.

## 5. Ordem de build

**Marco 0: fundação (1 semana)**
Repositório, Next.js, Supabase, migrations com o schema, auth, seletor de empresa, permissões, layout base, CI com testes de RLS.

**Marco 1: vertical slice (2–3 semanas)**
Granja → galpão → lote → apontamento diário (web) → painel do lote com curva → uma despesa a pagar rateada no centro de custo do lote → baixa → painel financeiro.
Telas: S30, S31, S32, S33, S08, S09, S01. Tabelas: nucleos, galpoes, linhagens, curvas_padrao, lotes, lote_alocacoes, apontamentos_diarios, apontamento_ovos, classes_ovo, categorias, centros_custo, contas_financeiras, agendamentos, agendamento_rateios, baixas.

**Marco 2: financeiro must-have (3–4 semanas)**
Contatos, contas a receber, parcelas e recorrências, transferências, OFX + conciliação manual com sugestões, fluxo de caixa, painel caixa × competência, relatórios de contas com exportação, fechamento de mês.

**Marco 3: avicultura must-have + PWA (3 semanas)**
App offline de apontamento, alertas, eventos sanitários básicos, estoque de ovos alimentado pela produção, pedidos de venda.

**Marco 4: custo do ovo (2 semanas)**
Consumo de ração por lote, amortização da ave, rateio de indiretos, `custos_lote_mensal`, margem por cliente/produto. É o diferencial; demonstrável para vender.

**Marco 5: should-haves (4–6 semanas)**
Fábrica de ração, NF-e via provedor, cobrança Asaas (boleto + Pix + WhatsApp), regras de conciliação, cartão de crédito, DRE vertical/horizontal, aging, orçamento, relatórios comerciais.

**Marco 6: could-haves**
CNAB, Open Finance, app do vendedor, caixa de entrada com IA, BI/API pública, rastreabilidade de embalagem.

Marcos 0–4 ≈ 11–13 semanas para um MVP utilizável numa granja real, com 1–2 devs.

## 6. Decisões (tomadas em 2026-10-26)

1. **Multiempresa vendável desde já.** O schema já isola tudo por empresa; o onboarding cria quantas empresas o usuário precisar.
2. **Cobrança com Asaas no MVP** (boleto + Pix + webhooks + lembretes). Bancos diretos (Sicredi, Sicoob, Inter) entram depois como outros provedores do mesmo `perfis_cobranca`.
3. **Linhagens:** catálogo global só com os nomes das linhagens comerciais; a granja cria a sua e cola a curva do manual (semana, % postura, peso do ovo, consumo, viabilidade). Classes de ovo padrão pela Portaria MAPA nº 1/1990, editáveis.
4. **Amortização da ave:** linear por semana de produção, do início da postura até a previsão de descarte (padrão: 80 semanas de idade), sobre custo de aquisição + custo acumulado da recria.
5. **Open Finance pela Pluggy** (antecipado da V3). Widget da Pluggy para o consentimento, `clientUserId` = empresa; extrato lido pela API (rotina diária na Vercel + webhook + botão), gravado pelo mesmo `importar_extrato` do OFX (idempotente pelo id da transação). Conta nova começa no dia 1º do mês com saldo inicial calculado do saldo do banco. Cartão de crédito fica fora por enquanto.
6. **Usuários e permissões:** quem cria a empresa é o usuário **master** (`usuarios_empresa.is_admin`) e só ele convida, muda perfil, bloqueia e remove usuários; a empresa nunca fica sem master ativo. Convite é por e-mail: quem já tem conta entra na hora, quem não tem entra no primeiro login com o e-mail confirmado. Cargos prontos (acesso total, administrativo, financeiro, gerente da granja, galponista, fabricante de ração, manutenção geral, vendedor, caixa, apontador, cadastros, só visualização, personalizado), cargos criados pelo master na tabela `cargos` (o usuário com cargo da empresa recebe as permissões do cargo; mudar o cargo muda todos que o têm) mais permissões avulsas `<modulo>.ver/editar` (vendas: `lancar/cancelar/precos`; `pdv.operar`, `cobrancas.emitir`, `financeiro.fechar`). A escrita é travada no banco por policies restritivas que chamam `app.pode()`; a leitura continua por empresa e a tela/menu esconde o módulo sem `.ver`. Triggers que geram dado derivado (estoque do apontamento, saldo do título, centro de custo automático) rodam como sistema. Quem não tem e-mail entra por **usuário e senha** criados pelo master (`logins_locais`; por baixo, e-mail interno `<usuario>@usuarios.finavi.test`, domínio reservado que nunca entrega mensagem): troca a senha no primeiro acesso, o master define senha nova e zera o app autenticador, e a conta fica presa à empresa. 2º fator: app autenticador (funciona sem internet e sem sinal); o master pode dispensar só cargo operacional, e a dispensa deixa de valer se a pessoa ganhar permissão de lançar no financeiro, notas ou configurações (`app.pode_dispensar_2fa`).
7. **Vendas e PDV:** a venda de balcão (PDV) roda numa função só no banco (`venda_balcao`: cria o pedido à vista, fatura, recebe e marca entregue), para nunca ficar pela metade. Sem cliente vai para "Consumidor final"; dinheiro cai no caixa físico e Pix/cartão na conta escolhida. Cupom impresso é não fiscal; NFC-e fica para depois. Fluxo de pedido pensado para o celular: cliente, repetir último pedido, faturar, receber ou cobrar no Asaas numa tela.
8. **Planejamento de lotes (Gestão > Planejamento, 2026-10-27):** cada granja grava o próprio manejo em `planejamento_parametros` (semanas no pinteiro e no frangueiro, idade de descarte, vazio sanitário por tipo de galpão com mínimo de 15 dias no banco, intervalo entre lotes) e os custos futuros em `planejamento_custos` (fase, base por ave/lote/mês/dúzia, semana de idade e vigência para reajustes previstos). Lotes futuros ficam em `lotes_planejados`. A previsão (ocupação dos galpões com vazio sanitário, transferências, data limite para alojar a reposição de cada galpão de postura, sugestões na cadência da granja) e o estudo de viabilidade (consumo e % de postura pela curva da linhagem ou por uma curva genérica, mortalidade linear por fase, caixa semanal) são calculados em `src/lib/planejamento.ts`, sem tabela derivada. Padrões: 8 + 8 semanas, descarte com 80, vazio de 28/15/30 dias, um lote a cada 12 semanas.

9. **Medicamentos no apontamento (2026-10-28):** o consumo de água saiu do apontamento diário (não dá para medir todo dia; a coluna `agua_l` fica com o histórico). Em Cadastros > Medicamentos e vitaminas (`medicamentos`, permissão `sanidade.*`) a granja grava tipo, princípio ativo, dose por litro de água, via, carência dos ovos e o produto do estoque. No apontamento (web e celular) marca o que aplicou no galpão, com dias de tratamento e litros de água medicada; `registrar_medicacao` grava como manejo de Sanidade (`eventos_sanitarios`), então carência, alertas e descarte de ovos retidos seguem iguais. Carência = dias de tratamento + carência do produto. A quantidade (dose × água, ou informada) baixa o estoque como consumo do lote ao custo médio; sem saldo o tratamento fica registrado sem baixa. O custo do ovo continua vindo do financeiro (compra na categoria de sanidade), para não contar duas vezes.

Repositório: https://github.com/Astrolito/ERP_FINAVE.
