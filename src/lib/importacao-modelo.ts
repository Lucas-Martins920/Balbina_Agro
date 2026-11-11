// Planilha modelo do Balbina: quem não usa outro sistema baixa o modelo, preenche e envia.
// Este arquivo define as abas e colunas do modelo, reconhece a aba e as colunas de qualquer
// planilha parecida (nomes com ou sem acento, nomes comuns de outros sistemas), valida linha
// por linha e monta o pacote de importação (public.importar_pacote), que é idempotente.
import { cnpjValido, cpfValido } from "./documento.ts";
import { semAcento } from "./formato.ts";
import {
  grupoPeloNome, type CategoriaImportada, type ContaImportada, type ContatoImportado, type Grupo, type Pacote,
  type FinalidadeViveiro, type ProdutoImportado, type SistemaViveiro, type TipoConta, type TipoContato, type TipoProduto, type TituloImportado, type TransferenciaImportada,
} from "./importacao.ts";

export type TipoModelo = "viveiros" | "lotes" | "estoque" | "lancamentos" | "contatos" | "categorias" | "contas" | "transferencias" | "produtos";
// comecar: o que a piscicultura precisa para começar; cadastro: base para o resto; opcional: histórico, só se quiser
export type Etapa = "comecar" | "cadastro" | "opcional";

export type ColunaModelo = {
  campo: string;
  titulo: string;
  obrigatoria?: boolean;
  ajuda: string;
  // outros nomes aceitos no cabeçalho (já sem acento, minúsculos e com _ no lugar de espaço)
  nomes?: string[];
  opcoes?: string[];
  largura?: number;
};

export type Modelo = {
  tipo: TipoModelo;
  etapa: Etapa;
  aba: string;
  descricao: string;
  // nomes de aba reconhecidos (normalizados)
  nomesAba: string[];
  // precisa do financeiro no plano da empresa
  financeiro: boolean;
  colunas: ColunaModelo[];
  exemplos: string[][];
};

export const MODELOS: Modelo[] = [
  {
    tipo: "viveiros", etapa: "comecar", aba: "Viveiros", financeiro: false,
    descricao: "Setores e viveiros da piscicultura. Setor que não existir é criado; viveiro que já existe (mesmo setor e nome) é atualizado.",
    nomesAba: ["viveiros", "viveiros_e_setores", "setores_e_viveiros", "tanques", "viveiros_e_tanques", "instalacoes"],
    colunas: [
      { campo: "setor", titulo: "Setor", obrigatoria: true, ajuda: "Setor ou sítio onde fica o viveiro. Piscicultura com um só lugar: repita o mesmo nome.",
        nomes: ["setor", "sitio", "piscicultura", "fazenda", "unidade", "local"], largura: 16 },
      { campo: "nome", titulo: "Viveiro", obrigatoria: true, ajuda: "Nome do viveiro ou tanque (ex.: Viveiro 1, Tanque-rede 3).",
        nomes: ["viveiro", "nome", "nome_do_viveiro", "tanque"], largura: 16 },
      { campo: "finalidade", titulo: "Finalidade", obrigatoria: true, ajuda: "Alevinagem, Recria, Alevinagem e recria ou Engorda.",
        opcoes: ["Alevinagem", "Recria", "Alevinagem e recria", "Engorda"], nomes: ["finalidade", "fase", "uso", "tipo"], largura: 18 },
      { campo: "sistema", titulo: "Sistema", ajuda: "Viveiro escavado, Barragem, Tanque-rede, Alvenaria, Lona ou Outro. Vazio vira viveiro escavado.",
        opcoes: ["Viveiro escavado", "Barragem", "Tanque-rede", "Alvenaria", "Lona", "Outro"],
        nomes: ["sistema", "sistema_de_cultivo", "tipo_de_viveiro", "estrutura"], largura: 16 },
      { campo: "capacidade", titulo: "Capacidade de peixes", obrigatoria: true, ajuda: "Quantos peixes o viveiro comporta.",
        nomes: ["capacidade_de_peixes", "capacidade", "capacidade_peixes", "lotacao", "peixes"], largura: 12 },
      { campo: "area", titulo: "Área (m²)", ajuda: "Opcional: espelho d'água em metros quadrados. Dá a densidade em peixes por m².",
        nomes: ["area_m2", "area_m", "area", "espelho_d_agua", "espelho_dagua", "lamina_d_agua"], largura: 10 },
      { campo: "volume", titulo: "Volume (m³)", ajuda: "Opcional: volume de água em metros cúbicos. Dá a densidade em kg por m³, a medida do tanque-rede.",
        nomes: ["volume_m3", "volume_m", "volume"], largura: 10 },
      { campo: "profundidade", titulo: "Profundidade (m)", ajuda: "Opcional: profundidade média, em metros.",
        nomes: ["profundidade_m", "profundidade", "profundidade_media"], largura: 10 },
      { campo: "aeracao", titulo: "Aeração", ajuda: "Sim ou Não: o viveiro tem aerador.", opcoes: ["Sim", "Não"], nomes: ["aeracao", "aerador", "aeradores"], largura: 10 },
    ],
    exemplos: [
      ["Setor Sede", "Viveiro 1", "Engorda", "Viveiro escavado", "10.000", "10.000", "13.000", "1,3", "Sim"],
      ["Setor Sede", "Berçário", "Alevinagem e recria", "Viveiro escavado", "60.000", "1.000", "1.200", "1,2", "Não"],
    ],
  },
  {
    tipo: "lotes", etapa: "comecar", aba: "Lotes", financeiro: false,
    descricao: "Lotes de peixes que estão na piscicultura hoje. Lote com o mesmo código não entra de novo.",
    nomesAba: ["lotes", "lotes_de_peixes", "povoamentos", "peixes"],
    colunas: [
      { campo: "codigo", titulo: "Código do lote", obrigatoria: true, ajuda: "Como o lote é chamado na piscicultura (ex.: L01, Lote 23).",
        nomes: ["codigo_do_lote", "codigo", "lote", "nome_do_lote", "identificacao"], largura: 12 },
      { campo: "especie", titulo: "Espécie", obrigatoria: true, ajuda: "Ex.: Tambaqui, Tambacu, Pirarucu, Tilápia-do-nilo. Espécie que não existir é cadastrada.",
        nomes: ["especie", "peixe", "variedade"], largura: 16 },
      { campo: "povoamento", titulo: "Data de povoamento", obrigatoria: true,
        ajuda: "Dia em que o lote foi povoado neste viveiro (dd/mm/aaaa); os dias de cultivo contam daqui. Lote que já está na água há tempo: use a data de hoje, com os peixes e o peso de hoje.",
        nomes: ["data_de_povoamento", "povoamento", "data_povoamento", "data_entrada", "entrada"], largura: 12 },
      { campo: "setor", titulo: "Setor", ajuda: "Opcional: só precisa se houver viveiros com o mesmo nome em setores diferentes.",
        nomes: ["setor", "sitio", "piscicultura"], largura: 14 },
      { campo: "viveiro", titulo: "Viveiro", obrigatoria: true, ajuda: "Viveiro onde o lote está (da aba Viveiros ou já cadastrado).",
        nomes: ["viveiro", "viveiro"], largura: 14 },
      { campo: "qtd", titulo: "Peixes povoados", obrigatoria: true, ajuda: "Quantos peixes estão no viveiro na data de povoamento.",
        nomes: ["peixes_povoados", "peixes", "quantidade", "qtd", "qtd_peixes", "peixes_hoje", "quantidade_de_peixes", "alevinos"], largura: 12 },
      { campo: "peso", titulo: "Peso médio (g)", obrigatoria: true,
        ajuda: "Peso médio de um peixe na data de povoamento, em gramas (ex.: 1 para alevino, 150 para juvenil). O peso põe o lote no ponto certo da curva.",
        nomes: ["peso_medio_g", "peso_medio", "peso_inicial_g", "peso_inicial", "peso_g", "peso"], largura: 10 },
      { campo: "peso_alvo", titulo: "Peso de despesca (g)", ajuda: "Opcional: peso médio que o lote deve ter na despesca (ex.: 2.500).",
        nomes: ["peso_de_despesca_g", "peso_de_despesca", "peso_alvo_g", "peso_alvo", "peso_final"], largura: 10 },
      { campo: "custo", titulo: "Custo dos peixes", ajuda: "Opcional: quanto custaram os alevinos ou juvenis, em reais (entra no custo do kg).",
        nomes: ["custo_dos_peixes", "custo_dos_alevinos", "custo", "valor", "custo_aquisicao"], largura: 14 },
      { campo: "fornecedor", titulo: "Fornecedor", ajuda: "Opcional: de quem comprou os peixes.", nomes: ["fornecedor", "alevinocultura", "laboratorio", "origem"], largura: 18 },
    ],
    exemplos: [
      ["L01", "Tambaqui", "01/03/2026", "Setor Sede", "Viveiro 1", "9.500", "150", "2.500", "12.000,00", ""],
    ],
  },
  {
    tipo: "estoque", etapa: "comecar", aba: "Estoque inicial", financeiro: false,
    descricao: "Quanto tem hoje de ração, insumos, alevinos, embalagens e medicamentos. O saldo do produto passa a ser a quantidade da planilha.",
    nomesAba: ["estoque_inicial", "estoque", "saldo_de_estoque", "saldos_de_estoque", "inventario", "contagem"],
    colunas: [
      { campo: "produto", titulo: "Produto", obrigatoria: true, ajuda: "Nome igual ao da aba Produtos ou ao cadastro de Produtos e insumos.",
        nomes: ["produto", "item", "insumo", "descricao", "nome_do_produto"], largura: 26 },
      { campo: "quantidade", titulo: "Quantidade", obrigatoria: true, ajuda: "Na unidade do produto (kg, sc, un, dose…).",
        nomes: ["quantidade", "qtd", "saldo_atual", "estoque", "quantidade_em_estoque", "estoque_atual"], largura: 12 },
      { campo: "data", titulo: "Data do saldo", obrigatoria: true, ajuda: "Dia da contagem (dd/mm/aaaa), hoje ou antes.",
        nomes: ["data_do_saldo", "data", "data_da_contagem", "contado_em"], largura: 12 },
      { campo: "custo", titulo: "Custo total", ajuda: "Opcional: quanto vale esse estoque, em reais. Vira o custo médio do produto.",
        nomes: ["custo_total", "custo", "valor_total", "valor"], largura: 14 },
    ],
    exemplos: [["Ração extrusada 32% PB 6 mm", "1.000", "01/03/2026", "3.200,00"]],
  },
  {
    tipo: "produtos", etapa: "cadastro", aba: "Produtos", financeiro: false,
    descricao: "Ração, insumos, alevinos, embalagens, vacinas e medicamentos. O peixe de venda não entra aqui: vem das classes de peixe.",
    nomesAba: ["produtos", "produtos_e_insumos", "insumos", "itens", "materiais"],
    colunas: [
      { campo: "nome", titulo: "Nome", obrigatoria: true, ajuda: "Nome do produto.", nomes: ["nome", "produto", "descricao", "item"], largura: 28 },
      { campo: "tipo", titulo: "Tipo", obrigatoria: true, ajuda: "Ração, Insumo de ração, Alevino, Embalagem, Medicamento, Vacina ou Outro.",
        opcoes: ["Ração", "Insumo de ração", "Alevino", "Embalagem", "Medicamento", "Vacina", "Outro"], nomes: ["tipo", "grupo", "categoria"], largura: 16 },
      { campo: "unidade", titulo: "Unidade", obrigatoria: true, ajuda: "kg, t, sc, un, l, dose…", nomes: ["unidade", "un", "und", "unid", "medida"], largura: 10 },
      { campo: "sku", titulo: "Código", ajuda: "Opcional: código interno.", nomes: ["codigo", "sku", "cod", "referencia"], largura: 12 },
      { campo: "ncm", titulo: "NCM", ajuda: "Opcional: para nota fiscal.", nomes: ["ncm"], largura: 12 },
      { campo: "estoque_minimo", titulo: "Estoque mínimo", ajuda: "Opcional: avisa quando o estoque ficar abaixo.",
        nomes: ["estoque_minimo", "minimo", "estoque_min"], largura: 12 },
      { campo: "observacoes", titulo: "Observações", ajuda: "Opcional.", nomes: ["observacoes", "observacao", "obs"], largura: 26 },
    ],
    exemplos: [
      ["Ração extrusada 32% PB 6 mm", "Ração", "kg", "RAC32", "2309.90.90", "1.000", ""],
      ["Calcário agrícola", "Outro", "kg", "", "", "", "Para a calagem dos viveiros"],
    ],
  },
  {
    tipo: "contatos", etapa: "cadastro", aba: "Clientes e fornecedores", financeiro: false,
    descricao: "Cadastro de clientes, fornecedores, funcionários e sócios. Quem já existe (mesmo CPF/CNPJ ou mesmo nome) é completado, não duplicado.",
    nomesAba: ["clientes_e_fornecedores", "clientes_fornecedores", "contatos", "clientes", "fornecedores", "cadastro", "cadastros", "pessoas"],
    colunas: [
      { campo: "nome", titulo: "Nome", obrigatoria: true, ajuda: "Nome ou razão social.",
        nomes: ["nome", "razao_social", "nome_razao_social", "nome_ou_razao_social", "cliente", "fornecedor", "nome_fantasia"], largura: 30 },
      { campo: "tipo", titulo: "Tipo", ajuda: "Cliente, Fornecedor, Cliente e fornecedor, Funcionário ou Sócio. Vazio vira cliente.",
        opcoes: ["Cliente", "Fornecedor", "Cliente e fornecedor", "Funcionário", "Sócio"], nomes: ["tipo", "tipo_de_cadastro", "categoria", "perfil"], largura: 18 },
      { campo: "cpf_cnpj", titulo: "CPF ou CNPJ", ajuda: "Com ou sem pontos.",
        nomes: ["cpf_ou_cnpj", "cpf_cnpj", "cnpj_cpf", "cpf", "cnpj", "documento", "cnpj_ou_cpf"], largura: 18 },
      { campo: "inscricao_estadual", titulo: "Inscrição estadual", ajuda: "Opcional. Produtor rural costuma ter.",
        nomes: ["inscricao_estadual", "ie", "insc_estadual"], largura: 16 },
      { campo: "produtor_rural", titulo: "Produtor rural", ajuda: "Sim ou Não.", opcoes: ["Sim", "Não"], nomes: ["produtor_rural", "produtor"], largura: 12 },
      { campo: "telefone", titulo: "Telefone", ajuda: "Opcional.", nomes: ["telefone", "fone", "celular", "telefone_1", "whatsapp", "contato"], largura: 16 },
      { campo: "email", titulo: "E-mail", ajuda: "Opcional.", nomes: ["e_mail", "email"], largura: 24 },
      { campo: "logradouro", titulo: "Endereço", ajuda: "Rua, avenida, estrada ou ramal.", nomes: ["endereco", "logradouro", "rua", "end"], largura: 26 },
      { campo: "numero", titulo: "Número", ajuda: "Opcional.", nomes: ["numero", "n", "no", "num"], largura: 8 },
      { campo: "bairro", titulo: "Bairro", ajuda: "Opcional.", nomes: ["bairro"], largura: 16 },
      { campo: "complemento", titulo: "Complemento", ajuda: "Opcional.", nomes: ["complemento", "referencia", "ref"], largura: 16 },
      { campo: "cep", titulo: "CEP", ajuda: "Opcional.", nomes: ["cep"], largura: 10 },
      { campo: "cidade", titulo: "Cidade", ajuda: "Opcional.", nomes: ["cidade", "municipio"], largura: 18 },
      { campo: "uf", titulo: "UF", ajuda: "Sigla do estado, como AM.", nomes: ["uf", "estado"], largura: 6 },
      { campo: "codigo", titulo: "Código", ajuda: "Opcional: código do cadastro no seu controle.", nomes: ["codigo", "cod", "id", "codigo_lc"], largura: 10 },
    ],
    exemplos: [
      ["Mercado Central", "Cliente", "11.222.333/0001-81", "", "Não", "(92) 99999-0000", "compras@mercado.com", "Av. Brasil", "100", "Centro", "", "69000-000", "Manaus", "AM", ""],
      ["Cerealista Norte", "Fornecedor", "", "", "Não", "", "", "", "", "", "", "", "Manaus", "AM", ""],
    ],
  },
  {
    tipo: "contas", etapa: "cadastro", aba: "Contas", financeiro: true,
    descricao: "Contas bancárias, caixas, aplicações e cartões. Conta que já existe com o mesmo nome é completada.",
    nomesAba: ["contas", "contas_e_caixas", "contas_bancarias", "bancos", "caixas", "contas_financeiras"],
    colunas: [
      { campo: "nome", titulo: "Nome", obrigatoria: true, ajuda: "Como a conta aparece no Balbina (ex.: Sicredi, Caixa da piscicultura).",
        nomes: ["nome", "conta", "nome_da_conta", "descricao"], largura: 24 },
      { campo: "tipo", titulo: "Tipo", ajuda: "Conta corrente, Poupança, Caixa, Aplicação ou Cartão de crédito. Vazio vira conta corrente.",
        opcoes: ["Conta corrente", "Poupança", "Caixa", "Aplicação", "Cartão de crédito"], nomes: ["tipo", "tipo_de_conta"], largura: 16 },
      { campo: "banco", titulo: "Código do banco", ajuda: "Opcional: 3 dígitos (748 Sicredi, 001 Banco do Brasil).",
        nomes: ["codigo_do_banco", "banco", "cod_banco", "banco_codigo"], largura: 10 },
      { campo: "agencia", titulo: "Agência", ajuda: "Opcional.", nomes: ["agencia"], largura: 10 },
      { campo: "numero", titulo: "Número da conta", ajuda: "Opcional, com o dígito.", nomes: ["numero_da_conta", "conta_corrente", "numero", "n_conta"], largura: 14 },
      { campo: "saldo", titulo: "Saldo inicial", ajuda: "Saldo da conta no dia da coluna seguinte. Negativo com sinal de menos.",
        nomes: ["saldo_inicial", "saldo", "saldo_de_abertura"], largura: 14 },
      { campo: "saldo_data", titulo: "Data do saldo", ajuda: "Dia do saldo inicial (dd/mm/aaaa). Lançamentos antes desse dia não mexem no saldo.",
        nomes: ["data_do_saldo", "data_saldo", "saldo_em", "data_saldo_inicial"], largura: 12 },
    ],
    exemplos: [
      ["Caixa da piscicultura", "Caixa", "", "", "", "500,00", "01/03/2026"],
      ["Sicredi", "Conta corrente", "748", "0101", "12345-6", "10.000,00", "01/03/2026"],
    ],
  },
  {
    tipo: "categorias", etapa: "cadastro", aba: "Categorias", financeiro: true,
    descricao: "Plano de categorias de entradas e saídas, que monta a DRE. Categoria que já existe com o mesmo nome não duplica.",
    nomesAba: ["categorias", "plano_de_categorias", "plano_de_contas"],
    colunas: [
      { campo: "nome", titulo: "Nome", obrigatoria: true, ajuda: "Nome da categoria.", nomes: ["nome", "categoria", "descricao"], largura: 28 },
      { campo: "tipo", titulo: "Tipo", obrigatoria: true, ajuda: "Entrada ou Saída.", opcoes: ["Entrada", "Saída"],
        nomes: ["tipo", "sentido", "natureza", "entrada_saida", "entrada_ou_saida"], largura: 10 },
      { campo: "grupo", titulo: "Grupo da DRE", ajuda: "Receita operacional, Custo operacional, Despesa operacional, Investimento ou Financiamento.",
        opcoes: ["Receita operacional", "Custo operacional", "Despesa operacional", "Investimento", "Financiamento"],
        nomes: ["grupo_da_dre", "grupo", "grupo_dre", "classificacao"], largura: 22 },
      { campo: "pai", titulo: "Categoria pai", ajuda: "Opcional: categoria acima desta (ex.: Milho dentro de Insumos).",
        nomes: ["categoria_pai", "pai", "categoria_superior", "subgrupo", "grupo_pai"], largura: 22 },
    ],
    exemplos: [
      ["Venda de peixe", "Entrada", "Receita operacional", ""],
      ["Ração", "Saída", "Custo operacional", "Insumos"],
    ],
  },
  {
    tipo: "lancamentos", etapa: "opcional", aba: "Lançamentos", financeiro: true,
    descricao: "Opcional: contas a pagar e a receber, inclusive as antigas, se quiser o histórico no Balbina. Se já foi pago ou recebido, preencha a data, o valor e a conta, e o lançamento entra quitado.",
    nomesAba: ["lancamentos", "contas_a_pagar_e_receber", "contas_a_pagar_e_a_receber", "contas_a_pagar", "contas_a_receber", "titulos", "financeiro",
      "pagar", "receber", "despesas", "receitas"],
    colunas: [
      { campo: "tipo", titulo: "Tipo", ajuda: "Pagar ou Receber. Vazio com valor negativo vira conta a pagar.", opcoes: ["Pagar", "Receber"],
        nomes: ["tipo", "pagar_receber", "pagar_ou_receber", "natureza", "tipo_lancamento", "tipo_de_lancamento", "operacao", "entrada_saida"], largura: 10 },
      { campo: "descricao", titulo: "Descrição", obrigatoria: true, ajuda: "O que é o lançamento.",
        nomes: ["descricao", "historico", "discriminacao", "descricao_do_lancamento", "lancamento"], largura: 30 },
      { campo: "contato", titulo: "Cliente ou fornecedor", ajuda: "Nome de quem paga ou recebe. Quem não existir é cadastrado.",
        nomes: ["cliente_ou_fornecedor", "cliente_fornecedor", "fornecedor_cliente", "contato", "cliente", "fornecedor", "favorecido", "pagador",
          "beneficiario", "nome"], largura: 26 },
      { campo: "vencimento", titulo: "Vencimento", obrigatoria: true, ajuda: "Data no formato dd/mm/aaaa.",
        nomes: ["vencimento", "data_vencimento", "data_de_vencimento", "venc", "dt_vencimento", "data"], largura: 12 },
      { campo: "valor", titulo: "Valor", obrigatoria: true, ajuda: "Valor total em reais, como 1.234,56.",
        nomes: ["valor", "valor_total", "valor_r", "valor_rs", "total", "valor_original"], largura: 12 },
      { campo: "categoria", titulo: "Categoria", ajuda: "Categoria do plano de contas. Quem não existir é criada; vazio entra como \"Importado sem categoria\".",
        nomes: ["categoria", "plano_de_contas", "classificacao", "conta_contabil"], largura: 22 },
      { campo: "centro_custo", titulo: "Centro de custo", ajuda: "Opcional: lote, viveiro ou setor.",
        nomes: ["centro_de_custo", "centro_custo", "cc", "centro"], largura: 16 },
      { campo: "competencia", titulo: "Competência", ajuda: "Opcional: mês a que se refere (mm/aaaa). Vazio usa o mês do vencimento.",
        nomes: ["competencia", "mes_competencia", "data_competencia", "mes_de_competencia"], largura: 12 },
      { campo: "referencia", titulo: "Nº do documento", ajuda: "Opcional: nota fiscal, boleto ou pedido.",
        nomes: ["n_do_documento", "numero_do_documento", "n_documento", "num_documento", "documento", "nota_fiscal", "nf", "referencia", "numero"], largura: 14 },
      { campo: "pago_em", titulo: "Pago ou recebido em", ajuda: "Opcional: data em que foi pago ou recebido. Vazio fica em aberto.",
        nomes: ["pago_ou_recebido_em", "pago_recebido_em", "data_pagamento", "data_de_pagamento", "data_do_pagamento", "data_recebimento",
          "data_de_recebimento", "pago_em", "recebido_em", "data_baixa", "data_da_baixa", "data_quitacao", "quitado_em"], largura: 14 },
      { campo: "valor_pago", titulo: "Valor pago ou recebido", ajuda: "Opcional: vazio com data preenchida usa o valor total. Menor que o total fica parcial.",
        nomes: ["valor_pago_ou_recebido", "valor_pago_recebido", "valor_pago", "valor_recebido", "valor_baixa", "valor_da_baixa", "valor_quitado"], largura: 14 },
      { campo: "conta", titulo: "Conta", ajuda: "Conta ou caixa por onde o dinheiro passou (obrigatória quando pago ou recebido).",
        nomes: ["conta", "conta_bancaria", "conta_financeira", "conta_de_pagamento", "conta_corrente", "banco", "caixa"], largura: 18 },
      { campo: "codigo", titulo: "Código", ajuda: "Opcional: identificador seu. Com código, reenviar a linha nunca duplica, mesmo se mudar o texto.",
        nomes: ["codigo", "cod", "id", "identificador", "chave"], largura: 10 },
    ],
    exemplos: [
      ["Pagar", "Ração de engorda", "Fábrica de Ração Norte", "10/03/2026", "2.500,00", "Ração", "Viveiro 1", "", "NF 1234", "10/03/2026", "", "Caixa da piscicultura", ""],
      ["Receber", "Despesca do viveiro 1", "Peixaria Rio Negro", "15/03/2026", "1.800,00", "Venda de peixe", "", "03/2026", "", "", "", "", ""],
    ],
  },
  {
    tipo: "transferencias", etapa: "opcional", aba: "Transferências", financeiro: true,
    descricao: "Dinheiro que passou de uma conta para outra da própria empresa (não é receita nem despesa).",
    nomesAba: ["transferencias", "transferencias_entre_contas"],
    colunas: [
      { campo: "data", titulo: "Data", obrigatoria: true, ajuda: "dd/mm/aaaa.", nomes: ["data", "data_transferencia"], largura: 12 },
      { campo: "origem", titulo: "Conta de origem", obrigatoria: true, ajuda: "Conta de onde o dinheiro saiu.",
        nomes: ["conta_de_origem", "conta_origem", "origem", "de", "saiu_de"], largura: 20 },
      { campo: "destino", titulo: "Conta de destino", obrigatoria: true, ajuda: "Conta para onde o dinheiro foi.",
        nomes: ["conta_de_destino", "conta_destino", "destino", "para", "entrou_em"], largura: 20 },
      { campo: "valor", titulo: "Valor", obrigatoria: true, ajuda: "Em reais.", nomes: ["valor", "valor_r", "total"], largura: 12 },
      { campo: "descricao", titulo: "Descrição", ajuda: "Opcional.", nomes: ["descricao", "historico", "observacao"], largura: 26 },
      { campo: "codigo", titulo: "Código", ajuda: "Opcional: identificador seu.", nomes: ["codigo", "cod", "id"], largura: 10 },
    ],
    exemplos: [["05/03/2026", "Sicredi", "Caixa da piscicultura", "300,00", "Troco do caixa", ""]],
  },
];

export const modelo = (tipo: TipoModelo) => MODELOS.find((m) => m.tipo === tipo)!;

// "Pago ou recebido em*" → "pago_ou_recebido_em"
export function chaveCabecalho(t: string) {
  return semAcento(t.replace(/\*/g, "")).replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Igual a app.nome_chave do banco: sem acento, minúsculo e espaços únicos.
export function nomeChave(t: string | undefined) {
  return semAcento(t ?? "").replace(/\s+/g, " ");
}

export type LinhaLida = { numero: number; valores: string[] };
export type AbaLida = { nome: string; cabecalho: string[]; linhas: LinhaLida[] };

export type Contexto = {
  financeiro: boolean;
  contas: string[];
  contatos: string[];
  categorias: string[];
  // parte da piscicultura: o que já existe na empresa
  viveiros?: { setor: string; nome: string }[];
  especies?: string[];
  produtos?: string[];
  hoje?: string;
};

export type Problema = { aba: string; linha: number; mensagem: string; ignorada: boolean };
export type ResumoAba = {
  aba: string; tipo: TipoModelo | null; modelo?: string; linhas: number; validas: number; exemplos: number;
  colunas: string[]; ignoradas: string[]; erro?: string;
};
export type Previa = {
  abas: ResumoAba[];
  problemas: Problema[];
  pagar: { qtd: number; cents: number };
  receber: { qtd: number; cents: number };
  quitados: number;
  novos: { contatos: string[]; categorias: string[]; especies: string[] };
};

const MAX_PROBLEMAS = 200;

type Mapa = Map<string, number>;

// Coluna de cada campo do modelo; cada cabeçalho serve a um campo só.
export function mapearColunas(m: Modelo, cabecalho: string[]): { mapa: Mapa; ignoradas: string[] } {
  const chaves = cabecalho.map(chaveCabecalho);
  const mapa: Mapa = new Map();
  const usadas = new Set<number>();
  // primeiro o título exato do modelo, depois os outros nomes, na ordem de preferência
  for (const passo of [0, 1]) {
    for (const c of m.colunas) {
      if (mapa.has(c.campo)) continue;
      const nomes = passo === 0 ? [chaveCabecalho(c.titulo)] : (c.nomes ?? []);
      for (const n of nomes) {
        const i = chaves.findIndex((k, j) => k === n && !usadas.has(j));
        if (i >= 0) { mapa.set(c.campo, i); usadas.add(i); break; }
      }
    }
  }
  const ignoradas = cabecalho.filter((h, i) => h.trim() && !usadas.has(i));
  return { mapa, ignoradas };
}

// Qual modelo é a aba: pelo nome da aba e, se não der, pelas colunas.
export function reconhecerAba(nome: string, cabecalho: string[]): Modelo | null {
  const n = chaveCabecalho(nome).replace(/^(balbina_)?(modelo_)?(de_)?(importacao_)?/, "");
  const pelonome = MODELOS.find((m) => m.nomesAba.includes(n));
  if (pelonome) return pelonome;
  let melhor: { m: Modelo; pontos: number } | null = null;
  for (const m of MODELOS) {
    const { mapa } = mapearColunas(m, cabecalho);
    if (m.colunas.some((c) => c.obrigatoria && !mapa.has(c.campo))) continue;
    const pontos = mapa.size + mapa.size / m.colunas.length;
    if (!melhor || pontos > melhor.pontos) melhor = { m, pontos };
  }
  return melhor?.m ?? null;
}

// Valor em centavos: 1.234,56 · 1234,56 · 1234.56 · R$ -10 · (10,00). Número do Excel vem como "1234.5".
export function lerValor(v: string): number | undefined {
  let t = v.replace(/R\$|\s/g, "");
  if (!t) return undefined;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (t.startsWith("-")) { negativo = !negativo; t = t.slice(1); }
  if (t.endsWith("-")) { negativo = !negativo; t = t.slice(0, -1); }
  if (!/^[\d.,]+$/.test(t)) return undefined;
  const virgula = t.lastIndexOf(","), ponto = t.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) t = virgula > ponto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  // só vírgula: uma é decimal (1234,56); várias são milhar (1,234,567)
  else if (virgula >= 0) t = t.indexOf(",") !== virgula ? t.replace(/,/g, "") : t.replace(",", ".");
  // só ponto: "1.234" e "1.234.567" são milhar; "12.5" é decimal
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100) * (negativo ? -1 : 1);
}

function dataValida(a: number, m: number, d: number) {
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 1990 && a <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Datas: 31/01/2026, 31-01-2026, 31.01.26, 2026-01-31 e número de série do Excel.
export function lerData(v: string): string | undefined {
  const t = v.trim();
  let a: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [a, m, d] = [Number(br[3].length === 2 ? `20${br[3]}` : br[3]), Number(br[2]), Number(br[1])];
  else if (/^\d{5}(\.\d+)?$/.test(t)) {
    // série do Excel (dias desde 30/12/1899)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000);
    [a, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return undefined;
  if (!dataValida(a, m, d)) return undefined;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Competência: 03/2026, 2026-03, ou uma data qualquer do mês.
export function lerCompetencia(v: string): string | undefined {
  const t = v.trim();
  const mesAno = t.match(/^(\d{1,2})[/.-](\d{4})$/);
  const anoMes = t.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (mesAno || anoMes) {
    const [mes, ano] = mesAno ? [Number(mesAno[1]), Number(mesAno[2])] : [Number(anoMes![2]), Number(anoMes![1])];
    return dataValida(ano, mes, 1) ? `${ano}-${String(mes).padStart(2, "0")}-01` : undefined;
  }
  const d = lerData(t);
  return d ? `${d.slice(0, 8)}01` : undefined;
}

const opcao = (v: string) => semAcento(v).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

function lerTipoLancamento(v: string): "pagar" | "receber" | undefined {
  const t = opcao(v);
  if (!t) return undefined;
  if (/^(a )?pagar$|^despesa|^saida|^debito|^d$|^pagamento|^conta a pagar|^custo/.test(t)) return "pagar";
  if (/^(a )?receber$|^receita|^entrada|^credito|^c$|^recebimento|^conta a receber|^venda/.test(t)) return "receber";
  return undefined;
}

function lerTiposContato(v: string, padrao: TipoContato): TipoContato[] | undefined {
  const t = opcao(v);
  if (!t) return [padrao];
  const tipos = new Set<TipoContato>();
  if (/cliente/.test(t)) tipos.add("cliente");
  if (/fornecedor/.test(t)) tipos.add("fornecedor");
  if (/funcionario|colaborador|empregado/.test(t)) tipos.add("funcionario");
  if (/socio/.test(t)) tipos.add("socio");
  if (/^ambos$/.test(t)) { tipos.add("cliente"); tipos.add("fornecedor"); }
  return tipos.size ? [...tipos] : undefined;
}

function lerSimNao(v: string): boolean | undefined {
  const t = opcao(v);
  if (!t) return false;
  if (/^(s|sim|x|yes|verdadeiro)$/.test(t)) return true;
  if (/^(n|nao|no|falso)$/.test(t)) return false;
  return undefined;
}

function lerSentido(v: string): "entrada" | "saida" | undefined {
  const t = opcao(v);
  if (/^(entrada|receita|credito|e|c|receber)/.test(t)) return "entrada";
  if (/^(saida|despesa|custo|debito|s|d|pagar)/.test(t)) return "saida";
  return undefined;
}

const GRUPOS: Record<string, Grupo> = {
  receita_operacional: "receita_operacional", custo_operacional: "custo_operacional", despesa_operacional: "despesa_operacional",
  investimento: "investimento", financiamento: "financiamento",
};

function lerTipoConta(v: string): TipoConta | undefined {
  const t = opcao(v);
  if (!t) return "corrente";
  if (/cartao|credito/.test(t)) return "cartao_credito";
  if (/poupanca/.test(t)) return "poupanca";
  if (/aplicacao|investimento/.test(t)) return "aplicacao";
  if (/caixa|caixinha|dinheiro|carteira/.test(t)) return "caixinha";
  if (/corrente|banco|conta/.test(t)) return "corrente";
  return undefined;
}

function lerFinalidade(v: string): FinalidadeViveiro | undefined {
  const t = opcao(v);
  const alevinagem = /alevinagem|bercario|larvicultura|^cria/.test(t);
  const recria = /recria|juvenil/.test(t);
  if (alevinagem && recria) return "alevinagem_recria";
  if (recria) return "recria";
  if (alevinagem) return "alevinagem";
  if (/engorda|terminacao|producao/.test(t)) return "engorda";
  return undefined;
}

function lerSistema(v: string): SistemaViveiro | undefined {
  const t = opcao(v);
  if (!t) return undefined;
  if (/tanque ?rede|gaiola/.test(t)) return "tanque_rede";
  if (/barragem|represa|acude/.test(t)) return "barragem";
  if (/escavado|viveiro|terra/.test(t)) return "escavado";
  if (/alvenaria|concreto|cimento/.test(t)) return "alvenaria";
  if (/lona|geomembrana/.test(t)) return "lona";
  if (/^outros?$/.test(t)) return "outro";
  return undefined;
}

// Inteiro positivo: 10.000 · 10000 · "9500,0" (número do Excel)
function lerInteiro(v: string): number | undefined {
  const c = lerValor(v);
  return c !== undefined && c > 0 && c % 100 === 0 ? c / 100 : undefined;
}

// Número positivo com até duas casas: 0,8 · 1.200 · 1,35 (peso em gramas, área, volume, profundidade)
function lerPositivo(v: string): number | undefined {
  const c = lerValor(v);
  return c !== undefined && c > 0 ? c / 100 : undefined;
}

function lerTipoProduto(v: string): TipoProduto | "peixe" | undefined {
  const t = opcao(v);
  if (/alevino|juvenil|pos larva/.test(t)) return "alevino";
  if (/^peixes?$|pescado/.test(t)) return "peixe";
  // ingrediente de fábrica de ração (milho, farelo…) vira "outro": a piscicultura compra ração pronta
  if (/insumo|ingrediente|materia prima|premix|milho|soja|farelo/.test(t)) return "outro";
  if (/racao/.test(t)) return "racao";
  if (/embalagem|caixa|bandeja|gelo/.test(t)) return "embalagem";
  if (/vacina/.test(t)) return "vacina";
  if (/medicamento|remedio|vitamina|antibiotico/.test(t)) return "medicamento";
  if (/^outros?$/.test(t)) return "outro";
  return undefined;
}

// Hash curto e estável (cyrb53) para a chave de linhas sem código: a mesma linha gera a mesma chave.
function hash(t: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Chave da linha: o código da pessoa ou o conteúdo; linhas iguais na mesma planilha ganham #1, #2…
function gerador(prefixo: string) {
  const vistos = new Map<string, number>();
  return (codigo: string, partes: (string | number | undefined)[]) => {
    if (codigo) return `${prefixo}:${codigo}`;
    const base = `${prefixo}:${hash(partes.map((p) => (typeof p === "string" ? nomeChave(p) : String(p ?? ""))).join("|"))}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return `${base}#${n}`;
  };
}

// Lê todas as abas e monta o pacote. Linha com erro fica de fora; o resto entra.
export function interpretarPlanilha(abas: AbaLida[], ctx: Contexto): { pacote: Pacote; previa: Previa } {
  const pacote: Pacote = { origem: "planilha" };
  const previa: Previa = {
    abas: [], problemas: [], pagar: { qtd: 0, cents: 0 }, receber: { qtd: 0, cents: 0 }, quitados: 0,
    novos: { contatos: [], categorias: [], especies: [] },
  };
  const contasConhecidas = new Map(ctx.contas.map((c) => [nomeChave(c), c]));
  const contatosConhecidos = new Set(ctx.contatos.map(nomeChave));
  const categoriasConhecidas = new Set(ctx.categorias.map(nomeChave));
  const novosContatos = new Map<string, string>();
  const novasCategorias = new Map<string, string>();

  // contas novas da planilha valem para os lançamentos e transferências da mesma planilha
  const reconhecidas = abas.map((a) => ({ aba: a, m: reconhecerAba(a.nome, a.cabecalho) }));
  // nomes de uma coluna de uma aba (para saber o que a própria planilha cadastra)
  const daPlanilha = (tipo: TipoModelo, ...campos: string[]) => reconhecidas.filter((x) => x.m?.tipo === tipo).flatMap(({ aba, m }) => {
    const { mapa } = mapearColunas(m!, aba.cabecalho);
    return aba.linhas.map((l) => campos.map((c) => (mapa.has(c) ? (l.valores[mapa.get(c)!] ?? "").trim() : "")))
      .filter((vs) => vs.every(Boolean));
  });
  for (const [n] of daPlanilha("contas", "nome")) contasConhecidas.set(nomeChave(n), n);
  for (const [n] of daPlanilha("contatos", "nome")) contatosConhecidos.add(nomeChave(n));
  for (const [n] of daPlanilha("categorias", "nome")) categoriasConhecidas.add(nomeChave(n));
  // viveiro pelo nome e por setor + nome; produto e espécie pelo nome
  const viveiros = [...(ctx.viveiros ?? []), ...daPlanilha("viveiros", "setor", "nome").map(([setor, nome]) => ({ setor, nome }))];
  const produtosConhecidos = new Set([...(ctx.produtos ?? []), ...daPlanilha("produtos", "nome").map(([n]) => n)].map(nomeChave));
  const especiesConhecidas = new Set((ctx.especies ?? []).map(nomeChave));
  const novasEspecies = new Map<string, string>();
  const hoje = ctx.hoje ?? new Date().toISOString().slice(0, 10);
  const unicaConta = contasConhecidas.size === 1 ? [...contasConhecidas.values()][0] : undefined;

  const chaveTitulo = gerador("lanc");
  const chaveTransf = gerador("transf");

  for (const { aba, m } of reconhecidas) {
    const linhasComDados = aba.linhas.filter((l) => l.valores.some((v) => v.trim()));
    if (/^(instrucoes|leia_me|como_preencher|ajuda)$/.test(chaveCabecalho(aba.nome))) continue;
    if (!linhasComDados.length && !m) continue;
    const resumo: ResumoAba = { aba: aba.nome, tipo: m?.tipo ?? null, modelo: m?.aba, linhas: linhasComDados.length, validas: 0, exemplos: 0, colunas: [], ignoradas: [] };
    previa.abas.push(resumo);
    if (!m) {
      resumo.erro = "Não reconheci esta aba. Use os títulos de coluna do modelo do Balbina ou dê à aba o nome do modelo (ex.: Lançamentos).";
      continue;
    }
    const { mapa, ignoradas } = mapearColunas(m, aba.cabecalho);
    resumo.colunas = m.colunas.filter((c) => mapa.has(c.campo)).map((c) => c.titulo);
    resumo.ignoradas = ignoradas;
    const faltam = m.colunas.filter((c) => c.obrigatoria && !mapa.has(c.campo)).map((c) => c.titulo);
    if (faltam.length) { resumo.erro = `Faltam as colunas obrigatórias: ${faltam.join(", ")}.`; continue; }
    if (m.financeiro && !ctx.financeiro) {
      resumo.erro = "O financeiro não faz parte do plano da empresa. O usuário master pode trocar de plano em Assinatura.";
      continue;
    }
    // linha de exemplo do modelo: os textos batem (números e datas o Excel pode ter reformatado)
    const exemplos = m.exemplos.map((e) => m.colunas.map((c, i) => [c.campo, e[i] ?? ""] as const)
      .filter(([, x]) => x && lerValor(x) === undefined && !lerData(x)).map(([campo, x]) => [campo, nomeChave(x)] as const));
    const nomeAba = chaveCabecalho(aba.nome);
    const tipoPadraoLanc = /pagar|despesa/.test(nomeAba) && !/receber/.test(nomeAba) ? "pagar"
      : /receber|receita/.test(nomeAba) && !/pagar/.test(nomeAba) ? "receber" : undefined;
    const tipoPadraoContato: TipoContato = /fornecedor/.test(nomeAba) && !/cliente/.test(nomeAba) ? "fornecedor" : "cliente";

    for (const l of linhasComDados) {
      const v = (campo: string) => (mapa.has(campo) ? (l.valores[mapa.get(campo)!] ?? "").trim() : "");
      if (exemplos.some((e) => e.every(([campo, x]) => nomeChave(v(campo)) === x))) { resumo.exemplos++; continue; }
      const erros: string[] = [];
      const avisos: string[] = [];
      const ok = () => {
        for (const e of erros) previa.problemas.push({ aba: aba.nome, linha: l.numero, mensagem: e, ignorada: true });
        for (const a of avisos) previa.problemas.push({ aba: aba.nome, linha: l.numero, mensagem: a, ignorada: false });
        if (!erros.length) resumo.validas++;
        return !erros.length;
      };

      if (m.tipo === "lancamentos") {
        const descricao = v("descricao");
        if (!descricao) erros.push("Falta a descrição.");
        const vencimento = lerData(v("vencimento"));
        if (!vencimento) erros.push(v("vencimento") ? `Vencimento "${v("vencimento")}" não é uma data (use dd/mm/aaaa).` : "Falta o vencimento.");
        let valor = lerValor(v("valor"));
        if (valor === undefined) erros.push(v("valor") ? `Valor "${v("valor")}" não é um número.` : "Falta o valor.");
        let tipo = lerTipoLancamento(v("tipo"));
        if (v("tipo") && !tipo) erros.push(`Tipo "${v("tipo")}" não reconhecido: use Pagar ou Receber.`);
        if (!v("tipo")) tipo = valor !== undefined && valor < 0 ? "pagar" : tipoPadraoLanc;
        if (!v("tipo") && !tipo) erros.push("Falta o tipo: Pagar ou Receber.");
        if (valor !== undefined) {
          if (valor === 0) erros.push("O valor não pode ser zero.");
          valor = Math.abs(valor);
        }
        const competencia = v("competencia") ? lerCompetencia(v("competencia")) : undefined;
        if (v("competencia") && !competencia) erros.push(`Competência "${v("competencia")}" não reconhecida (use mm/aaaa).`);
        const pagoEm = v("pago_em") ? lerData(v("pago_em")) : undefined;
        if (v("pago_em") && !pagoEm) erros.push(`Data de pagamento "${v("pago_em")}" não é uma data.`);
        let valorPago = v("valor_pago") ? lerValor(v("valor_pago")) : undefined;
        if (v("valor_pago") && valorPago === undefined) erros.push(`Valor pago "${v("valor_pago")}" não é um número.`);
        if (valorPago !== undefined) valorPago = Math.abs(valorPago);
        if (valorPago && !v("pago_em")) erros.push("Informe a data em que foi pago ou recebido.");
        let conta = v("conta");
        if (pagoEm && !conta) {
          if (unicaConta) { conta = unicaConta; avisos.push(`Sem conta: a baixa vai para "${unicaConta}", a única conta da empresa.`); }
          else erros.push("Informe a conta por onde foi pago ou recebido.");
        }
        if (pagoEm && conta && !contasConhecidas.has(nomeChave(conta))) {
          erros.push(`A conta "${conta}" não existe. Cadastre em Contas e saldos ou inclua na aba Contas.`);
        }
        if (!ok() || !tipo || valor === undefined || !vencimento) continue;

        const contato = v("contato");
        const categoria = v("categoria");
        if (contato && !contatosConhecidos.has(nomeChave(contato))) novosContatos.set(nomeChave(contato), contato);
        if (categoria && !categoriasConhecidas.has(nomeChave(categoria))) novasCategorias.set(nomeChave(categoria), categoria);
        const chave = chaveTitulo(v("codigo"), [tipo, descricao, contato, vencimento, valor, v("referencia"), categoria]);
        const titulo: TituloImportado = {
          chave, tipo, descricao, contato: contato || undefined, vencimento, competencia, valor_cents: valor,
          referencia: v("referencia") || undefined,
          rateio: [{ categoria, centro_custo: v("centro_custo") || undefined, valor_cents: valor }],
          baixas: pagoEm ? [{ chave: `${chave}:pg`, conta, data: pagoEm, valor_cents: valorPago || valor }] : [],
        };
        (pacote.titulos ??= []).push(titulo);
        const soma = tipo === "pagar" ? previa.pagar : previa.receber;
        soma.qtd++; soma.cents += valor;
        if (pagoEm) previa.quitados++;
      } else if (m.tipo === "contatos") {
        const nome = v("nome");
        if (!nome) erros.push("Falta o nome.");
        const tipos = lerTiposContato(v("tipo"), tipoPadraoContato);
        if (!tipos) erros.push(`Tipo "${v("tipo")}" não reconhecido: use Cliente, Fornecedor, Cliente e fornecedor, Funcionário ou Sócio.`);
        const produtor = lerSimNao(v("produtor_rural"));
        if (produtor === undefined) erros.push(`Produtor rural "${v("produtor_rural")}" não reconhecido: use Sim ou Não.`);
        let doc: string | undefined = v("cpf_cnpj").replace(/\D/g, "") || undefined;
        // o Excel tira o zero da frente quando o documento foi digitado como número
        if (doc && (doc.length === 10 || doc.length === 13)) doc = doc.padStart(doc.length + 1, "0");
        if (doc && !(doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false)) {
          avisos.push(`CPF/CNPJ "${v("cpf_cnpj")}" inválido: o cadastro entra sem documento.`);
          doc = undefined;
        }
        const uf = v("uf").toUpperCase();
        if (uf && !/^[A-Z]{2}$/.test(uf)) avisos.push(`UF "${v("uf")}" ignorada: use a sigla do estado, como AM.`);
        if (!ok() || !tipos) continue;
        const endereco: Record<string, string> = {};
        for (const k of ["logradouro", "numero", "bairro", "complemento", "cep"]) {
          const x = v(k);
          if (x) endereco[k] = k === "cep" ? x.replace(/\D/g, "") : x;
        }
        const c: ContatoImportado = {
          nome, tipos, cpf_cnpj: doc, inscricao_estadual: v("inscricao_estadual") || undefined, produtor_rural: produtor || undefined,
          telefone: v("telefone") || undefined, email: v("email") || undefined, cidade: v("cidade") || undefined,
          uf: /^[A-Z]{2}$/.test(uf) ? uf : undefined, endereco,
        };
        if (v("codigo")) c.chave = `contato:${v("codigo")}`;
        (pacote.contatos ??= []).push(c);
      } else if (m.tipo === "categorias") {
        const nome = v("nome");
        if (!nome) erros.push("Falta o nome.");
        const sentido = lerSentido(v("tipo"));
        if (!sentido) erros.push(v("tipo") ? `Tipo "${v("tipo")}" não reconhecido: use Entrada ou Saída.` : "Falta o tipo: Entrada ou Saída.");
        const g = v("grupo");
        const grupo = g ? GRUPOS[chaveCabecalho(g)] ?? grupoPeloNome(g) : undefined;
        if (g && !grupo) erros.push(`Grupo "${g}" não reconhecido.`);
        if (!ok() || !sentido) continue;
        const c: CategoriaImportada = { nome, sentido, grupo, pai: v("pai") || undefined };
        (pacote.categorias ??= []).push(c);
      } else if (m.tipo === "contas") {
        const nome = v("nome");
        if (!nome) erros.push("Falta o nome.");
        const tipo = lerTipoConta(v("tipo"));
        if (!tipo) erros.push(`Tipo "${v("tipo")}" não reconhecido: use Conta corrente, Poupança, Caixa, Aplicação ou Cartão de crédito.`);
        const saldo = v("saldo") ? lerValor(v("saldo")) : undefined;
        if (v("saldo") && saldo === undefined) erros.push(`Saldo "${v("saldo")}" não é um número.`);
        const saldoData = v("saldo_data") ? lerData(v("saldo_data")) : undefined;
        if (v("saldo_data") && !saldoData) erros.push(`Data do saldo "${v("saldo_data")}" não é uma data.`);
        if (saldo !== undefined && !saldoData) erros.push("Informe a data do saldo inicial.");
        const banco = v("banco").replace(/\D/g, "");
        if (!ok() || !tipo) continue;
        const [conta, dv] = v("numero").split("-");
        const c: ContaImportada = {
          nome, tipo, banco_codigo: banco ? banco.padStart(3, "0") : undefined, agencia: v("agencia") || undefined,
          conta: conta?.trim() || undefined, conta_dv: dv?.trim() || undefined,
          saldo_inicial_cents: saldo, saldo_inicial_data: saldoData,
        };
        (pacote.contas ??= []).push(c);
      } else if (m.tipo === "transferencias") {
        const data = lerData(v("data"));
        if (!data) erros.push(v("data") ? `Data "${v("data")}" não é uma data.` : "Falta a data.");
        const valor = lerValor(v("valor"));
        if (valor === undefined || valor === 0) erros.push(v("valor") ? `Valor "${v("valor")}" inválido.` : "Falta o valor.");
        const origem = v("origem"), destino = v("destino");
        for (const [rotulo, c] of [["origem", origem], ["destino", destino]] as const) {
          if (!c) erros.push(`Falta a conta de ${rotulo}.`);
          else if (!contasConhecidas.has(nomeChave(c))) erros.push(`A conta de ${rotulo} "${c}" não existe. Cadastre em Contas e saldos ou inclua na aba Contas.`);
        }
        if (origem && destino && nomeChave(origem) === nomeChave(destino)) erros.push("Conta de origem e de destino são a mesma.");
        if (!ok() || !data || valor === undefined) continue;
        const t: TransferenciaImportada = {
          chave: chaveTransf(v("codigo"), [data, origem, destino, Math.abs(valor), v("descricao")]),
          origem, destino, data, valor_cents: Math.abs(valor), descricao: v("descricao") || undefined,
        };
        (pacote.transferencias ??= []).push(t);
      } else if (m.tipo === "produtos") {
        const nome = v("nome");
        if (!nome) erros.push("Falta o nome.");
        const tipo = lerTipoProduto(v("tipo"));
        if (tipo === "peixe") erros.push("O peixe de venda não entra por planilha: cadastre as classes de peixe em Piscicultura.");
        else if (!tipo) erros.push(v("tipo") ? `Tipo "${v("tipo")}" não reconhecido: use Ração, Insumo de ração, Alevino, Embalagem, Medicamento, Vacina ou Outro.` : "Falta o tipo.");
        const unidade = v("unidade");
        if (!unidade) erros.push("Falta a unidade.");
        else if (unidade.length > 20) erros.push("Unidade com mais de 20 letras.");
        const minimo = v("estoque_minimo") ? lerValor(v("estoque_minimo")) : undefined;
        if (v("estoque_minimo") && (minimo === undefined || minimo < 0)) erros.push(`Estoque mínimo "${v("estoque_minimo")}" inválido.`);
        if (!ok() || !tipo || tipo === "peixe") continue;
        const p: ProdutoImportado = {
          nome, tipo, unidade, sku: v("sku") || undefined, ncm: v("ncm") || undefined,
          estoque_minimo: minimo !== undefined ? minimo / 100 : undefined, observacoes: v("observacoes") || undefined,
        };
        (pacote.produtos ??= []).push(p);
      } else if (m.tipo === "viveiros") {
        const setor = v("setor"), nome = v("nome");
        if (!setor) erros.push("Falta o setor.");
        if (!nome) erros.push("Falta o nome do viveiro.");
        const finalidade = lerFinalidade(v("finalidade"));
        if (!finalidade) erros.push(v("finalidade") ? `Finalidade "${v("finalidade")}" não reconhecida: use Alevinagem, Recria, Alevinagem e recria ou Engorda.` : "Falta a finalidade.");
        const sistema = lerSistema(v("sistema"));
        if (v("sistema") && !sistema) erros.push(`Sistema "${v("sistema")}" não reconhecido: use Viveiro escavado, Barragem, Tanque-rede, Alvenaria, Lona ou Outro.`);
        const medida = (campo: string, nome: string) => {
          if (!v(campo)) return undefined;
          const n = lerPositivo(v(campo));
          if (n === undefined) erros.push(`${nome} "${v(campo)}" não é um número maior que zero.`);
          return n;
        };
        const area_m2 = medida("area", "Área"), volume_m3 = medida("volume", "Volume"), profundidade_m = medida("profundidade", "Profundidade");
        if (profundidade_m !== undefined && profundidade_m > 20) erros.push(`Profundidade de ${v("profundidade")} m: informe em metros (até 20).`);
        const capacidade = lerInteiro(v("capacidade"));
        if (!capacidade) erros.push(v("capacidade") ? `Capacidade "${v("capacidade")}" inválida: use um número inteiro de peixes.` : "Falta a capacidade de peixes.");
        const aeracao = lerSimNao(v("aeracao"));
        if (aeracao === undefined) erros.push(`Aeração "${v("aeracao")}" não reconhecido: use Sim ou Não.`);
        if (!ok() || !finalidade || !capacidade) continue;
        (pacote.viveiros ??= []).push({ setor, nome, finalidade, sistema, capacidade, aeracao, area_m2, volume_m3, profundidade_m });
      } else if (m.tipo === "lotes") {
        const codigo = v("codigo"), especie = v("especie"), viveiro = v("viveiro"), setor = v("setor");
        if (!codigo) erros.push("Falta o código do lote.");
        if (!especie) erros.push("Falta a espécie.");
        const povoamento = lerData(v("povoamento"));
        if (!povoamento) erros.push(v("povoamento") ? `Povoamento "${v("povoamento")}" não é uma data.` : "Falta a data de povoamento.");
        else if (povoamento > hoje) erros.push("A data de povoamento não pode ser no futuro.");
        const qtd = lerInteiro(v("qtd"));
        if (!qtd) erros.push(v("qtd") ? `Peixes povoados "${v("qtd")}" inválido: use um número inteiro.` : "Falta a quantidade de peixes.");
        const peso = lerPositivo(v("peso"));
        if (!peso) erros.push(v("peso") ? `Peso médio "${v("peso")}" inválido: informe em gramas, como 150 ou 0,8.` : "Falta o peso médio dos peixes no povoamento (g).");
        const pesoAlvo = v("peso_alvo") ? lerPositivo(v("peso_alvo")) : undefined;
        if (v("peso_alvo") && !pesoAlvo) erros.push(`Peso de despesca "${v("peso_alvo")}" inválido: informe em gramas, como 2.500.`);
        else if (peso && pesoAlvo && pesoAlvo <= peso) erros.push("O peso de despesca precisa ser maior que o peso no povoamento.");
        const achados = viveiros.filter((g) => nomeChave(g.nome) === nomeChave(viveiro) && (!setor || nomeChave(g.setor) === nomeChave(setor)));
        if (!viveiro) erros.push("Falta o viveiro.");
        else if (!achados.length) erros.push(`O viveiro "${viveiro}" não existe. Inclua na aba Viveiros ou cadastre em Piscicultura.`);
        else if (new Set(achados.map((g) => nomeChave(g.setor))).size > 1) erros.push(`Há mais de um viveiro "${viveiro}": informe o setor.`);
        const custo = v("custo") ? lerValor(v("custo")) : undefined;
        if (v("custo") && (custo === undefined || custo < 0)) erros.push(`Custo "${v("custo")}" inválido.`);
        if (!ok() || !povoamento || !qtd || !peso) continue;
        if (!especiesConhecidas.has(nomeChave(especie))) novasEspecies.set(nomeChave(especie), especie);
        if (v("fornecedor") && !contatosConhecidos.has(nomeChave(v("fornecedor")))) novosContatos.set(nomeChave(v("fornecedor")), v("fornecedor"));
        (pacote.lotes ??= []).push({
          codigo, especie, povoamento, setor: setor || undefined, viveiro, qtd, peso_inicial_g: peso, peso_alvo_g: pesoAlvo,
          custo_cents: custo || undefined, fornecedor: v("fornecedor") || undefined,
        });
      } else if (m.tipo === "estoque") {
        const produto = v("produto");
        if (!produto) erros.push("Falta o produto.");
        else if (!produtosConhecidos.has(nomeChave(produto))) erros.push(`O produto "${produto}" não existe. Inclua na aba Produtos ou cadastre em Produtos e insumos.`);
        const qtd = lerValor(v("quantidade"));
        if (qtd === undefined || qtd < 0) erros.push(v("quantidade") ? `Quantidade "${v("quantidade")}" inválida.` : "Falta a quantidade.");
        const data = lerData(v("data"));
        if (!data) erros.push(v("data") ? `Data "${v("data")}" não é uma data.` : "Falta a data do saldo.");
        else if (data > hoje) erros.push("A data do saldo não pode ser no futuro.");
        const custo = v("custo") ? lerValor(v("custo")) : undefined;
        if (v("custo") && (custo === undefined || custo < 0)) erros.push(`Custo "${v("custo")}" inválido.`);
        if (!ok() || qtd === undefined || !data) continue;
        (pacote.estoque ??= []).push({ produto, quantidade: qtd / 100, data, custo_cents: custo || undefined });
      }
    }
  }
  previa.novos.contatos = [...novosContatos.values()];
  previa.novos.categorias = [...novasCategorias.values()];
  previa.novos.especies = [...novasEspecies.values()];
  previa.problemas = previa.problemas.slice(0, MAX_PROBLEMAS);
  return { pacote, previa };
}

// CSV do modelo: separado por ; (Excel brasileiro abre direto), com BOM para os acentos.
export function modeloCsv(tipo: TipoModelo): string {
  const m = modelo(tipo);
  const linha = (vs: string[]) => vs.map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";");
  return "﻿" + [linha(m.colunas.map((c) => c.titulo + (c.obrigatoria ? "*" : ""))), ...m.exemplos.map(linha)].join("\r\n") + "\r\n";
}

// CSV para AbaLida, guardando o número da linha no arquivo (para a mensagem de erro bater com o Excel).
export function abaCsv(nome: string, texto: string): AbaLida {
  const t = texto.replace(/^﻿/, "");
  const fim = t.search(/\r?\n/);
  const primeira = fim >= 0 ? t.slice(0, fim) : t;
  const sep = [";", ",", "\t"].map((s) => [s, primeira.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const linhas: LinhaLida[] = [];
  let campo = "", linha: string[] = [], aspas = false, numero = 1, inicio = 1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else { if (c === "\n") numero++; campo += c; }
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); linhas.push({ numero: inicio, valores: linha }); linha = []; campo = "";
      numero++; inicio = numero;
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push({ numero: inicio, valores: linha }); }
  const comDados = linhas.filter((l) => l.valores.some((v) => v.trim()));
  const [cab, ...resto] = comDados;
  return { nome, cabecalho: cab?.valores.map((v) => v.trim()) ?? [], linhas: resto };
}
