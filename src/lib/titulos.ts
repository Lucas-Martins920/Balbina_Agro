// O que muda entre contas a pagar e a receber. O resto da tela e das ações é o mesmo.
export type TipoTitulo = "pagar" | "receber";

export const CONFIG_TITULO = {
  pagar: {
    rota: "/contas-a-pagar",
    titulo: "Contas a pagar",
    singular: "conta a pagar",
    sentido: "saida",
    tipoContato: "fornecedor",
    contato: "Fornecedor",
    baixa: "Pagar",
    registrarBaixa: "Registrar pagamento",
    baixaFeita: "Pagamento registrado.",
    quitadas: "Pagas",
    quitada: "Paga",
    vencida: "Vencida",
    exemplo: "Ex.: Milho, carga de 30 t",
    competencia: "Competência (mês da despesa)",
    dicaRateio: "Use o centro de custo do lote ou do viveiro para a despesa entrar no custo do kg dele.",
  },
  receber: {
    rota: "/contas-a-receber",
    titulo: "Contas a receber",
    singular: "conta a receber",
    sentido: "entrada",
    tipoContato: "cliente",
    contato: "Cliente",
    baixa: "Receber",
    registrarBaixa: "Registrar recebimento",
    baixaFeita: "Recebimento registrado.",
    quitadas: "Recebidas",
    quitada: "Recebida",
    vencida: "Vencida",
    exemplo: "Ex.: Tambaqui, pedido 1234",
    competencia: "Competência (mês da venda)",
    dicaRateio: "Use o centro de custo do lote para a receita entrar na margem dele.",
  },
} as const;

export function lerTipo(valor: FormDataEntryValue | null): TipoTitulo | null {
  return valor === "pagar" || valor === "receber" ? valor : null;
}

export const FREQUENCIAS: Record<string, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export const FORMAS_PAGAMENTO: Record<string, string> = {
  boleto: "Boleto",
  pix: "Pix",
  ted: "TED",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  debito_automatico: "Débito automático",
  cheque: "Cheque",
};

export const GRUPOS_CATEGORIA: Record<string, string> = {
  receita_operacional: "Receitas operacionais",
  custo_operacional: "Custos operacionais",
  despesa_operacional: "Despesas operacionais",
  investimento: "Investimentos",
  financiamento: "Financiamentos",
};

// Em que parte do custo do kg a categoria de custo operacional entra
export const COMPONENTES_CUSTO: Record<string, string> = {
  racao: "Ração",
  alevinos: "Alevinos e juvenis",
  sanidade: "Sanidade",
  mao_obra: "Mão de obra",
  energia: "Energia",
  embalagem: "Embalagem",
  outros: "Outros custos",
};
