# Piscicultura no Balbina

O Balbina é o ERP do FINAVI (avicultura de postura) com o domínio trocado para piscicultura de tambaqui e outros
peixes redondos. Gestão, financeiro, fiscal, vendas, planejamento e configurações vieram iguais; o que era da granja
virou peixe. Este documento é a referência do vocabulário e das regras do peixe. As migrations da troca são as
`supabase/migrations/2026110500000*_piscicultura_*.sql` e `20261105000006_campo_insumos.sql`; as anteriores são as do
FINAVI com os nomes já traduzidos.

## Referências técnicas

- **D1**: Corrêa et al., *Criação de tambaquis*, Embrapa Amazônia Oriental, 2018 (tabela de arraçoamento, qualidade
  da água, biometria, manejo).
- **D2**: Izel et al., *Produção intensiva de tambaqui em tanques escavados com aeração*, Circular Técnica 39, Embrapa
  Amazônia Ocidental, 2013 (crescimento com aeração, densidade, aeradores por hectare).

As mesmas fontes alimentam a base de manejo do chat do campo (`src/lib/campo/conhecimento-tambaqui.ts`).

## Vocabulário: da granja para o viveiro

| FINAVI (granja) | Balbina (piscicultura) | Onde |
|---|---|---|
| núcleo | setor (com licença ambiental) | `setores` |
| galpão | viveiro: escavado, barragem, tanque-rede, alvenaria, lona; área (m²), volume (m³), profundidade, aerador | `viveiros` |
| linhagem | espécie (Tambaqui, Tambatinga, Tambacu, Pirapitinga, Matrinxã, Pirarucu...) | `especies` |
| curva padrão da linhagem | curva de crescimento (peso esperado por semana de cultivo) | `curvas_crescimento` |
| alojamento | povoamento: quantidade, peso inicial (g), custo dos alevinos/juvenis, peso de abate | `povoar_lote` |
| fase cria/recria/produção | finalidade do viveiro: alevinagem (berçário), recria, engorda, alevinagem + recria | `viveiros.finalidade` |
| apontamento (ovos, mortes, ração) | lançamento do viveiro: ração do turno (por tipo), mortes e descartes com causa, qualidade da água, checklist, medicação | `registrar_lancamento_campo` |
| pesagem das aves | biometria por amostragem (peso médio, uniformidade) | `biometrias` |
| ovos produzidos e classificados | despesca (parcial ou total) com kg por classe de tamanho | `registrar_despesca` |
| ovo em cartela/caixa | peixe em kg (balança) ou caixa de 20 kg | `produtos.fator_kg` |
| custo do ovo | custo do kg por lote | `/custo-do-kg` |
| vacina | banho, medicamento na ração ou na água, com carência | `eventos_sanitarios` |
| — | insumo aplicado no viveiro: calagem, adubação, medicamento, banho, limpeza | `/api/lancar-insumos` |

## O ciclo do lote

1. **Povoamento** (`povoar_lote`): o lote entra num viveiro com a espécie, a quantidade, o peso inicial em gramas e o
   custo. O peso de abate (`peso_alvo_g`) dá a previsão de despesca pela curva da espécie.
2. **Trato diário** (`registrar_lancamento_campo`): um lançamento por viveiro, dia e turno (manhã ou tarde). A ração
   escolhida por tipo sai do estoque e entra no custo do lote; mortes e descartes baixam a contagem do viveiro;
   oxigênio, temperatura, pH, transparência e amônia ficam no lançamento e alimentam os alertas. Lançar de novo no
   mesmo turno pede confirmação (`forcar`), e o `client_id` torna o reenvio do celular inofensivo.
3. **Biometria**: amostra de peixes pesados; dá o peso médio, a biomassa, o ganho por dia e a conversão alimentar.
   Entre duas biometrias o peso é estimado pela curva (`app.peso_estimado`). D1: amostrar ~10% a cada 15 dias até
   ~70 g e depois todo mês; a Rotina do dia avisa quando um viveiro passa de 30 dias sem pesagem.
4. **Despesca** (`registrar_despesca`): parcial (ficam peixes) ou total (esvazia o viveiro e, se for o último viveiro
   do lote, encerra o lote). Os kg entram no estoque do pescado, por classe; o que não foi separado entra como
   "Inteiro". Na total, os peixes que o lançamento dizia estar no viveiro e não apareceram ficam como perdidos.
   A carência de um medicamento trava a despesca até o fim dela. Só a última despesca de cada lote pode ser desfeita,
   e só enquanto o peixe não foi vendido.
5. **Venda**: daí em diante vale o que veio do FINAVI (pontos de venda com depósito e caixa próprios, transferência
   com frete e perda, pedidos, faturamento, entrega, PDV, app do vendedor, link do cliente, NF-e).

## Ração: tabela de arraçoamento

A ração sugerida do dia é a biomassa estimada do viveiro × a taxa da faixa de peso, dividida pelos turnos
(`racao_sugerida`). Oxigênio abaixo de 3 mg/L suspende a sugestão. Tabela do tambaqui (D1, Tabela 3):

| Fase | Peso (g) | Proteína | Grânulo | Taxa (% do peso vivo/dia) | Refeições |
|---|---|---|---|---|---|
| Alevinagem | 0,5 a 7 | 55% | farelada/pó | 20 → 10 | 6 |
| Recria I | 7 a 25 | 40% | 1–2 mm | 7,7 → 6,4 | 4 |
| Recria II | 25 a 70 | 40% | 2–4 mm | 5,9 → 4,6 | 4 |
| Recria III | 70 a 188 | 32% | 4–6 mm | 4,2 → 2,7 | 4 |
| Recria IV | 188 a 298 | 28% | 8 mm | 2,6 → 2,2 | 4 |
| Engorda I | 298 a 530 | 28% | 8 mm | 2,1 → 1,8 | 3 |
| Engorda II | 530 a 1.000 | 28% | 8 mm | 1,7 → 1,2 | 2 |
| Engorda III | 1.000 a 2.500 | 28% | 10 mm | 1,0 → 0,8 | 2 |

Cada empresa pode ter a sua tabela e a sua curva (espécie própria em `/lotes/especies`).

A tabela (D1) e a curva padrão (D2, viveiro aerado) vêm de trabalhos diferentes e não fecham entre si: dando só a
ração da tabela, o peixe teria de crescer como na curva com conversão perto de 1,0, o que não acontece no viveiro. Use
a sugestão como ponto de partida e ajuste pela saciedade (sobra no cocho, peixe comendo); na conta de teste o trato
fica 15% a 50% acima da tabela e a conversão do ciclo fica entre 1,4 e 1,5 (1,7 na barragem, que passou do ponto de
abate). Se a conversão real da piscicultura destoar muito disso, ajuste a curva da espécie com as biometrias.

## Qualidade da água

Faixas do tambaqui (D1), em `src/lib/agua.ts` e na view de alertas: oxigênio de 4 a 8 mg/L (abaixo de 3, suspender a
ração), temperatura de 28 a 30 °C, pH de 5 a 7, transparência de 30 a 40 cm, amônia tóxica abaixo de 0,46 mg/L (o
sistema calcula a fração tóxica pela amônia total, o pH e a temperatura).

## Estoque e venda do pescado

- Unidade do estoque: kg, com casas decimais. Cada classe tem um produto base "(estoque)" que guarda o saldo e os
  produtos de venda "Peixe <classe> (kg)" e "Caixa 20 kg · peixe <classe>" (`app.produtos_venda_peixe`).
- Classes padrão de toda empresa nova: Inteiro (sem separação), Pequeno (até 1 kg), Médio (1 a 2 kg), Grande (2 a
  3 kg), Extra (acima de 3 kg) e Descarte (não vendido). Dá para mudar em Piscicultura > Classes.
- O PDV, a venda do escritório e o app do vendedor aceitam fração de kg (peso da balança, até 3 casas).
- Alevinos e juvenis vendidos são o tipo `alevino`, contados em unidades.

## Custo do kg

O custo do lote soma, mês a mês (`calcular_custos_mes`, tabela `custos_lote_mensal`), o rateio do financeiro por
componente (`categorias.componente_custo`, view `categorias_custo`): ração, alevinos, sanidade, mão de obra, energia, embalagem e
outros. A ração lançada por tipo entra pelo custo médio do estoque, e a comprada sem centro de custo vai pelo que cada
lote comeu. Os outros gastos lançados no viveiro, no setor ou sem centro de custo são divididos entre os lotes pela
biomassa de cada dia (kg·dia), não pela contagem de peixes: 15 mil juvenis de 50 g pesam 750 kg e não podem levar
mais custo que 8 mil peixes de 1 kg. O custo do kg do mês é o custo total dividido
pelos kg produzidos no mês (biomassa do fim − biomassa do início + kg despescados), e a conversão alimentar é a ração
do mês sobre esses mesmos kg.

## App de campo (`/campo`)

PWA instalável, feito para o celular na beira do viveiro: funciona sem sinal (service worker + fila no aparelho) e
envia sozinho quando a conexão volta. Cinco abas:

| Aba | O que faz | Rota de API |
|---|---|---|
| Chat | Texto ou voz. "Coloquei 2 sacos de ração no tanque 02" vira um cartão para confirmar (nada é lançado sem o toque); dúvidas de manejo do tambaqui respondidas pela base da Embrapa. Precisa de `ANTHROPIC_API_KEY` no servidor | `POST /api/chat/manejo` |
| Viveiros | Painel de cada viveiro (peixes, peso estimado, biomassa, ração do dia, água, alertas), abrir lote e fechar lote (despesca) | `POST /api/abrir-lote`, `POST /api/lotes/:id/fechar` |
| Ração | Ração do turno viveiro por viveiro, pela tabela de arraçoamento, em sacos ou kg, com mortes, água e checklist; insumos aplicados (calagem, adubação, medicamento, banho) | `POST /api/apontamentos`, `POST /api/lancar-insumos` |
| Biometria | Pesagem por amostra, curva de crescimento contra o padrão da espécie, ganho por dia e conversão alimentar | `POST /api/biometrias` |
| Envios | Situação do sinal, fila do aparelho, o que precisa de decisão (lançamento repetido no turno, falta de estoque) e o que já foi | — |

Regras puras do campo em `src/lib/campo/` (fila, propostas do chat, validação, indicadores), com testes. O app nativo
(`mobile/`, Expo) faz o lançamento do viveiro, os pedidos, o caixa de balcão e o estoque; o chat, a biometria e a
despesca ficam no `/campo`.

## O que ficou do FINAVI sem mudança

Financeiro (contas, títulos, conciliação, cartões, fluxo de caixa, fechamento, DRE, LCDPR), fiscal (NF-e/NFC-e pela
Focus NFe, produtor rural PF com Funrural), comercial (pedidos, PDV, pontos de venda, tabelas de preço, app do
vendedor, link do cliente), planejamento e viabilidade, multiempresa, cargos e permissões, API pública com webhooks,
automações e assinatura por plano. O NCM padrão do pescado é 0302.89.90 (peixe fresco ou refrigerado).
