# Pontos de venda

Veio do FINAVI (pedido do Nicolas de 29/10/2026), com o ovo trocado pelo peixe: cadastrar os lugares onde a
piscicultura vende, que podem ser mais de um (na própria piscicultura e numa peixaria ou feira em Manaus, por
exemplo). O ponto pode ser da mesma empresa ou de outra empresa do mesmo dono. O peixe pode ir da piscicultura
para o ponto por venda ou por transferência, com frete e impostos.

## Como ficou (etapa 1: ponto da mesma empresa)

| O quê | Onde |
|---|---|
| Cadastro dos pontos, saldo de cada um e resumo de 30 dias (vendas, peixe recebido em kg, frete por kg, perda) | Estoque → Pontos de venda (`/pontos-de-venda`) |
| Transferência piscicultura → ponto (ou de volta), com frete, "a caminho" e recebimento com perdas | `/pontos-de-venda/transferencias` |
| Dados do ponto, caixa do PDV, desativar e contagem (inventário) do ponto | `/pontos-de-venda/{id}` |
| PDV escolhe o ponto (fica lembrado no navegador) e vende do estoque dele | `/vendas/pdv` |
| Fechamento do caixa por ponto | `/vendas/pdv/caixa?ponto=…` |
| Pedido normal com "o peixe sai de" | `/vendas/nova` |

Regras no banco (migration `20261029173000_pontos_de_venda.sql`, teste `supabase/tests/99_pontos_venda.sql`):

- **A piscicultura é a sede.** Toda empresa tem um ponto `sede` que usa o depósito de pescado de sempre. Ele é
  criado sozinho com a empresa. A sede não pode ser desativada.
- **Cada ponto tem depósito de pescado, caixa (conta caixinha) e centro de custo próprios**, criados com o
  ponto. O centro de custo "Ponto · nome" fica embaixo do centro Comercial e recebe a receita das vendas
  do ponto e o frete das transferências para ele, então o DRE por centro de custo já mostra o resultado
  de cada ponto.
- **`estoque_peixe` é o estoque da piscicultura (sede).** A despesca dá entrada lá, em kg por classe, e o
  inventário também. `estoque_peixe_ponto` mostra o saldo de cada ponto. Enquanto a empresa só tem a sede,
  nada muda para ela.
- **Carência**: o lote em carência de medicamento não é despescado (`registrar_despesca` recusa), então o
  peixe em carência nunca chega ao estoque nem ao ponto.
- **Transferência**: o peixe sai da origem na hora, em kg (movimento `transferencia`, `transferir_peixe`), e
  entra no destino no recebimento (`receber_transferencia_peixe`). O que chega estragado ou falta na balança
  sai como `perda` no destino. "Recebida na hora" é o padrão; "a
  caminho" deixa o recebimento para depois, como no aceite de transferência dos ERPs de varejo.
- **Frete**: vira conta a pagar (categoria Fretes, centro de custo do ponto de destino, fornecedor =
  transportador, se houver) e entra como custo por kg recebido no movimento de entrada do ponto. Com
  veículo próprio dá para informar o frete só como custo, sem gerar conta a pagar.
- **Cancelar/desfazer**: o peixe volta para a origem; só passa se o destino ainda tiver o peixe e se o
  frete não tiver sido pago (estorne o pagamento antes). Frete em aberto é cancelado junto.
- **Venda**: `pedidos_venda.ponto_venda_id` (sem ponto = sede). O faturamento baixa o estoque do ponto
  e põe a receita no centro de custo dele. No PDV, dinheiro sem conta cai no caixa do ponto.
- **Desativar ponto**: só sem peixe e sem transferência a caminho (use a contagem para zerar).
- **Permissões**: cadastro com `estoque.editar` ou `configuracoes.editar`; transferência e contagem com
  `estoque.editar`; frete em contas a pagar exige também `contas-a-pagar.editar`; o caixa (`pdv.operar`)
  só vende. Módulo do plano: Estoque (todos os planos); PDV continua no plano Vendas em diante.

### Custo do kg

O **custo do kg por lote** é custo de produção na piscicultura (não muda com o ponto). O frete é custo
logístico do ponto: a tela de pontos mostra o **frete por kg** de cada ponto e o DRE por
centro de custo mostra o resultado do ponto. Isso segue o CPC 16 (Estoques), que manda incluir no custo
do estoque o que se gasta para levá-lo "à sua condição e localização atuais", e por isso o frete fica
gravado no movimento de entrada do ponto (`custo_unit_cents`).

## Etapa 2: ponto como outra empresa do mesmo dono

Quando a loja tem CNPJ próprio, ela é outra empresa no Balbina (menu "Outra empresa"), com os próprios
pontos, estoque, caixa e financeiro. A piscicultura vende para a loja num pedido normal, com a loja cadastrada
como cliente pelo CNPJ. Depois de faturado, a página do pedido mostra "Venda para <loja>" a quem
participa das duas empresas, e um clique lança a entrada na loja (migration
`20261029183000_venda_entre_empresas.sql`, teste `99_venda_entre_empresas.sql`):

- o peixe entra no estoque do ponto escolhido da loja (a loja precisa ter a classe de pescado com o mesmo
  nome), com custo igual ao preço por kg da venda;
- cada parcela a receber da piscicultura vira uma conta a pagar na loja, com o mesmo vencimento, na categoria
  "Compra de peixe para revenda" e no centro de custo do ponto;
- a piscicultura vira fornecedora na loja (criada pelo CPF ou CNPJ dela);
- desfazer na loja tira o peixe e cancela as contas a pagar, desde que nada tenha sido pago. O pedido
  na piscicultura só pode ser cancelado depois de desfazer a entrada na loja.

Quem lança precisa ver as vendas da piscicultura e lançar estoque e contas a pagar na loja.

## Pesquisa

- **ICMS na transferência entre estabelecimentos do mesmo titular**: o STF (ADC 49, 2021, efeitos a
  partir de 2024) tirou a incidência; a LC 204/2023 alterou a LC 87/1996 nesse sentido e o Convênio ICMS
  178/2023, depois substituído pelo 109/2024, regulou a transferência de crédito. Cada estado
  regulamentou: em MG, por exemplo, o produtor rural pessoa física fica automaticamente na opção de
  "equiparar a transferência a operação tributada", com a frase "transferência de mercadoria equiparada a
  uma operação tributada" nas informações complementares da NF-e (cartilha SEF/MG, jan/2025). Falta
  conferir a regra da SEFAZ-AM.
  Fontes: [Cartilha SEF/MG](https://www.fazenda.mg.gov.br/empresas/legislacao_tributaria/orientacao/2025.01.16_Cartilha_Remessa_M_Titular.pdf),
  [Demarest sobre o Convênio 178/2023](https://www.demarest.com.br/apos-rejeicao-do-convenio-icms-174-2023-confaz-publica-convenio-icms-178-2023/).
- **A nota continua existindo** na transferência: a mercadoria circula com NF-e de transferência
  (CFOP 5.151 para produção própria dentro do estado, 5.152 para mercadoria comprada; 6.151/6.152 entre
  estados; entrada 1.151/1.152). Fonte: [tabela CFOP grupo 5](https://tabelasfiscais.com.br/cfop/grupo/5).
- **Pescado e ICMS**: o pescado fresco ou resfriado (NCM 0302) tem isenção nas saídas internas em vários
  estados (Convênio ICMS 60/91 e regulamentos estaduais), com exceções por espécie e por apresentação;
  confirmar no RICMS-AM.
- **Funrural**: incide sobre a receita da comercialização da produção. Transferência entre
  estabelecimentos do mesmo produtor não é venda; venda para outra empresa (mesmo do mesmo dono) é.
- **Produtor rural pessoa física com loja**: o produtor PF pode ter inscrição estadual por propriedade
  rural, mas uma peixaria na cidade revendendo peixe tende a ser atividade comercial, que normalmente exige
  CNPJ (aí o ponto vira "outra empresa", etapa 2). Confirmar com o contador.
- **Como os ERPs tratam multiloja**: Alterdata (Wshop/Ishop) faz a NF-e de transferência na loja de origem
  e um "aceite de transferência" na loja de destino, que vira a entrada no estoque; o CIGAM gera a nota de
  saída e a de entrada e pode exigir confirmação do recebimento. O Balbina (como o FINAVI)
  segue o mesmo desenho (saída na hora, entrada no recebimento), sem nota automática por enquanto.
  Fontes: [Alterdata](https://ajuda.alterdata.com.br/x/g3lSC), [CIGAM](https://www.cigam.com.br/wiki/index.php/CL_-_Como_Fazer_-_Transfer%C3%AAncia_de_Produtos-_Gest%C3%A3o_de_Lojas).
  O NIBO não controla estoque; separa unidades por centro de custo, que é o que o Balbina faz com o centro
  de custo de cada ponto.

## Perguntas para o contador (não assumidas no sistema)

1. A loja em Manaus pode ser um estabelecimento do mesmo produtor rural (mesmo CPF, outra inscrição
   estadual) ou precisa de CNPJ próprio? Se precisar de CNPJ, o caminho é a etapa 2 (outra empresa).
2. Na transferência piscicultura → ponto dentro do AM, emitir NF-e de transferência com CFOP 5.151? O AM pede
   alguma opção ou frase (não incidência × equiparação a operação tributada, LC 204/2023)?
3. Pescado (tambaqui fresco ou resfriado): isento de ICMS nas saídas internas do AM? Há crédito a transferir?
4. Qual valor usar na nota de transferência (custo de produção, último preço de entrada)?
5. Funrural: confirma que não incide na transferência e incide na venda para a empresa da loja?
6. Se a loja for outra empresa (CNPJ, Simples?), qual preço usar na venda da piscicultura para ela (preço de
   mercado, para não virar distribuição disfarçada de lucro) e como fica a revenda?
7. O frete da transferência pode entrar no custo do estoque da loja (CPC 16), ou o contador prefere como
   despesa de venda?

Até a resposta, a transferência no Balbina não emite nota. A NF-e de transferência entra depois que o contador definir CFOP, valor e tributação.
