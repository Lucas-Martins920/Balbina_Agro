# Recon map: NIBO (financeiro) + PosturaWeb (avicultura de postura) — web

Scope: módulo financeiro completo no padrão NIBO Gestão Financeira + módulos zootécnicos, ração, estoque, comercial e fiscal no padrão PosturaWeb (SAG), unidos num único ERP para granjas de ovos.
For: granjas de postura comercial (pequenas e médias), uso interno do Nicolas e potencial produto para vender.
Date: 2026-10-26
Método: replica-recon (https://github.com/Jakeschincariol/replica-skill). Só fontes públicas. Replicar funcionalidade e fluxo, nunca código, marca, textos ou layout.

> **Legenda de confiança:** **[obs]** visto em fonte pública · **[inf]** inferido a partir das fontes · **[dom]** conhecimento do domínio de postura, não confirmado no PosturaWeb (o site público dele quase não descreve telas).

---

## 1. Fontes

| # | fonte | URL | notas |
| --- | --- | --- | --- |
| 1 | NIBO – Conhecendo a Gestão Financeira | https://ajuda.nibo.com.br/pt-BR/articles/9819394-conhecendo-a-gestao-financeira | mapa de menus |
| 2 | NIBO – coleção Gestão Financeira (214 artigos) | https://ajuda.nibo.com.br/pt-BR/collections/3804821-nibo-gestao-financeira | índice de tudo |
| 3 | NIBO – Relatórios | https://ajuda.nibo.com.br/pt-BR/articles/7026282-quais-sao-os-relatorios-do-nibo-gestao-financeira | painel, filtros |
| 4 | NIBO – Conciliação bancária | https://ajuda.nibo.com.br/pt-BR/articles/6884846-conciliacao-bancaria | fluxo |
| 5 | NIBO – Regras de conciliação | https://ajuda.nibo.com.br/pt-BR/articles/17229923-como-usar-as-regras-de-conciliacao-no-nibo-gestao-financeira | SE/ENTÃO |
| 6 | NIBO – Categorias | https://ajuda.nibo.com.br/pt-BR/articles/7198882-categorias | 5 grupos |
| 7 | NIBO – Rateio | https://ajuda.nibo.com.br/pt-BR/articles/7967455-como-usar-o-rateio-de-despesas-e-receitas | |
| 8 | NIBO – Centro de custo | https://ajuda.nibo.com.br/pt-BR/articles/7178121-centro-de-custo | Plus/Premium |
| 9 | NIBO – Análise vertical/horizontal | https://ajuda.nibo.com.br/pt-BR/articles/9868328-como-analisar-os-relatorios-de-analise-vertical-e-horizontal | |
| 10 | NIBO – Planejamento orçamentário | https://ajuda.nibo.com.br/pt-BR/articles/15949517-como-utilizar-o-planejamento-orcamentario | Premium |
| 11 | NIBO – Cartão de crédito | https://ajuda.nibo.com.br/pt-BR/articles/7891511-como-controlar-cartao-de-credito-no-nibo | |
| 12 | NIBO – CNAB de pagamento | https://ajuda.nibo.com.br/pt-BR/articles/9823047-como-utilizar-o-cnab-de-pagamento | Itaú, Inter |
| 13 | NIBO – Gerar cobranças | https://ajuda.nibo.com.br/pt-BR/articles/12099536-como-gerar-cobrancas-atraves-do-nibo-gestao-financeira | boleto, WhatsApp |
| 14 | NIBO – Caixa de entrada com IA | https://ajuda.nibo.com.br/pt-BR/articles/11632661-caixa-de-entrada-com-ia-e-agendamento-completo | |
| 15 | NIBO – Usuários e permissões | https://ajuda.nibo.com.br/pt-BR/articles/7061119-usuarios-e-permissoes | |
| 16 | NIBO – Fechamento de mês / Competência | https://ajuda.nibo.com.br/pt-BR/articles/9911856-conheca-o-fechamento-de-mes-no-nibo-gestao-financeira · https://ajuda.nibo.com.br/pt-BR/articles/8926334-como-funciona-o-regime-de-competencia | |
| 17 | NIBO – API pública (criar recebimento + índice) | https://nibo.readme.io/reference/criar-recebimento | modelo de dados quase de graça |
| 18 | NIBO – preços (terceiros) | https://www.idinheiro.com.br/negocios/nibo/ | Light/Plus/Premium |
| 19 | NIBO – avaliações | https://www.b2bstack.com.br/produto/nibo · https://www.reclameaqui.com.br/empresa/nibo/lista-reclamacoes/ | amostra pequena |
| 20 | PosturaWeb – Home | https://www.posturaweb.com.br/ | "30+ módulos" |
| 21 | PosturaWeb – Conheça a solução | https://www.posturaweb.com.br/Conhe%C3%A7a_a_solu%C3%A7%C3%A3o | lista de módulos |
| 22 | PosturaWeb – Dúvidas comuns | https://www.posturaweb.com.br/D%C3%BAvidas_comuns | preço, apps, nuvem |
| 23 | PosturaWeb – Cases | https://www.posturaweb.com.br/Cases | depoimentos |
| 24 | aviNews – EDATA/SAG/Avecom | https://avinews.com/pt-br/grupo-edata-sag-anuncia-aquisicao-da-avecom-e-reforca-a-estrategia-de-lideranca-em-solucoes-integradas-para-a-cadeia-produtiva-de-proteinas/ | contexto do grupo |

**Lacuna importante:** o PosturaWeb não tem central de ajuda nem API públicas. Para subir a confiança da parte de avicultura, o ideal é uma demonstração/conta de teste do Nicolas (prints de cada tela) ou planilhas que a granja já usa.

---

## 2. Core loop

**Financeiro (NIBO):** agendar contas a pagar/receber → importar extrato (Open Finance/OFX) → conciliar → ver resultado no painel por caixa ou competência.
**Avicultura (PosturaWeb):** apontar a produção diária do lote (ovos, mortalidade, ração) → indicadores do lote contra a curva da linhagem → custo do ovo → vender/faturar.
**O elo do nosso ERP:** custo do ovo por lote calculado com os lançamentos financeiros reais (ração, mão de obra, energia, depreciação de aves), coisa que nenhum dos dois faz bem sozinho. NIBO não sabe o que é um lote; PosturaWeb faz financeiro, mas só como apoio.

---

## 3. Telas — Financeiro (padrão NIBO)

| ID | tela | caminho | propósito | componentes-chave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Resumo (home financeira) | Caixa → Resumo | saldos por conta, a pagar/receber em aberto e vencidos | cards de saldo, gráfico resultado operacional 6 meses, pizza de receitas do mês [obs] | vazio (sem contas), filled |
| S02 | Contas & Extratos | Caixa → Extratos | extrato por conta, conciliado ou não, criar conta, transferências | lista de contas, gráfico de saldo (Nibo × banco), tabela de movimentos com selo de conciliação [obs] | vazio, conta bloqueada, pendências |
| S03 | Conciliação | Extratos → conta → Conciliar | casar movimento do banco com lançamento | duas colunas (banco × sistema); abas Sugestão / Nova transação / Buscar-Criar vários [obs] | sem pendências, com sugestões, conciliação em lote |
| S04 | Regras de conciliação | S03 → Regras | automatizar o que se repete | abas Recebimento/Pagamento/Transferência, lista ordenável por arraste, editor SE/ENTÃO [obs] | vazio, sem permissão |
| S05 | Extratos importados | S03 → Ver extratos importados | histórico de importações OFX/planilha/PDF, excluir, desconciliar em lote [obs] | | |
| S06 | Fluxo de caixa (projetado) | Caixa → Fluxo de Caixa | só valores em aberto: atrasados + futuros/provisionados [obs] | tabela por dia/mês, saldo projetado | |
| S07 | Receber (lista) | Recebimentos → Receber | agendamentos a receber | filtros período/nome/descrição/referência/valor/categoria/CC, ações em lote [obs] | vazio, vencidos |
| S08 | Agendar recebimento/pagamento (modal) | Receber/Pagar → Agendar | criar título | vencimento, competência, previsão, contato, categoria, valor; "Valores detalhados" (CC, retenção, desconto, juros, multa); recorrência/parcelamento; automação de cobrança e NFS-e [obs] | erro de validação |
| S09 | Pagar (lista) | Pagamentos → Pagar | agendamentos a pagar, gerar CNAB, importar retorno [obs] | | |
| S10 | Recorrências | Recebimentos/Pagamentos → Recorrências | contratos fixos: valor, frequência, término, status, reajuste automático e histórico de reajustes [obs] | | |
| S11 | Boletos / Cobranças | Recebimentos → Boletos | status em cobrança/pago/cancelado/expirado, visualizado, reenviar lembrete, baixar em lote [obs] | | expirada (regerar com juros) |
| S12 | Central de cobrança | Recebimentos → Central | ações em lote: emitir nota, cobrar boleto, baixar, fatura, nota de débito [obs] | | |
| S13 | Notas fiscais | Recebimentos → NFS-e | status processando/emitida/negada/cancelando/cancelada [obs] | **No nosso caso é NF-e de produto (ovo), não NFS-e** [inf] | rejeição SEFAZ |
| S14 | Caixa de entrada (IA) | menu | documentos recebidos → IA extrai → novo agendamento / atualizar / lançamento não agendado / anexar [obs] | | |
| S15 | Contatos | menu → Contatos | clientes, fornecedores, funcionários, sócios; abertos/vencidos; 12 meses; arquivar; importar planilha [obs] | | |
| S16 | Painel de acompanhamento | Relatórios | receita e resultado operacional, investimento, financiamento, balanço resumido, indicadores-chave editáveis; filtro ano, caixa/competência, Realizado / ×Agendado / ×Orçado, CC [obs] | | |
| S17 | Relatórios de contas | Relatórios → A receber/Recebidas/A pagar/Pagas/Transferências | listas filtráveis, colunas configuráveis, Excel/PDF [obs] | | |
| S18 | Análise vertical / horizontal | Relatórios → Performance | % sobre receita; variação entre períodos; mensal a anual; período completo/parcial [obs] | | |
| S19 | Envelhecimento (aging) a receber/pagar | Relatórios | faixas de atraso [obs título; inf conteúdo] | | |
| S20 | Relatório unificado por lançamento / agendamento | Relatórios | visão plana para exportar/BI [obs título] | | |
| S21 | Planejamento orçamentário | Relatórios → Planejamento | grade categoria × mês, por centro de custo, replicar valor, importar xlsx [obs] | | sem permissão |
| S22 | Configurações | Mais opções | empresa, categorias, centros de custo, avançado (rateio, competência), usuários, importar/exportar, limpar/excluir empresa, histórico de atividades/recuperar excluídos [obs] | | |
| S23 | Fechamento de mês (contador) | Contador → Fechamento | pacote de documentos do mês, envia ao contador [obs] | | |
| S24 | Usuários e permissões | Minhas empresas → Gerenciar usuários | perfis Sem restrições / Cadastros / Visualização / Personalizado; admin [obs] | | |

## 4. Telas — Avicultura (padrão PosturaWeb + domínio)

| ID | tela | propósito | evidência |
| --- | --- | --- | --- |
| S30 | Estrutura da granja | núcleos, galpões, boxes/gaiolas, capacidade | "digitalização da estrutura da granja" [obs]; detalhe [dom] |
| S31 | Lotes | alojamento: linhagem, data de nascimento/alojamento, qtd aves, origem, fase (cria/recria/produção/muda/descarte) | "fases de recria e produção" [obs]; campos [dom] |
| S32 | Apontamento diário de produção (web + app) | por galpão/lote: ovos coletados por classe, trincados/sujos/descarte, mortalidade e causa, eliminação, ração consumida, água, temperatura | "App para coleta de índices zootécnicos" [obs]; campos [dom] |
| S33 | Painel do lote / indicadores | % postura, ovos/ave alojada, massa de ovo, peso médio, viabilidade, conversão (kg ração/dz e kg/kg), consumo g/ave/dia, comparação com a curva padrão da linhagem | "Indicadores de produção… em tempo real" [obs]; fórmulas [dom] |
| S34 | Curvas padrão de linhagem | tabela semana × % postura, peso, consumo (Hy-Line, Lohmann, Dekalb, Novogen…) | [dom] |
| S35 | Manejo sanitário | programa de vacinação, medicações com carência, pesagens, uniformidade, debicagem, programa de luz | não citado no site [dom] |
| S36 | Classificação e embalagem | entrada de ovos na classificadora, classes por peso, formação de estoque em caixas/bandejas (30 dz), lotes de embalagem para rastreabilidade | [dom]; estoque [obs] |
| S37 | Fábrica de ração | compras de insumos, fórmulas por fase, ordens de produção (industrialização), custo por tonelada, estoque valorizado | "fábrica de ração: compras, formulações e cálculo do valor em estoque" [obs] |
| S38 | Estoque | insumos, ração, ovos, embalagens, medicamentos; entradas/saídas por lote/galpão; inventário | "estoque… atualizado em tempo real" [obs] |
| S39 | Pedidos de venda (web + app vendedor) | cliente, produto (classe/embalagem), preço, entrega/rota, faturar | "App para vendas", "registro de todos os pedidos" [obs] |
| S40 | Faturamento NF-e | NF-e de ovos a partir do pedido, ligado ao contas a receber | "NF-e em poucos cliques" [obs] |
| S41 | Relatórios comerciais | curva ABC, vendas por produto/região/cidade/UF/período, clientes sem comprar há 60+ dias, melhores clientes, margem | [obs] |
| S42 | Custo do ovo | custo por dúzia/caixa por lote e período: ração + aves (amortização da franga) + mão de obra + energia + sanidade + embalagem + overhead rateado | "custo do ovo e margens de lucro" [obs]; método [dom] |
| S43 | BI / dashboards | painéis financeiros e zootécnicos | "BI", "dashboards financeiros" [obs] |

## 5. Fluxos

```
F01 Agendar e baixar uma conta a pagar
    S09 -> S08 (vencimento, competência, contato, categoria, CC, parcelas) -> S09 -> baixa manual ou via S03
    edge: parcelamento com vencimentos diferentes, retenção de imposto, juros/multa na baixa, pagamento parcial

F02 Importar extrato e conciliar
    S02 -> (Open Finance diário | OFX | planilha | PDF com IA) -> S03 -> Sugestão OK (baixa o agendamento) | Nova transação | Buscar/Criar vários
    edge: 1 movimento = N títulos, transferência entre contas próprias, repasse de boleto, aplicação/resgate, saldo diferente do banco
    happy path: 1 clique por sugestão; sugestão em lote para mesmo valor+descrição

F03 Regras de conciliação
    S03 -> criar regra a partir da transação (pré-preenche descrição/valor/conta) -> SE (CPF/CNPJ, descrição, valor; até 20; E/OU) ENTÃO (contato, categoria, descrição | contrapartida) -> aplica ao abrir S03
    edge: primeira regra da lista vence; contato com mesmo CNPJ tem prioridade; selo some se usuário editar

F04 Cobrar cliente
    S07 -> Cobrar -> perfil de cobrança (banco: PJBank/Itaú/Inter/C6/Cora) -> boleto enviado por e-mail/WhatsApp -> S11 acompanha visualização -> pago -> baixa automática
    edge: cobrança expirada -> regerar com juros e multa; cancelar; lote

F05 Pagar via CNAB
    S09 -> selecionar títulos com forma de pagamento -> Gerar remessa (boleto/TED; Pix em arquivo separado) -> banco -> Importar retorno -> Pago (baixa) | Agendado no banco | Erro
    edge: data no passado, dados bancários incompletos

F06 Recorrência com reajuste
    S08 recorrente -> S10 -> reajuste automático por índice/percentual -> histórico

F07 Documento na caixa de entrada
    S14 -> IA extrai -> novo agendamento | atualizar existente | lançamento não agendado | anexar

F08 Analisar resultado
    S16 (caixa × competência; realizado × orçado) -> clicar no número -> S17 com os títulos que o compõem
    S21 orçamento por categoria × mês × CC

F10 Alojar um lote
    S30 (galpão livre) -> S31 novo lote (linhagem, idade, qtd, custo da franga) -> custo da franga vira ativo biológico a amortizar na fase de produção
    edge: lote dividido em dois galpões, transferência recria -> produção

F11 Apontamento diário (app no galpão, offline)
    S32 por galpão: ovos por classe + quebrados, mortes (causa), ração (kg), água -> sincroniza -> S33 atualiza
    edge: sem internet no galpão, apontamento retroativo, correção de dia errado, mortalidade acima do alerta
    número a bater: < 1 min por galpão

F12 Produzir ração
    S37 compra de milho/soja/núcleo -> estoque -> fórmula da fase -> ordem de produção -> baixa insumos, entra ração com custo médio -> consumo por lote em S32

F13 Classificar, vender e faturar
    S32/S36 ovos entram no estoque por classe -> S39 pedido (app vendedor) -> separação -> S40 NF-e -> gera título em S07 -> F04 cobrança -> F02 conciliação

F14 Custo do ovo
    fechamento do mês -> custos diretos por lote (ração consumida × custo médio, amortização da ave, sanidade) + indiretos rateados por CC/galpão (mão de obra, energia, manutenção) -> ÷ dúzias produzidas -> margem por cliente/produto em S41
```

## 6. Componentes

| componente | variantes | estados | usado em |
| --- | --- | --- | --- |
| Tabela de títulos com filtros e ações em lote | a pagar, a receber, pagas, recebidas | vazio, carregando, seleção múltipla, exportar | S07, S09, S17, S12 |
| Modal de agendamento | simples, valores detalhados, recorrente, parcelado | validação, rateio | S08 |
| Painel de conciliação duas colunas | sugestão, nova, multi | match, sem match, lote | S03 |
| Editor de regras SE/ENTÃO | recebimento, pagamento, transferência | arrastar para priorizar | S04 |
| Seletor de período + caixa/competência + CC | | | S16–S21, S33 |
| Grade editável mês × linha | orçamento, curva padrão | autossoma por grupo | S21, S34 |
| Card de KPI com meta/curva | financeiro, zootécnico | acima/abaixo do padrão | S01, S16, S33 |
| Gráfico linha real × padrão | % postura, peso, consumo | | S33 |
| Formulário de apontamento mobile | por galpão | offline, sincronizando, erro | S32 |
| Badge de status | aberto, vencido, pago, conciliado, cobrança, NF | | todas |

## 7. Modelo de dados inferido

```
Empresa         id, cnpj, razao, regime_tributario, endereco          evidence: CNAB exige CNPJ/endereço [12]   confidence: high
Usuario/Perfil  id, empresa_id, perfil (sem_restricao|cadastros|visualizacao|personalizado), is_admin, permissoes[]   [15] high
Contato         id, tipo (cliente|fornecedor|funcionario|socio), nome, cpf_cnpj, endereco, arquivado   [1][17] high
ContaFinanceira id, tipo (corrente|poupanca|caixinha|cartao|aplicacao), banco, agencia, conta, dv,
                saldo_inicial, dia_fechamento, dia_vencimento, limite, conta_pagadora_id, cnab_habilitado, bloqueada_ate   [11][12] high
Categoria       id, grupo (receita_op|custo_op|despesa_op_e_outras|investimento|financiamento),
                sentido (entrada|saida), parent_id (subgrupo), sistema (não editável)   [6][7] high
CentroCusto     id, nome, ativo           [8] high (hierarquia: guess)
Agendamento     id, tipo (pagar|receber), contato_id, descricao, referencia, vencimento, competencia, previsao,
                valor, status (aberto|parcial|baixado|perda|cancelado), recorrencia_id, parcela_n/total,
                forma_pagamento, desconto, juros, multa, retencoes, favorito   [1][17] high
AgendamentoRateio agendamento_id, categoria_id, centro_custo_id, valor | percentual   [7][17] high
Baixa(Lancamento) id, agendamento_id?, conta_id, data, valor, juros, desconto   (pode existir sem agendamento: "lançamento não agendado")   [14] high
Transferencia   id, conta_origem, conta_destino, data, valor, descricao   [1][11] high
Recorrencia     id, frequencia, termino, valor, reajuste (indice|percentual, periodicidade), historico_reajustes[]   [10] high
MovimentoBancario id, conta_id, importacao_id, data, descricao, valor, cpf_cnpj_contraparte, conciliado   [4] high
Conciliacao     id, movimento_id, (baixa_id|transferencia_id)[] (N:N)   [4][17] high
RegraConciliacao id, tipo, ordem, contas[], condicoes[{campo,operador,valor}], operador_logico, acao{contato,categoria,descricao,contrapartida}   [5] high
Cobranca        id, agendamento_id, perfil_cobranca_id, meio (boleto|pix), status, visualizado_em, nosso_numero   [13] high
NotaFiscal      id, tipo (NF-e|NFS-e), numero, serie, status, xml, agendamento_id   [1] high (NF-e de produto para ovos: inf)
Orcamento       ano, centro_custo_id?, categoria_id, mes, valor   [10] high
Documento       id, origem (caixa_entrada|anexo), dados_extraidos_json, vinculo   [14] high
RemessaCNAB     id, conta_id, arquivo, itens[], retorno_status   [12] high

--- avicultura ---
Granja/Nucleo   id, empresa_id, nome, endereco, registro (SIF/SIE/SIM, cadastro no órgão estadual)   [dom] medium
Galpao          id, nucleo_id, tipo (cria|recria|producao), sistema (gaiola|cage-free|caipira), capacidade_aves   [obs estrutura; dom campos] medium
Linhagem        id, nome, curva_padrao[{semana, pct_postura, peso_ovo, consumo_g, peso_ave, viabilidade}]   [dom] high
Lote            id, codigo, linhagem_id, data_nascimento, data_alojamento, qtd_alojada, custo_aquisicao,
                fase, status (ativo|em_muda|descartado), centro_custo_id   [obs lotes/fases; dom] high
LoteGalpao      lote_id, galpao_id, qtd, desde, ate (um lote pode ocupar vários galpões)   [dom] medium
ApontamentoDiario lote_id, galpao_id, data, ovos_por_classe{}, ovos_trincados, ovos_descarte,
                mortes, causa_morte, eliminadas, racao_kg, agua_l, temp_min, temp_max, usuario, origem (app|web)   [obs app; dom campos] high
EventoSanitario lote_id, data, tipo (vacina|medicacao|pesagem|debicagem), produto_id, dose, carencia_dias   [dom] medium
ClasseOvo       id, nome (Jumbo|Extra|Grande|Médio|Pequeno|Industrial), peso_min_g, peso_max_g   [dom; verificar norma MAPA vigente] medium
Produto         id, tipo (ovo|racao|insumo|embalagem|medicamento), unidade, classe_ovo_id?, embalagem (cx 30dz, bandeja 30, estojo 12)   [obs estoque; dom] high
MovimentoEstoque id, produto_id, deposito, tipo (entrada|saida|producao|consumo|ajuste|transferencia), qtd, custo_unit, lote_id?, origem_doc   [obs] high
FormulaRacao    id, fase, itens[{insumo_id, kg_por_ton}], versao   [obs] high
OrdemProducaoRacao id, formula_id, ton, data, custo_total   [obs "industrialização"] high
PedidoVenda     id, cliente_id, vendedor_id, data, itens[{produto_id, qtd, preco}], status, rota, nota_fiscal_id   [obs] high
CustoLoteMensal lote_id, mes, racao, amortizacao_ave, mao_obra, energia, sanidade, embalagem, overhead, duzias, custo_dz   [obs "custo do ovo"; dom método] medium
```

Relações: Empresa 1-n Granja 1-n Galpão; Lote n-n Galpão (LoteGalpao); Lote 1-n ApontamentoDiario; Lote 1-1 CentroCusto (a ponte para o financeiro); PedidoVenda 1-1 NotaFiscal 1-n Agendamento (parcelas); Agendamento 1-n Baixa n-n MovimentoBancario; ConsumoRacao (MovimentoEstoque) por Lote alimenta CustoLoteMensal.

## 8. Regras de negócio e cálculos

**Financeiro [obs/inf]**
- Três datas por título: vencimento (fluxo), competência (DRE/resultado), previsão (projeção); baixa = data de caixa. Relatórios alternam caixa × competência.
- Fluxo de caixa projetado mostra só o que está em aberto; o realizado está nos extratos.
- Rateio: um título pode ter várias categorias (por valor) e vários centros de custo (por percentual, somando 100%).
- Conciliação baixa automaticamente o título em aberto. Regras: primeira da lista vence; match por CPF/CNPJ do contato tem precedência.
- Cartão de crédito = conta própria; pagamento da fatura = transferência da conta pagadora.
- Recebimento pode ser marcado como "perda" (inadimplência) e sai do a receber.
- Fechamento mensal reúne documentos para o contador; documentos novos vão para o mês seguinte. (Sugestão nossa: também travar edição de lançamentos do mês fechado, que o NIBO não deixa claro.)

**Avicultura [dom]** — fórmulas padrão do setor a validar com o Nicolas:
- % postura (ave-dia) = ovos do dia ÷ aves vivas no dia × 100
- Ovos por ave alojada (acumulado) = ovos acumulados ÷ aves alojadas
- Massa de ovo (g/ave/dia) = % postura × peso médio do ovo ÷ 100
- Consumo (g/ave/dia) = ração kg × 1000 ÷ aves vivas
- Conversão alimentar = kg de ração ÷ dúzias produzidas (e kg ração ÷ kg de ovo)
- Mortalidade semanal e acumulada (%) e viabilidade = 1 − mortalidade acumulada
- Desvio contra a curva da linhagem na mesma idade (semanas), com alerta quando passar do limite
- Custo do ovo (R$/dz) = (ração consumida × custo médio + amortização da ave + custos diretos + indiretos rateados) ÷ dúzias. A amortização da ave usa custo da franga até o início da postura, amortizado ao longo do ciclo produtivo esperado.
- Classes de ovo por peso (Portaria MAPA nº 1/1990, conferir se houve atualização): Jumbo ≥ 66 g, Extra 60–65,9, Grande 55–59,9, Médio 50–54,9, Pequeno 45–49,9, Industrial < 45.

## 9. Integrações

| integração | NIBO | PosturaWeb | nosso ERP (proposta) |
| --- | --- | --- | --- |
| Extrato bancário | Open Finance (Belvo), OFX, planilha, PDF com IA [obs] | não citado | OFX + planilha no MVP; Open Finance via agregador (Belvo/Pluggy) na V2 |
| Boleto/cobrança | PJBank, Itaú, Inter, C6, Cora; e-mail + WhatsApp [obs] | BB, Bradesco, Caixa, Itaú [obs] | API de banco ou gateway (Asaas/Inter/Sicredi/Sicoob, comuns no agro) com Pix + boleto |
| Pagamentos em lote | CNAB remessa/retorno Itaú/Inter [obs] | não citado | CNAB 240 V2 |
| Nota fiscal | NFS-e (serviço) [obs] | NF-e (produto) [obs] | NF-e de produto via provedor (Focus NFe, NFE.io, PlugNotas) |
| Contador | conexão com escritório, fechamento de mês [obs] | módulo contabilidade [obs] | exportação para contador + fechamento |
| Apps | app Nibo Empresa (docs, aprovação, relatórios) [obs] | app zootécnico + app vendas [obs] | PWA offline para apontamento e vendas |
| API/BI | API REST + Power BI [obs] | BI [obs] | API própria desde o início |

## 10. Fora de escopo (não clonar)

- Rede e parcerias: contrato com PJBank/Belvo, base de escritórios contábeis do Nibo Obrigações (produto para contador, não para granja).
- NFS-e e o emaranhado de rejeições municipais: a granja vende produto (NF-e); NFS-e só se houver serviço.
- Marca, textos, layout e nomes de tela dos dois sistemas.
- Abatedouro/frango de corte/matrizes (o grupo SAG/Avecom cobre, mas está fora do foco de postura).
- Instalação em servidor local (o PosturaWeb oferece; nós começamos só em nuvem).

## 11. Dores dos usuários (replica-entrepreneur, amostra pequena)

Amostra: 2 avaliações na B2B Stack (nota 2,5) + 5 reclamações recentes visíveis no Reclame Aqui (nota 7,6, 278 ativas, tempo médio de resposta de 21 dias). **Tema fino, não é tendência estatística.**
- Suporte lento ou ausente ("o suporte me ignora há 8 dias", Reclame Aqui, 15/10/2026) e cobrança após cancelamento (Reclame Aqui, out/2026).
- Erros e sensação de produto inacabado (B2B Stack, 2020).
- Módulos de conciliação Open Finance que não funcionam por meses (Reclame Aqui, 22/09/2026).
- Boleto só por e-mail (B2B Stack, 2019; já resolvido com WhatsApp).
- PosturaWeb: nenhuma avaliação pública encontrada. O modelo comercial é o ponto fraco visível: licença + mensalidade + implantação a R$ 195/h, cerca de R$ 10 mil por módulo e cerca de R$ 80 mil para a empresa completa (página "Dúvidas comuns").

**Ângulo possível:** "Para granjas de postura que hoje juntam um financeiro genérico com planilhas de produção, ou pagam R$ 80 mil de implantação num ERP pesado: o custo do ovo por lote ligado ao financeiro real, com apontamento offline no galpão, por assinatura e sem implantação cara."

## 12. Tamanho

Telas ~38, fluxos 13, entidades ~35. Partes difíceis: (1) conciliação bancária com sugestões e regras; (2) NF-e de produto + cobrança bancária (certificados, homologação, rejeições); (3) apontamento offline com sincronização; (4) custo do ovo com rateio e amortização das aves; (5) multiempresa/permissões. **Tamanho: L** (um trimestre para um MVP sólido com 1–2 devs), XL se tudo de uma vez. Recomendação: fatiar em MVP.

## 13. Proposta de fatias (para o replica-architect)

1. **MVP (vertical slice):** estrutura da granja, lotes, apontamento diário (web + PWA offline), painel do lote contra a curva, contas a pagar/receber com categorias e centro de custo por lote, importação OFX + conciliação manual, fluxo de caixa e painel caixa × competência.
2. **V2:** estoque e fábrica de ração, pedidos e NF-e, cobrança boleto/Pix, regras de conciliação, custo do ovo mensal, orçamento.
3. **V3:** Open Finance, CNAB, app de vendas, caixa de entrada com IA, BI, manejo sanitário completo, rastreabilidade de lote de embalagem.

Próximo passo: `/replica-architect` sobre este recon (stack, schema SQL, API e ordem de build).
