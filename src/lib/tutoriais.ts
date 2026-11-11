// Tutoriais guiados por tela (balões em cima da tela, com destaque no ponto explicado).
// Cada tela tem o seu: aparece no primeiro acesso de cada pessoa e pode ser refeito pelo botão de ajuda.
// Os passos apontam para marcas `data-tour` dos componentes comuns (ui.tsx, cadastro.tsx, menu) ou para um
// cartão pelo título (`data-cartao`). Passo sem o elemento na tela é pulado; passo com `permissao` só aparece
// para quem tem a chave, então o tratador vê o tour do que ele usa e o master vê tudo.
import { semAcento } from "./formato.ts";

export type Passo = {
  // Seletor do elemento destacado (o primeiro visível da lista); sem alvo, o balão fica no meio da tela.
  alvo?: string | string[];
  titulo: string;
  texto: string;
  permissao?: string;
};

export type Duvida = { pergunta: string; resposta: string };

export type Tutorial = {
  // Rota da tela; `[id]` vale para qualquer trecho (ex.: /lotes/[id]).
  tela: string;
  nome: string;
  // Chave que a pessoa precisa ter para ver o tutorial ("master" = só o usuário master). Sem ela, vale para todos.
  permissao?: string;
  passos: Passo[];
  duvidas?: Duvida[];
};

const t = (nome: string) => `[data-tour="${nome}"]`;
const cartao = (titulo: string) => `[data-cartao="${titulo}"]`;
// botão que abre a gaveta de lançamento (BotaoLancamento)
const lancamento = (rotulo: string) => `[data-lancamento="${rotulo}"]`;

// Tour de boas-vindas: roda antes do tour da primeira tela que a pessoa abre.
export const TOUR_GERAL: Tutorial = {
  tela: "geral",
  nome: "Conhecendo o Balbina",
  passos: [
    {
      titulo: "Bem-vindo ao Balbina",
      texto: "Em cada tela nova que você abrir aparece um tour curto como este, só na primeira vez. Use Próximo ou as setas do teclado para seguir.",
    },
    {
      alvo: [t("menu"), t("abas")],
      titulo: "Menu",
      texto: "Aqui ficam as telas que o seu cargo pode usar. O que não aparece no menu não faz parte do seu acesso.",
    },
    {
      alvo: t("empresa"),
      titulo: "Empresa",
      texto: "Se você trabalha em mais de uma empresa, troque aqui. Tudo o que aparece na tela é da empresa escolhida.",
    },
    {
      alvo: t("tema"),
      titulo: "Aparência",
      texto: "Escolha entre o modo dia e o modo noite.",
    },
    {
      alvo: t("ajuda"),
      titulo: "Ajuda sempre à mão",
      texto: "Este botão fica sempre no canto da tela. Nele você tira dúvidas da tela aberta, busca uma resposta e refaz qualquer tutorial.",
    },
  ],
  duvidas: [
    {
      pergunta: "Por que não vejo algumas telas?",
      resposta: "Cada pessoa vê só as telas do seu cargo. Peça ao usuário master da empresa para liberar o que faltar em Configurações > Usuários e cargos.",
    },
    {
      pergunta: "Como volto a ver um tutorial?",
      resposta: "Abra a Ajuda (botão de interrogação no canto) e toque em \"Ver o tutorial desta tela\". Para rever todos, use \"Refazer todos os tutoriais\".",
    },
    {
      pergunta: "Posso desligar os tutoriais?",
      resposta: "Sim. Na Ajuda, desmarque \"Mostrar o tutorial nas telas novas\". Eles continuam disponíveis no botão de ajuda.",
    },
    {
      pergunta: "Como uso no celular?",
      resposta: "O celular abre na versão simples, com a operação do dia. O ícone de monitor no alto troca para a versão completa. No viveiro, use o app de campo (/campo), que funciona sem internet.",
    },
  ],
};

export const TUTORIAIS: Tutorial[] = [
  {
    tela: "/painel",
    nome: "Painel",
    passos: [
      { alvo: t("titulo"), titulo: "Painel", texto: "O resumo da piscicultura e do financeiro do período, para ver tudo de relance ao começar o dia." },
      { alvo: cartao("Primeiros passos"), permissao: "master", titulo: "Primeiros passos", texto: "Enquanto a empresa está sendo configurada, esta faixa mostra o que falta. Cada passo leva à tela certa." },
      { alvo: t("filtros"), titulo: "Período", texto: "Troque o período para recalcular todos os números do painel." },
      { alvo: cartao("Próximos 7 dias"), titulo: "Próximos 7 dias", texto: "O que vence a pagar e a receber na semana. Clique para abrir a conta." },
      { alvo: cartao("Viveiros povoados"), titulo: "Viveiros povoados", texto: "Cada viveiro com o lote, os peixes, o peso médio e os dias de cultivo. Clique no lote para ver a curva de crescimento." },
    ],
    duvidas: [
      { pergunta: "De onde vêm os números do painel?", resposta: "Do que foi lançado no sistema: apontamentos, biometrias, despescas, vendas, contas pagas e recebidas. Nada é digitado no painel." },
      { pergunta: "Por que o painel mostra menos coisas para mim?", resposta: "Os cartões seguem o seu cargo: quem não vê o financeiro não vê os números de caixa." },
    ],
  },
  {
    tela: "/primeiros-passos",
    nome: "Primeiros passos",
    permissao: "master",
    passos: [
      { alvo: t("titulo"), titulo: "Assistente de primeiros passos", texto: "O caminho para deixar a piscicultura pronta: viveiros, lotes, estoque, contas, apontamento e equipe. Cada passo se marca sozinho quando o sistema encontra o dado." },
      { alvo: cartao("Tem tudo numa planilha?"), titulo: "Atalho pela planilha", texto: "Se os dados já estão numa planilha, baixe o modelo, preencha e importe tudo de uma vez." },
    ],
    duvidas: [
      { pergunta: "Posso pular um passo?", resposta: "Pode. O passo pulado fica marcado e você volta a ele quando quiser em Configurações > Primeiros passos." },
    ],
  },
  {
    tela: "/piscicultura",
    nome: "Piscicultura",
    permissao: "piscicultura.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Piscicultura", texto: "Setores e viveiros, com a capacidade, a área e a finalidade de cada um (alevinagem, recria ou engorda)." },
      { alvo: t("novo"), permissao: "piscicultura.editar", titulo: "Cadastrar", texto: "Cadastre o setor e depois os viveiros dele, com área, volume e aeração. A finalidade do viveiro decide que lotes ele pode receber." },
      { alvo: t("lista"), titulo: "Lista", texto: "Clique numa linha para editar. O lote povoado em cada viveiro aparece aqui." },
    ],
    duvidas: [
      { pergunta: "Qual a diferença entre setor e viveiro?", resposta: "Setor é o grupo de viveiros (um sítio, uma barragem ou um conjunto de tanques-rede). O lote é povoado no viveiro." },
      { pergunta: "Para que servem a área e o volume?", resposta: "Para a densidade: peixes por m² no viveiro escavado e kg por m³ no tanque-rede. Elas aparecem nos viveiros povoados e nos alertas de lotação." },
    ],
  },
  {
    tela: "/lotes",
    nome: "Lotes",
    permissao: "lotes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Lotes", texto: "Cada lote de peixes: espécie, data de povoamento, fase, peso médio e o viveiro onde está." },
      { alvo: [t("novo"), t("acoes")], permissao: "lotes.editar", titulo: "Povoar um lote", texto: "Cadastre o lote no dia do povoamento, com a quantidade e o peso médio dos alevinos. Os dias de cultivo e a curva passam a ser calculados sozinhos." },
      { alvo: t("lista"), titulo: "Detalhe do lote", texto: "Clique no lote para ver o crescimento contra a curva da espécie, lançar biometria, transferir de viveiro e despescar." },
    ],
    duvidas: [
      { pergunta: "Como transfiro um lote de viveiro?", resposta: "Abra o lote e use Transferir. O viveiro de destino precisa ter a finalidade da fase do lote (por exemplo, engorda)." },
      { pergunta: "Onde cadastro a curva da espécie?", resposta: "Em Lotes > Espécies. O tambaqui já vem com a curva de referência (Embrapa); ela é a base da ração sugerida, dos indicadores e da previsão de despesca." },
      { pergunta: "De quanto em quanto tempo faço biometria?", resposta: "A cada 2 a 4 semanas, pesando uma amostra de cada viveiro. O peso médio corrige a biomassa, a ração sugerida e a previsão de despesca." },
    ],
  },
  {
    tela: "/lotes/[id]",
    nome: "Detalhe do lote",
    permissao: "lotes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Lote", texto: "Tudo sobre um lote: dias de cultivo, peixes vivos, peso médio, biomassa e o viveiro atual." },
      { alvo: cartao("Ração sugerida para hoje"), titulo: "Ração sugerida", texto: "A ração do dia pela biomassa do viveiro e pela taxa de arraçoamento do peso médio. É sugestão: ajuste pelo apetite dos peixes e pela sobra." },
      { alvo: cartao("Indicadores zootécnicos"), titulo: "Crescimento", texto: "Peso das biometrias, ganho diário, conversão alimentar e sobrevivência, comparados com a curva de crescimento da espécie." },
      { alvo: t("lista"), titulo: "Histórico", texto: "Os apontamentos, biometrias e despescas do lote, do mais novo ao mais antigo." },
    ],
  },
  {
    tela: "/lotes/especies",
    nome: "Espécies",
    permissao: "lotes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Espécies", texto: "As espécies de peixe com a curva de crescimento: peso esperado e ração por semana de cultivo." },
      { alvo: lancamento("Nova espécie"), permissao: "lotes.editar", titulo: "Nova espécie", texto: "Cadastre a espécie e cole a curva por semana de cultivo (peso médio e consumo de ração)." },
    ],
  },
  {
    tela: "/apontamentos",
    nome: "Apontamento diário",
    permissao: "apontamentos.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Apontamento diário", texto: "O registro do dia de cada viveiro: ração, mortes, qualidade da água e medicamentos. O alto da tela mostra quantos viveiros ainda faltam hoje." },
      { alvo: lancamento("Novo apontamento"), permissao: "apontamentos.editar", titulo: "Novo lançamento", texto: "Escolha o viveiro e o turno e preencha a ração dada, as mortes e a água (oxigênio, temperatura, pH). A ração escolhida sai do estoque." },
      { alvo: t("acoes"), titulo: "No celular, sem internet", texto: "No viveiro, abra o app de campo: ele guarda os lançamentos sem sinal e envia quando a internet voltar." },
      { alvo: t("lista"), titulo: "Lançamentos do dia", texto: "O que já foi apontado. Confira antes de fechar o dia." },
    ],
    duvidas: [
      { pergunta: "Lancei errado. Como corrijo?", resposta: "Exclua o lançamento na lista e lance de novo. Quem lança exclui o que lançou no mesmo dia; o gerente da piscicultura e o master excluem qualquer um, de qualquer data (use o filtro De/Até). Excluir devolve a ração e a medicação ao estoque, e o lançamento fica na lixeira, no fim da tela, de onde dá para restaurar." },
      { pergunta: "Como o sistema sugere a ração?", resposta: "Pela biomassa do viveiro (peixes vivos × peso médio, corrigido pela curva desde a última biometria) e pela taxa de arraçoamento da espécie para esse peso." },
      { pergunta: "O que acontece com o oxigênio baixo?", resposta: "Abaixo de 4 mg/L o apontamento vira alerta de atenção e abaixo de 3 mg/L, crítico, no painel e no app de campo: hora de suspender a ração e ligar o aerador." },
      { pergunta: "O que é o checklist do viveiro?", resposta: "Itens que a piscicultura quer conferir todo dia (aeradores, entrada de água, telas, comportamento dos peixes). Problema marcado vira alerta de manutenção." },
    ],
  },
  {
    tela: "/apontamentos/checklist",
    nome: "Checklist do viveiro",
    permissao: "apontamentos.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Checklist do viveiro", texto: "Os itens que aparecem no apontamento diário para conferir em cada viveiro." },
      { alvo: lancamento("Novo item"), permissao: "apontamentos.editar", titulo: "Novo item", texto: "Crie itens de sim/não ou de número (por exemplo, transparência da água) e escolha em que viveiros valem." },
    ],
  },
  {
    tela: "/relatorios/indicadores",
    nome: "Indicadores zootécnicos",
    permissao: "lotes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Indicadores", texto: "Peso, ganho diário, sobrevivência, ração e conversão alimentar de cada lote, comparados com a curva de crescimento da espécie." },
      { alvo: t("filtros"), titulo: "Agrupar", texto: "Veja por lote ou por espécie." },
      { alvo: t("indicadores"), titulo: "Resumo", texto: "Os números da piscicultura inteira no período." },
      { alvo: t("lista"), titulo: "Lote a lote", texto: "Compare os lotes lado a lado para achar quem está abaixo do esperado." },
    ],
  },
  {
    tela: "/sanidade",
    nome: "Sanidade",
    permissao: "sanidade.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Sanidade", texto: "Medicações, banhos, calagem, adubação e análises por lote, com a carência antes da despesca." },
      { alvo: lancamento("Registrar manejo"), permissao: "sanidade.editar", titulo: "Registrar ou programar", texto: "Lance o que foi feito ou programe o próximo (calagem, análise da água, banho). O programado aparece como pendente." },
      { alvo: t("lista"), titulo: "Agenda", texto: "O que está programado e o que já foi feito." },
    ],
    duvidas: [
      { pergunta: "O que é carência?", resposta: "Os dias depois do medicamento em que o peixe não pode ser despescado para venda. O sistema recusa a despesca do lote até o fim da carência." },
    ],
  },
  {
    tela: "/sondas",
    nome: "Sondas IoT",
    permissao: "lotes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Sondas IoT", texto: "Leituras em tempo real de oxigênio, temperatura, pH e amônia das sondas instaladas nos viveiros." },
      { alvo: t("lista"), titulo: "Painel", texto: "Cada sonda mostra a última leitura com indicadores coloridos: normal, atenção ou crítico." },
    ],
    duvidas: [
      { pergunta: "Como cadastro uma sonda?", resposta: "Em Configurações > API, cadastre a sonda com o nome e o viveiro. O token gerado vai na configuração do equipamento." },
    ],
  },
  {
    tela: "/medicamentos",
    nome: "Medicamentos e vitaminas",
    permissao: "sanidade.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Medicamentos e vitaminas", texto: "O cadastro com a dose (na ração ou no banho) e a carência antes da despesca." },
      { alvo: t("novo"), permissao: "sanidade.editar", titulo: "Novo", texto: "Cadastre uma vez; depois é só marcar no apontamento do viveiro." },
      { alvo: t("busca"), titulo: "Busca", texto: "Ache pelo nome, mesmo sem acento." },
    ],
  },
  {
    tela: "/contas-a-pagar",
    nome: "Contas a pagar",
    permissao: "contas-a-pagar.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Contas a pagar", texto: "Tudo o que a piscicultura deve pagar. No alto, o total em aberto e o vencido." },
      { alvo: t("filtros"), titulo: "Situação", texto: "Em aberto, vencidas, pagas ou a lixeira." },
      { alvo: t("periodo"), titulo: "Mês", texto: "Navegue pelo mês de vencimento com as setas." },
      { alvo: t("busca"), titulo: "Busca", texto: "Procure por descrição, fornecedor, documento ou valor." },
      { alvo: t("lista"), titulo: "Lista", texto: "Clique na conta para pagar, editar ou duplicar. Marque várias para pagar, reprogramar ou excluir em lote." },
      { alvo: lancamento("Nova conta a pagar"), permissao: "contas-a-pagar.editar", titulo: "Nova conta", texto: "Lance a conta com as parcelas e divida entre categorias e centros de custo (rateio)." },
    ],
    duvidas: [
      { pergunta: "Como pago várias de uma vez?", resposta: "Marque as contas na lista; aparece uma barra embaixo com Pagar total, Alterar vencimento e Excluir." },
      { pergunta: "Excluí sem querer.", resposta: "Contas excluídas vão para a lixeira (filtro Lixeira) e podem ser restauradas." },
      { pergunta: "O que é competência?", resposta: "O mês a que a despesa pertence (por exemplo, a ração de outubro paga em novembro). É ela que entra no DRE e no custo do kg." },
    ],
  },
  {
    tela: "/contas-a-receber",
    nome: "Contas a receber",
    permissao: "contas-a-receber.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Contas a receber", texto: "O que os clientes devem à piscicultura. No alto, o total em aberto e o vencido." },
      { alvo: t("filtros"), titulo: "Situação", texto: "Em aberto, vencidas, recebidas ou a lixeira." },
      { alvo: t("busca"), titulo: "Busca", texto: "Procure por descrição, cliente, documento ou valor." },
      { alvo: t("lista"), titulo: "Lista", texto: "Clique na conta para registrar o recebimento. Marque várias para receber ou reprogramar em lote." },
      { alvo: lancamento("Nova conta a receber"), permissao: "contas-a-receber.editar", titulo: "Nova conta", texto: "Lance o recebimento com parcelas, categoria e centro de custo. Vendas faturadas já entram aqui sozinhas." },
    ],
    duvidas: [
      { pergunta: "Como cobro por boleto ou Pix?", resposta: "Pelo pedido de venda (Cobrar pelo Asaas) ou em Cobranças. Quando o cliente paga, a conta é baixada sozinha." },
    ],
  },
  {
    tela: "/contas",
    nome: "Contas e saldos",
    permissao: "contas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Contas e saldos", texto: "Bancos e caixas da empresa com o saldo de cada um." },
      { alvo: t("lista"), titulo: "Contas", texto: "Clique numa conta para ver o extrato e editar os dados." },
      { alvo: lancamento("Transferir entre contas"), permissao: "contas.editar", titulo: "Transferir", texto: "Passe dinheiro de uma conta para outra sem virar receita nem despesa." },
    ],
  },
  {
    tela: "/cobrancas",
    nome: "Cobranças",
    permissao: "cobrancas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Cobranças", texto: "Boletos e Pix emitidos pelo Asaas. Pagou, baixou sozinho." },
      { alvo: t("lista"), titulo: "Lista", texto: "A situação de cada cobrança: aguardando, paga ou vencida." },
    ],
  },
  {
    tela: "/cartoes",
    nome: "Cartões de crédito",
    permissao: "cartoes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Cartões de crédito", texto: "Compras no cartão, com cada parcela na sua fatura." },
      { alvo: t("lista"), titulo: "Fatura", texto: "As compras da fatura aberta. Quando pagar, use Pagar esta fatura." },
    ],
  },
  {
    tela: "/conciliacao",
    nome: "Conciliação",
    permissao: "conciliacao.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Conciliação", texto: "Confere o extrato do banco com o que foi lançado no sistema." },
      { alvo: t("filtros"), titulo: "Pendentes e conciliados", texto: "Troque entre o que falta conferir e o que já bateu." },
      { alvo: t("lista"), permissao: "conciliacao.editar", titulo: "Conciliar", texto: "Para cada linha do extrato, aceite a sugestão ou escolha a conta certa. Regras automáticas resolvem o que se repete." },
    ],
    duvidas: [
      { pergunta: "Como importo o extrato?", resposta: "Pelo arquivo OFX do banco ou conectando o banco pelo Open Finance (Conciliação > Bancos)." },
      { pergunta: "O que faz a regra Ignorar?", resposta: "Deixa de fora movimentos que não são da operação, como aplicação automática (BB Rende Fácil)." },
    ],
  },
  {
    tela: "/conciliacao/regras",
    nome: "Regras de conciliação",
    permissao: "conciliacao.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Regras", texto: "Cada linha importada passa pelas regras na ordem; a primeira que servir concilia sozinha." },
      { alvo: lancamento("Nova regra"), permissao: "conciliacao.editar", titulo: "Nova regra", texto: "Diga o texto do extrato e a categoria, ou marque para ignorar." },
    ],
  },
  {
    tela: "/conciliacao/bancos",
    nome: "Bancos conectados",
    permissao: "conciliacao.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Open Finance", texto: "Conecte o banco para o extrato chegar sozinho, sem baixar arquivo." },
    ],
  },
  {
    tela: "/fluxo-de-caixa",
    nome: "Fluxo de caixa",
    permissao: "fluxo-de-caixa.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Fluxo de caixa", texto: "O saldo de hoje e o previsto, somando o que está a pagar e a receber." },
      { alvo: t("filtros"), titulo: "Horizonte", texto: "Escolha até quando projetar." },
      { alvo: cartao("Saldo previsto"), titulo: "Saldo previsto", texto: "Onde o saldo fica negativo é onde é preciso agir antes." },
      { alvo: t("lista"), titulo: "Semana a semana", texto: "Entradas, saídas e saldo de cada semana." },
    ],
  },
  {
    tela: "/relatorios",
    nome: "Relatórios",
    passos: [
      { alvo: t("titulo"), titulo: "Relatórios", texto: "Todos os relatórios do sistema num lugar só, separados por assunto. Você vê só os que pode emitir." },
      { alvo: "[data-relatorio]", titulo: "Abrir ou baixar", texto: "Abra o relatório para escolher o período ou baixe direto o arquivo do mês ou do ano." },
    ],
  },
  {
    tela: "/relatorios/dre",
    nome: "DRE",
    permissao: "relatorios.ver",
    passos: [
      { alvo: t("titulo"), titulo: "DRE", texto: "O resultado do ano mês a mês. Caixa mostra quando o dinheiro entrou ou saiu; competência mostra o mês a que pertence." },
      { alvo: cartao("Fechamento de mês"), permissao: "financeiro.fechar", titulo: "Fechar o mês", texto: "Fechar trava os lançamentos do mês para ninguém mudar o que já foi conferido." },
    ],
  },
  {
    tela: "/relatorios/aging",
    nome: "Aging",
    permissao: "relatorios.ver",
    passos: [{ alvo: t("titulo"), titulo: "Aging", texto: "O saldo em aberto por faixa de atraso: quanto está vencido há 30, 60 ou 90 dias." }],
  },
  {
    tela: "/relatorios/orcamento",
    nome: "Orçamento",
    permissao: "relatorios.ver",
    passos: [{ alvo: t("titulo"), titulo: "Orçamento", texto: "O planejado contra o realizado em cada categoria. Quem pode editar preenche o planejado direto na tabela." }],
  },
  {
    tela: "/vendas",
    nome: "Vendas",
    permissao: "vendas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Vendas", texto: "Os pedidos da piscicultura. No alto, o estoque disponível para vender." },
      { alvo: t("acoes"), permissao: "vendas.lancar", titulo: "Novo pedido", texto: "Crie o pedido, escolha o cliente e os produtos; o preço vem da tabela do cliente." },
      { alvo: t("filtros"), titulo: "Situação", texto: "Abertos, faturados, entregues ou cancelados." },
      { alvo: t("lista"), titulo: "Pedidos", texto: "Clique no pedido para faturar, cobrar pelo Asaas, emitir a nota ou registrar o pagamento." },
    ],
    duvidas: [
      { pergunta: "Faturar baixa o estoque?", resposta: "Sim. Faturar tira os kg de peixe do estoque e cria a conta a receber." },
      { pergunta: "Onde vendo no balcão?", resposta: "No PDV (Vendas > PDV), que tem troco e fechamento do caixa." },
    ],
  },
  {
    tela: "/vendas/nova",
    nome: "Novo pedido",
    permissao: "vendas.lancar",
    passos: [
      { alvo: t("titulo"), titulo: "Novo pedido", texto: "Escolha o cliente, toque nos produtos e confirme. O preço segue a tabela do cliente." },
    ],
  },
  {
    tela: "/vendas/[id]",
    nome: "Pedido",
    permissao: "vendas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Pedido", texto: "Tudo do pedido num lugar só." },
      { alvo: cartao("Itens"), titulo: "Itens", texto: "Os produtos e quantidades." },
      { alvo: lancamento("Cobrar pelo Asaas"), permissao: "cobrancas.emitir", titulo: "Cobrar", texto: "Gere boleto ou Pix; quando o cliente pagar, baixa sozinho." },
      { alvo: cartao("Nota fiscal"), titulo: "Nota fiscal", texto: "Emita a NF-e do pedido faturado." },
    ],
  },
  {
    tela: "/vendas/pdv",
    nome: "PDV (balcão)",
    permissao: "pdv.ver",
    passos: [
      { alvo: t("titulo"), titulo: "PDV", texto: "Frente de caixa para venda rápida no balcão: toque nos produtos, informe o valor recebido e o troco aparece." },
    ],
    duvidas: [
      { pergunta: "Como fecho o caixa?", resposta: "Em PDV > Caixa: confira as vendas do dia por forma de pagamento e feche." },
    ],
  },
  {
    tela: "/vendas/pdv/caixa",
    nome: "Fechamento do caixa",
    permissao: "pdv.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Caixa do dia", texto: "As vendas do balcão por forma de pagamento." },
      { alvo: t("indicadores"), titulo: "Totais", texto: "Confira com o dinheiro na gaveta antes de fechar." },
    ],
  },
  {
    tela: "/vendas/precos",
    nome: "Preços especiais",
    permissao: "vendas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Preços especiais", texto: "Preço combinado com um cliente para um produto, acima da tabela." },
      { alvo: lancamento("Novo preço especial"), permissao: "vendas.precos", titulo: "Novo preço", texto: "Escolha o cliente, o produto e o preço." },
    ],
  },
  {
    tela: "/relatorios/vendas",
    nome: "Relatórios de vendas",
    permissao: "vendas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Relatórios de vendas", texto: "Faturado e entregue no período, com preço médio." },
      { alvo: cartao("Por cliente (curva ABC)"), titulo: "Curva ABC", texto: "Os clientes que mais compram (A) até os de menor peso (C)." },
    ],
  },
  {
    tela: "/notas",
    nome: "Notas fiscais",
    permissao: "notas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Notas fiscais", texto: "NF-e dos pedidos e NFC-e do balcão pela Focus NFe. O alto mostra se é homologação (teste) ou produção." },
      { alvo: t("lista"), titulo: "Notas", texto: "A situação de cada nota, com o PDF (DANFE) e o XML." },
    ],
    duvidas: [
      { pergunta: "Produtor rural pode emitir?", resposta: "Pode. O emitente aceita CPF com inscrição estadual de produtor rural." },
    ],
  },
  {
    tela: "/estoque",
    nome: "Estoque",
    permissao: "estoque.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Estoque", texto: "Os kg de peixe em estoque por classe de tamanho, o que está disponível para venda e o saldo de ração e insumos." },
      { alvo: t("acoes"), permissao: "estoque.editar", titulo: "Despesca e contagem", texto: "O peixe entra pela despesca. Para acertar o saldo depois de pesar a câmara ou o gelo, use Contar o pescado." },
      { alvo: t("lista"), titulo: "Produtos e insumos", texto: "Clique num produto para lançar entrada, saída ou ajuste de saldo." },
    ],
    duvidas: [
      { pergunta: "Como o peixe sai do estoque?", resposta: "Quando o pedido é faturado. O produto de venda diz quantos kg tem a unidade dele: o kg sai 1 kg, a caixa de 20 kg sai 20 kg." },
    ],
  },
  {
    tela: "/despescas",
    nome: "Despescas",
    permissao: "lotes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Despescas", texto: "O peixe sai do viveiro e os kg entram no estoque, por classe de tamanho." },
      { alvo: lancamento("Lançar despesca"), permissao: "lotes.editar", titulo: "Lançar despesca", texto: "Escolha o viveiro, informe os kg e, se souber, quantos peixes saíram. A parcial deixa peixes no viveiro; a total esvazia o viveiro." },
      { alvo: t("lista"), titulo: "Despescas do período", texto: "O que já saiu de cada viveiro, com o peso médio do peixe." },
    ],
    duvidas: [
      { pergunta: "Por que a despesca foi recusada?", resposta: "O lote está em carência de medicamento. A despesca para venda só passa depois do fim da carência, que aparece em Sanidade e no lote." },
      { pergunta: "O que a despesca total faz?", resposta: "Esvazia o viveiro e, se era o último viveiro do lote, encerra o lote. O custo do kg do lote fecha com os kg despescados." },
    ],
  },
  {
    tela: "/pontos-de-venda",
    nome: "Pontos de venda",
    permissao: "estoque.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Pontos de venda", texto: "Piscicultura, peixaria, feira: o estoque de peixe de cada ponto." },
      { alvo: lancamento("Novo ponto"), permissao: "estoque.editar", titulo: "Novo ponto", texto: "Cadastre o ponto. Se for outra empresa sua, a entrada na loja é automática." },
    ],
  },
  {
    tela: "/pontos-de-venda/[id]",
    nome: "Ponto de venda",
    permissao: "estoque.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Ponto de venda", texto: "O estoque e os movimentos deste ponto." },
      { alvo: lancamento("Lançar contagem"), permissao: "estoque.editar", titulo: "Contagem", texto: "Informe a contagem física para acertar o saldo." },
    ],
  },
  {
    tela: "/pontos-de-venda/transferencias",
    nome: "Transferências",
    permissao: "estoque.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Transferências", texto: "Peixe que sai da piscicultura para os pontos de venda, em kg, com o frete." },
      { alvo: lancamento("Nova transferência"), permissao: "estoque.editar", titulo: "Nova transferência", texto: "Escolha o ponto e as quantidades; o estoque sai da piscicultura e fica a caminho até o ponto confirmar." },
    ],
  },
  {
    tela: "/racao",
    nome: "Estoque de ração",
    permissao: "racao.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Estoque de ração", texto: "Cada compra de ração é uma entrada numerada (R-1, R-2…) com lote de fabricação e validade. O trato usa primeiro a que vence primeiro (FEFO)." },
      { alvo: lancamento("Entrada de ração"), permissao: "racao.editar", titulo: "Entrada de ração", texto: "Lance a compra em sacos ou kg, com lote, validade, fornecedor e valor. O custo da entrada é o que vai para o custo do lote." },
    ],
  },
  {
    tela: "/contatos",
    nome: "Clientes e fornecedores",
    permissao: "contatos.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Clientes e fornecedores", texto: "Documento e endereço completos são necessários para nota e cobrança." },
      { alvo: t("busca"), titulo: "Busca", texto: "Procure por nome, documento ou cidade." },
      { alvo: t("novo"), permissao: "contatos.editar", titulo: "Novo", texto: "Cadastre o cliente ou fornecedor. Produtor rural pessoa física usa CPF com inscrição estadual." },
      { alvo: t("lista"), titulo: "Editar", texto: "Clique numa linha para editar e escolher a tabela de preço do cliente." },
    ],
  },
  {
    tela: "/produtos",
    nome: "Produtos de venda",
    permissao: "produtos.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Produtos de venda", texto: "O que a piscicultura vende: peixe por kg ou por caixa, alevinos e outros itens. Só estes aparecem na tabela de preços, nas vendas e nas notas." },
      { alvo: t("novo"), permissao: "produtos.editar", titulo: "Novo", texto: "Cadastre o produto com unidade, tipo e preço de venda." },
      { alvo: t("lista"), titulo: "Movimentar", texto: "Clique numa linha para editar ou lançar entrada, saída e ajuste de estoque." },
    ],
    duvidas: [
      { pergunta: "Onde cadastro ração, calcário ou medicamento?", resposta: "Em Insumos da piscicultura. Insumo não pede preço de venda." },
      { pergunta: "Como crio o produto de peixe?", resposta: "Ele nasce da classe de peixe (em Piscicultura): cada classe vendável ganha o produto por kg e a caixa de 20 kg." },
    ],
  },
  {
    tela: "/insumos",
    nome: "Insumos da piscicultura",
    permissao: "produtos.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Insumos da piscicultura", texto: "O que a piscicultura compra e consome: ração, ingredientes, alevinos, embalagens, gelo e medicamentos." },
      { alvo: t("novo"), permissao: "produtos.editar", titulo: "Novo insumo", texto: "Cadastre com unidade e tipo. Não precisa de preço de venda." },
      { alvo: t("lista"), titulo: "Movimentar", texto: "Clique numa linha para editar ou lançar entrada, saída e ajuste de estoque." },
    ],
    duvidas: [
      { pergunta: "E se eu vender um insumo?", resposta: "Abra o insumo e marque “Vendo este produto”. Ele passa para Produtos de venda e ganha preço." },
      { pergunta: "Onde ficam as fórmulas de ração?", resposta: "Em Estoque > Ração e insumos: fórmulas, ordens de produção e custo da ração." },
    ],
  },
  {
    tela: "/tabelas-de-preco",
    nome: "Tabelas de preço",
    permissao: "vendas.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Tabelas de preço", texto: "A tabela padrão vale para todos; crie outras (atacado, varejo) e ligue cada cliente à sua." },
      { alvo: t("novo"), permissao: "vendas.precos", titulo: "Nova tabela", texto: "Preço próprio ou um ajuste em % sobre a padrão." },
    ],
  },
  {
    tela: "/categorias",
    nome: "Categorias",
    permissao: "categorias.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Categorias", texto: "O plano de categorias de entradas e saídas. É ele que vira o DRE." },
      { alvo: t("novo"), permissao: "categorias.editar", titulo: "Nova categoria", texto: "Crie dentro do grupo certo para cair na linha certa do DRE." },
    ],
  },
  {
    tela: "/centros-de-custo",
    nome: "Centros de custo",
    permissao: "centros-de-custo.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Centros de custo", texto: "Onde cada gasto cai. Setores, viveiros e lotes ganham o seu sozinhos e viram o custo por lote." },
      { alvo: t("novo"), permissao: "centros-de-custo.editar", titulo: "Novo", texto: "Crie centros para o que não é lote, como o barco, a fábrica de ração ou o administrativo." },
    ],
  },
  {
    tela: "/planejamento",
    nome: "Planejamento",
    permissao: "planejamento.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Planejamento", texto: "Quando povoar, transferir e renovar cada lote, pelo manejo da sua piscicultura." },
      { alvo: cartao("Próximos passos"), titulo: "Próximos passos", texto: "O que fazer nas próximas semanas: povoamentos, transferências e despescas." },
      { alvo: cartao("Linha do tempo dos viveiros"), titulo: "Linha do tempo", texto: "Cada viveiro ao longo do tempo, com os lotes e o vazio sanitário." },
      { alvo: t("acoes"), permissao: "planejamento.editar", titulo: "Parâmetros e viabilidade", texto: "Ajuste os prazos do seu manejo e veja a viabilidade dos próximos lotes." },
    ],
  },
  {
    tela: "/previsoes",
    nome: "Previsões e alertas",
    permissao: "planejamento.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Previsões e alertas", texto: "Contas sobre o que a piscicultura já lança. Nada aqui muda sozinho: são sugestões com o motivo à vista." },
      { alvo: cartao("Sinais fora do normal"), titulo: "Sinais fora do normal", texto: "Lote cuja ração, mortalidade ou qualidade da água saiu da tendência dos últimos dias. Dois sinais juntos viram crítico." },
      { alvo: cartao("Biomassa prevista"), titulo: "Biomassa prevista", texto: "Os kg de peixe das próximas semanas pela curva da espécie, no ritmo que cada lote mostrou nas biometrias." },
      { alvo: cartao("Ração e insumos"), titulo: "Ração", texto: "Quantos dias o estoque dura no consumo atual, para comprar antes de faltar." },
    ],
    duvidas: [
      { pergunta: "Como a biomassa é prevista?", resposta: "O Balbina compara o peso das biometrias do lote com a curva da espécie e segue a curva nesse ritmo; os peixes caem pela mortalidade recente." },
      { pergunta: "Quando vale despescar?", resposta: "Quando o peso alvo chega ou quando a ração da semana passa a custar mais do que o peixe ganha de valor. A previsão mostra a data provável do peso alvo de cada lote." },
    ],
  },
  {
    tela: "/planejamento/parametros",
    nome: "Parâmetros do planejamento",
    permissao: "planejamento.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Parâmetros", texto: "Os prazos do seu manejo comandam a previsão; os preços e custos alimentam a viabilidade." },
      { alvo: cartao("Fases do lote"), titulo: "Fases", texto: "Quantas semanas o lote fica na alevinagem e na recria, e com quantas semanas de cultivo vai à despesca." },
    ],
  },
  {
    tela: "/planejamento/viabilidade",
    nome: "Viabilidade",
    permissao: "planejamento.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Viabilidade", texto: "Quanto cada lote futuro vai custar e render, do povoamento à despesca." },
      { alvo: cartao("Caixa acumulado"), titulo: "Caixa", texto: "O caixa da piscicultura mês a mês no horizonte do plano." },
    ],
  },
  {
    tela: "/custo-do-kg",
    nome: "Custo do kg",
    permissao: "custo-do-kg.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Custo do kg", texto: "Quanto custa cada kg de peixe produzido, lote a lote, com o que foi lançado no financeiro." },
      { alvo: t("lista"), titulo: "Por lote", texto: "Ração, alevinos, mão de obra, energia e despesas rateadas, sobre o ganho de biomassa. Compare com o preço de venda do kg." },
      { alvo: lancamento("Recalcular"), permissao: "custo-do-kg.editar", titulo: "Recalcular", texto: "Recalcule depois de lançar despesas atrasadas do mês." },
    ],
    duvidas: [
      { pergunta: "Por que o custo mudou de um mês para o outro?", resposta: "Ele usa as despesas pela competência. Uma conta lançada depois muda o custo daquele mês." },
      { pergunta: "Como o ganho de peso é medido?", resposta: "Biomassa no fim do mês menos a do começo, mais o que foi despescado. A biomassa vem das biometrias e da curva, então biometrias em dia deixam o custo mais preciso." },
    ],
  },
  {
    tela: "/configuracoes",
    nome: "Configurações gerais",
    permissao: "configuracoes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Configurações", texto: "Dados da empresa, limites da qualidade da água, fuso horário e atalhos para os cadastros." },
      { alvo: cartao("Qualidade da água no apontamento"), titulo: "Qualidade da água", texto: "Escolha se o apontamento pede oxigênio, temperatura, pH, transparência e amônia. Com eles o sistema avisa quando a água sai da faixa." },
      { alvo: cartao("Primeiros passos"), permissao: "master", titulo: "Primeiros passos", texto: "Retome o assistente de configuração quando quiser." },
    ],
  },
  {
    tela: "/configuracoes/usuarios",
    nome: "Usuários e cargos",
    permissao: "master",
    passos: [
      { alvo: t("titulo"), titulo: "Usuários e cargos", texto: "Quem acessa a empresa e o que cada um pode fazer. Só o master vê esta tela." },
      { alvo: t("filtros"), titulo: "Três partes", texto: "Usuários (quem entra), Cargos (os prontos e os criados pela empresa) e Quem pode o quê (a tabela de cada cargo por módulo)." },
      { alvo: t("novo"), titulo: "Novo usuário", texto: "Crie usuário e senha para quem não tem e-mail ou convide por e-mail. O cargo decide as telas e os tutoriais que a pessoa vê." },
      { alvo: t("lista"), titulo: "Editar acesso", texto: "Clique na pessoa para trocar o cargo, marcar permissões extras, bloquear ou dar senha nova." },
    ],
  },
  {
    tela: "/configuracoes/importar",
    nome: "Importar dados",
    permissao: "configuracoes.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Importar", texto: "Traga cadastros e lançamentos de outro sistema. Rodar de novo atualiza, sem duplicar." },
      { alvo: cartao("Planilha modelo do Balbina"), titulo: "Planilha modelo", texto: "Baixe, preencha e envie: aparece uma prévia linha a linha antes de gravar." },
    ],
  },
  {
    tela: "/configuracoes/api",
    nome: "API",
    permissao: "master",
    passos: [
      { alvo: t("titulo"), titulo: "API", texto: "Chaves para outros sistemas lerem e lançarem dados desta empresa." },
      { alvo: cartao("Chaves de API"), titulo: "Chaves", texto: "Cada chave vale por 7 dias. Guarde-a na hora: ela não aparece de novo." },
    ],
  },
  {
    tela: "/historico",
    nome: "Histórico de alterações",
    permissao: "historico.ver",
    passos: [
      { alvo: t("titulo"), titulo: "Histórico", texto: "Toda inclusão, edição e exclusão, com quem fez e quando. Ninguém consegue apagar." },
      { alvo: t("filtros"), titulo: "Filtrar", texto: "Por tipo de ação." },
      { alvo: t("lista"), titulo: "Registros", texto: "Abra um registro para ver o antes e o depois." },
    ],
  },
  {
    tela: "/seguranca",
    nome: "Segurança da conta",
    passos: [
      { alvo: t("titulo"), titulo: "Segurança", texto: "A verificação em duas etapas protege a sua conta mesmo se alguém descobrir a senha." },
      { alvo: cartao("Dispositivos confiáveis"), titulo: "Dispositivos", texto: "Os aparelhos que não pedem o código. Remova os que você não usa mais." },
    ],
  },
  {
    tela: "/campo",
    nome: "App de campo",
    permissao: "apontamentos.ver",
    passos: [
      { alvo: t("sinal"), titulo: "App de campo", texto: "Feito para o viveiro. Depois de aberto uma vez com sinal, funciona sem internet: o que você lança fica guardado no celular e vai sozinho quando o sinal voltar. Aqui você vê se está online e quantos envios esperam." },
      { alvo: t("chat"), titulo: "Chat", texto: "Escreva ou fale o que fez, como \"coloquei 2 sacos de ração no tanque 2\". O Balbina monta o lançamento num cartão: confira e confirme. Também responde dúvidas de manejo do tambaqui." },
      { alvo: t("abas-campo"), titulo: "Módulos", texto: "Viveiros: a ficha de cada viveiro, abrir lote e despesca. Ração: o trato do turno e os insumos. Biometria: pesagem e curva de crescimento. Envios: a fila e o que já chegou ao servidor." },
    ],
    duvidas: [
      { pergunta: "Como coloco na tela inicial do celular?", resposta: "No iPhone: Compartilhar > Adicionar à Tela de Início. No Android: menu do Chrome > Instalar app." },
      { pergunta: "Lancei sem sinal. Foi?", resposta: "Fica na aba Envios e vai sozinho quando o sinal voltar. Não limpe os dados do navegador nem feche a sessão antes disso." },
      { pergunta: "O chat funciona sem internet?", resposta: "Sim, de um jeito mais simples: a frase do lançamento vira cartão no próprio celular e as dúvidas são respondidas pela base de manejo guardada nele. Com sinal, a IA entende frases mais livres." },
      { pergunta: "Quanto de ração dar?", resposta: "A aba Ração mostra a ração de cada viveiro pela tabela de arraçoamento da espécie e o peso estimado do lote. Faça a biometria em dia para a sugestão seguir o peso real." },
    ],
  },
];

// Tutorial da tela aberta. Rota exata ganha da rota com [id].
export function tutorialDaTela(caminho: string, lista: Tutorial[] = TUTORIAIS): Tutorial | undefined {
  const partes = caminho.replace(/\/+$/, "").split("/").filter(Boolean);
  const exato = lista.find((tu) => tu.tela === `/${partes.join("/")}`);
  if (exato) return exato;
  return lista.find((tu) => {
    const molde = tu.tela.split("/").filter(Boolean);
    return molde.length === partes.length && molde.every((m, i) => m === partes[i] || /^\[.+\]$/.test(m));
  });
}

// `permitidas`: as chaves que a pessoa tem entre as usadas nos tutoriais (ver chavesDosTutoriais).
export function podeVerTutorial(tutorial: Tutorial, permitidas: ReadonlySet<string>): boolean {
  return !tutorial.permissao || permitidas.has(tutorial.permissao);
}

export function passosPermitidos(tutorial: Tutorial, permitidas: ReadonlySet<string>): Passo[] {
  return tutorial.passos.filter((p) => !p.permissao || permitidas.has(p.permissao));
}

// Todas as chaves citadas, para o servidor dizer quais a pessoa tem sem mandar o acesso inteiro ao navegador.
export function chavesDosTutoriais(): string[] {
  const chaves = [TOUR_GERAL, ...TUTORIAIS].flatMap((tu) => [tu.permissao, ...tu.passos.map((p) => p.permissao)]);
  return [...new Set(chaves.filter((c): c is string => Boolean(c)))].sort();
}

export type DuvidaEncontrada = Duvida & { tela: string; nome: string };

// Busca nas dúvidas das telas que a pessoa pode ver: cada palavra precisa aparecer na pergunta, na resposta ou no nome da tela.
export function buscarDuvidas(termo: string, permitidas: ReadonlySet<string>, lista: Tutorial[] = [TOUR_GERAL, ...TUTORIAIS]): DuvidaEncontrada[] {
  const palavras = semAcento(termo).split(/\s+/).filter((p) => p.length > 1);
  if (palavras.length === 0) return [];
  return lista
    .filter((tu) => podeVerTutorial(tu, permitidas))
    .flatMap((tu) => (tu.duvidas ?? []).map((d) => ({ ...d, tela: tu.tela, nome: tu.nome })))
    .filter((d) => {
      const texto = semAcento(`${d.pergunta} ${d.resposta} ${d.nome}`);
      return palavras.every((p) => texto.includes(p));
    });
}

// Tela especial guardada quando a pessoa desliga o tutorial automático.
export const TUTORIAIS_DESLIGADOS = "*";
